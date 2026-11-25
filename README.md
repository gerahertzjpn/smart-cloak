# スマートクローク管理システム（Smart Cloak）

ホテル観光科との共同プロジェクト。
結婚式・披露宴・パーティーでのクローク業務（お荷物の一時預かり）をシステム化します。

## 解決する課題

| 現状の課題                     | システムでの解決                         |
|--------------------------------|------------------------------------------|
| 物理タグの脱落                 | 荷物ごとに写真を撮影し、写真で照合       |
| 属人的な保管序列               | システムが空き棚を自動で提案（フリーアドレス） |
| 渡し間違えの発生               | お客様のQRと荷物のQRをシステムで照合     |

## 業務フロー

1. **お預かりと情報入力**：氏名、メールアドレス、Webカメラでの荷物撮影、個数・特記事項。
2. **保管場所の確定**：システムが空き棚を提案（例：棚 A-3）。
3. **引換券とQRタグ**：お客様のメールへ引換券（QR）を自動送信、荷物にQRタグを貼付。
4. **クロークへの収納**：割り当てられた棚へ保管。
5. **お引き取り受付**：お客様のQRを読み取り、写真・個数・保管場所を表示。
6. **照合とお渡し**：荷物のQRを読み取り、一致を確認してから返却。

> **初めての人は、まず [docs/guide.md](docs/guide.md)（はじめてガイド）を読んでください。**

## 自分のPCで動かす（プロトタイプ）

必要なもの：[Node.js](https://nodejs.org/ja)（22 以上）だけ。DB のインストールは不要です。

```bash
cd backend
npm install
npm run dev
```

ブラウザで http://localhost:8080 を開きます。右上で「担当スタッフ」を選んでから使ってください。

| 画面         | できること                                                     |
|--------------|----------------------------------------------------------------|
| お預かり     | お客様情報 → 荷物を撮影して追加 → 確定（空き棚を自動割り当て）→ 引換券QR・タグ印刷 |
| お引き取り   | 引換券QRを読み取り → 荷物の写真と棚を表示 → タグで照合 → お渡し |
| 棚の状況     | 棚ごとの空き状況、保管中の荷物を写真で探す（タグ脱落時）       |

- ハンドスキャナーがなくても、QRの中身（コード）を入力欄に貼り付けて Enter で試せます。
- 自分のPCでは、DB は PC内の PGlite、写真は `backend/.data/` に保存されます。メールは送信しません。
- クラウド（Cloud Run・Cloud SQL・Cloud Storage）での動かし方は [docs/deploy.md](docs/deploy.md)。

## リポジトリ構成

```
AGENTS.md        AIとメンバー向けのルール（最初に読む）
CLAUDE.md        Claude Code 用（AGENTS.md を読み込む）
GEMINI.md        Google Antigravity（Gemini）用の案内
docs/guide.md    はじめてガイド：作業の流れと用語
docs/db.md       データベースのテーブル定義
docs/api.md      画面とサーバー間の取り決め
docs/deploy.md   Google Cloud へのデプロイ手順
db/migrations/   DBスキーマの変更履歴（001, 002, ...）
db/seed.sql      マスタデータ（スタッフ・荷物の種類・棚）
db/seed_test.sql テスト用のお客様データ
db/tests/        DBの自動チェック
db/queries.sql   主要クエリの例
backend/         サーバー（Node.js + Express）
frontend/        画面（HTML / CSS / JavaScript）
Dockerfile       Cloud Run 用のコンテナ
```

## インフラ

- Google Cloud（プロジェクト `project-pjwork12-ai07ae`、東京リージョン）
- サーバーと画面：Cloud Run
- データベース：Cloud SQL for PostgreSQL
- 写真：Cloud Storage
- パスワード類：Secret Manager

## チームでの作業の流れ

1. `git pull` で最新版を取得する。
2. `git switch -c タスク名` で自分のブランチを作る。
3. タスクを進める（AIを使う場合、AIは `AGENTS.md` を読む）。
4. `git push` して GitHub で Pull Request を作る。
5. 自動チェックが緑になり、別のメンバーが承認するのを待つ。
6. `main` にマージする。

タスクと担当者は GitHub Projects のボードで管理します。
