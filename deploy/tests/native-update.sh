#!/bin/sh
set -eu

repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
update_script="$repo_dir/deploy/native/room-manager-update.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

mock_bin="$test_dir/bin"
remote_dir="$test_dir/remote"
state_dir="$test_dir/state"
mkdir -p "$mock_bin" "$remote_dir" "$state_dir"

# curl: serve files from $MOCK_REMOTE_DIR by URL basename.
cat >"$mock_bin/curl" <<'MOCK'
#!/bin/sh
set -eu
output=
url=
while [ "$#" -gt 0 ]; do
    case "$1" in
        --output) output=$2; shift 2 ;;
        --retry|--connect-timeout|--max-time|--header) shift 2 ;;
        --*) shift ;;
        *) url=$1; shift ;;
    esac
done
source_file="$MOCK_REMOTE_DIR/$(basename "$url")"
[ -f "$source_file" ] || { echo "404: $url" >&2; exit 22; }
cp "$source_file" "$output"
MOCK

# flock: the lock itself is not under test.
printf '#!/bin/sh\nexit 0\n' >"$mock_bin/flock"

# systemctl --user: "restart" starts a fake process. The new process reports
# readiness only when the active binary contains the READY=yes marker.
cat >"$mock_bin/systemctl" <<'MOCK'
#!/bin/sh
set -eu
[ "$1" = --user ] && shift
case "$1" in
    restart)
        count=$(cat "$MOCK_STATE_DIR/restarts" 2>/dev/null || echo 0)
        echo $((count + 1)) >"$MOCK_STATE_DIR/restarts"
        pid=$((4000 + count + 1))
        echo "$pid" >"$MOCK_STATE_DIR/pid"
        rm -f "$ROOM_MANAGER_READY_FILE"
        if grep -q 'READY=yes' "$ROOM_MANAGER_DEPLOY_HOME/current/room-manager"; then
            echo "$pid" >"$ROOM_MANAGER_READY_FILE"
        fi
        ;;
    show) cat "$MOCK_STATE_DIR/pid" 2>/dev/null || echo 0 ;;
    is-active) exit 0 ;;
    *) echo "unexpected systemctl call: $*" >&2; exit 64 ;;
esac
MOCK
chmod +x "$mock_bin/curl" "$mock_bin/flock" "$mock_bin/systemctl"

sha_old=1111111111111111111111111111111111111111
sha_new=2222222222222222222222222222222222222222
sha_bad=3333333333333333333333333333333333333333

checksum() {
    sha256sum "$1" 2>/dev/null | cut -d ' ' -f 1 || shasum -a 256 "$1" | cut -d ' ' -f 1
}

# publish <sha> <healthy|unhealthy> [advertised sha256]
publish() {
    asset="$remote_dir/room-manager-$1-aarch64"
    {
        printf '#!/bin/sh\n'
        [ "$2" = healthy ] && printf '# READY=yes\n'
        printf '# build %s\n' "$1"
        printf 'exit 0\n'
    } >"$asset"
    digest=${3:-$(checksum "$asset")}
    printf 'sha=%s\nsha256=%s\n' "$1" "$digest" >"$remote_dir/latest.txt"
}

new_device() {
    rm -rf "${test_dir:?}/home" "${state_dir:?}"
    mkdir -p "$state_dir"
    export ROOM_MANAGER_DEPLOY_HOME="$test_dir/home"
    mkdir -p "$ROOM_MANAGER_DEPLOY_HOME/releases/$sha_old"
    printf '#!/bin/sh\n# READY=yes\n# build old\nexit 0\n' >"$ROOM_MANAGER_DEPLOY_HOME/releases/$sha_old/room-manager"
    chmod +x "$ROOM_MANAGER_DEPLOY_HOME/releases/$sha_old/room-manager"
    ln -s "releases/$sha_old" "$ROOM_MANAGER_DEPLOY_HOME/current"
}

run_update() {
    PATH="$mock_bin:$PATH" \
        MOCK_REMOTE_DIR="$remote_dir" \
        MOCK_STATE_DIR="$state_dir" \
        ROOM_MANAGER_RELEASE_URL=https://example.invalid/releases/download/device-main \
        ROOM_MANAGER_READY_FILE="$test_dir/ready" \
        ROOM_MANAGER_READY_TIMEOUT=2 \
        ROOM_MANAGER_STABLE_SECONDS=0 \
        ROOM_MANAGER_POLL_INTERVAL=1 \
        XDG_RUNTIME_DIR="$test_dir/run" \
        "$update_script" "$@"
}

restarts() {
    cat "$state_dir/restarts" 2>/dev/null || echo 0
}

current_id() {
    basename "$(readlink "$ROOM_MANAGER_DEPLOY_HOME/current")"
}

# 1. A device that already runs the published commit is left untouched.
new_device
publish "$sha_old" healthy
run_update update >/dev/null
[ "$(restarts)" -eq 0 ]
[ "$(current_id)" = "$sha_old" ]

# 2. A healthy new release is deployed and the old one is kept for rollback.
new_device
publish "$sha_new" healthy
run_update update >/dev/null
[ "$(restarts)" -eq 1 ]
[ "$(current_id)" = "$sha_new" ]
[ "$(basename "$(readlink "$ROOM_MANAGER_DEPLOY_HOME/previous")")" = "$sha_old" ]
[ ! -e "$ROOM_MANAGER_DEPLOY_HOME/failed-sha" ]
[ -x "$ROOM_MANAGER_DEPLOY_HOME/releases/$sha_old/room-manager" ]

# 3. A binary that does not match the advertised checksum is never activated.
new_device
publish "$sha_new" healthy 0000000000000000000000000000000000000000000000000000000000000000
if run_update update >/dev/null 2>&1; then
    echo "checksum mismatch was accepted" >&2
    exit 1
fi
[ "$(restarts)" -eq 0 ]
[ "$(current_id)" = "$sha_old" ]
[ ! -e "$ROOM_MANAGER_DEPLOY_HOME/releases/$sha_new" ]

# 4. A malformed manifest is rejected.
new_device
printf 'sha=../../etc\nsha256=abc\n' >"$remote_dir/latest.txt"
if run_update update >/dev/null 2>&1; then
    echo "malformed manifest was accepted" >&2
    exit 1
fi
[ "$(restarts)" -eq 0 ]

# 5. An unhealthy release is rolled back, quarantined and not retried.
new_device
publish "$sha_bad" unhealthy
if run_update update >/dev/null 2>&1; then
    echo "unhealthy release reported success" >&2
    exit 1
fi
[ "$(current_id)" = "$sha_old" ]
[ "$(restarts)" -eq 2 ]
[ "$(cat "$ROOM_MANAGER_DEPLOY_HOME/failed-sha")" = "$sha_bad" ]
run_update update >/dev/null
[ "$(restarts)" -eq 2 ]

# 6. A newer commit supersedes the quarantined one.
publish "$sha_new" healthy
run_update update >/dev/null
[ "$(current_id)" = "$sha_new" ]
[ ! -e "$ROOM_MANAGER_DEPLOY_HOME/failed-sha" ]

# 7. Manual rollback restores the previous release and quarantines the current one.
run_update rollback >/dev/null
[ "$(current_id)" = "$sha_old" ]
[ "$(cat "$ROOM_MANAGER_DEPLOY_HOME/failed-sha")" = "$sha_new" ]
run_update update >/dev/null
[ "$(current_id)" = "$sha_old" ]

# 8. Releases other than current and previous are pruned after a deploy.
new_device
mkdir -p "$ROOM_MANAGER_DEPLOY_HOME/releases/stale"
publish "$sha_new" healthy
run_update update >/dev/null
[ ! -e "$ROOM_MANAGER_DEPLOY_HOME/releases/stale" ]

echo "native-update tests passed"
