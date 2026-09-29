#!/bin/sh
set -eu

umask 022

commit=${1:-}
binary=${2:-target/release/room-manager}
output_dir=${3:-dist}

if [ "${#commit}" -ne 40 ]; then
    echo "usage: $0 <40-character-commit-sha> [binary] [output-dir]" >&2
    exit 64
fi
case "$commit" in *[!0123456789abcdef]*) echo "commit must be lowercase hexadecimal" >&2; exit 64 ;; esac

[ -f "$binary" ] || { echo "binary not found: $binary" >&2; exit 1; }
mkdir -p "$output_dir"
work_dir=$output_dir/.room-manager-aarch64-$commit.$$
archive=$output_dir/room-manager-aarch64-$commit.tar.gz
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT INT HUP TERM

mkdir -p "$work_dir"
install -m 0755 "$binary" "$work_dir/room-manager"
printf '{\n  "commit": "%s",\n  "architecture": "aarch64"\n}\n' "$commit" >"$work_dir/manifest.json"
(cd "$work_dir" && sha256sum room-manager >SHA256SUMS)
tar -czf "$archive" -C "$work_dir" room-manager manifest.json SHA256SUMS
sha256sum "$archive" >"$archive.sha256"
printf '%s\n' "$archive"
