#!/bin/sh
# Publishes the Raspberry Pi binary to the rolling `device-main` GitHub Release.
#
# Assets are immutable per commit (room-manager-<sha>-aarch64). latest.txt is
# uploaded last, so a device never sees a manifest whose binary is missing.
set -eu

: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${REPOSITORY:?REPOSITORY must be set}"
: "${DEPLOY_SHA:?DEPLOY_SHA must be set}"
: "${BINARY_PATH:?BINARY_PATH must be set}"

tag=${RELEASE_TAG:-device-main}
keep=${KEEP_BINARIES:-5}

printf '%s' "$DEPLOY_SHA" | grep -Eq '^[0-9a-f]{40}$' || {
    echo "DEPLOY_SHA must be a 40 character commit SHA" >&2
    exit 64
}
printf '%s' "$keep" | grep -Eq '^[1-9][0-9]*$' || {
    echo "KEEP_BINARIES must be a positive number" >&2
    exit 64
}
[ -s "$BINARY_PATH" ] || {
    echo "binary not found or empty: $BINARY_PATH" >&2
    exit 66
}

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

asset="room-manager-$DEPLOY_SHA-aarch64"
cp "$BINARY_PATH" "$work_dir/$asset"
sha256=$(sha256sum "$work_dir/$asset" | cut -d ' ' -f 1)
printf 'sha=%s\nsha256=%s\n' "$DEPLOY_SHA" "$sha256" >"$work_dir/latest.txt"

if ! gh release view "$tag" --repo "$REPOSITORY" >/dev/null 2>&1; then
    gh release create "$tag" \
        --repo "$REPOSITORY" \
        --target "$DEPLOY_SHA" \
        --title "Device binary (rolling)" \
        --notes "Raspberry Pi binaries fetched by room-manager-update. Managed by the CD workflow; do not edit." \
        --prerelease \
        --latest=false
fi

gh release upload "$tag" --repo "$REPOSITORY" --clobber "$work_dir/$asset"
gh release upload "$tag" --repo "$REPOSITORY" --clobber "$work_dir/latest.txt"

stale=$(gh release view "$tag" --repo "$REPOSITORY" --json assets --jq \
    ".assets | map(select(.name | test(\"^room-manager-[0-9a-f]{40}-aarch64\$\") and . != \"$asset\")) \
     | sort_by(.createdAt) | reverse | .[$((keep - 1)):] | .[].name" 2>/dev/null || true)
for name in $stale; do
    gh release delete-asset "$tag" "$name" --repo "$REPOSITORY" --yes
done

printf 'Published %s (sha256=%s)\n' "$asset" "$sha256"
