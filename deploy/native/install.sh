#!/bin/sh
# Installs the native, pull-based deployment on the Raspberry Pi.
#
# Run as the user that owns the room-manager systemd user service (not root),
# from a checkout or a copy of deploy/native. An existing ~/room-manager binary
# and user service are migrated in place; the previous unit is kept as
# room-manager.service.pre-native.
#
# Usage: install.sh [--binary PATH] [--enable-timer]
#   --binary PATH   initial binary (default: ~/room-manager)
#   --enable-timer  start the update timer after a healthy restart
#
# SERVO_DIRECTION=normal|reverse overrides the direction that is otherwise
# carried over from the existing unit's --servo-direction option.
set -eu

script_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)
base_dir="$HOME/.local/lib/room-manager"
unit_dir="$HOME/.config/systemd/user"
config_dir="$HOME/.config/room-manager"
legacy_env="$unit_dir/room-manager.env"
binary="$HOME/room-manager"
enable_timer=false

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --binary)
            [ "$#" -ge 2 ] || die "--binary requires a path"
            binary=$2
            shift 2
            ;;
        --enable-timer)
            enable_timer=true
            shift
            ;;
        *) die "unknown option: $1" ;;
    esac
done

[ "$(id -u)" -ne 0 ] || die "run as the user that owns the room-manager user service, not root"
for command in curl flock sha256sum systemctl; do
    command -v "$command" >/dev/null 2>&1 || die "required command not found: $command"
done
XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
export XDG_RUNTIME_DIR
[ -S "$XDG_RUNTIME_DIR/bus" ] || die "no systemd user session at $XDG_RUNTIME_DIR (is lingering enabled?)"
[ -f "$legacy_env" ] || die "$legacy_env is missing; it must define API_PATH and API_TOKEN"

if [ -z "${SERVO_DIRECTION:-}" ] && [ -f "$unit_dir/room-manager.service" ]; then
    SERVO_DIRECTION=$(sed -n 's/.*--servo-direction[ =]\([a-z]*\).*/\1/p' "$unit_dir/room-manager.service" | head -n 1)
fi
SERVO_DIRECTION=${SERVO_DIRECTION:-normal}
case "$SERVO_DIRECTION" in
    normal | reverse) ;;
    *) die "SERVO_DIRECTION must be normal or reverse, got: $SERVO_DIRECTION" ;;
esac

mkdir -p "$base_dir/bin" "$base_dir/releases" "$unit_dir" "$config_dir"

if [ ! -L "$base_dir/current" ]; then
    [ -f "$binary" ] || die "no binary to start from: $binary does not exist (use --binary PATH)"
    mkdir -p "$base_dir/releases/initial"
    install -m 0755 "$binary" "$base_dir/releases/initial/room-manager"
    ln -sfn releases/initial "$base_dir/current"
fi

[ -e "$config_dir/device.env" ] || printf 'SERVO_DIRECTION=%s\n' "$SERVO_DIRECTION" >"$config_dir/device.env"

install -m 0755 "$script_dir/room-manager-update.sh" "$base_dir/bin/room-manager-update"

had_service=false
if [ -f "$unit_dir/room-manager.service" ]; then
    had_service=true
    [ -e "$unit_dir/room-manager.service.pre-native" ] \
        || cp -p "$unit_dir/room-manager.service" "$unit_dir/room-manager.service.pre-native"
fi
for unit in room-manager.service room-manager-update.service room-manager-update.timer; do
    install -m 0644 "$script_dir/systemd/$unit" "$unit_dir/$unit"
done
systemctl --user daemon-reload
systemctl --user enable room-manager.service

printf 'restarting room-manager.service on the native layout\n'
systemctl --user restart room-manager.service
if ! "$base_dir/bin/room-manager-update" wait-ready; then
    printf 'room-manager did not become ready; restoring the previous unit\n' >&2
    if [ "$had_service" = true ]; then
        cp -p "$unit_dir/room-manager.service.pre-native" "$unit_dir/room-manager.service"
        systemctl --user daemon-reload
        systemctl --user restart room-manager.service
    else
        systemctl --user stop room-manager.service
    fi
    die "installation rolled back"
fi

if [ "$enable_timer" = true ]; then
    systemctl --user enable --now room-manager-update.timer
    printf 'update timer enabled\n'
else
    printf 'update timer not enabled; verify the device, then run: systemctl --user enable --now room-manager-update.timer\n'
fi
"$base_dir/bin/room-manager-update" status
