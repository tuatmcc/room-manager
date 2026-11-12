#!/bin/sh
set -eu

repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
publish_script="$repo_dir/deploy/ci/publish-device-binary.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

mock_bin="$test_dir/bin"
mkdir -p "$mock_bin" "$test_dir/uploaded"

# gh: record calls, keep uploaded files and serve a fixed asset listing.
cat >"$mock_bin/gh" <<'MOCK'
#!/bin/sh
set -eu
printf '%s\n' "$*" >>"$MOCK_CALLS"
case "$1 $2" in
    "release view")
        case "$*" in
            *--json*) printf '%s\n' "$MOCK_STALE" ;;
            *) [ "$MOCK_RELEASE_EXISTS" = true ] ;;
        esac
        ;;
    "release create") ;;
    "release upload")
        for last; do :; done
        cp "$last" "$MOCK_UPLOADED/$(basename "$last")"
        ;;
    "release delete-asset") ;;
    *) echo "unexpected gh call: $*" >&2; exit 64 ;;
esac
MOCK
chmod +x "$mock_bin/gh"

sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
printf 'fake-binary' >"$test_dir/room-manager"

run_publish() {
    PATH="$mock_bin:$PATH" \
        GH_TOKEN=test \
        REPOSITORY=example/room-manager \
        DEPLOY_SHA="$sha" \
        BINARY_PATH="$test_dir/room-manager" \
        MOCK_CALLS="$test_dir/calls" \
        MOCK_UPLOADED="$test_dir/uploaded" \
        MOCK_RELEASE_EXISTS="$1" \
        MOCK_STALE="${2:-}" \
        "$publish_script"
}

# A missing release is created as a non-latest prerelease, then both assets go up.
: >"$test_dir/calls"
run_publish false >/dev/null
grep -q 'release create device-main .*--target aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.*--prerelease --latest=false' "$test_dir/calls"
grep -q "release upload device-main .*room-manager-$sha-aarch64" "$test_dir/calls"
[ "$(cmp "$test_dir/uploaded/room-manager-$sha-aarch64" "$test_dir/room-manager" && echo same)" = same ]

# The manifest carries the commit and the checksum of the binary.
grep -q "^sha=$sha\$" "$test_dir/uploaded/latest.txt"
grep -Eq '^sha256=[0-9a-f]{64}$' "$test_dir/uploaded/latest.txt"

# The manifest is uploaded after the binary.
binary_line=$(grep -n "release upload .*room-manager-$sha-aarch64" "$test_dir/calls" | cut -d : -f 1)
manifest_line=$(grep -n 'release upload .*latest.txt' "$test_dir/calls" | cut -d : -f 1)
[ "$binary_line" -lt "$manifest_line" ]

# An existing release is reused and stale binaries are deleted.
: >"$test_dir/calls"
run_publish true 'room-manager-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-aarch64' >/dev/null
if grep -q 'release create' "$test_dir/calls"; then
    echo "existing release was recreated" >&2
    exit 1
fi
grep -q 'release delete-asset device-main room-manager-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-aarch64' "$test_dir/calls"

# Invalid input is rejected before anything is published.
: >"$test_dir/calls"
if PATH="$mock_bin:$PATH" GH_TOKEN=test REPOSITORY=example/room-manager \
    DEPLOY_SHA=main BINARY_PATH="$test_dir/room-manager" "$publish_script" >/dev/null 2>&1; then
    echo "invalid sha was accepted" >&2
    exit 1
fi
[ ! -s "$test_dir/calls" ]

echo "publish-device-binary tests passed"
