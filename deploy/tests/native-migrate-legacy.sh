#!/bin/sh
set -eu

repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
script=$repo_dir/deploy/native/migrate-legacy.sh
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
mock_bin=$test_dir/bin
mkdir -p "$mock_bin"

cat >"$mock_bin/mock" <<'EOF'
#!/bin/sh
set -eu

data=$ROOM_MANAGER_MIGRATION_ROOT/mock
state=$ROOM_MANAGER_MIGRATION_ROOT/var/lib/room-manager-migration
tool=${0##*/}
printf '%s %s\n' "$tool" "$*" >>"$data/log"

case "$tool" in
    id) echo 0 ;;
    uname) echo aarch64 ;;
    pgrep)
        [ -f "$data/stray-process" ]
        ;;
    installer)
        [ "$1" = --prepare-only ]
        legacy_unit=legacy.service
        [ ! -f "$data/same-legacy" ] || legacy_unit=room-manager.service
        [ "$(cat "$data/$legacy_unit")" = active ]
        [ -f "$state/block-new" ]
        [ ! -f "$data/prepare-failure" ]
        mkdir -p "$ROOM_MANAGER_MIGRATION_ROOT/var/lib/room-manager-deploy"
        printf '%s\n' bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb >"$ROOM_MANAGER_MIGRATION_ROOT/var/lib/room-manager-deploy/prepared-sha"
        mkdir -p "$ROOM_MANAGER_SYSTEMD_DIR"
        for unit in room-manager.service room-manager-recover.service room-manager-deploy.service room-manager-deploy.timer; do
            touch "$ROOM_MANAGER_SYSTEMD_DIR/$unit"
        done
        touch "$data/installed"
        ;;
    controller)
        case "$1" in
            prepare)
                [ -f "$state/block-new" ]
                legacy_unit=legacy.service
                [ ! -f "$data/same-legacy" ] || legacy_unit=room-manager.service
                [ "$(cat "$data/$legacy_unit")" = active ]
                ;;
            deploy)
                [ ! -f "$state/block-new" ]
                legacy_unit=legacy.service
                [ ! -f "$data/same-legacy" ] || legacy_unit=room-manager.service
                [ "$(cat "$data/$legacy_unit")" = inactive ]
                [ ! -f "$data/deploy-failure" ]
                printf '%s\n' active >"$data/room-manager.service"
                ;;
            *) exit 64 ;;
        esac
        ;;
    systemctl)
        case "$1" in
            show)
                unit=$2
                property=$3
                property=${property#--property=}
                case "$property" in
                    Id) echo "$unit" ;;
                    LoadState)
                        case "$unit" in
                            legacy.service)
                                echo loaded
                                ;;
                            room-manager.service)
                                if [ -f "$data/same-legacy" ] || [ -f "$data/installed" ]; then echo loaded; else echo not-found; fi
                                ;;
                            room-manager-recover.service|room-manager-deploy.service|room-manager-deploy.timer)
                                if [ -f "$data/installed" ]; then echo loaded; else echo not-found; fi
                                ;;
                            *) echo not-found ;;
                        esac
                        ;;
                    ActiveState)
                        cat "$data/$unit" 2>/dev/null || echo inactive
                        ;;
                    KillMode) echo control-group ;;
                    RemainAfterExit) echo no ;;
                    TriggeredBy) ;;
                    FragmentPath) echo /etc/systemd/system/room-manager.service ;;
                    UnitFileState) cat "$data/old-enabled" ;;
                    MainPID) echo 0 ;;
                    *) exit 64 ;;
                esac
                ;;
            cat) echo '[Service]' ;;
            daemon-reload) : ;;
            disable) printf 'disable %s\n' "$*" >>"$data/actions" ;;
            enable)
                if [ "$2" = --now ]; then
                    printf '%s\n' active >"$data/$3"
                fi
                printf 'enable %s\n' "$*" >>"$data/actions"
                ;;
            start)
                shift
                for unit do
                    case "$unit" in
                        legacy.service)
                            [ ! -f "$state/block-legacy" ]
                            printf '%s\n' active >"$data/legacy.service"
                            ;;
                        room-manager.service)
                            [ ! -f "$state/block-new" ] ||
                                [ ! -f "$ROOM_MANAGER_MIGRATION_ROOT/etc/systemd/system/room-manager.service.d/90-room-manager-migration.conf" ]
                            printf '%s\n' active >"$data/room-manager.service"
                            ;;
                        room-manager-recover.service|room-manager-deploy.service|room-manager-deploy.timer)
                            [ ! -f "$state/block-new" ]
                            printf '%s\n' active >"$data/$unit"
                            ;;
                    esac
                done
                ;;
            stop)
                shift
                for unit do
                    case "$unit" in
                        legacy.service|room-manager.service|room-manager-recover.service|room-manager-deploy.service|room-manager-deploy.timer)
                            printf '%s\n' inactive >"$data/$unit"
                            ;;
                    esac
                done
                ;;
            is-active)
                [ "$2" = --quiet ]
                [ "$(cat "$data/$3" 2>/dev/null || true)" = active ]
                ;;
            *) exit 64 ;;
        esac
        ;;
    *) exit 64 ;;
esac
EOF
chmod +x "$mock_bin/mock"
for command in id uname pgrep installer controller systemctl; do
    ln -s mock "$mock_bin/$command"
done
export PATH="$mock_bin:$PATH"
export ROOM_MANAGER_MIGRATION_INSTALLER="$mock_bin/installer"
export ROOM_MANAGER_MIGRATION_CONTROLLER="$mock_bin/controller"

setup() {
    name=$1
    root=$test_dir/$name
    export ROOM_MANAGER_MIGRATION_ROOT="$root"
    data=$root/mock
    state=$root/var/lib/room-manager-migration
    mkdir -p "$data" "$root/run" "$root/etc/room-manager"
    printf '%s\n' active >"$data/legacy.service"
    printf '%s\n' enabled >"$data/old-enabled"
    printf '%s\n' 'API_PATH=https://room-manager.example.test' >"$root/etc/room-manager/app.env"
    printf '%s\n' 'ROOM_MANAGER_MANIFEST_URL=https://example.test/manifest' >"$root/etc/room-manager/deploy.env"
    : >"$data/log"
}
fail() { echo "test failed: $*" >&2; exit 1; }

setup check
"$script" check legacy.service
[ ! -e "$state" ] || fail 'check modified state'

setup success
"$script" apply legacy.service
[ "$(cat "$state/phase")" = awaiting-verification ]
[ "$(cat "$data/legacy.service")" = inactive ]
[ "$(cat "$data/room-manager.service")" = active ]
[ -f "$state/block-legacy" ]
[ ! -f "$state/block-new" ]
"$script" finalize --hardware-verified
[ "$(cat "$state/phase")" = complete ]
[ "$(cat "$data/room-manager-deploy.timer")" = active ]
"$script" rollback
[ "$(cat "$state/phase")" = rolled-back ]
[ "$(cat "$data/legacy.service")" = active ]
[ -f "$state/block-new" ]
[ ! -f "$state/block-legacy" ]

setup deploy-failure
touch "$data/deploy-failure"
if "$script" apply legacy.service; then
    fail 'deployment failure was accepted'
fi
[ "$(cat "$data/legacy.service")" = active ]
[ "$(cat "$state/phase")" = rolled-back ]
[ -f "$state/block-new" ]

setup interrupted
"$script" apply legacy.service
printf '%s\n' starting-native >"$state/phase"
"$script" rollback
[ "$(cat "$state/phase")" = rolled-back ]
[ "$(cat "$data/legacy.service")" = active ]

setup same-service
touch "$data/same-legacy"
printf '%s\n' active >"$data/room-manager.service"
mkdir -p "$ROOM_MANAGER_MIGRATION_ROOT/etc/systemd/system"
printf '%s\n' '[Service]' >"$ROOM_MANAGER_MIGRATION_ROOT/etc/systemd/system/room-manager.service"
"$script" check room-manager.service
"$script" apply room-manager.service
[ "$(cat "$state/phase")" = awaiting-verification ]
[ -f "$state/legacy-replaced" ]
"$script" finalize --hardware-verified
"$script" rollback
[ "$(cat "$state/phase")" = rolled-back ]
[ "$(cat "$data/room-manager.service")" = active ]

echo 'Native migration tests passed'
