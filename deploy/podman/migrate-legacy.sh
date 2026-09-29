#!/bin/sh
# Migrate one explicitly selected, system-level systemd service to Quadlet.
set -eu
umask 077

usage() {
    echo "usage: $0 check|apply OLD.service IMAGE | rollback | finalize --hardware-verified" >&2
    exit 64
}
die() { echo "$*" >&2; exit 1; }
phase() { printf '%s\n' "$1" >"$state/phase.tmp" && mv "$state/phase.tmp" "$state/phase"; }
property() { systemctl show "$1" --property="$2" --value; }

# Only used by the isolated command-mock tests. Production uses the host root.
root=${ROOM_MANAGER_MIGRATION_ROOT:-}
state="$root/var/lib/room-manager-migration"
config="$root/etc/room-manager"
script_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)
installer=${ROOM_MANAGER_MIGRATION_INSTALLER:-$script_dir/install.sh}
units='room-manager-deploy.timer room-manager-deploy.service room-manager-blue.service room-manager-green.service'
action=${1:-}
[ "$#" -gt 0 ] || usage
shift
case "$action" in
    check|apply) [ "$#" -eq 2 ] || usage; old=$1; image=$2 ;;
    rollback) [ "$#" -eq 0 ] || usage ;;
    finalize) [ "$#" -eq 1 ] || usage; [ "$1" = --hardware-verified ] || usage ;;
    *) usage ;;
esac
[ "$(id -u)" -eq 0 ] || die 'run as root'
for command in systemctl podman flock pgrep curl; do
    command -v "$command" >/dev/null || die "missing command: $command"
done

preflight() {
    # Reject aliases, paths, patterns, and our own units; never guess the target.
    printf '%s\n' "$old" | grep -Eq '^[A-Za-z0-9_@.-]+\.service$' || die 'invalid service name'
    case " $units " in *" $old "*) die 'old service must not be a new deployment unit' ;; esac
    [ "$(property "$old" Id)" = "$old" ] || die 'use the canonical service name, not an alias'
    [ "$(property "$old" LoadState)" = loaded ] || die 'old service is not loaded'
    [ "$(property "$old" ActiveState)" = active ] || die 'old service must be active'
    [ "$(property "$old" KillMode)" = control-group ] || die 'old service must use KillMode=control-group'
    [ "$(property "$old" RemainAfterExit)" = no ] || die 'oneshot wrapper services are not supported'
    [ -z "$(property "$old" TriggeredBy)" ] || die 'timer/socket activated legacy services require a separate migration'
    enabled=$(property "$old" UnitFileState)
    case "$enabled" in enabled|disabled|static) ;; *) die "unsupported old enable state: $enabled" ;; esac
    [ ! -e "$state" ] || die "migration already recorded; inspect $state/phase and use rollback if interrupted"
    [ ! -e "$root/etc/systemd/system/$old.d/90-room-manager-migration.conf" ] || die 'legacy migration drop-in already exists'
    for unit in $units; do
        load=$(property "$unit" LoadState)
        [ "$load" = not-found ] || die "new unit already exists: $unit"
        [ ! -e "$root/etc/systemd/system/$unit.d/90-room-manager-migration.conf" ] || die 'new migration drop-in already exists'
    done
    for color in blue green; do
        [ ! -e "$root/etc/containers/systemd/room-manager-$color.container" ] || die 'Quadlet already installed'
        if podman container exists "room-manager-$color" || podman image exists "localhost/room-manager:$color"; then
            die 'existing room-manager containers/images require manual inspection'
        fi
    done
    [ ! -e "$root/var/lib/room-manager-deploy/active-color" ] || die 'existing deployment state requires manual inspection'
    [ "$(uname -m)" = aarch64 ] || die 'requires aarch64 Raspberry Pi OS'
    printf '%s\n' "$image" | grep -Eq '^ghcr\.io/tuatmcc/room-manager(:sha-[0-9a-f]{40}|@sha256:[0-9a-f]{64})$' ||
        die 'use the SHA tag or digest from a successful CD run, not :main'
    [ -r "$config/app.env" ] || die 'prepare app.env first (see DEPLOYMENT.md)'
    [ -r "$config/deploy.env" ] || die 'prepare deploy.env first (see DEPLOYMENT.md)'
    if grep -q 'replace-me\|example\.workers\.dev' "$config/app.env"; then die 'app.env contains placeholders'; fi
    api_path=$(sed -n 's/^API_PATH=//p' "$config/app.env")
    case "$api_path" in https://*) ;; *) die 'API_PATH must be an unquoted HTTPS URL in app.env' ;; esac
    curl --fail --silent --show-error --connect-timeout 10 --max-time 30 "${api_path%/}/health" >/dev/null
}

guard() {
    unit=$1
    marker=$2
    install -d -m 0755 "$root/etc/systemd/system/$unit.d"
    printf '[Unit]\nConditionPathExists=!%s\n' "$state/$marker" >"$root/etc/systemd/system/$unit.d/90-room-manager-migration.conf"
}

healthy() {
    for unit in room-manager-blue.service room-manager-green.service; do
        [ "$(property "$unit" ActiveState)" = active ] || return 1
    done
    podman healthcheck run room-manager-blue >/dev/null 2>&1 &&
        podman healthcheck run room-manager-green >/dev/null 2>&1
}

restore_legacy() {
    # Never give hardware back until all new owners have demonstrably stopped.
    : >"$state/block-new" || return 1
    phase rolling-back || return 1
    safe=true
    for unit in $units; do
        load=$(property "$unit" LoadState) || { safe=false; continue; }
        if [ "$load" = loaded ]; then
            systemctl stop "$unit" || safe=false
            case "$(property "$unit" ActiveState)" in inactive|failed) ;; *) safe=false ;; esac
        elif [ "$load" != not-found ]; then
            safe=false
        fi
    done
    for color in blue green; do
        if podman container exists "room-manager-$color"; then
            [ "$(podman inspect --format '{{.State.Running}}' "room-manager-$color")" = false ] || safe=false
        else
            # Exit 1 means absent; errors talking to Podman are not proof of absence.
            [ "$?" -eq 1 ] || safe=false
        fi
    done
    if [ "$(property room-manager-deploy.timer LoadState)" = loaded ]; then
        systemctl disable room-manager-deploy.timer || safe=false
    fi
    if [ "$safe" != true ]; then
        phase recovery-required
        echo 'New services could not be stopped; legacy stays blocked. Inspect units/containers, then retry rollback.' >&2
        return 1
    fi
    systemctl daemon-reload || return 1
    rm -f "$state/block-legacy" || return 1
    if [ "$(cat "$state/old-enabled")" = enabled ]; then systemctl enable "$old" || return 1; fi
    systemctl start "$old" || return 1
    [ "$(property "$old" ActiveState)" = active ] || return 1
    phase rolled-back || return 1
    echo 'Legacy service restored. New services remain blocked across reboot.'
}

if [ "$action" = check ]; then
    preflight
    echo "Preflight passed for $old. No service was changed; installer/device/image checks run during apply before legacy stops."
    exit 0
fi

exec 9>"$root/run/room-manager-deploy.lock"
flock -n 9 || die 'another deployment or migration is running'
if [ "$action" != apply ]; then
    [ -f "$state/old-unit" ] || die 'no saved migration'
    old=$(cat "$state/old-unit")
    if [ "$action" = rollback ]; then restore_legacy; exit; fi
    [ "$(cat "$state/phase")" = awaiting-verification ] || die 'migration is not awaiting hardware verification'
    [ -f "$state/block-legacy" ] || die 'legacy guard is missing'
    [ ! -f "$state/block-new" ] || die 'new services are blocked'
    case "$(property "$old" ActiveState)" in inactive|failed) ;; *) die 'legacy is still active' ;; esac
    healthy || die 'containers are not healthy'
    systemctl enable --now room-manager-deploy.timer
    [ "$(property room-manager-deploy.timer ActiveState)" = active ] || die 'update timer did not start'
    phase complete
    echo 'Migration complete; periodic updates are enabled using deploy.env.'
    exit 0
fi

preflight
install -d -m 0700 "$state"
printf '%s\n' "$old" >"$state/old-unit"
printf '%s\n' "$enabled" >"$state/old-enabled"
systemctl cat "$old" >"$state/legacy-unit.txt"
phase preparing
on_exit() {
    result=$?
    trap - EXIT HUP INT TERM
    if [ "$result" -ne 0 ]; then
        echo "Migration failed; restoring $old" >&2
        restore_legacy || echo "Recovery requires attention; see $state/phase" >&2
    fi
    exit "$result"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

# Both guards survive a reboot or SIGKILL. A saved phase permits manual recovery.
: >"$state/block-new"
for unit in $units; do guard "$unit" block-new; done
guard "$old" block-legacy
"$installer" --prepare-only --image "$image"
for color in blue green; do
    podman image inspect --format '{{.Id}}' "localhost/room-manager:$color" >"$state/image-$color"
done
cmp "$state/image-blue" "$state/image-green"
phase stopping-legacy
: >"$state/block-legacy"
if [ "$enabled" = enabled ]; then systemctl disable "$old"; fi
systemctl stop "$old"
case "$(property "$old" ActiveState)" in inactive|failed) ;; *) die 'legacy did not stop' ;; esac
[ "$(property "$old" MainPID)" = 0 ] || die 'legacy main process remains'
if pgrep -x room-manager >/dev/null; then
    die 'another room-manager process remains; inspect startup sources'
else
    [ "$?" -eq 1 ] || die 'could not inspect remaining processes'
fi
phase starting-containers
rm -f "$state/block-new"
systemctl start room-manager-blue.service room-manager-green.service
timeout=${ROOM_MANAGER_MIGRATION_TIMEOUT:-90}
case "$timeout" in ''|*[!0-9]*) die 'invalid readiness timeout' ;; esac
deadline=$(( $(date +%s) + timeout ))
until healthy; do
    [ "$(date +%s)" -lt "$deadline" ] || die 'container readiness timed out'
    sleep 2
done
phase awaiting-verification
trap - EXIT HUP INT TERM
echo 'Containers are ready. Verify cards, Discord, audio, unlock/relock and USB reconnect, then run finalize --hardware-verified.'
echo "To return to the legacy binary, run: $0 rollback"
