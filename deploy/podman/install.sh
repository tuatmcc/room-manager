#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "run this installer as root" >&2
    exit 1
fi

for command in podman systemctl install flock; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "required command not found: $command" >&2
        exit 1
    }
done

if [ "$(uname -m)" != aarch64 ]; then
    echo "this production image requires a 64-bit Raspberry Pi (aarch64)" >&2
    exit 1
fi

podman_major=$(podman --version | awk '{print $3}' | cut -d. -f1)
case "$podman_major" in
    ''|*[!0-9]*)
        echo "could not determine the Podman version" >&2
        exit 1
        ;;
esac
if [ "$podman_major" -lt 5 ]; then
    echo "Podman 5 or newer is required for this Quadlet configuration" >&2
    exit 1
fi

if [ "$(podman info --format '{{.Host.CgroupsVersion}}')" != v2 ]; then
    echo "Podman must use cgroup v2" >&2
    exit 1
fi

for device_path in /dev/snd /dev/bus/usb /dev/gpiochip0; do
    if [ ! -e "$device_path" ]; then
        echo "required device path not found: $device_path" >&2
        exit 1
    fi
done

if [ ! -e /dev/gpiomem ] && [ ! -e /dev/gpiomem0 ]; then
    echo "neither /dev/gpiomem nor /dev/gpiomem0 exists" >&2
    exit 1
fi

script_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)
config_dir=/etc/room-manager
quadlet_dir=/etc/containers/systemd
state_dir=/var/lib/room-manager-deploy

install -d -m 0755 "$config_dir" "$quadlet_dir" /usr/local/libexec
install -d -m 0700 "$state_dir"

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
fi

install -m 0644 "$script_dir/systemd/room-manager-blue.container" "$quadlet_dir/room-manager-blue.container"
install -m 0644 "$script_dir/systemd/room-manager-green.container" "$quadlet_dir/room-manager-green.container"
install -m 0644 "$script_dir/systemd/room-manager-deploy.service" /etc/systemd/system/room-manager-deploy.service
install -m 0644 "$script_dir/systemd/room-manager-deploy.timer" /etc/systemd/system/room-manager-deploy.timer
install -m 0755 "$script_dir/room-manager-blue-green.sh" /usr/local/libexec/room-manager-blue-green

# This is an administrator-owned file.
# shellcheck disable=SC1091
. "$config_dir/deploy.env"
: "${ROOM_MANAGER_SOURCE_IMAGE:?set ROOM_MANAGER_SOURCE_IMAGE in $config_dir/deploy.env}"
if [ -n "${REGISTRY_AUTH_FILE:-}" ]; then
    export REGISTRY_AUTH_FILE
fi

podman pull "$ROOM_MANAGER_SOURCE_IMAGE"
if ! podman image exists localhost/room-manager:blue; then
    podman tag "$ROOM_MANAGER_SOURCE_IMAGE" localhost/room-manager:blue
fi
if ! podman image exists localhost/room-manager:green; then
    podman tag "$ROOM_MANAGER_SOURCE_IMAGE" localhost/room-manager:green
fi

if [ ! -s "$state_dir/active-color" ]; then
    printf 'blue\n' >"$state_dir/active-color"
fi
chmod 0644 "$state_dir/active-color"

systemctl daemon-reload
systemctl enable --now room-manager-blue.service room-manager-green.service
systemctl enable --now room-manager-deploy.timer

echo "room-manager Blue/Green services and update timer are installed"
