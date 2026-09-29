#!/bin/sh
set -eu

repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
controller="$repo_dir/deploy/podman/room-manager-blue-green.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

mock_bin="$test_dir/bin"
mock_state="$test_dir/state"
mkdir -p "$mock_bin" "$mock_state"

cat >"$mock_bin/systemctl" <<'EOF'
#!/bin/sh
exit 0
EOF

cat >"$mock_bin/logger" <<'EOF'
#!/bin/sh
exit 0
EOF

cat >"$mock_bin/podman" <<'EOF'
#!/bin/sh
set -eu

command=$1
shift
case "$command" in
    pull)
        exit 0
        ;;
    image)
        subcommand=$1
        shift
        case "$subcommand" in
            inspect) cat "$MOCK_STATE/source-image" ;;
            exists) exit 0 ;;
            *) exit 64 ;;
        esac
        ;;
    container)
        [ "$1" = inspect ] || exit 64
        container=
        for arg in "$@"; do container=$arg; done
        color=${container#room-manager-}
        cat "$MOCK_STATE/image-$color"
        ;;
    tag)
        target=
        for arg in "$@"; do target=$arg; done
        color=${target##*:}
        printf '%s\n' "$color" >"$MOCK_STATE/updated-color"
        exit 0
        ;;
    auto-update)
        if [ "${1:-}" = --help ]; then
            echo 'Auto update containers'
            if [ -f "$MOCK_STATE/supports-filter" ]; then
                echo '  --filter filter'
            fi
            exit 0
        fi
        color=
        for arg in "$@"; do
            case "$arg" in
                *slot=blue) color=blue ;;
                *slot=green) color=green ;;
            esac
        done
        if [ -z "$color" ]; then
            color=$(cat "$MOCK_STATE/updated-color")
        fi
        cp "$MOCK_STATE/source-image" "$MOCK_STATE/image-$color"
        ;;
    healthcheck)
        [ "$1" = run ] || exit 64
        color=${2#room-manager-}
        active=$(cat "$MOCK_STATE/active-color")
        if [ -f "$MOCK_STATE/fail-green-after-cutover" ] \
            && [ "$color" = green ] \
            && [ "$active" = green ]; then
            exit 1
        fi
        exit 0
        ;;
    *)
        echo "unexpected podman command: $command" >&2
        exit 64
        ;;
esac
EOF

chmod +x "$mock_bin/systemctl" "$mock_bin/logger" "$mock_bin/podman"

run_controller() {
    PATH="$mock_bin:$PATH" \
        MOCK_STATE="$mock_state" \
        ROOM_MANAGER_DEPLOY_ENV="$test_dir/missing.env" \
        ROOM_MANAGER_SOURCE_IMAGE=registry.example/room-manager:main \
        ROOM_MANAGER_STATE_DIR="$mock_state" \
        ROOM_MANAGER_DEPLOY_LOCK="$test_dir/deploy.lock" \
        ROOM_MANAGER_CUTOVER_TIMEOUT=1 \
        "$controller" "$@"
}

assert_active() {
    actual=$(cat "$mock_state/active-color")
    if [ "$actual" != "$1" ]; then
        echo "expected active=$1, got active=$actual" >&2
        exit 1
    fi
}

printf 'blue\n' >"$mock_state/active-color"
printf 'old\n' >"$mock_state/image-blue"
printf 'old\n' >"$mock_state/image-green"
printf 'new\n' >"$mock_state/source-image"
run_controller deploy
assert_active green
[ "$(cat "$mock_state/image-green")" = new ]

run_controller deploy
assert_active green

run_controller rollback
assert_active blue

touch "$mock_state/supports-filter"
printf 'filtered\n' >"$mock_state/source-image"
run_controller deploy
assert_active green
rm "$mock_state/supports-filter"

run_controller rollback
assert_active blue
printf 'old\n' >"$mock_state/image-blue"
printf 'old\n' >"$mock_state/image-green"
printf 'newer\n' >"$mock_state/source-image"
touch "$mock_state/fail-green-after-cutover"
if run_controller deploy; then
    echo "expected a failed candidate cutover" >&2
    exit 1
fi
assert_active blue
[ "$(cat "$mock_state/failed-image")" = newer ]

if run_controller deploy; then
    echo "expected the failed image to remain quarantined" >&2
    exit 1
fi
assert_active blue

# Simulate the controller being interrupted after switching the active marker.
# The next timer run must recover the healthy standby before considering updates.
printf 'green\n' >"$mock_state/active-color"
printf 'old\n' >"$mock_state/image-blue"
printf 'newer\n' >"$mock_state/image-green"
if run_controller deploy; then
    echo "expected interrupted-cutover recovery to report failure" >&2
    exit 1
fi
assert_active blue
[ "$(cat "$mock_state/failed-image")" = newer ]

printf 'invalid\n' >"$mock_state/active-color"
if run_controller deploy; then
    echo "expected invalid active-color to fail" >&2
    exit 1
fi

echo "Blue/Green controller tests passed"
