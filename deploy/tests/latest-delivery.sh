#!/bin/sh
set -eu

repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
check_script="$repo_dir/deploy/ci/check-latest-delivery.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

mock_bin="$test_dir/bin"
mkdir -p "$mock_bin"

cat >"$mock_bin/gh" <<'EOF'
#!/bin/sh
set -eu

case "$2" in
    */commits/main)
        printf '%s\n' "$MOCK_MAIN_SHA"
        ;;
    */actions/workflows/ci.yml/runs*)
        printf '{"workflow_runs":[{"id":%s,"head_sha":"%s","run_number":%s,"conclusion":"%s"}]}\n' \
            "$MOCK_RUN_ID" "$MOCK_RUN_SHA" "$MOCK_RUN_NUMBER" "$MOCK_CONCLUSION"
        ;;
    *)
        echo "unexpected gh request: $*" >&2
        exit 64
        ;;
esac
EOF
chmod +x "$mock_bin/gh"

run_check() {
    output_file=$1
    deploy_sha=$2
    trigger_run_id=$3
    PATH="$mock_bin:$PATH" \
        GH_TOKEN=test \
        REPOSITORY=example/room-manager \
        DEPLOY_SHA="$deploy_sha" \
        TRIGGER_RUN_ID="$trigger_run_id" \
        GITHUB_OUTPUT="$output_file" \
        MOCK_MAIN_SHA=latest \
        MOCK_RUN_ID=42 \
        MOCK_RUN_SHA=latest \
        MOCK_RUN_NUMBER=7 \
        MOCK_CONCLUSION=success \
        "$check_script"
}

output="$test_dir/output"
run_check "$output" latest 42
[ "$(cat "$output")" = 'is_latest=true' ]

: >"$output"
run_check "$output" stale 42
[ "$(cat "$output")" = 'is_latest=false' ]

: >"$output"
run_check "$output" latest 41
[ "$(cat "$output")" = 'is_latest=false' ]

echo "Latest delivery guard tests passed"
