#!/bin/sh
set -eu

umask 077

deploy_env=${ROOM_MANAGER_DEPLOY_ENV:-/etc/room-manager/deploy.env}
if [ -r "$deploy_env" ]; then
    # deploy.env is administrator-owned and contains shell-compatible KEY=VALUE
    # settings. It is never part of a release directory.
    # shellcheck disable=SC1090
    . "$deploy_env"
fi

state_dir=${ROOM_MANAGER_STATE_DIR:-/var/lib/room-manager-deploy}
install_root=${ROOM_MANAGER_INSTALL_ROOT:-/opt/room-manager}
releases_dir=$install_root/releases
staging_root=$install_root/.staging
service_name=${ROOM_MANAGER_SERVICE:-room-manager.service}
manifest_url=${ROOM_MANAGER_MANIFEST_URL:-}
deployment_lock=${ROOM_MANAGER_DEPLOY_LOCK:-/run/room-manager-deploy.lock}
cutover_timeout=${ROOM_MANAGER_CUTOVER_TIMEOUT:-120}
release_keep=${ROOM_MANAGER_RELEASE_KEEP:-5}
lock_held=${ROOM_MANAGER_DEPLOY_LOCK_HELD:-false}
action=${1:-deploy}

failed_sha_file=$state_dir/failed-sha
last_successful_sha_file=$state_dir/last-successful-sha
prepared_sha_file=$state_dir/prepared-sha
manifest_file=$state_dir/desired-manifest.json
current_link=$install_root/current
previous_link=$install_root/previous
stage=
manifest_tmp=

log() {
    if command -v logger >/dev/null 2>&1; then
        logger -t room-manager-deploy -- "$*" 2>/dev/null || true
    fi
    printf '%s\n' "$*"
}

die() {
    log "ERROR: $*"
    exit 1
}

cleanup() {
    if [ -n "$stage" ] && [ -d "$stage" ]; then
        rm -rf -- "$stage"
    fi
    if [ -n "$manifest_tmp" ]; then
        rm -f -- "$manifest_tmp"
    fi
}
trap cleanup EXIT
trap 'exit 130' INT HUP TERM

is_sha() {
    value=$1
    [ "${#value}" -eq 40 ] || return 1
    case "$value" in
        *[!0123456789abcdef]*|'') return 1 ;;
    esac
}

is_sha256() {
    value=$1
    [ "${#value}" -eq 64 ] || return 1
    case "$value" in
        *[!0123456789abcdef]*|'') return 1 ;;
    esac
}

validate_positive_integer() {
    case "$1" in
        ''|*[!0-9]*) return 1 ;;
    esac
    [ "$1" -gt 0 ]
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

json_value() {
    key=$1
    file=$2
    sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$file" |
        sed -n '1p'
}

validate_manifest() {
    manifest=$1
    desired_sha=$(json_value commit "$manifest")
    architecture=$(json_value architecture "$manifest")
    artifact_url=$(json_value artifact "$manifest")
    artifact_sha=$(json_value sha256 "$manifest")

    is_sha "$desired_sha" || die "manifest commit is not a 40-character SHA"
    [ "$architecture" = aarch64 ] || die "manifest architecture must be aarch64"
    case "$artifact_url" in
        https://*|file://*) ;;
        *) die "manifest artifact must use HTTPS" ;;
    esac
    is_sha256 "$artifact_sha" || die "manifest sha256 is invalid"
}

fetch_manifest() {
    [ -n "$manifest_url" ] || die "ROOM_MANAGER_MANIFEST_URL must be set in $deploy_env"
    case "$manifest_url" in
        https://*|file://*) ;;
        *) die "ROOM_MANAGER_MANIFEST_URL must use HTTPS (file:// is only for local tests)" ;;
    esac

    manifest_tmp=$state_dir/desired-manifest.json.tmp.$$
    curl --fail --silent --show-error --location --retry 5 --retry-all-errors \
        --retry-delay 2 --connect-timeout 10 --max-time 60 \
        "$manifest_url" -o "$manifest_tmp"
    validate_manifest "$manifest_tmp"
    mv -f -- "$manifest_tmp" "$manifest_file"
}

read_release_link_sha() {
    link=$1
    [ -L "$link" ] || return 1
    target=$(readlink "$link") || return 1
    case "$target" in
        releases/*) sha=${target#releases/} ;;
        "$releases_dir"/*) sha=${target#"$releases_dir/"} ;;
        *) return 1 ;;
    esac
    is_sha "$sha" || return 1
    [ -d "$releases_dir/$sha" ] || return 1
    verify_release_identity "$releases_dir/$sha" "$sha" || return 1
    printf '%s\n' "$sha"
}

read_current_sha() {
    read_release_link_sha "$current_link"
}

read_previous_sha() {
    read_release_link_sha "$previous_link"
}

atomic_link() {
    link=$1
    sha=$2
    is_sha "$sha" || die "refusing to link invalid release SHA: $sha"
    [ -d "$releases_dir/$sha" ] || die "release does not exist: $sha"

    temporary_link=$install_root/."$(basename "$link")".$$
    rm -f -- "$temporary_link"
    ln -s "releases/$sha" "$temporary_link"
    mv -Tf -- "$temporary_link" "$link"
}

atomic_state() {
    destination=$1
    value=$2
    temporary_state=$destination.tmp.$$
    printf '%s\n' "$value" >"$temporary_state"
    chmod 0600 "$temporary_state"
    mv -f -- "$temporary_state" "$destination"
}

verify_release() {
    release_dir=$1
    [ -x "$release_dir/room-manager" ] || return 1
    [ -r "$release_dir/manifest.json" ] || return 1
    [ -r "$release_dir/SHA256SUMS" ] || return 1
    (cd "$release_dir" && sha256sum -c SHA256SUMS >/dev/null 2>&1)
}

verify_release_identity() {
    release_dir=$1
    sha=$2
    verify_release "$release_dir" || return 1
    [ "$(json_value commit "$release_dir/manifest.json")" = "$sha" ] || return 1
    [ "$(json_value architecture "$release_dir/manifest.json")" = aarch64 ] || return 1
}

remove_failed_sha() {
    rm -f -- "$failed_sha_file"
}

record_failed_sha() {
    atomic_state "$failed_sha_file" "$1"
}

record_successful_sha() {
    atomic_state "$last_successful_sha_file" "$1"
}

failed_sha_is() {
    [ -r "$failed_sha_file" ] && [ "$(sed -n '1p' "$failed_sha_file")" = "$1" ]
}

last_successful_sha() {
    sed -n '1p' "$last_successful_sha_file" 2>/dev/null || true
}

download_file() {
    url=$1
    destination=$2
    curl --fail --silent --show-error --location --retry 5 --retry-all-errors \
        --retry-delay 2 --connect-timeout 10 --max-time 600 \
        "$url" -o "$destination"
}

cleanup_staging() {
    find "$staging_root" -mindepth 1 -maxdepth 1 -type d -name '*.[0-9]*' \
        -exec rm -rf -- {} + 2>/dev/null || true
}

prepare_release() {
    cleanup_staging
    stage=$staging_root/$desired_sha.$$
    mkdir -p "$stage/release"

    if [ -d "$releases_dir/$desired_sha" ]; then
        verify_release_identity "$releases_dir/$desired_sha" "$desired_sha" ||
            die "existing release is invalid: $desired_sha"
        atomic_state "$prepared_sha_file" "$desired_sha"
        log "release already prepared: $desired_sha"
        return 0
    fi

    archive=$stage/room-manager.tar.gz
    log "downloading native artifact for $desired_sha"
    download_file "$artifact_url" "$archive"
    actual_archive_sha=$(sha256sum "$archive" | awk '{print $1}')
    [ "$actual_archive_sha" = "$artifact_sha" ] ||
        die "artifact checksum mismatch for $desired_sha"

    tar -tzf "$archive" >"$stage/entries"
    while IFS= read -r entry || [ -n "$entry" ]; do
        case "$entry" in
            room-manager|manifest.json|SHA256SUMS) ;;
            *) die "artifact contains an unexpected entry: $entry" ;;
        esac
    done <"$stage/entries"
    for entry in room-manager manifest.json SHA256SUMS; do
        grep -Fqx "$entry" "$stage/entries" || die "artifact is missing $entry"
    done

    tar -xzf "$archive" --no-same-owner --no-same-permissions -C "$stage/release"
    inner_sha=$(json_value commit "$stage/release/manifest.json")
    inner_architecture=$(json_value architecture "$stage/release/manifest.json")
    [ "$inner_sha" = "$desired_sha" ] || die "artifact manifest SHA does not match desired SHA"
    [ "$inner_architecture" = aarch64 ] || die "artifact manifest architecture is not aarch64"
    verify_release "$stage/release" || die "native artifact release validation failed"

    release_dir=$releases_dir/$desired_sha
    if [ -e "$release_dir" ] || [ -L "$release_dir" ]; then
        verify_release_identity "$release_dir" "$desired_sha" ||
            die "release appeared with invalid contents: $desired_sha"
    else
        mv -f -- "$stage/release" "$release_dir"
    fi
    atomic_state "$prepared_sha_file" "$desired_sha"
    log "prepared native release: $desired_sha"
}

service_ready() {
    systemctl is-active --quiet "$service_name"
}

wait_ready() {
    deadline=$(( $(date +%s) + cutover_timeout ))
    while :; do
        if service_ready; then
            return 0
        fi
        if systemctl is-failed --quiet "$service_name"; then
            return 1
        fi
        [ "$(date +%s)" -lt "$deadline" ] || return 1
        sleep 1
    done
}

restart_and_wait() {
    if ! systemctl restart "$service_name"; then
        return 1
    fi
    wait_ready
}

restore_previous_layout() {
    old_current=$1
    old_previous=$2
    if [ -n "$old_current" ]; then
        atomic_link "$current_link" "$old_current"
    else
        rm -f -- "$current_link"
    fi
    if [ -n "$old_previous" ]; then
        atomic_link "$previous_link" "$old_previous"
    else
        rm -f -- "$previous_link"
    fi
}

activate_release() {
    old_current=$1
    old_previous=$2

    if [ -n "$old_current" ]; then
        atomic_link "$previous_link" "$old_current"
    fi
    atomic_link "$current_link" "$desired_sha"

    if restart_and_wait; then
        record_successful_sha "$desired_sha"
        remove_failed_sha
        rm -f -- "$prepared_sha_file"
        log "deployment succeeded: current=$desired_sha"
        return 0
    fi

    record_failed_sha "$desired_sha"
    log "new release failed readiness: $desired_sha"
    restore_previous_layout "$old_current" "$old_previous"
    if [ -n "$old_current" ] && restart_and_wait; then
        record_successful_sha "$old_current"
        log "rollback succeeded: current=$old_current"
    else
        log "ERROR: rollback failed; operator attention is required"
    fi
    return 1
}

recover_unready_current() {
    old_current=$1
    old_previous=$2

    if service_ready; then
        return 0
    fi
    log "current release is not ready: $old_current"
    if restart_and_wait; then
        return 0
    fi

    if [ -n "$old_previous" ] && [ "$old_previous" != "$old_current" ] &&
        ! failed_sha_is "$old_previous"; then
        record_failed_sha "$old_current"
        atomic_link "$current_link" "$old_previous"
        if restart_and_wait; then
            atomic_link "$previous_link" "$old_current"
            current=$old_previous
            previous=$old_current
            record_successful_sha "$current"
            log "recovered service with previous release: $current"
        else
            restore_previous_layout "$old_current" "$old_previous"
            log "ERROR: previous release also failed readiness"
            return 1
        fi
    else
        log "ERROR: no safe previous release is available"
        return 1
    fi
    return 0
}

cleanup_releases() {
    [ -d "$releases_dir" ] || return 0
    case "$release_keep" in
        ''|*[!0-9]*) return 0 ;;
    esac

    current=$(read_current_sha 2>/dev/null || true)
    previous=$(read_previous_sha 2>/dev/null || true)
    failed=$(sed -n '1p' "$failed_sha_file" 2>/dev/null || true)
    successful=$(sed -n '1p' "$last_successful_sha_file" 2>/dev/null || true)
    count=0
    find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -name '????????????????????????????????????????' \
        -printf '%T@ %f\n' 2>/dev/null |
        sort -rn |
        while IFS=' ' read -r _ sha; do
            [ -n "$sha" ] || continue
            protected=false
            [ "$sha" = "$current" ] && protected=true
            [ "$sha" = "$previous" ] && protected=true
            [ "$sha" = "$failed" ] && protected=true
            [ "$sha" = "$successful" ] && protected=true
            if [ "$protected" = true ] || [ "$count" -lt "$release_keep" ]; then
                count=$((count + 1))
            else
                rm -rf -- "${releases_dir:?}/$sha" || true
            fi
        done
}

acquire_lock() {
    mkdir -p "$state_dir" "$install_root" "$releases_dir" "$staging_root"
    if [ "$lock_held" != true ]; then
        exec 9>"$deployment_lock"
        if ! flock -n 9; then
            log "another deployment is already running"
            exit 0
        fi
    fi
}

status() {
    current=$(read_current_sha 2>/dev/null || true)
    previous=$(read_previous_sha 2>/dev/null || true)
    failed=$(sed -n '1p' "$failed_sha_file" 2>/dev/null || true)
    successful=$(sed -n '1p' "$last_successful_sha_file" 2>/dev/null || true)
    printf 'current=%s\n' "${current:-none}"
    printf 'previous=%s\n' "${previous:-none}"
    printf 'last-successful=%s\n' "${successful:-none}"
    printf 'failed=%s\n' "${failed:-none}"
}

deploy() {
    fetch_manifest
    current=$(read_current_sha 2>/dev/null || true)
    previous=$(read_previous_sha 2>/dev/null || true)

    if [ -L "$current_link" ] && [ -z "$current" ]; then
        [ -n "$previous" ] || die "current link is invalid and no previous release is available"
        log "recovering invalid current link with previous release: $previous"
        atomic_link "$current_link" "$previous"
        current=$previous
    fi

    if failed_sha_is "$desired_sha"; then
        if [ "$current" = "$desired_sha" ] && [ -n "$previous" ] &&
            [ "$previous" != "$current" ] && ! failed_sha_is "$previous"; then
            log "recovering interrupted quarantine cutover: $desired_sha -> $previous"
            quarantined_sha=$current
            rollback_target=$previous
            atomic_link "$current_link" "$rollback_target"
            atomic_link "$previous_link" "$quarantined_sha"
            if restart_and_wait; then
                record_successful_sha "$rollback_target"
                rm -f -- "$prepared_sha_file"
                cleanup_releases
                log "recovered service after interrupted quarantine: current=$rollback_target"
            else
                log "ERROR: quarantined release rollback is not ready"
            fi
        fi
        log "desired release is quarantined after a failed readiness check: $desired_sha"
        return 1
    fi

    if [ "$current" = "$desired_sha" ]; then
        if [ "$(last_successful_sha)" = "$desired_sha" ] && service_ready; then
            log "current release is already active: $desired_sha"
            cleanup_releases
            return 0
        fi
        if [ "$(last_successful_sha)" != "$current" ] && restart_and_wait; then
            record_successful_sha "$current"
            rm -f -- "$prepared_sha_file"
            log "completed interrupted activation: current=$current"
            cleanup_releases
            return 0
        fi
        recover_unready_current "$current" "$previous" || return 1
        record_successful_sha "$current"
        cleanup_releases
        return 0
    fi

    if [ -n "$current" ]; then
        if [ "$(last_successful_sha)" != "$current" ]; then
            restart_and_wait || recover_unready_current "$current" "$previous" || return 1
            record_successful_sha "$current"
        else
            recover_unready_current "$current" "$previous" || return 1
        fi
    fi

    prepare_release
    if activate_release "$current" "$previous"; then
        result=0
    else
        result=$?
    fi
    if [ "$result" -eq 0 ]; then
        cleanup_releases
    fi
    return "$result"
}

prepare() {
    fetch_manifest
    if failed_sha_is "$desired_sha"; then
        log "desired release is quarantined; refusing to prepare it: $desired_sha"
        return 1
    fi
    prepare_release
    cleanup_releases
}

rollback() {
    current=$(read_current_sha 2>/dev/null || true)
    previous=$(read_previous_sha 2>/dev/null || true)
    [ -n "$current" ] || die "current release is not available"
    [ -n "$previous" ] || die "previous release is not available"
    failed_sha_is "$previous" && die "previous release is quarantined: $previous"

    atomic_link "$previous_link" "$current"
    atomic_link "$current_link" "$previous"
    if restart_and_wait; then
        record_successful_sha "$previous"
        log "manual rollback succeeded: current=$previous"
        cleanup_releases
        return 0
    fi

    restore_previous_layout "$current" "$previous"
    if restart_and_wait; then
        log "manual rollback failed; restored current=$current"
    else
        log "ERROR: manual rollback and restoration both failed"
    fi
    return 1
}

require_command curl
require_command flock
require_command sha256sum
require_command tar
require_command systemctl
require_command readlink
require_command find
require_command sort
require_command awk
require_command sed
require_command grep
validate_positive_integer "$cutover_timeout" || die "ROOM_MANAGER_CUTOVER_TIMEOUT must be positive"

acquire_lock
case "$action" in
    status)
        status
        ;;
    prepare)
        prepare
        ;;
    deploy)
        deploy
        ;;
    rollback)
        rollback
        ;;
    *)
        echo "usage: $0 [prepare|deploy|status|rollback]" >&2
        exit 64
        ;;
esac
