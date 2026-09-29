#!/bin/sh
# Migrate one explicitly selected legacy native systemd service to the native
# room-manager CD layout. The legacy binary and its configuration are kept.
set -eu

umask 077

usage() {
    echo "usage: $0 check|apply OLD.service | rollback | finalize --hardware-verified" >&2
    exit 64
}

die() {
    echo "$*" >&2
    exit 1
}

root=${ROOM_MANAGER_MIGRATION_ROOT:-}
state=$root/var/lib/room-manager-migration
config=$root/etc/room-manager
deploy_state=$root/var/lib/room-manager-deploy
lock_path=$root/run/room-manager-deploy.lock
script_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)
installer=${ROOM_MANAGER_MIGRATION_INSTALLER:-$script_dir/install.sh}
controller=${ROOM_MANAGER_MIGRATION_CONTROLLER:-$script_dir/room-manager-deploy.sh}
units='room-manager.service room-manager-deploy.service room-manager-deploy.timer'
action=${1:-}
same_service_name=false

[ "$#" -gt 0 ] || usage
shift
case "$action" in
    check|apply) [ "$#" -eq 1 ] || usage; old=$1 ;;
    rollback) [ "$#" -eq 0 ] || usage ;;
    finalize) [ "$#" -eq 1 ] || usage; [ "$1" = --hardware-verified ] || usage ;;
    *) usage ;;
esac

[ "$(id -u)" -eq 0 ] || die 'run as root'
for command in systemctl flock pgrep uname sed grep; do
    command -v "$command" >/dev/null 2>&1 || die "missing command: $command"
done

property() {
    systemctl show "$1" --property="$2" --value
}

phase() {
    temporary=$state/phase.tmp.$$
    printf '%s\n' "$1" >"$temporary"
    mv -f -- "$temporary" "$state/phase"
}

valid_service_name() {
    printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9_@.-]+\.service$'
}

preflight() {
    valid_service_name "$old" || die 'invalid legacy service name'
    if [ "$old" != room-manager.service ]; then
        case " $units " in
            *" $old "*) die 'legacy service must not be a new deployment unit' ;;
        esac
    fi
    [ "$(property "$old" Id)" = "$old" ] || die 'use the canonical service name, not an alias'
    [ "$(property "$old" LoadState)" = loaded ] || die 'legacy service is not loaded'
    [ "$(property "$old" ActiveState)" = active ] || die 'legacy service must be active'
    [ "$(property "$old" KillMode)" = control-group ] || die 'legacy service must use KillMode=control-group'
    [ "$(property "$old" RemainAfterExit)" = no ] || die 'oneshot legacy services are not supported'
    [ -z "$(property "$old" TriggeredBy)" ] || die 'timer/socket activated legacy services require a separate migration'

    for unit in $units; do
        if [ "$old" = room-manager.service ] && [ "$unit" = room-manager.service ]; then
            continue
        fi
        [ "$(property "$unit" LoadState)" = not-found ] || die "new unit already exists: $unit"
    done
    [ ! -e "$state" ] || die "migration already recorded at $state"
    [ "$(uname -m)" = aarch64 ] || die 'native migration requires aarch64'
    [ -r "$config/app.env" ] || die 'prepare app.env first (see DEPLOYMENT.md)'
    [ -r "$config/deploy.env" ] || die 'prepare deploy.env first (see DEPLOYMENT.md)'
    if grep -q 'replace-me\|example\.workers\.dev' "$config/app.env"; then
        die 'app.env contains placeholders'
    fi
    manifest_url=$(sed -n 's/^ROOM_MANAGER_MANIFEST_URL=//p' "$config/deploy.env" | sed -n '1p')
    case "$manifest_url" in
        https://*) ;;
        *) die 'ROOM_MANAGER_MANIFEST_URL must be an HTTPS URL' ;;
    esac
}

guard() {
    unit=$1
    marker=$2
    dropin=$root/etc/systemd/system/$unit.d/90-room-manager-migration.conf
    install -d -m 0755 "$(dirname -- "$dropin")"
    printf '[Unit]\nConditionPathExists=!%s\n' "$state/$marker" >"$dropin"
}

unit_is_stopped() {
    case "$(property "$1" ActiveState)" in
        inactive|failed|deactivating) return 0 ;;
        *) return 1 ;;
    esac
}

stop_new_units() {
    safe=true
    for unit in room-manager-deploy.timer room-manager-deploy.service room-manager.service; do
        if [ "$same_service_name" = true ] && [ "$unit" = room-manager.service ] &&
            [ ! -f "$state/legacy-replaced" ]; then
            continue
        fi
        load=$(property "$unit" LoadState 2>/dev/null || true)
        if [ "$load" = loaded ]; then
            systemctl stop "$unit" || safe=false
            unit_is_stopped "$unit" || safe=false
        elif [ "$load" != not-found ]; then
            safe=false
        fi
    done
    [ "$safe" = true ]
}

wait_ready() {
    timeout=${ROOM_MANAGER_MIGRATION_TIMEOUT:-180}
    case "$timeout" in ''|*[!0-9]*) die 'invalid ROOM_MANAGER_MIGRATION_TIMEOUT' ;; esac
    deadline=$(( $(date +%s) + timeout ))
    until systemctl is-active --quiet room-manager.service; do
        [ "$(date +%s)" -lt "$deadline" ] || return 1
        sleep 1
    done
}

restore_legacy() {
    [ -f "$state/old-unit" ] || die 'no saved migration'
    old=$(sed -n '1p' "$state/old-unit")
    mkdir -p "$state"
    : >"$state/block-new"
    phase rolling-back

    if ! stop_new_units; then
        phase recovery-required
        echo 'new native units could not be stopped; legacy remains blocked' >&2
        return 1
    fi

    if [ -f "$state/legacy-stopped" ]; then
        if pgrep -x room-manager >/dev/null 2>&1; then
            phase recovery-required
            echo 'a room-manager process remains; legacy stays blocked' >&2
            return 1
        fi
    fi

    if [ "$same_service_name" = true ]; then
        if [ -f "$state/legacy-room-manager.service" ]; then
            install -m 0644 "$state/legacy-room-manager.service" \
                "$root/etc/systemd/system/room-manager.service"
        fi
        rm -f -- "$root/etc/systemd/system/room-manager.service.d/90-room-manager-migration.conf"
    fi
    for unit in room-manager.service room-manager-deploy.timer; do
        load=$(property "$unit" LoadState 2>/dev/null || true)
        if [ "$load" = loaded ]; then
            systemctl disable "$unit" || safe=false
        fi
    done
    if [ "$safe" != true ]; then
        phase recovery-required
        echo 'new native unit enable state could not be restored' >&2
        return 1
    fi
    rm -f -- "$state/block-legacy"
    systemctl daemon-reload
    if [ "$(sed -n '1p' "$state/old-enabled")" = enabled ]; then
        systemctl enable "$old"
    fi
    systemctl start "$old"
    [ "$(property "$old" ActiveState)" = active ] || {
        : >"$state/block-legacy"
        systemctl daemon-reload || true
        phase recovery-required
        echo 'legacy service did not become active; operator attention is required' >&2
        return 1
    }
    phase rolled-back
    echo 'legacy service restored; native units remain blocked by migration state'
}

if [ "$action" = check ]; then
    preflight
    echo "Preflight passed for $old. No service or host state was changed."
    exit 0
fi

if [ "$action" = apply ]; then
    preflight
else
    [ -f "$state/old-unit" ] || die 'no saved migration'
    old=$(sed -n '1p' "$state/old-unit")
fi
[ "$old" = room-manager.service ] && same_service_name=true

mkdir -p "$root/run"
exec 9>"$lock_path"
flock -n 9 || die 'another deployment or migration is running'

if [ "$action" = rollback ]; then
    restore_legacy
    exit
fi

if [ "$action" = finalize ]; then
    [ "$(sed -n '1p' "$state/phase")" = awaiting-verification ] ||
        die 'migration is not awaiting hardware verification'
    if [ "$same_service_name" = true ]; then
        [ -f "$state/legacy-replaced" ] || die 'legacy service replacement is not recorded'
    else
        [ -f "$state/block-legacy" ] || die 'legacy service guard is missing'
    fi
    [ ! -f "$state/block-new" ] || die 'native service is blocked'
    if [ "$same_service_name" != true ]; then
        unit_is_stopped "$old" || die 'legacy service is still active'
    fi
    wait_ready || die 'native room-manager is not ready'
    systemctl enable --now room-manager-deploy.timer
    [ "$(property room-manager-deploy.timer ActiveState)" = active ] ||
        die 'deployment timer did not start'
    phase complete
    echo 'Migration complete; pull-based native updates are enabled.'
    exit
fi

install -d -m 0700 "$state"
printf '%s\n' "$old" >"$state/old-unit"
printf '%s\n' "$(property "$old" UnitFileState)" >"$state/old-enabled"
systemctl cat "$old" >"$state/legacy-unit.txt"
if [ "$same_service_name" = true ]; then
    legacy_fragment=$(property "$old" FragmentPath 2>/dev/null || true)
    case "$legacy_fragment" in
        /*) legacy_fragment_path=$root$legacy_fragment ;;
        *) legacy_fragment_path=$root/etc/systemd/system/room-manager.service ;;
    esac
    [ -r "$legacy_fragment_path" ] || die "cannot preserve legacy unit: $legacy_fragment_path"
    install -m 0644 "$legacy_fragment_path" "$state/legacy-room-manager.service"
fi
phase preparing

legacy_stopped=false
restore_on_exit() {
    result=$?
    trap - EXIT HUP INT TERM
    if [ "$result" -ne 0 ]; then
        echo "Migration failed; restoring $old" >&2
        if [ "$legacy_stopped" = true ]; then
            : >"$state/legacy-stopped"
        fi
        restore_legacy || echo "Recovery requires attention; see $state/phase" >&2
    fi
    exit "$result"
}
trap restore_on_exit EXIT
trap 'exit 130' INT HUP TERM

# Guard both sides before touching the legacy service. These markers survive a
# power loss and prevent systemd from starting both implementations at boot.
: >"$state/block-new"
guard room-manager.service block-new
guard room-manager-deploy.service block-new
guard room-manager-deploy.timer block-new
if [ "$same_service_name" != true ]; then
    guard "$old" block-legacy
fi
systemctl daemon-reload

# Install units and download the immutable release while the legacy process is
# still serving. The controller's prepare action never changes current or
# restarts room-manager.service.
native_systemd_dir=$root/etc/systemd/system
if [ "$same_service_name" = true ]; then
    native_systemd_dir=$root/etc/room-manager-native-systemd
fi
ROOM_MANAGER_CONFIG_DIR="$config" \
ROOM_MANAGER_INSTALL_ROOT="$root/opt/room-manager" \
ROOM_MANAGER_STATE_DIR="$deploy_state" \
ROOM_MANAGER_SYSTEMD_DIR="$native_systemd_dir" \
ROOM_MANAGER_LIBEXEC_DIR="$root/usr/local/libexec" \
    "$installer" --prepare-only

ROOM_MANAGER_DEPLOY_ENV="$config/deploy.env" \
ROOM_MANAGER_INSTALL_ROOT="$root/opt/room-manager" \
ROOM_MANAGER_STATE_DIR="$deploy_state" \
ROOM_MANAGER_DEPLOY_LOCK="$lock_path" \
ROOM_MANAGER_DEPLOY_LOCK_HELD=true \
    "$controller" prepare

[ -r "$deploy_state/prepared-sha" ] || die 'native release was not prepared'
prepared_sha=$(sed -n '1p' "$deploy_state/prepared-sha")
case "$prepared_sha" in
    ???????*) [ "${#prepared_sha}" -eq 40 ] || die 'prepared release SHA is invalid' ;;
    *) die 'prepared release SHA is invalid' ;;
esac
phase stopping-legacy

if [ "$same_service_name" != true ]; then
    : >"$state/block-legacy"
fi
if [ "$(sed -n '1p' "$state/old-enabled")" = enabled ]; then
    systemctl disable "$old"
fi
systemctl stop "$old"
legacy_stopped=true
: >"$state/legacy-stopped"
case "$(property "$old" ActiveState)" in
    inactive|failed) ;;
    *) die 'legacy service did not stop' ;;
esac
[ "$(property "$old" MainPID)" = 0 ] || die 'legacy main process remains'
if pgrep -x room-manager >/dev/null 2>&1; then
    die 'another room-manager process remains; inspect startup sources'
fi

if [ "$same_service_name" = true ]; then
    for unit in room-manager.service room-manager-deploy.service room-manager-deploy.timer; do
        install -m 0644 "$native_systemd_dir/$unit" "$root/etc/systemd/system/$unit"
    done
    : >"$state/legacy-replaced"
    rm -f -- "$root/etc/systemd/system/room-manager.service.d/90-room-manager-migration.conf"
fi
systemctl daemon-reload
phase starting-native
rm -f -- "$state/block-new"
systemctl daemon-reload
ROOM_MANAGER_DEPLOY_ENV="$config/deploy.env" \
ROOM_MANAGER_INSTALL_ROOT="$root/opt/room-manager" \
ROOM_MANAGER_STATE_DIR="$deploy_state" \
ROOM_MANAGER_DEPLOY_LOCK="$lock_path" \
ROOM_MANAGER_DEPLOY_LOCK_HELD=true \
    "$controller" deploy
wait_ready || die 'native room-manager readiness timed out'
systemctl enable room-manager.service
phase awaiting-verification
trap - EXIT HUP INT TERM
echo 'Native room-manager is ready. Verify cards, Discord, audio, unlock/relock and USB reconnect, then run finalize --hardware-verified.'
echo "To return to the legacy binary, run: $0 rollback"
