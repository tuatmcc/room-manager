# Continuous Deployment

## Delivery model

`main` の CI が成功すると `.github/workflows/cd.yml` が検証済みコミットを取得し、次の順序で自動配布する。

1. Raspberry Pi アプリの ARM64 OCI image を immutable な `ghcr.io/tuatmcc/room-manager:sha-<commit>` 候補として build/publish する
2. Workers API の新 version を候補として upload し、candidate URL の `GET /health` で Worker、D1、KV を確認した後で 100% のトラフィックを新 version へ切り替える
3. API 切替成功後だけ、端末 image の `main` tag を検証済み `sha-<commit>` へ進める

Raspberry Pi は外部から SSH されない。端末自身の `room-manager-deploy.timer` が 5 分ごとに registry を確認し、Podman Quadlet と `podman auto-update` で新 image を取得する pull 型 CD である。新 API は旧端末との後方互換を保つ前提とし、API の昇格に失敗した場合は端末の `main` tag を進めない。

### Why the API is not in Podman

API は Cloudflare Workers の D1、KV、scheduled handler、binding を直接利用するため、そのまま OCI container に移すことはできない。API は Cloudflare の version/deployment 機能で Blue/Green 配布し、物理端末だけを Podman 化する。API をコンテナ化するには D1/KV/scheduled event の互換実装への置換が必要で、現在のシステムとは別の設計変更になる。

## Blue/Green invariants

### Workers API

- DB migration を適用してから、green version を production traffic なしで upload する
- `candidate-room-manager.<subdomain>.workers.dev/health` で D1 query と KV read を含む health check を行う
- health check が成功した version tag だけを 100% へ promote する
- upload または health check に失敗した場合、現在の version は変更しない
- 直前の version は Cloudflare 上に残るため、Deployments から再度 100% に設定して rollback できる

D1 は Worker version に含まれず rollback されない。このため migration は、旧 API と新 API の双方から利用できる add-only の expand migration を先に行い、列削除や意味変更などの contract migration は全端末の更新確認後に別リリースで行う。

### Raspberry Pi

- `room-manager-blue` と `room-manager-green` の Quadlet container を常時起動する
- `/var/lib/room-manager-deploy/active-color` と共有 `flock` により、Pasori、GPIO、音声を扱うアプリ本体は必ず片方だけで動く
- 非稼働 slot のローカル image tag だけを更新する
- `AutoUpdate=local` 用のローカル tag は slot ごとに分離し、非稼働 tag だけを変更して `podman auto-update` で候補だけを再生成する。`--filter` 対応Podmanではslot labelでも対象を限定する
- standby health check 後に active color を atomic に切り替え、API・音声・GPIOと少なくとも1台のPasori readerの初期化後に readiness が得られなければ旧 slot へ自動 rollback する
- active container は候補の準備中に再起動されない
- controller 起動時に active slot が不健全なら、更新判定より先に健全な standby へ復旧し、不良 image digest を隔離する

物理デバイスは同時に 2 プロセスから安全に検証できない。したがって候補 slot の事前 health check は container supervisor と image の起動性を確認し、実アプリの生存確認は共有ロックを渡した直後に行う。切替時には最大数秒のカード読取停止があり得るが、二重読取は発生させない。

## GitHub setup

Repository の Actions secrets に次を登録する。

| Secret                         | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`        | Wrangler の account 選択                                   |
| `CLOUDFLARE_API_TOKEN`         | D1 migration、version upload、deployment、trigger 更新     |
| `CLOUDFLARE_WORKERS_SUBDOMAIN` | candidate URL の subdomain 部分。`.workers.dev` は含めない |

Workflow の `GITHUB_TOKEN` には `packages: write` だけを追加し、GHCR publish に利用する。GHCR package が private の場合は、Raspberry Pi 用に `read:packages` のみを持つ token を別途発行する。

Branch protection では `main` への merge 前に `CI` を必須にする。CD は `CI` の `workflow_run` が `success` のときだけ、CI が検証した同じ SHA を配布する。
CD は candidate publish、API準備、API昇格、端末image昇格の各境界で、対象SHAが現在の `main` HEADであり、そのSHAの最新CI runが成功済みであることを再検証する。途中で新しい `main` またはCI再実行が現れた古いdeliveryはproductionへ昇格しない。処理中のproduction変更を強制cancelせず、境界単位でlatest-onlyを保証する。

## Raspberry Pi initial setup

### 1. Preconditions

- 64-bit Raspberry Pi OS / Debian (`aarch64`)
- systemd、cgroup v2、Podman 5.x、Quadlet、`flock`
- `/dev/gpiomem` または `/dev/gpiomem0`、`/dev/gpiochip0`、`/dev/snd`、`/dev/bus/usb` が存在する
- GPIO18 にサーボを接続し、Pasori を USB 接続できる
- API へ HTTPS で到達できる

確認コマンド:

```sh
uname -m
podman --version
podman info --format '{{.Host.CgroupsVersion}}'
systemctl --version
test -e /dev/gpiomem -o -e /dev/gpiomem0
test -e /dev/gpiochip0 && test -d /dev/snd && test -d /dev/bus/usb
```

ディストリビューションの公式手順で Podman 5.x を導入する。古い Raspberry Pi OS の Podman は Quadlet の health / auto-update option が不足する場合があるため使わない。

Podman 5.4〜5.8 の `podman auto-update` には container filter がないため、このcontrollerは全auto-update対象を確認する。room-managerのactive tagは変更しないのでactive slotは再起動されないが、同じ端末で別サービスに `io.containers.autoupdate` を設定すると、そのサービスも同じタイミングで更新され得る。物理端末はroom-manager専用にするか、別サービスではauto-update labelを使わない。filter対応版ではcontrollerがroom-managerの候補slotだけに限定する。

### 2. Registry login

GHCR package が private の場合だけ、`read:packages` token で rootful Podman を login する。token を shell history に残さない。

```sh
sudo install -d -m 0755 /etc/room-manager
sudo podman login --authfile /etc/room-manager/registry-auth.json \
  ghcr.io --username <github-user> --password-stdin
sudo chmod 0600 /etc/room-manager/registry-auth.json
```

上のコマンドへ token を標準入力で渡す。Quadlet と更新 service は rootful Podman を使うため、一般ユーザー側の `podman login` では代用できない。`--authfile` を省略した既定の `/run` 配下は再起動時に失われるため、本番では使わない。
private package を使う場合は、`deploy.env` の `REGISTRY_AUTH_FILE` コメントを外してこの authfile を指定する。

### 3. Secrets and configuration

リポジトリを取得するか、`deploy/podman` ディレクトリを端末へコピーする。最初の installer 実行は秘密情報の雛形を作成して停止する。

```sh
sudo ./deploy/podman/install.sh
sudoedit /etc/room-manager/app.env
sudoedit /etc/room-manager/deploy.env
sudo chmod 0600 /etc/room-manager/app.env
```

`app.env` の必須値:

```dotenv
API_PATH=https://<production-worker-host>
API_TOKEN=<local-device bearer token>
SERVO_DIRECTION=normal
```

`deploy.env` の既定値は次の通り。fork や別 registry では image 名を変更する。

```dotenv
ROOM_MANAGER_SOURCE_IMAGE=ghcr.io/tuatmcc/room-manager:main
# private GHCR package の場合だけ有効化する
# REGISTRY_AUTH_FILE=/etc/room-manager/registry-auth.json
ROOM_MANAGER_CUTOVER_TIMEOUT=60
```

### 4. Install and verify

設定後に installer を再実行する。これは image を pull して blue/green の両ローカル tag を初期化し、Quadlet 2 系統を起動する。初回は物理デバイスの確認前に更新されないよう、更新 timer は有効化しない。

```sh
sudo ./deploy/podman/install.sh
sudo systemctl status room-manager-blue.service room-manager-green.service
sudo /usr/local/libexec/room-manager-blue-green status
sudo podman ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

初期状態は `blue` が active、`green` が standby である。カードを 1 回タッチし、API、Discord 通知、音声、解錠、自動施錠までを実機確認する。

実機確認が完了してから更新 timer を有効化する。

```sh
sudo systemctl enable --now room-manager-deploy.timer
sudo systemctl status room-manager-deploy.timer
```

## Routine operations

更新確認を即時実行する:

```sh
sudo systemctl start room-manager-deploy.service
sudo journalctl -u room-manager-deploy.service -n 100 --no-pager
```

両 slot のログを見る:

```sh
sudo journalctl -u room-manager-blue.service -u room-manager-green.service -f
```

直前の standby slot へ手動 rollback する:

```sh
sudo /usr/local/libexec/room-manager-blue-green rollback
sudo /usr/local/libexec/room-manager-blue-green status
```

手動rollback後は timer を一時停止しない限り、次回確認で未隔離のregistry最新版を再試行する。自動rollbackした不良digestは `/var/lib/room-manager-deploy/failed-image` に記録され、`main` が別digestへ進むまで再試行しない。同じdigestを調査後に意図的に再試行する場合だけ、このファイルを削除して更新確認を起動する。

```sh
sudo systemctl stop room-manager-deploy.timer
sudo rm -f /var/lib/room-manager-deploy/failed-image
sudo systemctl start room-manager-deploy.timer
```

## Failure handling

- candidate pull / update 失敗: active slot は変更されない。registry 認証とネットワークを確認する
- pre-cutover health 失敗: active slot は変更されず、不良digestを隔離する。candidate container log を確認する
- post-cutover health 失敗: controller が active color を旧 slot に戻し、不良digestを隔離する
- controller 中断後に active slot が不健全: 次回timer実行が更新判定前に健全なstandbyへ戻す
- 自動 rollback も失敗: timer を停止し、両 service、`active-color`、デバイス node、container log を確認する
- API candidate health 失敗: GitHub Actions は promote 前に失敗し、production Worker version は維持される
- API promote 後の障害: Cloudflare Workers の Deployments で直前の version を 100% に戻す。D1 migration は戻さない

## Security notes

- API token は `/etc/room-manager/app.env` (mode `0600`) にだけ置く
- GHCR token は `/etc/room-manager/registry-auth.json` (mode `0600`) にだけ置き、リポジトリへ保存しない
- container には USB bus、ALSA device、RPPAL が必要とする `gpiomem` / `gpiochip` device のみを渡し、`--privileged` は使わない
- `/var/lib/room-manager-deploy` は root のみが更新できるよう mode `0700` とする
