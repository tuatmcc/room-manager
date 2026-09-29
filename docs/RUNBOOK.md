# RUNBOOK

## Read This First

このリポジトリでは、コードより先に「どの文書が正本か」を決めておく必要がある。日常運用では次の順で参照する。

1. `docs/SPEC.md`
2. `docs/ARCHITECTURE.md`
3. `docs/STATUS.md`
4. `AGENTS.md`
5. `docs/DEPLOYMENT.md`（デプロイ作業時）

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

通常は手動実行しない。`main` の CI 成功後に CD workflow が次の順で実行する。

1. ARM64 native artifact を SHA 固有の候補 Release へ upload
2. `pnpm --dir packages/api ci:migrate`
3. `wrangler versions upload` と candidate URL の `GET /health`（D1/KVを含むhealth check）
4. `wrangler versions deploy` で検証済み version を 100% promote
5. Worker trigger の反映
6. production manifest を新しい device SHA へ更新

理由:
スキーマが先、Worker コードが後でないと、本番トラフィックと DB の整合が崩れる。D1 は rollback されないため migration は expand/contract 方式にする。

ARM64 artifact は `ubuntu-24.04-arm` 上の Debian Bookworm build container で
`deploy/ci/build-native-arm64.sh` を通して生成する。CI の ARM64 build、CD candidate、
通常の release はこの同じ経路を使用し、Bookworm 内で architecture、dynamic link、
glibc symbol、`room-manager --help` を検証する。container は本番端末には導入しない。

GitHub secrets、candidate URL、rollback は `docs/DEPLOYMENT.md` を参照する。

## Raspberry Pi Operations

### Preconditions

- Linux on arm/aarch64
- Pasori は起動前または起動後に接続（未接続の場合もアプリは待機するが、本番readinessは少なくとも1台の初期化まで成功しない）
- GPIO18 にサーボ接続済み
- 必要な USB / GPIO 権限がある
- `/etc/room-manager/app.env` に `API_PATH` と `API_TOKEN` を設定する
- `SERVO_DIRECTION` は省略可能。既定値は `normal`、ドアの取り付け方向を反転する場合は `reverse` を指定する

### Run

- 開発時: `cargo run -p room-manager -- --api-path <API_URL> --api-token <TOKEN>`
- 開発時に逆方向のサーボを使う場合: `cargo run -p room-manager -- --api-path <API_URL> --api-token <TOKEN> --servo-direction reverse`
- 本番: `docs/DEPLOYMENT.md` に従い `room-manager.service` から native binary を起動する

### Expected Behavior

- 起動時に API, sound, clock, readers, door lock の初期化ログが出る
- カードタッチで音声再生、API 呼び出し、必要に応じて解錠が行われる
- 解錠後 30 秒で自動施錠される
- Pasori の抜去時は `disconnected pasori reader`、再接続時は `connected pasori reader` が bus number / device address とともに記録される
- 複数台の Pasori は区別せず同じ用途で並行稼働し、1 台の抜き差しはほかの reader worker に影響しない

## Incident Handling

### Card Touch Fails

- API 健康確認: process確認は `GET /`、D1/KVを含む確認は `GET /health`、端末経路は認証付き `GET /local-device`
- `API_TOKEN` 不一致を確認
- Discord 通知失敗がレスポンス失敗に波及していないかログを見る
- D1 で対象ユーザー、カード、未退出ログの状態を確認する

### Device Does Not Read Cards

- Pasori が VID/PID `054c:06c3` で見えているか確認
- 非 Raspberry Pi 環境で Noop runtime になっていないか確認
- USB 権限と reader 接続状態を確認
- Pasori を抜き差しし、1 秒程度で切断・再接続ログが出ることを確認
- 複数台運用では片方だけを抜き、残った Pasori でカードを読めることを確認

### Door Does Not Lock or Unlock

- GPIO18 配線とサーボ電源を確認
- 起動直後の初期施錠ログと、解錠後 30 秒タイマーのログを確認

## Release Expectations

- CI では Node と Rust の lint / format / test / build が走る
- CD workflow は CI 成功後、ARM64 native artifact、Workers API candidate、production desired-version manifest の順に処理する
- Raspberry Pi は 5 分周期で manifest と SHA 固有 archive を pull し、release directory と atomic symlink を更新する
- activation は `pending-sha` を先に永続化し、`room-manager-recover.service` が boot 時に未確認 candidate を起動する前に last-successful release へ戻す。READY 後に pending を解消する
- `room-manager.service` の `TimeoutStartSec=120s` が readiness timeout の正本であり、controller の `systemctl restart` はその結果を使って rollback/quarantine を判断する
- CI は pull request と全 branch push で検証できるが、CD は main の CI success のみを契機とする
- release workflow は通常の GitHub Release に ARM64 binary と archive を載せるが、本番 desired version の更新は行わない
