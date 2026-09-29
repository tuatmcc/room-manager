#!/bin/sh
set -eu

deploy_env=${ROOM_MANAGER_DEPLOY_ENV:-/etc/room-manager/deploy.env}
if [ -r "$deploy_env" ]; then
    # This file is root-owned and intentionally uses shell-compatible KEY=VALUE lines.
    # shellcheck source=/dev/null
    . "$deploy_env"
fi

state_dir=${ROOM_MANAGER_STATE_DIR:-/var/lib/room-manager-deploy}
active_file="$state_dir/active-color"
source_image=${ROOM_MANAGER_SOURCE_IMAGE:?ROOM_MANAGER_SOURCE_IMAGE must be set}
cutover_timeout=${ROOM_MANAGER_CUTOVER_TIMEOUT:-60}
action=${1:-deploy}
deployment_lock=${ROOM_MANAGER_DEPLOY_LOCK:-/run/room-manager-deploy.lock}
if [ -n "${REGISTRY_AUTH_FILE:-}" ]; then
    export REGISTRY_AUTH_FILE
fi

log() {
    logger -t room-manager-deploy -- "$*" 2>/dev/null || true
    printf '%s\n' "$*"
}

set_active() {
    color=$1
    tmp="$active_file.$$"
    printf '%s\n' "$color" >"$tmp"
    chmod 0644 "$tmp"
    mv -f "$tmp" "$active_file"
}

container_image_id() {
    podman container inspect --format '{{.Image}}' "room-manager-$1"
}

wait_healthy() {
    color=$1
    deadline=$(( $(date +%s) + cutover_timeout ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        if podman healthcheck run "room-manager-$color" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    return 1
}

run_auto_update() {
    color=$1
    if podman auto-update --help 2>&1 | grep -q -- '--filter'; then
        podman auto-update --filter "label=io.room-manager.slot=$color"
    else
        # Stable Podman through 5.8 has no --filter. Only the candidate's
        # local tag changes, so the active room-manager slot is not restarted.
        podman auto-update
    fi
}

mkdir -p "$state_dir"
exec 9>"$deployment_lock"
if ! flock -n 9; then
    log "another deployment is already running"
    exit 0
fi

active=$(cat "$active_file" 2>/dev/null || true)
case "$active" in
    blue) candidate=green ;;
    green) candidate=blue ;;
    *)
        log "active-color must contain blue or green"
        exit 1
        ;;
esac

case "$action" in
    status)
        printf 'active=%s image=%s\n' "$active" "$(container_image_id "$active")"
        printf 'standby=%s image=%s\n' "$candidate" "$(container_image_id "$candidate")"
        exit 0
        ;;
    rollback)
        if ! podman healthcheck run "room-manager-$candidate" >/dev/null; then
            log "rollback target $candidate is unhealthy"
            exit 1
        fi
        log "manually switching active slot from $active to $candidate"
        set_active "$candidate"
        if wait_healthy "$candidate"; then
            log "manual rollback succeeded: active=$candidate"
            exit 0
        fi
        log "manual rollback target failed; restoring $active"
        set_active "$active"
        wait_healthy "$active" || true
        exit 1
        ;;
    deploy) ;;
    *)
        echo "usage: $0 [deploy|status|rollback]" >&2
        exit 64
        ;;
esac

for color in blue green; do
    if ! systemctl is-active --quiet "room-manager-$color.service"; then
        log "room-manager-$color.service is not active"
        exit 1
    fi
done

log "checking $source_image for an update (active=$active candidate=$candidate)"
podman pull --quiet "$source_image" >/dev/null
source_id=$(podman image inspect --format '{{.Id}}' "$source_image")
active_id=$(container_image_id "$active")

if [ "$source_id" = "$active_id" ]; then
    log "active slot already runs $source_id"
    exit 0
fi

# Retag only the inactive slot. AutoUpdate=local then makes podman-auto-update
# recreate only that Quadlet unit while the active container remains untouched.
podman tag "$source_id" "localhost/room-manager:$candidate"
run_auto_update "$candidate"

candidate_id=$(container_image_id "$candidate")
if [ "$candidate_id" != "$source_id" ]; then
    log "candidate did not restart on the expected image: $candidate_id"
    exit 1
fi

if ! podman healthcheck run "room-manager-$candidate" >/dev/null; then
    log "candidate slot is unhealthy before cutover"
    exit 1
fi

log "switching active slot from $active to $candidate"
set_active "$candidate"

if wait_healthy "$candidate"; then
    printf '%s\n' "$source_id" >"$state_dir/last-successful-image"
    log "deployment succeeded: active=$candidate image=$source_id"
    exit 0
fi

log "candidate failed after cutover; rolling back to $active"
set_active "$active"
if wait_healthy "$active"; then
    log "rollback succeeded: active=$active image=$active_id"
else
    log "rollback failed; both slots require operator attention"
fi
exit 1
