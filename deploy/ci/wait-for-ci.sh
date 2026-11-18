#!/bin/sh
# Waits for the CI run of DEPLOY_SHA on main to finish.
#
# The release-please workflow and CI start from the same push, so a release can
# be created before CI has finished. Exits 0 only when the newest CI run for the
# commit succeeded; a failed run or a timeout stops the delivery.
set -eu

: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${REPOSITORY:?REPOSITORY must be set}"
: "${DEPLOY_SHA:?DEPLOY_SHA must be set}"

timeout=${CI_WAIT_TIMEOUT:-3600}
interval=${CI_POLL_INTERVAL:-30}

printf '%s' "$DEPLOY_SHA" | grep -Eq '^[0-9a-f]{40}$' || {
    echo "DEPLOY_SHA must be a 40 character commit SHA" >&2
    exit 64
}
printf '%s' "$timeout" | grep -Eq '^[0-9]+$' || {
    echo "CI_WAIT_TIMEOUT must be a number of seconds" >&2
    exit 64
}
printf '%s' "$interval" | grep -Eq '^[1-9][0-9]*$' || {
    echo "CI_POLL_INTERVAL must be a positive number of seconds" >&2
    exit 64
}

waited=0
while :; do
    run=$(gh api \
        "repos/$REPOSITORY/actions/workflows/ci.yml/runs?head_sha=$DEPLOY_SHA&branch=main&event=push&per_page=100" \
        | jq -c '[.workflow_runs[]] | sort_by(.run_number) | last // {}')
    status=$(printf '%s' "$run" | jq -r '.status // "missing"')
    conclusion=$(printf '%s' "$run" | jq -r '.conclusion // empty')

    if [ "$status" = completed ]; then
        if [ "$conclusion" = success ]; then
            printf 'CI succeeded for %s\n' "$DEPLOY_SHA"
            exit 0
        fi
        printf 'CI finished with %s for %s\n' "${conclusion:-unknown}" "$DEPLOY_SHA" >&2
        exit 1
    fi

    if [ "$waited" -ge "$timeout" ]; then
        printf 'Timed out after %ss waiting for CI (status: %s) for %s\n' \
            "$waited" "$status" "$DEPLOY_SHA" >&2
        exit 1
    fi

    printf 'Waiting for CI (status: %s) for %s\n' "$status" "$DEPLOY_SHA"
    sleep "$interval"
    waited=$((waited + interval))
done
