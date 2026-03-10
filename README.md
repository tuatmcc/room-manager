# room-manager

Discord と NFC カードを使って部室の入退出を管理するアプリケーションです。Cloudflare Workers 上の API と、Raspberry Pi 上で動く Rust アプリで構成されています。
元となった [mcc_nfc_room_manager](https://github.com/tuatmcc/mcc_nfc_room_manager) よりもモダンかつ堅牢な動作・設計を目指して開発しています。

## Repository Layout

- `packages/api`: Discord Interaction、カードタッチ受付、D1/KV、定期実行を担当する Workers API
- `crates/app`: Raspberry Pi 上でカード読取、音声、ドアロックを扱う Rust アプリ
- `crates/pasori`: Pasori / FeliCa アクセス用の Rust ライブラリ

## Setup

```sh
mise install
pnpm install
cargo fetch
```

以下を用意してください。

- ルート `.env`
- `packages/api/.dev.vars`

詳細な前提条件と運用ルールは [docs/RUNBOOK.md](docs/RUNBOOK.md) を参照してください。

## Common Commands

```sh
pnpm run build
pnpm run lint
pnpm run format:check
pnpm run test
pnpm run typecheck
```

```sh
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets --all-features -- -D warnings
cargo test --locked --workspace --all-targets --all-features
```

```sh
pnpm --dir packages/api dev
cargo run -p room-manager -- --api-path <API_URL> --api-token <TOKEN>
```

非 Raspberry Pi 環境では Rust アプリは Noop runtime で起動し、カードイベントは発生しません。
