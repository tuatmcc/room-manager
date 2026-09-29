# STATUS

## Snapshot

- Date: 2026-09-29
- Version markers:
  - root `package.json`: `0.3.1`
  - `packages/api/package.json`: `0.3.1`
  - `crates/app/Cargo.toml`: `0.3.1`
  - `crates/pasori/Cargo.toml`: `0.3.1`

## What Exists Today

### End-to-End Path

- Raspberry Pi 側アプリから Workers API へのカードタッチ送信が実装済み
- API はユーザー特定、入退出トグル、Discord 通知、レスポンス返却を実装済み
- 端末は API 応答に応じて音声再生し、成功時のみ解錠する
- 端末は接続中の全 Pasori を同じ役割で扱い、USB 切断後もデバイスの再検出と reader worker の再生成を継続する
- GPIO サーボの回転方向を `SERVO_DIRECTION=normal|reverse` または `--servo-direction` で切り替えられる

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
- `ReaderEvent::Card` は Raspberry Pi runtime でのみ生成され、portable runtime では platform-specific な dead-code lint を抑制している
- Raspberry Pi の初回 installer は Quadlet サービスを起動するが、実機確認が済むまで更新 timer を有効化しない
- GitHub Actions で Node / Rust の typecheck, lint, format, test, build が構成済み

### Continuous Deployment

- `main` の CI 成功後、検証済み SHA を使い、各昇格境界で最新SHA/CI runを再確認するlatest-only CD workflowが構成済み
- Workers API は D1 migration、candidate version upload、D1/KV dependency health check、100% promote の順で Blue/Green deploy される
- Raspberry Pi 用 ARM64 OCI image は GHCR の `main` と commit SHA tag へ publish される
- Raspberry Pi 側は Podman Quadlet の blue/green 2 slot、`podman auto-update`、共有 hardware lock、自動 rollback、不健全activeの次回起動時復旧、不良digest隔離で更新される
- 初期構築、秘密情報、監視、手動 rollback は `docs/DEPLOYMENT.md` に記載済み
- `deploy/podman/migrate-legacy.sh` は明示した旧 systemd システムサービスからの初回移行に対応し、旧系停止前の候補準備、再起動を跨ぐ起動抑止、readiness失敗時の旧系復旧、実機確認後のtimer有効化を行う。旧バイナリ・設定は変更しない

## Current Constraints

- 非 Raspberry Pi 環境では Noop runtime になるため、カード読取・音声・ドアロックは実動作しない
- `room-admin` はコマンド定義だけ存在し、実装されていない
- 端末側は API 失敗時の永続再送を持たない
- API は Discord 通知送信失敗をリクエスト失敗として扱い得る
- 未登録 NFC コードは 4 桁で、衝突時は最大 16 回までリトライする
- 学生証 / Suica 読取は固定オフセットのバイト解析に依存する
- Pasori の自動再接続は CI で論理部分を検証できるが、USB 抜き差しと複数台同時利用は Raspberry Pi 実機確認が必要
- Blue/Green の候補 slot は物理デバイスの二重操作を避けるため standby 状態で検証し、切替直後に少なくとも1台のPasori初期化を含む実機readinessを確認する
- D1 migration は Worker version と一緒に rollback できないため、expand/contract 方式が必要

## Known Risks

- 実機依存部は CI だけでは十分に担保できない
- Raspberry Pi の container device mapping と Blue/Green 切替は実機での初回確認が必要
- 旧方式の systemd unit はリポジトリに含まれないため、移行時に実機の正規 service 名を指定する。user service、cron、手動起動、timer/socket起動の移行は自動化対象外
- Cron による一括退出は運用ルール変更に弱い
- 秘密情報の配置ルールが曖昧だとローカル開発と本番の差異を生みやすい

## Resume Here

優先度順に次を進める。

1. `room-admin` の仕様を決め、実装するか削除するかを選ぶ
2. Discord 通知失敗時の扱いを明文化する
3. Raspberry Pi 実機で Podman 初期構築と blue/green 切替を検証する
4. スキーマ変更が入る開発では expand/contract を守り、`docs/ARCHITECTURE.md` のデータモデル節を先に更新する

## Files to Read First When Resuming

- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `packages/api/src/index.ts`
- `packages/api/src/usecase/TouchCard.ts`
- `crates/app/src/main.rs`
- `crates/app/src/app/touch_card.rs`
