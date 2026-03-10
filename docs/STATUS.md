# STATUS

## Snapshot

- Date: 2026-03-10
- Version markers:
  - root `package.json`: `0.2.5`
  - `packages/api/package.json`: `0.2.5`
  - `crates/app/Cargo.toml`: `0.2.5`
  - `crates/pasori/Cargo.toml`: `0.2.5`

## What Exists Today

### End-to-End Path

- Raspberry Pi 側アプリから Workers API へのカードタッチ送信が実装済み
- API はユーザー特定、入退出トグル、Discord 通知、レスポンス返却を実装済み
- 端末は API 応答に応じて音声再生し、成功時のみ解錠する

### Discord Commands

- 実装済み:
  - `/ping`
  - `/room register student-card`
  - `/room register nfc-card`
  - `/room list`
- 未実装:
  - `/room-admin setting register`

### Batch Job

- 毎日 20:15 JST 相当で未退出ユーザーを自動退出させる cron が設定済み
- 対象ユーザーがいる場合のみ Discord 通知する

### Tests and CI

- API 側にユースケース、ハンドラ、ユーティリティのテストがある
- Rust 側に `TouchCardUseCase` 周辺のテストがある
- GitHub Actions で Node / Rust の typecheck, lint, format, test, build が構成済み

## Current Constraints

- 非 Raspberry Pi 環境では Noop runtime になるため、カード読取・音声・ドアロックは実動作しない
- `room-admin` はコマンド定義だけ存在し、実装されていない
- 端末側は API 失敗時の永続再送を持たない
- API は Discord 通知送信失敗をリクエスト失敗として扱い得る
- 未登録 NFC コードは 4 桁で、衝突時は最大 16 回までリトライする
- 学生証 / Suica 読取は固定オフセットのバイト解析に依存する

## Known Risks

- 実機依存部は CI だけでは十分に担保できない
- Cron による一括退出は運用ルール変更に弱い
- 秘密情報の配置ルールが曖昧だとローカル開発と本番の差異を生みやすい

## Resume Here

優先度順に次を進める。

1. `room-admin` の仕様を決め、実装するか削除するかを選ぶ
2. Discord 通知失敗時の扱いを明文化する
3. Raspberry Pi 実機セットアップ手順を必要なら追加文書へ切り出す
4. スキーマ変更が入る開発では `docs/ARCHITECTURE.md` のデータモデル節を先に更新する

## Files to Read First When Resuming

- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `packages/api/src/index.ts`
- `packages/api/src/usecase/TouchCard.ts`
- `crates/app/src/main.rs`
- `crates/app/src/app/touch_card.rs`
