# Continuous Deployment

## Delivery model

`main` の CI が成功すると `.github/workflows/cd.yml` が検証済みコミットを取得し、次の順序で自動配布する。

1. Raspberry Pi 用の ARM64 バイナリを Debian bookworm コンテナで build し、workflow artifact として保持する（この時点では配布しない）
2. Workers API の新 version を候補として upload し、candidate URL の `GET /health` で Worker、D1、KV を確認した後で 100% のトラフィックを新 version へ切り替える
3. API 切替成功後だけ、バイナリを GitHub Release `device-main` へ公開する

Raspberry Pi は外部から SSH されない。端末自身の `room-manager-update.timer` が 5 分ごとに `device-main` の `latest.txt` を確認し、新しいコミットがあればバイナリを取得・検証して再起動する pull 型 CD である。新 API は旧端末との後方互換を保つ前提とし、API の昇格に失敗した場合はバイナリを公開しない。

### Why the API is not on the device

API は Cloudflare Workers の D1、KV、scheduled handler、binding を直接利用するため、端末へ移せない。API は Cloudflare の version/deployment 機能で Blue/Green 配布し、物理端末だけを pull 型で更新する。

### Why a native binary

端末は Pasori、GPIO、PipeWire のユーザーセッションを直接使い、既存の `room-manager` user service として動いている。実機は Debian 12 (Podman 4.3.1) で Quadlet が使えず、OS の入れ替えも難しいため、コンテナではなく単一バイナリと systemd user service で配布する。

## Blue/Green invariants

### Workers API

- DB migration を適用してから、green version を production traffic なしで upload する
- `candidate-room-manager.<subdomain>.workers.dev/health` で D1 query と KV read を含む health check を行う
- health check が成功した version tag だけを 100% へ promote する
- upload または health check に失敗した場合、現在の version は変更しない
- 直前の version は Cloudflare 上に残るため、Deployments から再度 100% に設定して rollback できる

D1 は Worker version に含まれず rollback されない。このため migration は、旧 API と新 API の双方から利用できる add-only の expand migration を先に行い、列削除や意味変更などの contract migration は全端末の更新確認後に別リリースで行う。

### Device binary

- バイナリは `rust:1.94.0-bookworm` コンテナで build する。端末の Debian 12 と同じ glibc / 共有ライブラリにリンクされるため、ubuntu runner でそのまま build したバイナリは配布に使わない
- Release `device-main`（prerelease、Latest ではない）に、コミットごとに不変の `room-manager-<sha>-aarch64` を置く。最新の 5 個だけを残し、古いものは削除する
- `latest.txt`（`sha=<40桁>` と `sha256=<64桁>`）は必ずバイナリの upload 後に更新する。端末が存在しないバイナリを指す manifest を見ることはない
- 各境界（API 準備、API 昇格、公開）で対象 SHA が現在の `main` HEAD であり、最新 CI run が成功済みであることを再検証する。途中で新しい `main` が現れた古い delivery は公開しない
- 端末は sha256 検証と `room-manager --help` の起動確認が通ったバイナリだけを有効化する
- 端末は切替後、アプリが readiness を報告するまで待つ。API・音声・GPIO と少なくとも 1 台の Pasori reader の初期化後に、アプリが自身の PID を ready file へ書く。この PID が service の `MainPID` と一致し、その後も安定して動作し続ければ成功とする
- 失敗したら直前のバイナリへ戻して再起動し、失敗したコミットを `failed-sha` に記録する。`main` が別コミットへ進むまで同じコミットは再試行しない
- 切替時にはサービスの再起動により数秒間カード読取が止まる。二重起動は発生しない（systemd が単一プロセスを管理する）

Pasori が接続されていない端末では readiness が得られないため、更新は rollback される。物理確認のできる状態で配布する。

## GitHub setup

Repository の Actions secrets に次を登録する。

| Secret                         | Purpose                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`        | Wrangler の account 選択                                                                            |
| `CLOUDFLARE_API_TOKEN`         | D1 migration、version upload、deployment、trigger 更新                                              |
| `CLOUDFLARE_WORKERS_SUBDOMAIN` | Worker 名を含む `workers.dev` ホスト名。`.workers.dev` は含めない（例: `room-manager.tuatmcc-com`） |

バイナリの公開には、公開ジョブだけに付与した `contents: write` の `GITHUB_TOKEN` を使う（他の job は `contents: read`）。リポジトリは public のため、端末は認証なしで Release assets を取得できる。private にする場合は端末に `read` 権限の token を渡す仕組みが別途必要になる。

Branch protection では `main` への merge 前に `CI` を必須にする。CD は `CI` の `workflow_run` が `success` のときだけ、CI が検証した同じ SHA を配布する。

## Raspberry Pi layout

端末の `room-manager` ユーザー（lingering 有効）の user service として動かす。音声に PipeWire のユーザーセッションを使うため system service にはしない。

```text
~/.local/lib/room-manager/
  bin/room-manager-update        更新スクリプト（deploy/native/room-manager-update.sh）
  releases/<sha>/room-manager    取得済みバイナリ
  current  -> releases/<sha>     稼働中（unit の ExecStart はここを指す）
  previous -> releases/<sha>     直前のバイナリ（rollback 用）
  failed-sha                     隔離中のコミット
~/.config/systemd/user/
  room-manager.service           アプリ本体
  room-manager.env               API_PATH / API_TOKEN（既存、mode 0600）
  room-manager-update.service    更新（oneshot）
  room-manager-update.timer      5 分ごとに更新を確認
~/.config/room-manager/
  device.env                     SERVO_DIRECTION など端末固有の設定
  update.env                     任意。ROOM_MANAGER_RELEASE_URL などの上書き
```

更新スクリプト自体は `device-main` では更新されない。スクリプトや unit を変えたときは、リポジトリを取得して `install.sh` を再実行する。

## Raspberry Pi setup

### 1. Preconditions

- 64-bit Raspberry Pi OS / Debian 12 (`aarch64`)、systemd、`curl`、`flock`（util-linux）、`sha256sum`
- `room-manager` ユーザーの lingering が有効（`loginctl show-user room-manager | grep Linger` が `yes`）
- `room-manager` ユーザーが `audio`、`plugdev`、`gpio` グループに属している
- `~/.config/systemd/user/room-manager.env` に `API_PATH` と `API_TOKEN` がある
- GPIO18 にサーボを接続し、Pasori を USB 接続できる
- API と GitHub（`github.com`）へ HTTPS で到達できる

### 2. Install (also migrates the existing user service)

リポジトリを取得するか `deploy/native` ディレクトリを端末へコピーし、`room-manager` ユーザーとして実行する（root では実行しない）。

```sh
sudo -iu room-manager
./deploy/native/install.sh
```

`install.sh` は次を行う。

- 既存の `~/room-manager` を最初の release（`releases/initial`）として取り込む。旧バイナリのファイル自体は削除しない
- 既存 unit の `--servo-direction` を読み取り、`device.env` の `SERVO_DIRECTION` へ引き継ぐ。`SERVO_DIRECTION=reverse ./deploy/native/install.sh` で明示もできる
- 旧 unit を `room-manager.service.pre-native` として退避し、新しい unit を配置してサービスを再起動する。数秒間カード読取が止まる。現地でドアを操作できる時間に実行する
- 再起動後、サービスが 10 秒間動き続けるかを確認する。取り込んだ旧バイナリは readiness 通知を持たない場合があるため、この時点では readiness を要求しない。停止していれば、退避した旧 unit を復元して旧構成で再起動し、エラーで終了する
- 続けて更新を 1 回実行し、`device-main` の最新バイナリへ切り替える。readiness が得られなければ取り込んだ旧バイナリへ自動で戻り、警告を表示する

初回は物理デバイスの確認前に更新されないよう、更新 timer は有効化しない。カード、Discord 通知、音声、解錠、30 秒後の施錠、USB 再接続を確認してから有効化する。

```sh
systemctl --user enable --now room-manager-update.timer
systemctl --user list-timers room-manager-update.timer
```

`./deploy/native/install.sh --enable-timer` で install と同時に有効化することもできる。

`install.sh` の更新で、CD の成功したバイナリへ切り替わる。`~/room-manager`（旧バイナリ）と `room-manager.service.pre-native` は、問題がなければ後から手動で削除してよい。

## Routine operations

更新確認を即時実行し、結果を見る:

```sh
systemctl --user start room-manager-update.service
journalctl --user -u room-manager-update.service -n 100 --no-pager
```

稼働中・直前・隔離中のバージョンを確認する:

```sh
~/.local/lib/room-manager/bin/room-manager-update status
```

アプリのログを見る:

```sh
journalctl --user -u room-manager.service -f
```

直前のバイナリへ手動 rollback する。稼働中だったコミットは隔離され、次に別のコミットが公開されるまで再配布されない。

```sh
~/.local/lib/room-manager/bin/room-manager-update rollback
```

隔離したコミットを調査後に意図的に再試行する場合だけ、`failed-sha` を削除して更新を起動する。

```sh
rm ~/.local/lib/room-manager/failed-sha
systemctl --user start room-manager-update.service
```

更新を一時的に止める場合は timer を停止する。

```sh
systemctl --user stop room-manager-update.timer
```

ssh 経由で実行する場合は `XDG_RUNTIME_DIR=/run/user/$(id -u)` を設定する（`sudo -iu room-manager` では通常設定される）。

## Failure handling

- `latest.txt` の取得失敗: 何も変更されない。ネットワークと Release `device-main` の存在を確認する。次回 timer で再試行される
- sha256 不一致 / 起動確認失敗: そのバイナリは有効化されず、稼働中のバージョンは変わらない。CD の build と publish を確認する
- 切替後に readiness が得られない: 自動で直前のバイナリへ戻り、失敗したコミットは `failed-sha` に隔離される。`journalctl --user -u room-manager.service` で原因を確認する。Pasori が接続されているかも確認する
- rollback 後も readiness が得られない: update service が失敗として終了する。timer を停止し、`journalctl`、Pasori・GPIO・音声デバイスの状態、`room-manager.env` を確認する。`room-manager.service.pre-native` と `~/room-manager` が残っていれば旧構成へ戻せる
- API candidate health 失敗: GitHub Actions は promote 前に失敗し、production Worker version は維持され、バイナリも公開されない
- API promote 後の障害: Cloudflare Workers の Deployments で直前の version を 100% に戻す。D1 migration は戻さない
- 公開済みバイナリに問題がある場合: 修正を `main` へ入れて新しいコミットを配布する。急ぐ場合は端末で `rollback` を実行する。`device-main` の assets を手で削除しない

## Security notes

- API token は `~/.config/systemd/user/room-manager.env`（mode `0600`）にだけ置く
- 配布物の完全性は HTTPS と `latest.txt` の sha256 で検証する。`latest.txt` と binary は同じ Release に置かれるため、Release を書き換えられる権限（リポジトリの write 権限）を持つ者は任意のバイナリを配布できる。公開できるのは CD workflow の `GITHUB_TOKEN` に限るよう、リポジトリの権限と Release の編集を管理する
- `latest.txt` の `sha` と `sha256` は厳密な 16 進文字列としてのみ受け付け、URL とパスの生成に使う
- 更新はアプリと同じ非特権ユーザーで行い、root 権限や sudo は不要
