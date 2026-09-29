#!/bin/sh
set -eu

umask 022

prepare_only=false
manifest_override=
while [ "$#" -gt 0 ]; do
    case "$1" in
        --prepare-only) prepare_only=true; shift ;;
        --manifest-url)
            [ "$#" -ge 2 ] || { echo "--manifest-url requires a URL" >&2; exit 64; }
            manifest_override=$2
            shift 2
            ;;
        *) echo "usage: $0 [--prepare-only] [--manifest-url URL]" >&2; exit 64 ;;
    esac
done

if [ "$(id -u)" -ne 0 ]; then
    echo "run this installer as root" >&2
    exit 1
fi

[ "$(uname -m)" = aarch64 ] || {
    echo "room-manager production requires Debian 12 on aarch64" >&2
    exit 1
}
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in
    debian:12*|raspbian:12*) ;;
    *)
        echo "room-manager production requires Debian 12 (or Raspberry Pi OS based on Debian 12)" >&2
        exit 1
        ;;
esac

for command in systemctl install flock curl sha256sum tar readlink find awk sed grep ldconfig; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "required command not found: $command" >&2
        exit 1
    }
done
systemctl --version >/dev/null 2>&1 || {
    echo "systemd is required" >&2
    exit 1
}

for path in /etc/ssl/certs/ca-certificates.crt /usr/share/zoneinfo/Asia/Tokyo; do
    [ -e "$path" ] || {
        echo "required runtime data is missing: $path" >&2
        exit 1
    }
done
ldconfig -p 2>/dev/null | grep -q 'libasound\.so\.2' || {
    echo "libasound2 runtime library is required" >&2
    exit 1
}
ldconfig -p 2>/dev/null | grep -q 'libusb-1\.0\.so\.0' || {
    echo "libusb-1.0-0 runtime library is required" >&2
    exit 1
}

script_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)
config_dir=${ROOM_MANAGER_CONFIG_DIR:-/etc/room-manager}
install_root=${ROOM_MANAGER_INSTALL_ROOT:-/opt/room-manager}
state_dir=${ROOM_MANAGER_STATE_DIR:-/var/lib/room-manager-deploy}
systemd_dir=${ROOM_MANAGER_SYSTEMD_DIR:-/etc/systemd/system}
libexec_dir=${ROOM_MANAGER_LIBEXEC_DIR:-/usr/local/libexec}

install -d -m 0755 "$config_dir" "$install_root" "$install_root/releases" \
    "$install_root/.staging" "$state_dir" "$libexec_dir" "$systemd_dir"
chmod 0700 "$state_dir"

if [ ! -f "$config_dir/app.env" ]; then
    install -m 0600 "$script_dir/app.env.example" "$config_dir/app.env"
    echo "created $config_dir/app.env; replace the placeholder values and rerun" >&2
    exit 1
fi
if grep -q 'replace-me\|example\.workers\.dev' "$config_dir/app.env"; then
    echo "replace the placeholder values in $config_dir/app.env and rerun" >&2
    exit 1
fi
chmod 0600 "$config_dir/app.env"

if [ ! -f "$config_dir/deploy.env" ]; then
    install -m 0644 "$script_dir/deploy.env.example" "$config_dir/deploy.env"
    echo "created $config_dir/deploy.env; review the manifest URL and rerun" >&2
    exit 1
fi
chmod 0644 "$config_dir/deploy.env"

install -m 0755 "$script_dir/room-manager-deploy.sh" "$libexec_dir/room-manager-deploy"
install -m 0755 "$script_dir/migrate-legacy.sh" "$libexec_dir/room-manager-migrate-legacy"
install -m 0644 "$script_dir/systemd/room-manager.service" "$systemd_dir/room-manager.service"
install -m 0644 "$script_dir/systemd/room-manager-recover.service" "$systemd_dir/room-manager-recover.service"
install -m 0644 "$script_dir/systemd/room-manager-deploy.service" "$systemd_dir/room-manager-deploy.service"
install -m 0644 "$script_dir/systemd/room-manager-deploy.timer" "$systemd_dir/room-manager-deploy.timer"

if [ -n "$manifest_override" ]; then
    temporary_env=$config_dir/deploy.env.$$
    sed "s|^ROOM_MANAGER_MANIFEST_URL=.*|ROOM_MANAGER_MANIFEST_URL=$manifest_override|" \
        "$config_dir/deploy.env" >"$temporary_env"
    mv -f -- "$temporary_env" "$config_dir/deploy.env"
fi

systemctl daemon-reload
if [ "$prepare_only" = true ]; then
    echo "native room-manager files prepared; services were not started"
    exit 0
fi

# The first install activates the app once so the operator can verify the
# physical reader, audio, GPIO, and lock before enabling periodic pulls.
systemctl enable room-manager-recover.service
systemctl start room-manager-recover.service
systemctl start room-manager-deploy.service
systemctl enable room-manager.service
echo "native room-manager is installed and ready; enable room-manager-deploy.timer after hardware verification"
