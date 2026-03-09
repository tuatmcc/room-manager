# room-manager

[mcc_room_manager](https://github.com/tuatmcc/mcc_nfc_room_manager)の後継プロジェクトです。
全体的にモダンかつ堅牢な動作・設計を目指して開発しています。

## プロジェクト構成

- `crates/app`: NFCカードのスキャンとスキャン結果をAPIサーバーに送信するアプリケーション(Raspberry Pi)
- `crates/pasori`: Pasori NFCリーダーライブラリ
- `packages/api`: Discordコマンドのハンドリング・API・データベースの管理を行うAPIサーバー(Cloudflare Workers)

## 環境構築

### 前提条件

以下のツールが必要です：

- [mise](https://mise.jdx.dev/): Rust、Node.js、pnpmの管理用

### セットアップ手順

1. リポジトリのクローン

```sh
git clone https://github.com/tuatmcc/room-manager.git
cd room-manager
```

2. miseを使用して環境を整える

```sh
mise install
```

3. 依存関係のインストール

```sh
# Rustの依存関係
cargo fetch

# Node.jsの依存関係
pnpm install
```

4. 環境変数の設定

`.env`ファイルをプロジェクトのルートディレクトリに作成し、必要な環境変数を設定してください。(`.env.example`を参考にしてください)
同様に、`packages/api/.dev.vars`ファイルも作成し、必要な環境変数を設定してください。

## ビルドと実行

### 開発環境での実行

```sh
# Rustアプリケーションのテスト
cargo test -p room-manager

# Rustアプリケーションのビルド
cargo build -p room-manager

# Rustアプリケーションの実行（開発モード）
cargo run -p room-manager

# APIサーバーの開発実行
cd packages/api
pnpm dev
```

`room-manager` は通常の `cargo` ではホストターゲット向けにビルドされます。Arm Linux 以外では、カードリーダー・音声・ドアロックは noop runtime で起動し、カードイベントなしで待機します。ローカルでのビルド確認・起動確認用の挙動です。

### リリースビルド

```sh
# Rustアプリケーションのリリースビルド
cargo build --release -p room-manager

# 実行ファイルは target/release/room-manager に生成されます
```

### Arm Linux でのビルド

Raspberry Pi など Arm Linux 環境では、そのまま native にビルドします。

```sh
# Arm Linux 環境上でリリースビルド
cargo build --release -p room-manager

# 実行ファイルは target/release/room-manager に生成されます
```
