#!/bin/sh
# Tests for deploy/ci/check-release-delivery.sh and deploy/ci/wait-for-ci.sh.
set -eu

repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
check_script="$repo_dir/deploy/ci/check-release-delivery.sh"
wait_script="$repo_dir/deploy/ci/wait-for-ci.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

sha=1111111111111111111111111111111111111111
other_sha=2222222222222222222222222222222222222222

mock_bin="$test_dir/bin"
mkdir -p "$mock_bin"

# MOCK_CI_STATUSES is a space separated list of "status:conclusion" pairs. Each
# CI query consumes the first pair until only one remains.
cat >"$mock_bin/gh" <<'EOF'
#!/bin/sh
set -eu

case "$2" in
    */commits/*)
        printf '{"sha":"%s"}\n' "$MOCK_TAG_SHA"
        ;;
    */releases/latest)
        printf '{"tag_name":"%s"}\n' "$MOCK_LATEST_TAG"
        ;;
    */compare/*)
        printf '{"status":"%s"}\n' "$MOCK_MAIN_STATUS"
        ;;
    */actions/workflows/ci.yml/runs*)
        state_file="$MOCK_STATE_DIR/ci"
        [ -f "$state_file" ] || printf '%s\n' "$MOCK_CI_STATUSES" >"$state_file"
        set -- $(cat "$state_file")
        if [ "$1" = none ]; then
            printf '{"workflow_runs":[]}\n'
        else
            status=${1%%:*}
            conclusion=${1#*:}
            printf '{"workflow_runs":[{"id":1,"run_number":1,"status":"%s","conclusion":%s}]}\n' \
                "$status" "$([ -n "$conclusion" ] && printf '"%s"' "$conclusion" || printf null)"
        fi
        [ "$#" -gt 1 ] && shift
        printf '%s\n' "$*" >"$state_file"
        ;;
    *)
        echo "unexpected gh request: $*" >&2
        exit 64
        ;;
esac
EOF
chmod +x "$mock_bin/gh"

reset_mock() {
    rm -rf "$test_dir/state"
    mkdir -p "$test_dir/state"
    MOCK_TAG_SHA=$sha
    MOCK_LATEST_TAG=v1.2.3
    MOCK_MAIN_STATUS=identical
    MOCK_CI_STATUSES=completed:success
}

run_check() {
    output="$test_dir/output"
    : >"$output"
    PATH="$mock_bin:$PATH" \
        GH_TOKEN=test \
        REPOSITORY=example/room-manager \
        TAG_NAME=${TAG:-v1.2.3} \
        DEPLOY_SHA=$sha \
        GITHUB_OUTPUT="$output" \
        MOCK_STATE_DIR="$test_dir/state" \
        MOCK_TAG_SHA="$MOCK_TAG_SHA" \
        MOCK_LATEST_TAG="$MOCK_LATEST_TAG" \
        MOCK_MAIN_STATUS="$MOCK_MAIN_STATUS" \
        MOCK_CI_STATUSES="$MOCK_CI_STATUSES" \
        "$check_script" >/dev/null || return
    cat "$output"
}

run_wait() {
    PATH="$mock_bin:$PATH" \
        GH_TOKEN=test \
        REPOSITORY=example/room-manager \
        DEPLOY_SHA=$sha \
        CI_WAIT_TIMEOUT=${TIMEOUT:-5} \
        CI_POLL_INTERVAL=1 \
        MOCK_STATE_DIR="$test_dir/state" \
        MOCK_CI_STATUSES="$MOCK_CI_STATUSES" \
        "$wait_script" >/dev/null 2>&1
}

expect() {
    if [ "$2" != "$3" ]; then
        printf 'FAIL: %s: expected %s, got %s\n' "$1" "$3" "$2" >&2
        exit 1
    fi
}

# check-release-delivery.sh
reset_mock
expect "current release" "$(run_check)" is_latest=true

reset_mock
MOCK_MAIN_STATUS=ahead
expect "main moved on after the release" "$(run_check)" is_latest=true

reset_mock
MOCK_LATEST_TAG=v1.2.4
expect "superseded by a newer release" "$(run_check)" is_latest=false

reset_mock
MOCK_TAG_SHA=$other_sha
expect "tag points elsewhere" "$(run_check)" is_latest=false

reset_mock
MOCK_MAIN_STATUS=diverged
expect "commit not on main" "$(run_check)" is_latest=false

reset_mock
MOCK_CI_STATUSES=completed:failure
expect "CI failed" "$(run_check)" is_latest=false

reset_mock
MOCK_CI_STATUSES=none
expect "CI missing" "$(run_check)" is_latest=false

reset_mock
if TAG=device-main run_check >/dev/null 2>&1; then
    echo "FAIL: non-version tag was accepted" >&2
    exit 1
fi

# wait-for-ci.sh
reset_mock
MOCK_CI_STATUSES="none in_progress: completed:success"
run_wait || {
    echo "FAIL: wait did not succeed after CI completed" >&2
    exit 1
}

reset_mock
MOCK_CI_STATUSES="in_progress: completed:failure"
if run_wait; then
    echo "FAIL: wait succeeded for failed CI" >&2
    exit 1
fi

reset_mock
MOCK_CI_STATUSES=in_progress:
if TIMEOUT=1 run_wait; then
    echo "FAIL: wait succeeded without CI completing" >&2
    exit 1
fi

echo "Release delivery guard tests passed"
