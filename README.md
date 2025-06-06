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
# Rustアプリケーションの実行（開発モード）
cargo run -p room-manager

# APIサーバーの開発実行
cd packages/api
pnpm dev
```

### リリースビルド

```sh
# Rustアプリケーションのリリースビルド
cargo build --release -p room-manager

# 実行ファイルは target/release/room-manager に生成されます
```

### クロスコンパイル（Raspberry Piなど向け）

ARM系デバイス向けにクロスコンパイルする場合：

```sh
# 依存ツールのインストール(最新版が必要なので注意)
cargo install cross --git https://github.com/cross-rs/cross

# aarch64向けビルド
cross build --release

# 実行ファイルは target/aarch64-unknown-linux-gnu/release/room-manager に生成されます
```
