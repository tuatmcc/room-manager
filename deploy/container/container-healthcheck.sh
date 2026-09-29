#!/bin/sh
set -eu

: "${DEPLOY_COLOR:?DEPLOY_COLOR must be set}"

state_dir=${DEPLOY_STATE_DIR:-/var/lib/room-manager-deploy}
active_color=$(cat "$state_dir/active-color" 2>/dev/null || true)

# A staged slot is healthy when its supervisor is alive. The active slot must
# additionally have acquired the shared hardware lock and started the app.
if [ "$active_color" != "$DEPLOY_COLOR" ]; then
    exit 0
fi

ready_file="$state_dir/ready-$DEPLOY_COLOR"
[ -s "$ready_file" ] || exit 1
read -r app_pid <"$ready_file"
case "$app_pid" in
    ''|*[!0-9]*) exit 1 ;;
esac

kill -0 "$app_pid" 2>/dev/null

