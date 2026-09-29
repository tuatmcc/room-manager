#!/bin/sh
set -eu

: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${REPOSITORY:?REPOSITORY must be set}"
: "${DEPLOY_SHA:?DEPLOY_SHA must be set}"
: "${TRIGGER_RUN_ID:?TRIGGER_RUN_ID must be set}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"

main_sha=$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)
runs=$(gh api \
    "repos/$REPOSITORY/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=100")
latest_run_id=$(printf '%s' "$runs" | jq -r \
    --arg sha "$main_sha" \
    '[.workflow_runs[] | select(.head_sha == $sha)] | sort_by(.run_number) | last | .id // empty')
latest_conclusion=$(printf '%s' "$runs" | jq -r \
    --arg sha "$main_sha" \
    '[.workflow_runs[] | select(.head_sha == $sha)] | sort_by(.run_number) | last | .conclusion // empty')

if [ "$DEPLOY_SHA" = "$main_sha" ] \
    && [ "$TRIGGER_RUN_ID" = "$latest_run_id" ] \
    && [ "$latest_conclusion" = success ]; then
    printf 'is_latest=true\n' >>"$GITHUB_OUTPUT"
    printf 'Delivery is current: sha=%s ci_run=%s\n' "$DEPLOY_SHA" "$TRIGGER_RUN_ID"
else
    printf 'is_latest=false\n' >>"$GITHUB_OUTPUT"
    printf '%s\n' \
        "Skipping superseded delivery: requested sha=$DEPLOY_SHA ci_run=$TRIGGER_RUN_ID; current sha=$main_sha ci_run=${latest_run_id:-none} conclusion=${latest_conclusion:-none}"
fi
