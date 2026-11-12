#!/bin/sh
# Pull-based updater for the room-manager binary.
#
# Runs on the Raspberry Pi as the unprivileged user that owns the
# room-manager systemd user service. It compares the rolling `device-main`
# release manifest with the running release, downloads and verifies a new
# binary, switches the `current` symlink and restarts the service. If the new
# binary does not report readiness, the previous release is restored and the
# failed commit is quarantined until a newer one is published.
#
# Usage: room-manager-update [update|rollback|status|wait-ready]
set -eu

base_dir=${ROOM_MANAGER_DEPLOY_HOME:-$HOME/.local/lib/room-manager}
release_url=${ROOM_MANAGER_RELEASE_URL:-https://github.com/tuatmcc/room-manager/releases/download/device-main}
service=${ROOM_MANAGER_SERVICE:-room-manager.service}
XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
export XDG_RUNTIME_DIR
ready_file=${ROOM_MANAGER_READY_FILE:-$XDG_RUNTIME_DIR/room-manager/ready}
ready_timeout=${ROOM_MANAGER_READY_TIMEOUT:-60}
stable_seconds=${ROOM_MANAGER_STABLE_SECONDS:-10}
poll_interval=${ROOM_MANAGER_POLL_INTERVAL:-1}

releases_dir="$base_dir/releases"
failed_file="$base_dir/failed-sha"
work_dir=

log() {
    printf '%s\n' "$*"
}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

cleanup() {
    if [ -n "$work_dir" ]; then
        rm -rf "$work_dir"
    fi
}

user_systemctl() {
    systemctl --user "$@"
}

main_pid() {
    user_systemctl show --property=MainPID --value "$service" 2>/dev/null || echo 0
}

# The app writes its PID to the ready file only after the API client, sound
# player, door lock and at least one Pasori reader are initialized.
wait_ready() {
    elapsed=0
    while [ "$elapsed" -lt "$ready_timeout" ]; do
        pid=$(main_pid)
        if [ "$pid" != 0 ] && [ -s "$ready_file" ] \
            && [ "$(head -n 1 "$ready_file")" = "$pid" ]; then
            return 0
        fi
        sleep "$poll_interval"
        elapsed=$((elapsed + poll_interval))
    done
    return 1
}

start_and_verify() {
    user_systemctl restart "$service" || return 1
    wait_ready || return 1
    ready_pid=$(main_pid)
    sleep "$stable_seconds"
    [ "$(main_pid)" = "$ready_pid" ] && user_systemctl is-active --quiet "$service"
}

link_id() {
    if [ -L "$base_dir/$1" ]; then
        basename "$(readlink "$base_dir/$1")"
    fi
}

point_link() {
    ln -sfn "releases/$2" "$base_dir/$1.tmp"
    mv -fT "$base_dir/$1.tmp" "$base_dir/$1"
}

is_hex() {
    printf '%s' "$1" | grep -Eq "^[0-9a-f]{$2}\$"
}

fetch() {
    curl --fail --silent --show-error --location \
        --retry 3 --retry-all-errors --connect-timeout 15 --max-time 600 \
        --header 'Cache-Control: no-cache' \
        --output "$2" "$1"
}

prune_releases() {
    keep_current=$(link_id current)
    keep_previous=$(link_id previous)
    for dir in "$releases_dir"/*/; do
        id=$(basename "$dir")
        if [ "$id" != "$keep_current" ] && [ "$id" != "$keep_previous" ]; then
            rm -rf "$dir"
        fi
    done
}

cmd_update() {
    [ -L "$base_dir/current" ] || die "not installed: $base_dir/current is missing"

    work_dir=$(mktemp -d "$releases_dir/.incoming.XXXXXX")
    fetch "$release_url/latest.txt" "$work_dir/latest.txt"
    sha=$(sed -n 's/^sha=//p' "$work_dir/latest.txt" | head -n 1)
    expected=$(sed -n 's/^sha256=//p' "$work_dir/latest.txt" | head -n 1)
    is_hex "$sha" 40 || die "latest.txt has an invalid sha"
    is_hex "$expected" 64 || die "latest.txt has an invalid sha256"

    current=$(link_id current)
    if [ "$current" = "$sha" ]; then
        log "up to date: $sha"
        return 0
    fi
    if [ "$(cat "$failed_file" 2>/dev/null || true)" = "$sha" ]; then
        log "skipping quarantined release: $sha"
        return 0
    fi

    if [ ! -x "$releases_dir/$sha/room-manager" ]; then
        rm -rf "${releases_dir:?}/$sha"
        mkdir "$work_dir/$sha"
        fetch "$release_url/room-manager-$sha-aarch64" "$work_dir/$sha/room-manager"
        actual=$(sha256sum "$work_dir/$sha/room-manager" | cut -d ' ' -f 1)
        [ "$actual" = "$expected" ] || die "sha256 mismatch for $sha: expected $expected, got $actual"
        chmod 0755 "$work_dir/$sha/room-manager"
        # Fails fast on missing shared libraries or an incompatible architecture.
        "$work_dir/$sha/room-manager" --help >/dev/null 2>&1 \
            || die "downloaded binary $sha does not run on this device"
        mv "$work_dir/$sha" "$releases_dir/$sha"
    fi

    log "deploying $current -> $sha"
    point_link previous "$current"
    point_link current "$sha"
    if start_and_verify; then
        rm -f "$failed_file"
        prune_releases
        log "deployed $sha"
        return 0
    fi

    log "release $sha did not become ready; rolling back to $current"
    point_link current "$current"
    printf '%s\n' "$sha" >"$failed_file"
    if start_and_verify; then
        log "rolled back to $current; $sha is quarantined"
        return 1
    fi
    die "rollback to $current also failed; manual intervention is required"
}

cmd_rollback() {
    current=$(link_id current)
    previous=$(link_id previous)
    [ -n "$previous" ] || die "no previous release to roll back to"
    [ "$current" != "$previous" ] || die "previous release is the current release"
    [ -x "$releases_dir/$previous/room-manager" ] || die "previous release $previous is missing"

    point_link current "$previous"
    point_link previous "$current"
    # Keep the timer from redeploying the release that was just rolled back.
    if is_hex "$current" 40; then
        printf '%s\n' "$current" >"$failed_file"
    fi
    start_and_verify || die "release $previous did not become ready after rollback"
    log "rolled back $current -> $previous"
}

cmd_status() {
    log "current:  $(link_id current)"
    log "previous: $(link_id previous)"
    log "failed:   $(cat "$failed_file" 2>/dev/null || true)"
    user_systemctl is-active "$service" || true
}

trap cleanup EXIT HUP INT TERM

command=${1:-update}
case "$command" in
    update | rollback)
        mkdir -p "$releases_dir"
        exec 9>"$base_dir/update.lock"
        if ! flock -n 9; then
            log "another update is already running"
            exit 0
        fi
        "cmd_$command"
        ;;
    status) cmd_status ;;
    wait-ready) wait_ready ;;
    *) die "unknown command: $command (expected update, rollback, status or wait-ready)" ;;
esac
