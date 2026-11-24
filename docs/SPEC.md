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
- 電子ペーパー端末(Sony DPT-S1)のブラウザ向け入室人数表示ページ

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

### 6. Room Occupancy Display

- `GET /display/:token` は現在の入室人数だけを表示する HTML を返す。ハンドルネームなど人数以外の情報は表示しない
- 表示先は DPT-S1 の内蔵ブラウザで、TLS 1.0 までしか話せないため HTTP で提供する(`http://room-manager.tuatmcc-com.workers.dev/display/<token>`。workers.dev が HTTP を許すことは実機で確認済み)。平文になるため、表示内容は人数と更新時刻に限る
- トークンは端末のキーボードで入力するため 8 文字とする(紛らわしい文字を除いた英小文字と数字なら約 8.5×10^11 通り)。短い分だけ総当たりに弱く、workers.dev には WAF の rate limiting を置けない。人数だけの低機微な情報であることを前提に許容し、漏洩や疑いがあれば `DISPLAY_TOKEN` を差し替える
- ページは 5 秒ごとに `GET /display/:token/count`(`{ count, updatedAt }`)を取得して人数を差し替える。入退室から表示までの遅延は 10 秒以内を目標とする
- `:token` は `DISPLAY_TOKEN`(8 文字以上)と定数時間で比較する。不一致、または `DISPLAY_TOKEN` 未設定の場合は存在を隠すため `404` を返す。`API_TOKEN` とは別の値にする
- 在室者の取得に失敗したときは `0 人` と誤表示せず、`500` を返す。ページ側は「(更新できません)」を表示する
- 画面は上から MCC ロゴ、「ただいま」、入室人数(大きな数字)、「人が入室中」、更新時刻(JST, `HH:MM:SS`)の順に並べる
- 電子ペーパー向けに白地・グレースケールのみ・アニメーションなしで描画し、値が変わったときだけ DOM を書き換える

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
- サーボの回転方向は `SERVO_DIRECTION` で `normal` または `reverse` に設定でき、既定値は `normal` とする
- 非 Raspberry Pi 環境では Noop runtime で起動できるが、カードイベントは発生しない
- 入退出の重複更新に対しては DB 制約とリトライで整合性を保つ
- release-please の Release（`vX.Y.Z`）作成を起点に、Workers API と Raspberry Pi 用 ARM64 バイナリを自動配布する。`main` への merge だけでは本番へ配布しない
- Workers API は未配布 version の health check 後に production traffic を切り替える
- Raspberry Pi は公開されたバイナリを自動で取得・検証して切り替え、起動確認に失敗した場合は直前のバイナリへ戻す
- Raspberry Pi 上で Pasori、GPIO、音声を操作するアプリプロセスは常に 1 個だけとする（systemd user service が単一プロセスを管理する）

## Acceptance Criteria

- 学生証登録済みユーザーがカードタッチすると、在室状態が切り替わり Discord と端末出力が一致する
- 未登録学生証 / 未登録 NFC は、正しいエラーコードと登録導線を返す
- `/room list` が現在の未退出ログに一致する
- 夜間バッチ実行後、開いた入室ログが残らない
- デプロイ中も旧系は候補系の検証完了まで稼働し、候補系の起動失敗時は旧系へ自動復帰する
