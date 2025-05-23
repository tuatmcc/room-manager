# room-manager

## [0.2.1](https://github.com/tuatmcc/room-manager/compare/v0.2.0...v0.2.1) (2025-05-23)


### Bug Fixes

* 自動ドアロックの時間を30秒に延長 ([#58](https://github.com/tuatmcc/room-manager/issues/58)) ([0c3f064](https://github.com/tuatmcc/room-manager/commit/0c3f064e60103c2b0645baf43d74dfba76cca37e))

## [0.2.0](https://github.com/tuatmcc/room-manager/compare/v0.1.0...v0.2.0) (2025-05-13)


### Features

* Discordコマンドのハンドル処理を大幅に改善 ([ecb7b63](https://github.com/tuatmcc/room-manager/commit/ecb7b63957f9553626510bdc2185267e7d3823f3))
* Discordコマンドのペイロードをパースする関数を追加 ([38d1b17](https://github.com/tuatmcc/room-manager/commit/38d1b171f0a0f14c51ccf1b5dc66b9a828e39d09))
* ドアロック操作機能を追加 ([#43](https://github.com/tuatmcc/room-manager/issues/43)) ([9632f61](https://github.com/tuatmcc/room-manager/commit/9632f6162404c96e2cb566318aa408e6b8c84cf6))
* 複数のNFCカードリーダーに対応 ([#53](https://github.com/tuatmcc/room-manager/issues/53)) ([03d1314](https://github.com/tuatmcc/room-manager/commit/03d13144ed987d42959613d58d77535059264a2d))


### Bug Fixes

* DBスキーマの修正 ([#56](https://github.com/tuatmcc/room-manager/issues/56)) ([2cefa9f](https://github.com/tuatmcc/room-manager/commit/2cefa9f29d9b40cb6e56a58cf31ff018adecb125))
* 未登録NFCカードのメッセージに含まれるコマンドメンション形式を修正 ([#42](https://github.com/tuatmcc/room-manager/issues/42)) ([a6ea908](https://github.com/tuatmcc/room-manager/commit/a6ea908a58a4f78eb365844d8764e289eb129735))

## [0.1.0](https://github.com/tuatmcc/room-manager/compare/v0.0.1...v0.1.0) (2025-05-10)


### Features

* `CardApi`の`touch`メソッドを非同期に変更し、呼び出しを修正 ([c21f83c](https://github.com/tuatmcc/room-manager/commit/c21f83cee5ce2a160a81566cb182799c36d3dda4))
* `in_comm_rf`を追加 ([71b60d6](https://github.com/tuatmcc/room-manager/commit/71b60d61a66c9744af0ef4a0873de2279a2f87f7))
* `in_set_protocol`を追加 ([2cad179](https://github.com/tuatmcc/room-manager/commit/2cad1796f83d50ed114d62b644454063f5d19e33))
* `in_set_rf`を追加 ([b12249e](https://github.com/tuatmcc/room-manager/commit/b12249ec916246dbb2a2f3ccb88b55d45c54ea53))
* `Message`インターフェイスの型を変更 ([72d5569](https://github.com/tuatmcc/room-manager/commit/72d5569b4fb55e898eac01e11e873e155cb8c112))
* `Message`を追加 ([b712cc1](https://github.com/tuatmcc/room-manager/commit/b712cc1a7658f3e559a290b0c5dc5fbabfb446ce))
* `TouchCardUseCase`からカードスキャン処理を削除 ([080f2ae](https://github.com/tuatmcc/room-manager/commit/080f2ae9732ab1f90d7475a4e07da097d443944d))
* APIに認証を追加 ([#17](https://github.com/tuatmcc/room-manager/issues/17)) ([98bc283](https://github.com/tuatmcc/room-manager/commit/98bc28360431b63e6e423f16174c49f00c47d4fb))
* appに合わせてAPIの型を変更 ([e1a4901](https://github.com/tuatmcc/room-manager/commit/e1a490164f0799d81a05c7b74c1c872b98136911))
* closeを実装 ([70d43b6](https://github.com/tuatmcc/room-manager/commit/70d43b6b79ae2d3dd9a6f860683a7bfe1ad1604b))
* DBスキーマを更新 ([12802a3](https://github.com/tuatmcc/room-manager/commit/12802a36f9ae367c3b289eb7d5842a1354d2594b))
* DiscordのApplication IDを環境変数から削除 ([cb06f13](https://github.com/tuatmcc/room-manager/commit/cb06f1328f8b3d4a14ae07fc0ca066931053c228))
* drizzleを追加 ([e9bfd97](https://github.com/tuatmcc/room-manager/commit/e9bfd97438105d62b90ecd9a6c5a315679605d63))
* Envにzodを通すように変更 ([4dbe692](https://github.com/tuatmcc/room-manager/commit/4dbe6926269bbd81be94eeae3e296566a02e3a0e))
* ESLintとPrettierのスクリプトを追加 ([3dbf2f5](https://github.com/tuatmcc/room-manager/commit/3dbf2f519e5809ea860b1b67f333ad50fee14539))
* GitHub Actions用の開発環境セットアップを追加 ([ce69649](https://github.com/tuatmcc/room-manager/commit/ce696492e38ddf3a8bf70a156d560c981e69c245))
* Initial commit ([e2c4c6e](https://github.com/tuatmcc/room-manager/commit/e2c4c6e29cc78287568c0b87d308af8757420247))
* Initialize ([a91f3e1](https://github.com/tuatmcc/room-manager/commit/a91f3e1008278f2525773ae86948221dbf283890))
* KVストレージをDiscordServiceに統合し、ユーザー情報のキャッシュ機能を追加 ([ab48ced](https://github.com/tuatmcc/room-manager/commit/ab48ced1e1cd0a4c7595a54c3623a74231c721b4))
* NFCカードの登録処理を大幅に更新 ([#15](https://github.com/tuatmcc/room-manager/issues/15)) ([9c6dd36](https://github.com/tuatmcc/room-manager/commit/9c6dd3656b51280e908e4ee8369a1646ad268557))
* NFC関連のnapiを追加 ([c9f33ae](https://github.com/tuatmcc/room-manager/commit/c9f33ae50566701e6a1ea0e696796435d011b9ff))
* Node.jsとRustでジョブを分離 ([fcb3f37](https://github.com/tuatmcc/room-manager/commit/fcb3f37d6f1499c979c9d0cec5474f9620040d15))
* OpenTelemetryを追加 ([22e466e](https://github.com/tuatmcc/room-manager/commit/22e466e0d51795fb8fc35ee5df66290f09be249c))
* otelの送信先を設定 ([f55834a](https://github.com/tuatmcc/room-manager/commit/f55834a0e066cdc6b2ca4ada8335ca61d1df6e3b))
* RegisterNfcCardユースケースの更新 ([a6691ad](https://github.com/tuatmcc/room-manager/commit/a6691ad6687e76345eb81daf3c524dfc252b87a8))
* Rustのコードを修正 ([84e2ede](https://github.com/tuatmcc/room-manager/commit/84e2edef059dbb7efae6f8a56d6f09685a2e8aad))
* sense_ttfを追加 ([3e65ccf](https://github.com/tuatmcc/room-manager/commit/3e65ccf3087cf48f1c5ffe3f1139a7ccbf5dd0e0))
* serviceの生成処理を追加 ([1ca3720](https://github.com/tuatmcc/room-manager/commit/1ca3720ee54d9db798e2879d6c92c5d2734884b1))
* Suicaタッチ時にもAPIや音声を再生 ([307b7eb](https://github.com/tuatmcc/room-manager/commit/307b7eb96aeff656a22ddb21781ad9a24915f030))
* Suicaに対応 ([a6780d1](https://github.com/tuatmcc/room-manager/commit/a6780d19336e1b0e4a472316522933fdeffc6cef))
* Suicaの登録処理を追加 ([f5d0101](https://github.com/tuatmcc/room-manager/commit/f5d01016fb943add28a7e7ae14a737006b3a1d6d))
* Suica以外を登録できるように変更 ([6cac369](https://github.com/tuatmcc/room-manager/commit/6cac36935e24bc451c06c680e88222cf00030d33))
* tg_set_protocolを追加 ([9268273](https://github.com/tuatmcc/room-manager/commit/92682736ba85c8f147624a7ab4e190a88cea4d57))
* tg_set_rfを追加 ([4460d45](https://github.com/tuatmcc/room-manager/commit/4460d453331d9ea0a676e49d5856c3029b3e09b0))
* TouchCardハンドラーの命名修正 ([4df4eff](https://github.com/tuatmcc/room-manager/commit/4df4eff3dd658aea862dca507ab7d715fb67b47f))
* TouchCardユースケースの更新 ([0ad92bb](https://github.com/tuatmcc/room-manager/commit/0ad92bb2cb4dda70d09b971c36b8c4f182d5cb29))
* TouchCard時のコマンドをメンション形式に変更 ([0309ba3](https://github.com/tuatmcc/room-manager/commit/0309ba353b4e75613e5a732ae2bc7e372b33c712))
* Transportトレイトを追加 ([491acbf](https://github.com/tuatmcc/room-manager/commit/491acbf228e113fe9bb133d07980f0715edc7341))
* Userリポジトリを追加 ([32c903a](https://github.com/tuatmcc/room-manager/commit/32c903a9bd820d162b532b64dd5a1b23854d7480))
* Webを追加 ([54fb73f](https://github.com/tuatmcc/room-manager/commit/54fb73f454bcab751a5aa450cb1923167f59c563))
* workspace化 ([b1a3714](https://github.com/tuatmcc/room-manager/commit/b1a3714690f3fce96e56e24118eeab078cd5f2d9))
* workspace化 ([d134dd2](https://github.com/tuatmcc/room-manager/commit/d134dd224e042481fc0421396952d0c1d8083c5e))
* エラーコードを追加 ([e05e47e](https://github.com/tuatmcc/room-manager/commit/e05e47e746de800fecaf0e82eca6cc95654fb4cf))
* エラーメッセージを分割 ([29b6991](https://github.com/tuatmcc/room-manager/commit/29b6991c929ed2a4d8bc093472acad4c9311c661))
* エラー型に`Message`を追加 ([467693d](https://github.com/tuatmcc/room-manager/commit/467693d82a86092c9381309ca16574dd51283da0))
* カードスキャンを統一 ([e6902a9](https://github.com/tuatmcc/room-manager/commit/e6902a99f02e29bc96e0389e58533ce7c46c5bb4))
* カードタッチのユースケースを追加 ([750215e](https://github.com/tuatmcc/room-manager/commit/750215ed52068c4aa1bba99ad3c1eff638808ed3))
* カードタッチの処理を統一 ([c5ee46f](https://github.com/tuatmcc/room-manager/commit/c5ee46f66e02c69b501b42447c97425d2181f588))
* カードタッチ時の処理を追加 ([7f62f1b](https://github.com/tuatmcc/room-manager/commit/7f62f1ba766c1991e6339d5e96025b5273e117d4))
* カードタッチ音を追加 ([6aa3713](https://github.com/tuatmcc/room-manager/commit/6aa37136ce75878b89559aa3ceb4533fec62b71e))
* カードのスキャンビットレートを落とす ([fd04412](https://github.com/tuatmcc/room-manager/commit/fd0441212e3127fa9bf81a6415e5312c57149334))
* カードリーダーを別スレッドに移動 ([84a7feb](https://github.com/tuatmcc/room-manager/commit/84a7feb344846149ed11cf3e105ae061d366bf50))
* コマンドのハンドラーを大幅に修正 ([8f676a5](https://github.com/tuatmcc/room-manager/commit/8f676a578b1f5ddbb15ecd62be4106ef2d30ad74))
* コマンドハンドラを追加 ([e189b8c](https://github.com/tuatmcc/room-manager/commit/e189b8cd5ac8e564ef2d095baab3803a11194087))
* コマンドを追加 ([7f56717](https://github.com/tuatmcc/room-manager/commit/7f56717d74ec5e555db50b07012fd6d8db01d27f))
* コマンドを追加 ([b9456ba](https://github.com/tuatmcc/room-manager/commit/b9456ba7a6544e4fe13f21f9afb2923aac8f9454))
* コマンド構成の更新 ([a3c9a1c](https://github.com/tuatmcc/room-manager/commit/a3c9a1ccbf16e6b5814870b2464dafd02b806320))
* スキーマの更新 ([a4f74de](https://github.com/tuatmcc/room-manager/commit/a4f74de0b491ad05806cbf565d16328e278e84f2))
* スキーマを更新 ([6c2538b](https://github.com/tuatmcc/room-manager/commit/6c2538b91b835f7cca3abe366ea4a1be437f844a))
* スキーマ更新に合わせてregisterStudentCardを更新 ([6708d2a](https://github.com/tuatmcc/room-manager/commit/6708d2aaf766250f77300536d9715f399983ea2c))
* スキーマ更新に合わせてtouchCardを更新 ([b150dbf](https://github.com/tuatmcc/room-manager/commit/b150dbf9e0efd8bc8fdc914c56728f5b6a7d903a))
* タッチの度に音声再生キューをリセット ([104b0b4](https://github.com/tuatmcc/room-manager/commit/104b0b4a5911fa5b1ecfc23d88cb30be6f670da1))
* タッチ時にAPIリクエストを飛ばすように ([d690b00](https://github.com/tuatmcc/room-manager/commit/d690b008fe0cfc6c75ad37b9b9b787bdd4286258))
* タッチ時に音声が鳴るように ([439548c](https://github.com/tuatmcc/room-manager/commit/439548c5be38f3029d690c06f3465079a1b79257))
* テストを非同期に変更し、型エラーも修正 ([ca8acb3](https://github.com/tuatmcc/room-manager/commit/ca8acb36338bbff5640a93995fde7e2ce63f8c92))
* ハンドラーの処理を変更 ([3eb26dd](https://github.com/tuatmcc/room-manager/commit/3eb26ddb37a1d9510f1d0099439b55c9799cd94b))
* メッセージの色を修正 ([6ee2d29](https://github.com/tuatmcc/room-manager/commit/6ee2d298659db8fae938a5cb857bca5b9e5321cc))
* モデル層の修正 ([d71a44f](https://github.com/tuatmcc/room-manager/commit/d71a44f7807200cf249b9b386a45986c7a575f18))
* ユースケース層にspanを追加 ([f9b460f](https://github.com/tuatmcc/room-manager/commit/f9b460fccb50747cda938fbfa15eb056069933b6))
* ライブラリ化 ([4938dca](https://github.com/tuatmcc/room-manager/commit/4938dca1846f3add0897e84f2b80b438cb9bb0c3))
* リポジトリ層にspanを追加 ([907e70b](https://github.com/tuatmcc/room-manager/commit/907e70b1ccc44e622397efb84d046e241687bcab))
* リポジトリ層の追加と修正 ([c6abc26](https://github.com/tuatmcc/room-manager/commit/c6abc26c8c14c77461e9dfab329d0e8dab1586d9))
* リレーションを追加 ([127907f](https://github.com/tuatmcc/room-manager/commit/127907fe10bf63b44548b815828c71dbde52a4c7))
* ローカルデバイスでもAPIに認証ヘッダーを追加 ([94f1331](https://github.com/tuatmcc/room-manager/commit/94f13314f2ca71a1497be9b917b20c2f1da9bec8))
* ローカルデバイスのAPIに認証を追加 ([4faff2c](https://github.com/tuatmcc/room-manager/commit/4faff2cc641adc5ffe61fcdd3aba065efb222070))
* ログを追加 ([#18](https://github.com/tuatmcc/room-manager/issues/18)) ([13b9a59](https://github.com/tuatmcc/room-manager/commit/13b9a597a91169dd8402a5087e25e54708b0364a))
* 不要なエラーハンドリングを削除し、エラー処理を簡素化 ([87d9c29](https://github.com/tuatmcc/room-manager/commit/87d9c29797381099023ed9da444a970c8b7bc5de))
* 不要なログメッセージを削除し、音声ファイルの読み込みを簡素化 ([dab9815](https://github.com/tuatmcc/room-manager/commit/dab9815c1f5140ea816a7bc0b901b505e0f802c9))
* 入室中一覧にメンションを使用するのを辞める ([b302b2b](https://github.com/tuatmcc/room-manager/commit/b302b2b527b4667b96c67834d1d7573d37d1f216))
* 入退出メッセージに現在入室中のメンバーを表示 ([8f007be](https://github.com/tuatmcc/room-manager/commit/8f007be32b1880ea6cdba40af241ab75fbc266af))
* 入退出メッセージを修正 ([d538747](https://github.com/tuatmcc/room-manager/commit/d538747a23241484b1d2097d09bbf13d27c202d2))
* 入退出時のメッセージの形式を変更 ([b39c466](https://github.com/tuatmcc/room-manager/commit/b39c4666335261dfd12e9044fceb697346cb21b3))
* 最後の一人に戸締まりを促す ([e1b4385](https://github.com/tuatmcc/room-manager/commit/e1b4385d445b93bdc98d3695931df1a483c482cb))
* 別スレッドのエラーハンドリングを追加 ([c7e0320](https://github.com/tuatmcc/room-manager/commit/c7e0320dcd9f2f65ab86af9619a9a8717f2f528e))
* 大幅にリアーキテクチャ ([5533ac0](https://github.com/tuatmcc/room-manager/commit/5533ac0266ffa121229ddef63c510b37d27ab28f))
* 学生証の登録処理を追加 ([a3f06f4](https://github.com/tuatmcc/room-manager/commit/a3f06f4c754bb6fe9257095471cc9e89e4173ecd))
* 学生証の重複登録はできないようにする ([5fea8a7](https://github.com/tuatmcc/room-manager/commit/5fea8a7c6713fdd620bb14850a8312112461ef77))
* 学生証登録のユースケースを追加 ([57b54b5](https://github.com/tuatmcc/room-manager/commit/57b54b5407bba755f584a1cb85b12dca69f9d11d))
* 学籍番号の取得まで実装 ([1f19f8f](https://github.com/tuatmcc/room-manager/commit/1f19f8fd6a991f8c3904f3cacf465a53b113bef0))
* 学籍番号を読み取る処理を追加 ([7ddce7a](https://github.com/tuatmcc/room-manager/commit/7ddce7a8583babd5659e30bc8aca4db0812b8062))
* 新しいクレートを追加 ([8bced91](https://github.com/tuatmcc/room-manager/commit/8bced91d1858802ad60eb711d74331c38e69b0af))
* 時間帯によって音声を出し分けるように変更 ([31d42ea](https://github.com/tuatmcc/room-manager/commit/31d42eafff176df38566ab5b80a3ba0217d55631))
* 現在入室中のメンバー一覧を閲覧するコマンドを実装 ([fa2695b](https://github.com/tuatmcc/room-manager/commit/fa2695bc38b826df31ab28b45f6d1e9000406ec1)), closes [#4](https://github.com/tuatmcc/room-manager/issues/4)
* 環境変数にDiscord関連の設定を追加 ([486ddb3](https://github.com/tuatmcc/room-manager/commit/486ddb378f79ef8e321e15796444d87749d20f78))
* 登録系コマンドのレスポンスを実行者だけ見れるようにする ([9dd3799](https://github.com/tuatmcc/room-manager/commit/9dd3799aa614c4e1506aba0f228c704b313e356d)), closes [#2](https://github.com/tuatmcc/room-manager/issues/2)
* 自動退出機能を追加 ([eecdd78](https://github.com/tuatmcc/room-manager/commit/eecdd7898969dade40e914607b1f87dd63361d27)), closes [#5](https://github.com/tuatmcc/room-manager/issues/5)
* 起動音追加 ([b177ad6](https://github.com/tuatmcc/room-manager/commit/b177ad69699082044aa6003a3fcc75f2bc2067d4))
* 送信メッセージの形式を変更 ([#23](https://github.com/tuatmcc/room-manager/issues/23)) ([b89813f](https://github.com/tuatmcc/room-manager/commit/b89813fa533fdee3dc15ee2ac5755421632d6266))
* 適当にログを追加 ([9d565bc](https://github.com/tuatmcc/room-manager/commit/9d565bc89537e20da057cd060b88c2306021a134))
* 音声プレイヤーを追加 ([b34452d](https://github.com/tuatmcc/room-manager/commit/b34452d9d4807bbcdafcf7468e16fe39fbf6c5c7))
* 音声をSuicaからNFCカードに変更 ([c5fb9a6](https://github.com/tuatmcc/room-manager/commit/c5fb9a63ca2294120762aee59a727c0d627a050f))


### Bug Fixes

* `.where`忘れの修正 ([326500c](https://github.com/tuatmcc/room-manager/commit/326500ccd3848cc364a97518125806c889e3d24d))
* DiscordServiceのキャッシュキーを修正し、ユーザーIDの形式を変更 ([e78b52f](https://github.com/tuatmcc/room-manager/commit/e78b52fe151d95eeddb9a92bbc56be557ed20a7d))
* in_comm_refを汎用的に変更 ([f58e9c6](https://github.com/tuatmcc/room-manager/commit/f58e9c6ce0c8eff47f73183ec13f10f8328dd5ec))
* nusbからrusbへ置き換え ([44150ae](https://github.com/tuatmcc/room-manager/commit/44150ae53d65e61a99b9b861b71bc80ce6385ae2))
* コマンドのスキーマを修正 ([bcee71b](https://github.com/tuatmcc/room-manager/commit/bcee71bbd69f54fb2183e757ef50d230078d395b))

## 0.1.0

### Minor Changes

- 5bedd81: 最初のリリース
