# ARCHITECTURE

## System Topology

1. 利用者が学生証または NFC カードを Pasori にタッチする
2. `crates/app` がカード情報を読み取り、`POST /local-device/touch-card` を呼ぶ
3. `packages/api` が D1 上のユーザー / カード / 入退室ログを更新する
4. API は Discord に通知し、端末へ結果を返す
5. `crates/app` は結果に応じて音声再生し、成功時のみドアを解錠する
6. 夜間 cron が未退出ログを一括で閉じ、必要なら Discord へ通知する

## Workspace Layout

- `crates/app`: 端末実行アプリ
- `crates/pasori`: Pasori / FeliCa ライブラリ
- `packages/api`: Cloudflare Workers API
- `.github/workflows`: CI / release

## Rust App Design

### Entry Point

- `crates/app/src/main.rs`
- `Config` から `API_PATH` と `API_TOKEN` を読み込む
- API クライアント、サウンドプレイヤー、時計、カードリーダー、ドアロックを初期化する
- すべてのカードリーダーストリームを `select_all` で束ね、カードごとに `TouchCardUseCase` を実行する

### Layers

- `app`: ユースケース
  - `TouchCardUseCase` が端末側のメインフローを担当
- `domain`: 純粋なエンティティと境界インターフェイス
  - `Card`, `TouchCardRequest`, `TouchCardResponse`, `RoomEntryStatus`, `ErrorCode`, `SoundEvent`
  - `CardApi`, `SoundPlayer`, `Clock`, `DoorLock`
- `infra`: 実装詳細
  - `HttpCardApi`: Workers API クライアント
  - `PasoriReader`: 実機カード読取
  - `RodioPlayer`: wav 再生
  - `GpioDoorLock`: サーボ制御
  - `SystemClock`: 現地時刻提供
- `runtime`: 実行環境切替
  - `raspi`: Linux + arm/aarch64 + `raspi-runtime` feature のとき実機実装
  - `portable`: それ以外は Noop 実装

### Runtime Decision

- デフォルト feature は `raspi-runtime`
- ただし実際に `raspi` runtime が有効になるのは `target_os=linux` かつ `arm/aarch64`
- そのため macOS や x86 Linux ではビルド成功しても、実行時は Noop reader / sound / lock になる

### Hardware-Specific Rules

- Pasori 検出は Sony VID `0x054c`, PID `0x06c3`
- 学生証読取は system code `0x809c`, service code `0x200b`
- Suica 残高読取は system code `0x0003`, service code `0x090f`
- ドアロックは GPIO18 のサーボを使い、解錠後 30 秒で自動施錠する

## Pasori Library Design

### Modules

- `device`: デバイス抽象と `rcs380` 実装
- `transport`: USB 通信
- `felica`: FeliCa プロトコルデータ型と処理

### Responsibility

- カードポーリング
- read without encryption
- IDm や system code の扱い

`crates/app` 側は `pasori` を使ってカード読取の業務ロジックだけを組み立てる。

## API Design

### Entry Point

- `packages/api/src/index.ts`
- Hono アプリを構築し、各リクエストで logger, env, repositories, services, usecases を初期化する

### Routes

- `GET /`: health check
- `GET /local-device`: health check
- `POST /local-device/touch-card`: 端末用カードタッチ受付
- `POST /interaction`: Discord Interaction
- `scheduled`: 日次自動退出

### Middleware

- `/local-device/*`: `Authorization: Bearer <API_TOKEN>` を検証
- `/interaction`: Discord 署名を検証

### Internal Composition

- `repositories`: D1 を使うデータアクセス層
- `services`: Discord REST と KV キャッシュ
- `usecase`: 業務ロジック
- `handlers`: HTTP / Interaction / cron 入出力の境界

## API Module Map

### Use Cases

- `TouchCardUseCase`
  - `studentId` 優先でユーザー解決
  - 未登録 NFC なら `unknown_nfc_cards` を払い出し
  - `room_entry_logs` をトグルし、現在在室人数を返す
- `RegisterStudentCardUseCase`
  - Discord ユーザーを作成または再利用し、学籍番号を作成または更新する
- `RegisterNfcCardUseCase`
  - 一時コードから未登録 NFC を引き当て、正式カードとして登録する
- `ListEntryUsersUseCase`
  - 退出していないユーザー一覧を返す
- `ExitAllEntryUsersUseCase`
  - 開いた入室ログをまとめて閉じる

### Handlers

- `local-device/touch-card`
  - 入力バリデーション
  - `TouchCardUseCase` 実行
  - presenter で Discord embed と API response を生成
  - Discord へ通知
- `slash-command/*`
  - `/ping`, `/room register student-card`, `/room register nfc-card`, `/room list`
  - `/room-admin` は未実装扱い
- `scheduled/exit-all-entry-users`
  - 一括退室と Discord 通知

### Services

- `DiscordService`
  - guild member 情報取得
  - channel への embed 投稿
  - 12 時間 TTL の KV キャッシュ

## Data Model

### `users`

- `id`
- `discord_id` unique
- 1 人の Discord ユーザーを表す正本

### `student_cards`

- `student_id` unique
- `user_id` unique
- 1 ユーザーに 1 学生証を紐付ける

### `nfc_cards`

- `idm` unique
- `user_id`
- 任意名付きの NFC カードを保持する

### `unknown_nfc_cards`

- `code` unique
- `idm` unique
- 未登録 NFC の一時保管
- 4 桁コードを払い出し、Discord 登録フローの橋渡しをする

### `room_entry_logs`

- `user_id`
- `entry_at`
- `exit_at nullable`
- `exit_at IS NULL` の `user_id` 一意制約により、同一ユーザーの開いたログは 1 件だけに保つ

## Key Invariants

- Discord ユーザー識別子は `users.discord_id` を正本とする
- 学生証番号はユーザー間で重複不可
- NFC IDm はユーザー間で重複不可
- 未退出の入室ログはユーザーごとに高々 1 件
- 端末側は API 成功時のみ解錠する

## Important Decisions

### D1 as Source of Truth

入退出状態は D1 の `room_entry_logs` を正本とし、Discord 表示はその派生結果とする。

### Discord as User Interface

登録や在室確認の UI を Discord に寄せ、専用 Web UI は持たない。

### Two-Step NFC Registration

未登録 NFC を即拒否せず、4 桁コードを介した二段階登録にすることで、物理カードと Discord アカウントを結びつける。

### Portable Runtime for Development

非実機環境でもビルドや一部確認を可能にするため Noop runtime を持つ。ただし実機確認の代替ではない。
