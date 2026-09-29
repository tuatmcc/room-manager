#!/bin/sh
set -eu

: "${DEPLOY_COLOR:?DEPLOY_COLOR must be set}"

state_dir=${DEPLOY_STATE_DIR:-/var/lib/room-manager-deploy}
lock_file="$state_dir/hardware.lock"
ready_file="$state_dir/ready-$DEPLOY_COLOR"

# Both slots can stay running, but only one process may own Pasori/GPIO/audio.
exec 9>"$lock_file"
flock -x 9

export ROOM_MANAGER_READY_FILE="$ready_file"
exec /usr/local/bin/room-manager "$@"
