#!/bin/sh
set -eu

repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
controller=$repo_dir/deploy/native/room-manager-deploy.sh
artifact_builder=$repo_dir/deploy/native/create-artifact.sh
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

mock_bin=$test_dir/bin
mock_state=$test_dir/state
artifact_dir=$test_dir/artifacts
mkdir -p "$mock_bin" "$mock_state" "$artifact_dir"

cat >"$mock_bin/systemctl" <<'EOF'
#!/bin/sh
set -eu

case "${1:-}" in
    is-active)
        [ "${2:-}" = --quiet ]
        [ "$(cat "$MOCK_STATE/service")" = active ]
        ;;
    is-failed)
        [ "${2:-}" = --quiet ]
        [ "$(cat "$MOCK_STATE/service")" = failed ]
        ;;
    restart)
        printf '%s\n' restart >>"$MOCK_STATE/log"
        if [ -f "$MOCK_STATE/fail-next" ]; then
            rm -f "$MOCK_STATE/fail-next"
            printf '%s\n' failed >"$MOCK_STATE/service"
            exit 1
        fi
        printf '%s\n' active >"$MOCK_STATE/service"
        ;;
    *)
        echo "unexpected systemctl call: $*" >&2
        exit 64
        ;;
esac
EOF

cat >"$mock_bin/curl" <<'EOF'
#!/bin/sh
set -eu

url=
output=
while [ "$#" -gt 0 ]; do
    case "$1" in
        -o) output=$2; shift 2 ;;
        -*) shift ;;
        *) url=$1; shift ;;
    esac
done
case "$url" in
    *manifest*) cp "$MOCK_MANIFEST" "$output" ;;
    *aarch64-b*) cp "$MOCK_STATE/artifact-b.tar.gz" "$output" ;;
    *aarch64-c*) cp "$MOCK_STATE/artifact-c.tar.gz" "$output" ;;
    *aarch64-d*) cp "$MOCK_STATE/artifact-d.tar.gz" "$output" ;;
    *) echo "unexpected curl URL: $url" >&2; exit 64 ;;
esac
EOF

chmod +x "$mock_bin/systemctl" "$mock_bin/curl"

binary=$test_dir/room-manager
printf '#!/bin/sh\nexit 0\n' >"$binary"
chmod 0755 "$binary"

sha_a=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
sha_b=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
sha_c=cccccccccccccccccccccccccccccccccccccccc
sha_d=dddddddddddddddddddddddddddddddddddddddd

make_artifact() {
    sha=$1
    artifact_dir_for_sha=$artifact_dir/$sha
    artifact_path=$("$artifact_builder" "$sha" "$binary" "$artifact_dir_for_sha")
    cp "$artifact_path" "$mock_state/artifact-${sha%????????????????????????????????}.tar.gz"
    printf '%s\n' "$artifact_path"
}

artifact_b=$(make_artifact "$sha_b")
artifact_c=$(make_artifact "$sha_c")
artifact_d=$(make_artifact "$sha_d")
cp "$artifact_b" "$mock_state/artifact-b.tar.gz"
cp "$artifact_c" "$mock_state/artifact-c.tar.gz"
cp "$artifact_d" "$mock_state/artifact-d.tar.gz"

release_a=$test_dir/opt/room-manager/releases/$sha_a
mkdir -p "$release_a"
cp "$binary" "$release_a/room-manager"
printf '{"commit":"%s","architecture":"aarch64"}\n' "$sha_a" >"$release_a/manifest.json"
(cd "$release_a" && sha256sum room-manager >SHA256SUMS)
ln -s "releases/$sha_a" "$test_dir/opt/room-manager/current"

manifest=$test_dir/manifest.json
write_manifest() {
    sha=$1
    artifact=$2
    checksum=$(sha256sum "$artifact" | awk '{print $1}')
    printf '{"commit":"%s","architecture":"aarch64","artifact":"https://example.test/%s","sha256":"%s"}\n' \
        "$sha" "$(basename "$artifact")" "$checksum" >"$manifest"
}

run_controller() {
    PATH="$mock_bin:$PATH" \
        MOCK_STATE="$mock_state" \
        MOCK_MANIFEST="$manifest" \
        ROOM_MANAGER_DEPLOY_ENV="$test_dir/deploy.env" \
        ROOM_MANAGER_STATE_DIR="$test_dir/var/lib/room-manager-deploy" \
        ROOM_MANAGER_INSTALL_ROOT="$test_dir/opt/room-manager" \
        ROOM_MANAGER_DEPLOY_LOCK="$test_dir/run/room-manager-deploy.lock" \
        ROOM_MANAGER_CUTOVER_TIMEOUT=2 \
        "$controller" "$@"
}

mkdir -p "$test_dir/run" "$test_dir/var/lib/room-manager-deploy"
printf '%s\n' 'ROOM_MANAGER_MANIFEST_URL=https://example.test/manifest' >"$test_dir/deploy.env"
printf '%s\n' active >"$mock_state/service"
: >"$mock_state/log"

write_manifest "$sha_b" "$artifact_b"
run_controller deploy
[ "$(readlink "$test_dir/opt/room-manager/current")" = "releases/$sha_b" ]
[ "$(readlink "$test_dir/opt/room-manager/previous")" = "releases/$sha_a" ]
[ "$(cat "$mock_state/service")" = active ]

printf '%s\n' "$sha_a" >"$test_dir/var/lib/room-manager-deploy/last-successful-sha"
restart_count=$(wc -l <"$mock_state/log")
run_controller deploy
[ "$(wc -l <"$mock_state/log")" -eq $((restart_count + 1)) ]

restart_count=$(wc -l <"$mock_state/log")
run_controller deploy
[ "$(wc -l <"$mock_state/log")" -eq "$restart_count" ]

write_manifest "$sha_c" "$artifact_c"
touch "$mock_state/fail-next"
if run_controller deploy; then
    echo 'expected failed candidate deployment' >&2
    exit 1
fi
[ "$(readlink "$test_dir/opt/room-manager/current")" = "releases/$sha_b" ]
[ "$(cat "$test_dir/var/lib/room-manager-deploy/failed-sha")" = "$sha_c" ]

restart_count=$(wc -l <"$mock_state/log")
if run_controller deploy; then
    echo 'expected quarantined candidate deployment to fail' >&2
    exit 1
fi
[ "$(wc -l <"$mock_state/log")" -eq "$restart_count" ]

write_manifest "$sha_d" "$artifact_d"
run_controller deploy
[ "$(readlink "$test_dir/opt/room-manager/current")" = "releases/$sha_d" ]
[ ! -e "$test_dir/var/lib/room-manager-deploy/failed-sha" ]

run_controller rollback
[ "$(readlink "$test_dir/opt/room-manager/current")" = "releases/$sha_b" ]
[ "$(readlink "$test_dir/opt/room-manager/previous")" = "releases/$sha_d" ]

touch "$mock_state/fail-next"
if run_controller rollback; then
    echo 'expected rollback readiness failure' >&2
    exit 1
fi
[ "$(readlink "$test_dir/opt/room-manager/current")" = "releases/$sha_b" ]

# Simulate a power loss after a failed cutover recorded the quarantine marker
# but before the controller restored the previous symlinks.
write_manifest "$sha_c" "$artifact_c"
rm -f "$test_dir/opt/room-manager/current" "$test_dir/opt/room-manager/previous"
ln -s "releases/$sha_c" "$test_dir/opt/room-manager/current"
ln -s "releases/$sha_b" "$test_dir/opt/room-manager/previous"
printf '%s\n' "$sha_c" >"$test_dir/var/lib/room-manager-deploy/failed-sha"
printf '%s\n' failed >"$mock_state/service"
restart_count=$(wc -l <"$mock_state/log")
if run_controller deploy; then
    echo 'expected interrupted quarantine recovery to remain failed' >&2
    exit 1
fi
[ "$(readlink "$test_dir/opt/room-manager/current")" = "releases/$sha_b" ]
[ "$(readlink "$test_dir/opt/room-manager/previous")" = "releases/$sha_c" ]
[ "$(cat "$mock_state/service")" = active ]
[ "$(wc -l <"$mock_state/log")" -eq $((restart_count + 1)) ]

restart_count=$(wc -l <"$mock_state/log")
if run_controller deploy; then
    echo 'expected quarantined interrupted candidate deployment to fail' >&2
    exit 1
fi
[ "$(wc -l <"$mock_state/log")" -eq "$restart_count" ]

(
    exec 9>"$test_dir/run/room-manager-deploy.lock"
    flock -n 9
    sleep 2
) &
holder=$!
sleep 1
restart_count=$(wc -l <"$mock_state/log")
run_controller deploy
[ "$(wc -l <"$mock_state/log")" -eq "$restart_count" ]
wait "$holder"

echo 'Native deployment controller tests passed'
