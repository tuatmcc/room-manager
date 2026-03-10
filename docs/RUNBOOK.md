# RUNBOOK

## Read This First

このリポジトリでは、コードより先に「どの文書が正本か」を決めておく必要がある。日常運用では次の順で参照する。

1. `docs/SPEC.md`
2. `docs/ARCHITECTURE.md`
3. `docs/STATUS.md`
4. `AGENTS.md`

## Always-Follow Rules

- 実装変更時は、影響するドキュメントを同じ変更セットで更新する
- API 契約を変えたら、`packages/api` と `crates/app` を同時に確認する
- `room-admin` は未実装である前提を崩さない。仕様が固まるまでは隠れた動作を足さない
- 秘密情報は `.env`, `packages/api/.dev.vars`, GitHub Actions secrets に限定する
- 実機依存の挙動は、portable runtime の結果だけで完了判定しない

## Development Workflow

### Environment Setup

- `mise install`
- `pnpm install`
- `cargo fetch`
- ルート `.env` を `.env.example` から作成
- `packages/api/.dev.vars` を作成し Workers 用 secrets を入れる

### Before Editing

- `docs/STATUS.md` を読んで現状の未完事項を確認する
- 変更が仕様変更か実装修正かを切り分ける
- 実機が必要か、portable runtime で足りるかを先に判断する

### During Editing

- Node 側は Hono handler / usecase / repository の境界を崩さない
- Rust 側は `domain` と `infra` を混ぜない
- DB スキーマ変更時は Drizzle migration を生成し、関連 usecase と docs を更新する

### Verification

最低限、変更範囲に応じて以下を実行する。

- Node 全体確認:
  - `pnpm run lint`
  - `pnpm run format:check`
  - `pnpm run typecheck`
  - `pnpm run test`
- Rust 全体確認:
  - `cargo fmt --all -- --check`
  - `cargo clippy --locked --workspace --all-targets --all-features -- -D warnings`
  - `cargo test --locked --workspace --all-targets --all-features`

## API Operations

### Local Development

- 起動: `pnpm --dir packages/api dev`
- ローカル D1 マイグレーション: `pnpm --dir packages/api dev:migrate`
- コマンド登録: `pnpm --dir packages/api register`

### Deployment

順序を変えない。

1. `pnpm --dir packages/api ci:migrate`
2. `pnpm --dir packages/api ci:deploy`

理由:
スキーマが先、Worker コードが後でないと、本番トラフィックと DB の整合が崩れる。

## Raspberry Pi Operations

### Preconditions

- Linux on arm/aarch64
- Pasori 接続済み
- GPIO18 にサーボ接続済み
- 必要な USB / GPIO 権限がある
- `API_PATH` と `API_TOKEN` を環境変数として渡す

### Run

- `cargo run -p room-manager -- --api-path <API_URL> --api-token <TOKEN>`

### Expected Behavior

- 起動時に API, sound, clock, readers, door lock の初期化ログが出る
- カードタッチで音声再生、API 呼び出し、必要に応じて解錠が行われる
- 解錠後 30 秒で自動施錠される

## Incident Handling

### Card Touch Fails

- API 健康確認: `GET /` と `GET /local-device`
- `API_TOKEN` 不一致を確認
- Discord 通知失敗がレスポンス失敗に波及していないかログを見る
- D1 で対象ユーザー、カード、未退出ログの状態を確認する

### Device Does Not Read Cards

- Pasori が VID/PID `054c:06c3` で見えているか確認
- 非 Raspberry Pi 環境で Noop runtime になっていないか確認
- USB 権限と reader 接続状態を確認

### Door Does Not Lock or Unlock

- GPIO18 配線とサーボ電源を確認
- 起動直後の初期施錠ログと、解錠後 30 秒タイマーのログを確認

## Release Expectations

- CI では Node と Rust の lint / format / test / build が走る
- release workflow では arm 上で `room-manager` バイナリをビルドし、API は migrate 後に deploy される
