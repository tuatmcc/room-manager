# room-manager

`room-manager` は、Discord と NFC カードを使って部室の入退出を管理するモノレポです。実体は Cloudflare Workers 上の API (`packages/api`) と、Raspberry Pi 上で Pasori リーダー・音声・ドアロックを制御する Rust アプリ (`crates/app`) で構成されます。

## Canonical Docs

- [docs/SPEC.md](docs/SPEC.md): プロダクト仕様
- [docs/PLAN.md](docs/PLAN.md): 実装計画、マイルストーン、リスク
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): 技術設計、モジュール、データモデル
- [docs/RUNBOOK.md](docs/RUNBOOK.md): 開発・運用時に守るルール
- [docs/STATUS.md](docs/STATUS.md): 現在の実装状況、未完事項、再開コンテキスト

## Repository Layout

- `packages/api`: Cloudflare Workers API。Discord Interaction、ローカル端末からのカードタッチ受付、D1/KV、定期実行を担当
- `crates/app`: Raspberry Pi 上でカード読取、API 呼び出し、音声再生、ドアロック制御を行う実行アプリ
- `crates/pasori`: Pasori / FeliCa 通信を扱う低レイヤー Rust ライブラリ

## Setup

- Node.js / pnpm / Rust は `mise install` で導入
- Node.js 依存は `pnpm install`
- Rust 依存は `cargo fetch`
- API クライアント用の `.env` と Workers 開発用の `packages/api/.dev.vars` を用意

## Common Commands

### Repository-wide

- Build: `pnpm run build`
- Lint: `pnpm run lint`
- Format: `pnpm run format`
- Format check: `pnpm run format:check`
- Test: `pnpm run test`
- Typecheck: `pnpm run typecheck`

### Rust

- Build app: `cargo build -p room-manager`
- Build app (release): `cargo build -p room-manager --release --locked`
- Test all: `cargo test --locked --workspace --all-targets --all-features`
- Lint all: `cargo clippy --locked --workspace --all-targets --all-features -- -D warnings`
- Format check: `cargo fmt --all -- --check`
- Run app locally: `cargo run -p room-manager -- --api-path <API_URL> --api-token <TOKEN>`

### API

- Dev server: `pnpm --dir packages/api dev`
- Typecheck: `pnpm --dir packages/api typecheck`
- Test: `pnpm --dir packages/api test`
- Dry-run build: `pnpm --dir packages/api build`
- Local migration: `pnpm --dir packages/api dev:migrate`
- Remote migration: `pnpm --dir packages/api ci:migrate`
- Deploy: `pnpm --dir packages/api ci:deploy`
- Register slash commands: `pnpm --dir packages/api register`

## Working Agreement

- 仕様判断は `docs/SPEC.md` を優先する
- 実装変更時は `docs/STATUS.md` と必要な設計文書を同時更新する
- API 契約を変えた場合は `packages/api` と `crates/app` の両方を追従させる
- 秘密情報は `.env`, `packages/api/.dev.vars`, CI secrets に限定し、リポジトリへ保存しない

## Commit Rules

履歴は Conventional Commits 形式に従うこと。

- 形式: `<type>: <summary>`
- コミットメッセージは件名・本文ともに日本語で記載すること（Conventional Commits の `type` は英語のままで可）。
- 3行目以降には具体的な変更内容を記載すること。
- 複数行のコミットメッセージを作成する場合は、コミットのコマンドの実行方法によってはうまく複数行になっていない場合がある。コミット後に必ず確認し、複数行になっていない場合は修正すること。
- コミットメッセージ本文に改行を入れるときは、`-m` 引数内に `\n` を書かないこと。`git commit -m "<件名>" -m "<本文>"` のように `-m` を分けるか、メッセージファイルを使うこと。
- 1コミット1目的を徹底すること。
- 適切な粒度でコミットを行うこと。
- GPG署名を無効化しないこと。署名関連でコミットエラーになった場合はユーザーに報告すること。
