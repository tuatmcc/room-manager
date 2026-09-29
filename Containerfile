# syntax=docker/dockerfile:1

FROM docker.io/library/rust:1.94.0-bookworm AS builder

RUN apt-get update \
    && apt-get install --yes --no-install-recommends libasound2-dev libusb-1.0-0-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates ./crates
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --locked --release --package room-manager \
    && cp /src/target/release/room-manager /room-manager

FROM docker.io/library/debian:bookworm-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        libasound2 \
        libusb-1.0-0 \
        tzdata \
        util-linux \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /room-manager /usr/local/bin/room-manager
COPY deploy/container/container-entrypoint.sh /usr/local/bin/container-entrypoint
COPY deploy/container/container-healthcheck.sh /usr/local/bin/container-healthcheck
COPY deploy/container/run-active.sh /usr/local/bin/run-active

ENV TZ=Asia/Tokyo
ENTRYPOINT ["/usr/local/bin/container-entrypoint"]

LABEL org.opencontainers.image.source="https://github.com/tuatmcc/room-manager"
