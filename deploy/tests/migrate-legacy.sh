#!/bin/sh
set -eu
repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
mkdir "$test_dir/bin"

# Fake every host-facing operation; never run the real installer/systemctl.
cat >"$test_dir/bin/mock" <<'EOF'
#!/bin/sh
set -eu
data="$ROOM_MANAGER_MIGRATION_ROOT/mock"
state="$ROOM_MANAGER_MIGRATION_ROOT/var/lib/room-manager-migration"
tool=${0##*/}
printf '%s %s\n' "$tool" "$*" >>"$data/log"
case "$tool" in
    id) echo 0 ;;
    uname) echo aarch64 ;;
    curl) [ ! -f "$data/api-failure" ] ;;
    pgrep) [ -f "$data/stray-process" ] ;;
    installer)
        [ "$1" = --prepare-only ] && [ "$2" = --image ]
        [ "$(cat "$data/legacy.service")" = active ]
        [ -f "$state/block-new" ]
        [ ! -f "$data/prepare-failure" ]
        for unit in room-manager-blue.service room-manager-green.service room-manager-deploy.service room-manager-deploy.timer; do
            echo inactive >"$data/$unit"
        done
        touch "$data/images"
        ;;
    podman)
        case "$1 $2" in
            'image exists') [ -f "$data/images" ] ;;
            'container exists')
                if [ -f "$data/inspect-failure" ]; then exit 125; fi
                [ -f "$data/container-$3" ] ;;
            'image inspect') echo sha256:tested ;;
            'healthcheck run') [ ! -f "$data/health-failure" ] ;;
            'inspect --format')
                case "$(cat "$data/$4.service")" in active) echo true ;; *) echo false ;; esac ;;
            *) exit 64 ;;
        esac
        ;;
    systemctl)
        case "$1" in
            show)
                case "$3" in
                    --property=Id) echo "$2" ;;
                    --property=LoadState)
                        if [ -f "$data/$2" ]; then echo loaded; else echo not-found; fi ;;
                    --property=ActiveState) cat "$data/$2" ;;
                    --property=KillMode) echo control-group ;;
                    --property=RemainAfterExit) echo no ;;
                    --property=TriggeredBy) if [ -f "$data/triggered" ]; then echo legacy.timer; fi ;;
                    --property=UnitFileState) cat "$data/old-enabled" ;;
                    --property=MainPID) echo 0 ;;
                    *) exit 64 ;;
                esac ;;
            cat) echo '[Service]' ;;
            daemon-reload) : ;;
            disable) : ;;
            enable)
                if [ "$2" = --now ]; then echo active >"$data/$3"; fi ;;
            start)
                shift
                for unit do
                    case "$unit" in
                        legacy.service)
                            [ ! -f "$state/block-legacy" ]
                            for color in blue green; do
                                [ "$(cat "$data/room-manager-$color.service" 2>/dev/null || true)" != active ]
                            done ;;
                        room-manager-*)
                            [ "$(cat "$data/legacy.service")" = inactive ]
                            [ ! -f "$state/block-new" ]
                            touch "$data/container-${unit%.service}" ;;
                    esac
                    echo active >"$data/$unit"
                done ;;
            stop)
                if [ "$2" = room-manager-blue.service ] && [ -f "$data/stop-failure" ]; then exit 1; fi
                echo inactive >"$data/$2" ;;
            *) exit 64 ;;
        esac ;;
    *) exit 64 ;;
esac
EOF
chmod +x "$test_dir/bin/mock"
for command in id uname curl pgrep installer podman systemctl; do
    ln -s mock "$test_dir/bin/$command"
done
export PATH="$test_dir/bin:$PATH"
export ROOM_MANAGER_MIGRATION_INSTALLER="$test_dir/bin/installer"
export ROOM_MANAGER_MIGRATION_TIMEOUT=0
image=ghcr.io/tuatmcc/room-manager:sha-0123456789012345678901234567890123456789
script="$repo_dir/deploy/podman/migrate-legacy.sh"

setup() {
    ROOM_MANAGER_MIGRATION_ROOT="$test_dir/$1"
    export ROOM_MANAGER_MIGRATION_ROOT
    data="$ROOM_MANAGER_MIGRATION_ROOT/mock"
    state="$ROOM_MANAGER_MIGRATION_ROOT/var/lib/room-manager-migration"
    mkdir -p "$data" "$ROOM_MANAGER_MIGRATION_ROOT/run" "$ROOM_MANAGER_MIGRATION_ROOT/etc/room-manager"
    echo active >"$data/legacy.service"
    echo enabled >"$data/old-enabled"
    echo 'API_PATH=https://test.invalid' >"$ROOM_MANAGER_MIGRATION_ROOT/etc/room-manager/app.env"
    touch "$ROOM_MANAGER_MIGRATION_ROOT/etc/room-manager/deploy.env"
}
fail() { echo "test failed: $*" >&2; exit 1; }

setup check
"$script" check legacy.service "$image"
[ ! -e "$state" ] || fail 'check modified host state'
if "$script" apply legacy.service ghcr.io/tuatmcc/room-manager:main; then fail 'mutable tag accepted'; fi
[ ! -e "$state" ] || fail 'invalid image modified services'
touch "$data/triggered"
if "$script" check legacy.service "$image"; then fail 'triggered legacy accepted'; fi

setup success
"$script" apply legacy.service "$image"
[ "$(cat "$state/phase")" = awaiting-verification ]
if "$script" apply legacy.service "$image"; then fail 'repeated migration accepted'; fi
if grep -q 'enable --now room-manager-deploy.timer' "$data/log"; then fail 'timer enabled before hardware verification'; fi
if "$script" finalize; then fail 'finalize accepted without hardware verification'; fi
"$script" finalize --hardware-verified
[ "$(cat "$state/phase")" = complete ]
"$script" rollback
[ "$(cat "$state/phase")" = rolled-back ]
[ "$(cat "$data/legacy.service")" = active ]
[ -f "$state/block-new" ]
[ ! -f "$state/block-legacy" ]

setup prepare-failure
touch "$data/prepare-failure"
if "$script" apply legacy.service "$image"; then fail 'prepare failure accepted'; fi
[ "$(cat "$data/legacy.service")" = active ]
if grep -q 'stop legacy.service' "$data/log"; then fail 'stopped legacy before preparation'; fi

setup health-failure
touch "$data/health-failure"
if "$script" apply legacy.service "$image"; then fail 'unhealthy deployment accepted'; fi
[ "$(cat "$state/phase")" = rolled-back ]
[ "$(cat "$data/legacy.service")" = active ]

setup api-failure
touch "$data/api-failure"
if "$script" apply legacy.service "$image"; then fail 'unhealthy API accepted'; fi
[ ! -e "$state" ]
[ "$(cat "$data/legacy.service")" = active ]

setup stray-process
touch "$data/stray-process"
if "$script" apply legacy.service "$image"; then fail 'remaining process ignored'; fi
[ "$(cat "$state/phase")" = rolled-back ]
if grep -q 'start room-manager-blue.service' "$data/log"; then fail 'started alongside stray process'; fi

setup inspect-failure
"$script" apply legacy.service "$image"
touch "$data/inspect-failure"
if "$script" rollback; then fail 'Podman error mistaken for absent container'; fi
[ "$(cat "$state/phase")" = recovery-required ]
[ -f "$state/block-legacy" ]
rm "$data/inspect-failure"
"$script" rollback

setup unsafe-rollback
touch "$data/health-failure" "$data/stop-failure"
if "$script" apply legacy.service "$image"; then fail 'unsafe rollback accepted'; fi
[ "$(cat "$state/phase")" = recovery-required ]
[ -f "$state/block-legacy" ]
[ "$(cat "$data/legacy.service")" = inactive ]
rm "$data/stop-failure"
"$script" rollback
[ "$(cat "$data/legacy.service")" = active ]

setup disabled
echo disabled >"$data/old-enabled"
"$script" apply legacy.service "$image"
"$script" rollback
if grep -q 'enable legacy.service' "$data/log"; then fail 'changed original boot enable state'; fi

setup interrupted
"$script" apply legacy.service "$image"
echo starting-containers >"$state/phase"
"$script" rollback
[ "$(cat "$state/phase")" = rolled-back ]
echo 'Legacy migration tests passed'
