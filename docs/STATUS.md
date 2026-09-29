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
- Raspberry Pi の初回 installer は native systemd service を起動するが、実機確認が済むまで更新 timer を有効化しない
- GitHub Actions で Node / Rust の typecheck, lint, format, test, build が構成済み
- ARM64 artifact は `ubuntu-24.04-arm` 上の Debian Bookworm build container で生成し、CI、CD、release の build 経路を統一している。AArch64、dynamic link、glibc symbol、`room-manager --help` の検証を build script に含める

### Continuous Deployment

- `main` の CI 成功後、検証済み SHA を使い、各昇格境界で最新SHA/CI runを再確認するlatest-only CD workflowが構成済み
- Workers API は D1 migration、candidate version upload、D1/KV dependency health check、100% promote の順で配布される
- Raspberry Pi 用 ARM64 native archive は commit SHA 固有の GitHub Release へ publish される
- API promote 成功後だけ GitHub Release の production manifest が更新され、端末はそれを pull して versioned release directory と atomic symlink を更新する
- Raspberry Pi 側は単一の `room-manager.service`、systemd readiness、automatic rollback、failed SHA quarantine、共有 deploy lock で更新される
- activation は `pending-sha` を先に永続化し、`room-manager-recover.service` が boot 時に未確認 candidate を起動する前に last-successful release へ戻す。READY 後に pending を解消し、rollback target failure 時は pending/failed state を残す
- readiness timeout は `room-manager.service` の `TimeoutStartSec=120s` に一本化している
- 初期構築、秘密情報、監視、手動 rollback は `docs/DEPLOYMENT.md` に記載済み
- `deploy/native/migrate-legacy.sh` は明示した旧 native systemd サービスからの初回移行に対応し、旧系停止前の artifact 準備、再起動を跨ぐ起動抑止、readiness失敗時の旧系復旧、実機確認後の timer 有効化を行う。旧バイナリ・設定は変更しない

## Current Constraints

- 非 Raspberry Pi 環境では Noop runtime になるため、カード読取・音声・ドアロックは実動作しない
- `room-admin` はコマンド定義だけ存在し、実装されていない
- 端末側は API 失敗時の永続再送を持たない
- API は Discord 通知送信失敗をリクエスト失敗として扱い得る
- 未登録 NFC コードは 4 桁で、衝突時は最大 16 回までリトライする
- 学生証 / Suica 読取は固定オフセットのバイト解析に依存する
- Pasori の自動再接続は CI で論理部分を検証できるが、USB 抜き差しと複数台同時利用は Raspberry Pi 実機確認が必要
- native service は systemd の stop/start と readiness 通知で切り替え中の同時実行を防ぎ、少なくとも1台のPasori初期化後に READY になる
- feature branch push でも CI を実行するが、CD workflow は main の CI success のみを受け付ける
- D1 migration は Worker version と一緒に rollback できないため、expand/contract 方式が必要

## Known Risks

- 実機依存部は CI だけでは十分に担保できない
- Raspberry Pi の Pasori、GPIO、ALSA、systemd readiness と電源断後の復旧は実機での初回確認が必要
- 旧方式の systemd unit はリポジトリに含まれないため、移行時に実機の正規 service 名を指定する。user service、cron、手動起動、timer/socket起動の移行は自動化対象外
- Cron による一括退出は運用ルール変更に弱い
- 秘密情報の配置ルールが曖昧だとローカル開発と本番の差異を生みやすい

## Resume Here

優先度順に次を進める。

1. `room-admin` の仕様を決め、実装するか削除するかを選ぶ
2. Discord 通知失敗時の扱いを明文化する
3. Raspberry Pi 実機で native installer、systemd readiness、rollback、timer を検証する
4. スキーマ変更が入る開発では expand/contract を守り、`docs/ARCHITECTURE.md` のデータモデル節を先に更新する

## Files to Read First When Resuming

- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `packages/api/src/index.ts`
- `packages/api/src/usecase/TouchCard.ts`
- `crates/app/src/main.rs`
- `crates/app/src/app/touch_card.rs`
