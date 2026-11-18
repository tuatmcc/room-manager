#!/bin/sh
# Decides whether a release may still be promoted to production.
#
# A release is current only when all of the following hold:
# - TAG_NAME is a release-please version tag (vX.Y.Z) that points at DEPLOY_SHA
# - TAG_NAME is the repository's latest GitHub Release
# - DEPLOY_SHA is contained in main
# - the newest CI run for DEPLOY_SHA on main succeeded
#
# Writes is_latest=true|false to GITHUB_OUTPUT. A superseded release is not an
# error: the workflow skips the remaining promotion steps instead.
set -eu

: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${REPOSITORY:?REPOSITORY must be set}"
: "${TAG_NAME:?TAG_NAME must be set}"
: "${DEPLOY_SHA:?DEPLOY_SHA must be set}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"

printf '%s' "$TAG_NAME" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || {
    echo "TAG_NAME must be a release tag like v1.2.3: $TAG_NAME" >&2
    exit 64
}
printf '%s' "$DEPLOY_SHA" | grep -Eq '^[0-9a-f]{40}$' || {
    echo "DEPLOY_SHA must be a 40 character commit SHA" >&2
    exit 64
}

tag_sha=$(gh api "repos/$REPOSITORY/commits/$TAG_NAME" | jq -r '.sha // empty')
latest_tag=$(gh api "repos/$REPOSITORY/releases/latest" | jq -r '.tag_name // empty')
main_status=$(gh api "repos/$REPOSITORY/compare/$DEPLOY_SHA...main" | jq -r '.status // empty')
ci_conclusion=$(gh api \
    "repos/$REPOSITORY/actions/workflows/ci.yml/runs?head_sha=$DEPLOY_SHA&branch=main&event=push&per_page=100" \
    | jq -r '[.workflow_runs[]] | sort_by(.run_number) | last | .conclusion // empty')

reason=
if [ "$tag_sha" != "$DEPLOY_SHA" ]; then
    reason="tag $TAG_NAME points at ${tag_sha:-nothing}"
elif [ "$latest_tag" != "$TAG_NAME" ]; then
    reason="latest release is ${latest_tag:-none}"
elif [ "$main_status" != ahead ] && [ "$main_status" != identical ]; then
    reason="commit is not on main (compare status: ${main_status:-unknown})"
elif [ "$ci_conclusion" != success ]; then
    reason="CI conclusion is ${ci_conclusion:-none}"
fi

if [ -z "$reason" ]; then
    printf 'is_latest=true\n' >>"$GITHUB_OUTPUT"
    printf 'Release is current: tag=%s sha=%s\n' "$TAG_NAME" "$DEPLOY_SHA"
else
    printf 'is_latest=false\n' >>"$GITHUB_OUTPUT"
    printf 'Skipping release %s (%s): %s\n' "$TAG_NAME" "$DEPLOY_SHA" "$reason"
fi
