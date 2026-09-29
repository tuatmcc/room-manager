#!/bin/sh
set -eu

: "${DEPLOY_COLOR:?DEPLOY_COLOR must be blue or green}"

case "$DEPLOY_COLOR" in
    blue|green) ;;
    *)
        echo "invalid DEPLOY_COLOR: $DEPLOY_COLOR" >&2
        exit 64
        ;;
esac

state_dir=${DEPLOY_STATE_DIR:-/var/lib/room-manager-deploy}
active_file="$state_dir/active-color"
ready_file="$state_dir/ready-$DEPLOY_COLOR"
child_pid=

mkdir -p "$state_dir"
rm -f "$ready_file"

stop_child() {
    if [ -n "$child_pid" ]; then
        kill "$child_pid" 2>/dev/null || true
        wait "$child_pid" 2>/dev/null || true
        child_pid=
    fi
    rm -f "$ready_file"
}

shutdown() {
    stop_child
    exit 0
}

trap shutdown HUP INT TERM
trap stop_child EXIT

while :; do
    active_color=$(cat "$active_file" 2>/dev/null || true)

    if [ "$active_color" = "$DEPLOY_COLOR" ]; then
        if [ -z "$child_pid" ]; then
            rm -f "$ready_file"
            /usr/local/bin/run-active &
            child_pid=$!
        elif ! kill -0 "$child_pid" 2>/dev/null; then
            wait "$child_pid" || status=$?
            status=${status:-1}
            child_pid=
            rm -f "$ready_file"
            echo "room-manager exited while $DEPLOY_COLOR was active" >&2
            exit "$status"
        fi
    else
        stop_child
    fi

    sleep 1
done

