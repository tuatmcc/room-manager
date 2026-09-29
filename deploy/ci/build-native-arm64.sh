#!/bin/sh
set -eu

# Build the production binary inside Debian Bookworm on the ARM runner. The
# container is a build environment only; the published result is copied out as
# a native binary/archive and is never used as the device runtime.

repo_dir=$(unset CDPATH; cd -- "$(dirname -- "$0")/../.." && pwd)
output_binary=$repo_dir/target/release/room-manager
build_target_dir=$repo_dir/target/bookworm
runner_home=${HOME:-/tmp}
runner_cargo_dir=${CARGO_HOME:-$runner_home/.cargo}

die() {
    echo "$*" >&2
    exit 1
}

[ "$(uname -m)" = aarch64 ] || die 'native ARM64 build must run on an aarch64 runner'
command -v docker >/dev/null 2>&1 || die 'Docker is required for the Bookworm build environment'
command -v install >/dev/null 2>&1 || die 'install is required to copy the verified binary'

rust_channel=$(sed -n 's/^[[:space:]]*channel[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$repo_dir/rust-toolchain.toml" | sed -n '1p')
case "$rust_channel" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) die "rust-toolchain.toml must pin a release channel, got: ${rust_channel:-empty}" ;;
esac

rust_image="docker.io/library/rust:${rust_channel}-bookworm"
mkdir -p "$runner_cargo_dir/registry" "$runner_cargo_dir/git"

docker run --rm --platform linux/arm64 \
    --mount "type=bind,source=$repo_dir,target=/src" \
    --mount "type=bind,source=$runner_cargo_dir/registry,target=/usr/local/cargo/registry" \
    --mount "type=bind,source=$runner_cargo_dir/git,target=/usr/local/cargo/git" \
    --workdir /src \
    --env HOST_UID="$(id -u)" \
    --env HOST_GID="$(id -g)" \
    "$rust_image" sh -euxc '
        apt-get update
        apt-get install --yes --no-install-recommends \
            binutils \
            ca-certificates \
            file \
            libasound2-dev \
            libusb-1.0-0-dev \
            pkg-config
        rm -rf /var/lib/apt/lists/*

        export CARGO_TARGET_DIR=/src/target/bookworm
        cargo build --locked --release --package room-manager
        binary=/src/target/bookworm/release/room-manager

        file_output=$(file -b "$binary")
        printf "Verified file: %s\\n" "$file_output"
        printf "%s\\n" "$file_output" | grep -Eq "ELF 64-bit.*ARM aarch64" || {
            echo "artifact is not an ARM64 ELF binary" >&2
            exit 1
        }
        readelf -h "$binary" | grep -Fq "AArch64" || {
            echo "readelf did not report AArch64" >&2
            exit 1
        }

        ldd_output=$(ldd "$binary")
        printf "%s\\n" "$ldd_output"
        printf "%s\\n" "$ldd_output" | grep -Fq "libasound.so.2" || {
            echo "libasound runtime link is missing" >&2
            exit 1
        }
        printf "%s\\n" "$ldd_output" | grep -Fq "libusb-1.0.so.0" || {
            echo "libusb runtime link is missing" >&2
            exit 1
        }
        if printf "%s\\n" "$ldd_output" | grep -Fq "not found"; then
            echo "artifact has an unresolved runtime library" >&2
            exit 1
        fi

        glibc_versions=$(readelf --version-info "$binary" |
            sed -n "s/.*\\(GLIBC_[0-9.]*\\).*/\\1/p" | sort -Vu)
        if [ -n "$glibc_versions" ]; then
            newest_supported=$(printf "%s\\n" "$glibc_versions" GLIBC_2.36 |
                sort -V | tail -n 1)
            [ "$newest_supported" = GLIBC_2.36 ] || {
                echo "artifact requires a glibc symbol newer than Debian 12: $newest_supported" >&2
                exit 1
            }
            printf "Verified glibc symbols:\\n%s\\n" "$glibc_versions"
        fi

        "$binary" --help >/dev/null
        chown -R "$HOST_UID:$HOST_GID" \
            /usr/local/cargo/registry /usr/local/cargo/git /src/target/bookworm
    '

install -d "$(dirname -- "$output_binary")"
install -m 0755 "$build_target_dir/release/room-manager" "$output_binary"
printf 'Bookworm ARM64 binary: %s\n' "$output_binary"
