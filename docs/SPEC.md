# SPEC

## Purpose

`room-manager` は、Discord コミュニティと物理的な部室利用を結びつける入退出管理システムである。利用者は学生証または NFC カードをリーダーにタッチし、システムは現在の在室状態をトグルしつつ Discord へ通知する。

## Product Goals

- 入室・退出を 1 回のカードタッチで完結させる
- Discord 上で利用者登録と現在在室中の確認を完結させる
- 物理端末側では、カード読取、音声案内、ドア解錠を一貫して行う
- 退出し忘れを日次バッチで自動補正する

## Users

- 部員: 学生証や NFC カードを使って入退出する
- 管理者: Discord コマンドで登録や確認を行う
- 開発者 / 運用者: API、端末、Discord、データベースを保守する

## In Scope

- Discord スラッシュコマンドによる学生証登録
- 未登録 NFC カードの一時コード払い出しと、そのコードを使った NFC 登録
- 物理端末からのカードタッチ受付
- 在室人数の集計と Discord 通知
- 毎日 20:15 JST 相当の自動退出処理

## Out of Scope

- Web UI
- 複数部屋の同時管理
- 入室権限や新規登録可否の細かな管理 UI
- オフライン時の端末側キューイングや後送

## Functional Requirements

### 1. Health and Liveness

- API は `GET /` と `GET /local-device` に対して `OK` を返す
- 端末アプリは起動時に API、音声、時計、カードリーダー、ドアロックを初期化する

### 2. Card Touch

- 端末はカードを検知すると `idm` と、取得できる場合のみ `student_id` を API に送る
- API は `student_id` がある場合は学生証ベース、ない場合は NFC IDm ベースで利用者を特定する
- 利用者が特定できた場合は在室状態をトグルし、`entry` または `exit` を返す
- 成功時は Discord に通知し、端末は音声案内の後にドアを解錠する
- 退出で在室人数が 0 になった場合は追加の音声案内を再生する

### 3. Unknown Card Handling

- 学生証が未登録なら `STUDENT_CARD_NOT_REGISTERED` を返す
- NFC カードが未登録なら `unknown_nfc_cards` に一時レコードを作成または再利用し、4 桁コード付きで `NFC_CARD_NOT_REGISTERED` を返す
- そのコードは Discord の `/room register nfc-card` で消費され、正常登録後は一時レコードを削除する

### 4. Discord Commands

- `/ping`: 疎通確認
- `/room register student-card`: Discord ユーザーへ学籍番号を登録または更新
- `/room register nfc-card`: 一時コードと表示名で NFC カードを登録
- `/room list`: 現在入室中のユーザーを表示
- `/room-admin setting register`: 現時点では未実装として明示的にエラーを返す

### 5. Scheduled Exit

- 毎日 20:15 JST 相当の Cron で、未退出の入室ログを一括で閉じる
- 対象ユーザーが 1 人以上いる場合のみ Discord に自動退出通知を送る

## External Interfaces

### Local Device to API

- Endpoint: `POST /local-device/touch-card`
- Auth: `Authorization: Bearer <API_TOKEN>`
- Request:
  - `idm: string`
  - `student_id?: number`
- Success response:
  - `success: true`
  - `status: "entry" | "exit"`
  - `entries: number`
- Error response:
  - `success: false`
  - `error: string`
  - `error_code: string`

### Discord Notifications

- 入退出成功時に通知 embed を送る
- 未登録カード時も登録導線付き embed を送る
- 自動退出時は対象ユーザー一覧付き embed を送る

## Non-Functional Requirements

- API は Cloudflare Workers / D1 / KV で動作する
- 端末アプリは Raspberry Pi 上で動作し、Pasori、GPIO サーボ、音声再生を利用する
- 非 Raspberry Pi 環境では Noop runtime で起動できるが、カードイベントは発生しない
- 入退出の重複更新に対しては DB 制約とリトライで整合性を保つ

## Acceptance Criteria

- 学生証登録済みユーザーがカードタッチすると、在室状態が切り替わり Discord と端末出力が一致する
- 未登録学生証 / 未登録 NFC は、正しいエラーコードと登録導線を返す
- `/room list` が現在の未退出ログに一致する
- 夜間バッチ実行後、開いた入室ログが残らない
