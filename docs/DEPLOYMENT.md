# Continuous Deployment

## 方針

本番端末は Debian 12 / aarch64 上で、Rust の ARM64 native binary を systemd から直接起動する。端末へコンテナランタイムを導入せず、外部から SSH で push deploy もしない。端末自身の systemd timer が desired version manifest を定期取得する pull 型 CD である。

main の CI 成功後、.github/workflows/cd.yml は次の順序で処理する。

1. CI が検証した同じ commit SHA から ARM64 binary と archive を作成する
2. SHA 固有の候補 GitHub Release に artifact を upload する
3. Workers API を candidate として upload し、D1/KV を含む GET /health を確認する
4. latest 確認後に Workers API を 100% へ promote し、trigger を反映する
5. API promote 成功後、latest を再確認して production-manifest.json を更新する

候補 artifact の作成だけでは端末は更新しない。production-manifest.json が更新されて初めて端末の desired version が進む。

## GitHub artifact

候補 Release の tag は cd-<40桁commit SHA> とする。asset は次の名前である。

    room-manager-aarch64-<40桁commit SHA>.tar.gz

archive の中身は次の3ファイルである。

    room-manager
    manifest.json
    SHA256SUMS

manifest.json には少なくとも commit と architecture=aarch64 を含める。production-manifest.json には次を含める。

    commit
    architecture
    artifact
    sha256

端末は manifest の commit、architecture、archive SHA-256 を検証し、archive 内の SHA256SUMS と binary の checksum も検証する。artifact URL は SHA 固有の Release を指すため、可変な main tag の binary を直接実行しない。

production-manifest.json は tag production の GitHub Release asset として公開する。端末の既定 URL は次である。

    https://github.com/tuatmcc/room-manager/releases/download/production/production-manifest.json

fork では deploy/native/deploy.env.example の URL を fork の repository に変更する。candidate Release と production Release の書き換え権限は GitHub Actions の contents: write に限定し、端末には GitHub token を置かない。

## 端末の構成

端末には次の状態を作る。

    /opt/room-manager/
    ├── releases/
    │   ├── <commit-sha-A>/room-manager
    │   └── <commit-sha-B>/room-manager
    ├── current -> releases/<active-sha>
    └── previous -> releases/<previous-sha>

current と previous は release directory を指す symlink である。release は staging directory へ完全展開して checksum を確認してから配置し、symlink は一時 symlink を mv -T して atomic に切り替える。実行中 binary を上書きしない。

アプリは room-manager.service だけで起動する。systemd の service 単位の stop/start と KillMode=control-group により、Pasori、GPIO、ALSA を操作する room-manager プロセスは常に最大1個である。

状態ファイルは次に置く。

    /var/lib/room-manager-deploy/desired-manifest.json
    /var/lib/room-manager-deploy/last-successful-sha
    /var/lib/room-manager-deploy/failed-sha
    /var/lib/room-manager-deploy/prepared-sha

deploy controller と timer、手動 rollback は /run/room-manager-deploy.lock を共有する。lock を取得できない timer は何も変更せず終了する。

## readiness

room-manager.service は Type=notify である。アプリは次の初期化をすべて終え、少なくとも1台の Pasori reader が Ready になった後に systemd へ READY=1 を送る。

- API client
- sound player
- system clock
- Pasori reader
- GPIO door lock

Pasori が未接続の場合はアプリが reader の再接続を待つが、READY にはならない。deploy controller は systemctl is-active が readiness を反映するまで待ち、プロセスが存在するだけでは成功と判定しない。

## 初回セットアップ

前提:

- 64-bit Debian 12 / aarch64
- systemd
- curl、tar、sha256sum、flock
- ca-certificates、tzdata
- runtime library の libasound.so.2 と libusb-1.0.so.0
- Pasori、/dev/snd、GPIO18、必要な GPIO/USB 権限
- 本番 Workers API へ HTTPS 接続できること

repository の deploy/native を含む checkout で、まず installer を実行する。

    sudo ./deploy/native/install.sh

初回は /etc/room-manager/app.env と deploy.env の雛形を作って停止する。秘密情報と manifest URL を設定して再実行する。

    sudoedit /etc/room-manager/app.env
    sudoedit /etc/room-manager/deploy.env
    sudo chmod 0600 /etc/room-manager/app.env
    sudo ./deploy/native/install.sh

app.env の必須値:

    API_PATH=https://<production-worker-host>
    API_TOKEN=<local-device bearer token>
    SERVO_DIRECTION=normal

deploy.env の主な値:

    ROOM_MANAGER_MANIFEST_URL=https://github.com/tuatmcc/room-manager/releases/download/production/production-manifest.json
    ROOM_MANAGER_CUTOVER_TIMEOUT=120
    ROOM_MANAGER_RELEASE_KEEP=5

installer は次を作成する。

- /etc/room-manager
- /opt/room-manager/releases
- /var/lib/room-manager-deploy
- /usr/local/libexec/room-manager-deploy
- room-manager.service
- room-manager-deploy.service
- room-manager-deploy.timer

通常の installer は production manifest を取得して room-manager.service を一度起動する。timer は自動では有効にしない。カード、API、Discord 通知、音声、解錠、施錠を実機確認してから有効化する。

    sudo systemctl status room-manager.service
    sudo systemctl enable --now room-manager-deploy.timer
    sudo systemctl status room-manager-deploy.timer

production manifest がまだ存在しない初回は、GitHub Actions の CD を一度最後まで成功させてから installer を実行する。

## 既存 native service からの移行

CD 導入前の基準 commit は 7dc63be である。移行対象の旧 binary と環境ファイルは削除・上書きしない。旧 unit の内容も保存し、旧 service 名が `room-manager.service` と同じ場合だけ、旧プロセス停止後に新 unit へ置き換える。保存した旧 unit は rollback で復元できる。対象は systemd system service として動いているアプリ1個だけで、user service、cron、手動起動、timer/socket 起動は対象外である。

移行スクリプトは次の順序を守る。

1. 旧 service の正規名、enabled 状態、unit 内容を確認する
2. 永続的な block marker と systemd drop-in を作る
3. 新 unit を install し、旧 service が動いたまま immutable artifact を prepare する
4. 旧 service を disable/stop し、旧プロセスが残っていないことを確認する
5. current を新 release へ切り替え、native service の readiness を確認する
6. awaiting-verification で停止し、実機確認後に timer を有効化する

準備確認:

    sudo ./deploy/native/migrate-legacy.sh check <old-service>.service

移行実行:

    sudo ./deploy/native/migrate-legacy.sh apply <old-service>.service

awaiting-verification になった後、カード読取、Discord 通知、音声、解錠、30秒後の施錠、Pasori 抜き差しを確認する。

    sudo ./deploy/native/migrate-legacy.sh finalize --hardware-verified

途中失敗、readiness failure、電源断後の復旧では旧 service を先に再起動せず、新 service が停止していることを確認する。旧 service へ戻す場合:

    sudo ./deploy/native/migrate-legacy.sh rollback

rollback が recovery-required になった場合は /var/lib/room-manager-migration/phase と journalctl を確認し、block marker を手動削除しない。旧 binary と設定が残っているため、必要なら実機管理者が旧 unit を明示的に復旧できる。

## 通常運用

更新確認を即時実行する。

    sudo systemctl start room-manager-deploy.service
    sudo journalctl -u room-manager-deploy.service -n 100 --no-pager

状態を確認する。

    sudo /usr/local/libexec/room-manager-deploy status
    sudo readlink /opt/room-manager/current
    sudo readlink /opt/room-manager/previous
    sudo journalctl -u room-manager.service -n 100 --no-pager

手動 rollback は current と previous を交換し、service restart と readiness 確認まで行う。

    sudo /usr/local/libexec/room-manager-deploy rollback

新 release が readiness に失敗すると、failed-sha に SHA を記録し、current を直前の正常 release へ戻して service を再起動する。rollback も失敗した場合は current は旧 release を指した状態で停止し、明確なエラーを journal に残す。

failed-sha と desired commit が同じ間は timer が再試行しない。次の commit が production manifest に指定されると通常更新に戻る。調査後に同じ SHA を意図的に再試行する場合だけ、管理者が failed-sha を削除して service を再実行する。

    sudo systemctl stop room-manager-deploy.timer
    sudo rm -f /var/lib/room-manager-deploy/failed-sha
    sudo systemctl start room-manager-deploy.timer

release cleanup は最新5件を基本にする。ただし current、previous、failed-sha、last-successful-sha が指す release は削除しない。cleanup の失敗は deployment の成否に影響させない。

## API deployment と rollback

Workers は次の順序で配布する。

1. D1 の backward-compatible migration
2. candidate version upload
3. candidate URL の /health。Worker、D1、KV を検証する
4. latest 確認
5. candidate version を 100% promote
6. latest 確認と trigger reconcile
7. production manifest 更新

D1 は Workers version と一緒に rollback されない。migration は expand/contract を守り、旧 API と新 API の双方が利用できる add-only migration を先に行う。

API candidate health または promotion が失敗した場合、production manifest は更新しない。API promote 後に障害が判明した場合は Cloudflare Workers の deployment で直前 version を 100% に戻す。D1 migration は戻さない。

## GitHub Actions の設定

Repository の Branch protection で main の CI を必須にする。CD は CI の workflow_run が success の場合だけ開始し、次の境界で対象 SHA と最新 CI run を再検証する。

- candidate artifact の作成・公開前
- API preparation 前
- API promotion 前
- API promotion 後
- production manifest 更新前

concurrency は cd-main、cancel-in-progress=false とする。処理中の production mutation を途中で force cancel しない。古い delivery は latest check に失敗し、production manifest を新しい main の上書きに使えない。

必要な secrets:

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_WORKERS_SUBDOMAIN

GITHUB_TOKEN は workflow の contents: write と actions: read を使う。packages: write、専用 artifact registry の token、端末側 GitHub token は不要である。

## 障害対応

- manifest 取得失敗: ネットワーク、HTTPS、production Release asset を確認する
- archive checksum 失敗: release asset を実行せず、staging を破棄する
- artifact 内 checksum/manifest 失敗: SHA 固有 artifact を隔離し、failed-sha にはまだ記録しない
- service readiness 失敗: journalctl -u room-manager.service を確認し、controller の自動 rollback を確認する
- rollback 失敗: timer を止め、current、previous、failed-sha と service の状態を保全して実機管理者へ引き継ぐ
- API health 失敗: Workers の traffic は変更されず、端末 desired version も進まない
- API promote 後の latest check 失敗: API はその時点で昇格済みになり得るが、古い CD は端末 desired version を更新しない。新しい CI delivery を待つ

## 実機確認と自動確認の境界

CI と shell test が確認するもの:

- archive の生成、内部 manifest、binary checksum
- atomic current/previous 切替
- 同一 SHA の無再起動
- readiness failure の自動 rollback
- failed SHA の反復適用防止
- 次 SHA による復旧
- 手動 rollback と rollback failure
- timer/manual 操作の lock 排他
- 旧 native service migration の block marker と復旧

Raspberry Pi 実機で確認するもの:

- Pasori reader の初期化、カード読取、USB 抜き差し
- GPIO18 のサーボ、初期施錠、解錠、30秒後の施錠
- ALSA 音声出力
- API と Discord の実際の通知
- 電源断後の systemd 起動、release cleanup、物理デバイス権限
- 新 version failure 時に二重の room-manager プロセスや二重の物理操作がないこと
