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
  - `/room force-exit`（Admin 限定、Autocomplete + 確認ボタンつき）
- 未実装:
  - `/room-admin setting register`

### Batch Job

- 毎日 20:15 JST 相当で未退出ユーザーを自動退出させる cron が設定済み
- 対象ユーザーがいる場合のみ Discord 通知する

### Tests and CI

- API 側にユースケース、ハンドラ、ユーティリティのテストがある
- Rust 側に `TouchCardUseCase` 周辺のテストがある
- `ReaderEvent::Card` は Raspberry Pi runtime でのみ生成され、portable runtime では platform-specific な dead-code lint を抑制している
- Raspberry Pi の初回 installer は user service を新構成へ移行するが、実機確認が済むまで更新 timer を有効化しない
- GitHub Actions で Node / Rust の typecheck, lint, format, test, build が構成済み

### Continuous Deployment

- `main` の CI 成功後、検証済み SHA を使い、各昇格境界で最新SHA/CI runを再確認するlatest-only CD workflowが構成済み
- Workers API は D1 migration、candidate version upload、D1/KV dependency health check、100% promote の順で Blue/Green deploy される
- Raspberry Pi 用 ARM64 バイナリは Debian bookworm コンテナで build され、API 昇格成功後に Release `device-main` へ `room-manager-<sha>-aarch64` と `latest.txt`（sha / sha256）として公開される
- Raspberry Pi 側は `room-manager` ユーザーの user service と `room-manager-update.timer`（5 分周期）で更新される。sha256 検証、起動確認、readiness 確認、`current` / `previous` symlink による自動 rollback、失敗コミットの隔離（`failed-sha`）、手動 `rollback` に対応する
- `deploy/native/install.sh` は既存の `~/room-manager` と user service を新構成へ移行し、旧 unit を `room-manager.service.pre-native` に退避する。移行後の起動を確認できなければ旧 unit を復元し、続けて最新バイナリへ更新する（readiness に失敗したら移行したバイナリへ戻る）。更新 timer は実機確認後に有効化する
- 初期構築、秘密情報、監視、手動 rollback は `docs/DEPLOYMENT.md` に記載済み
- Podman Quadlet による blue/green 構成は、実機が Debian 12 (Podman 4.3.1) で Quadlet を使えないため廃止した

## Current Constraints

- 非 Raspberry Pi 環境では Noop runtime になるため、カード読取・音声・ドアロックは実動作しない
- `room-admin` はコマンド定義だけ存在し、実装されていない
- `room force-exit` の Admin 判定は `DISCORD_ADMIN_ROLE_ID` が設定されていればロールID一致を優先し、未設定時は Discord の `Administrator` 権限ビットで判定する
- 端末側は API 失敗時の永続再送を持たない
- API は Discord 通知送信失敗をリクエスト失敗として扱い得る
- 未登録 NFC コードは 4 桁で、衝突時は最大 16 回までリトライする
- 学生証 / Suica 読取は固定オフセットのバイト解析に依存する
- Pasori の自動再接続は CI で論理部分を検証できるが、USB 抜き差しと複数台同時利用は Raspberry Pi 実機確認が必要
- 端末の更新はサービスの再起動を伴うため、切替時に数秒間カード読取が止まる。切替後に少なくとも1台のPasori初期化を含む readiness を確認し、Pasori 未接続の端末では更新が rollback される
- D1 migration は Worker version と一緒に rollback できないため、expand/contract 方式が必要

## Known Risks

- 実機依存部は CI だけでは十分に担保できない
- `device-main` Release は CD が初めて成功するまで存在しない。それ以前は端末の更新が `latest.txt` の取得失敗で何もせず終わる
- 配布物の完全性は HTTPS と同一 Release 上の sha256 に依存する。リポジトリの write 権限を持つ者は端末へバイナリを配布できる
- 実機で `install.sh` による移行と最新バイナリへの更新は成功した（2026-11-12）。カード・音声・解錠・施錠・USB 再接続の実機確認と、更新 timer の有効化、timer 経由の更新、自動 rollback の実機確認は未完了
- 更新スクリプトと unit は `device-main` では更新されないため、変更時は端末で `install.sh` を再実行する
- `release.yml` が生成する GitHub Release 用バイナリは ubuntu runner で build されており、Debian 12 の端末では動作しない可能性がある（端末配布には使わない）
- Cron による一括退出は運用ルール変更に弱い
- 秘密情報の配置ルールが曖昧だとローカル開発と本番の差異を生みやすい

## Resume Here

優先度順に次を進める。

1. `room-admin` の仕様を決め、実装するか削除するかを選ぶ
2. Discord 通知失敗時の扱いを明文化する
3. Raspberry Pi 実機でネイティブ配布の移行（`install.sh`）、更新、rollback を検証し、更新 timer を有効化する
4. スキーマ変更が入る開発では expand/contract を守り、`docs/ARCHITECTURE.md` のデータモデル節を先に更新する

## Files to Read First When Resuming

- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `packages/api/src/index.ts`
- `packages/api/src/usecase/TouchCard.ts`
- `crates/app/src/main.rs`
- `crates/app/src/app/touch_card.rs`
