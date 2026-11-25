# Google Cloud へのデプロイ

> 担当：DB担当（このリポジトリの管理者）。メンバーは読むだけでOKです。
> パスワードやパスコードは、このファイルにもリポジトリにも書かないこと。

## 全体の構成

```
 スタッフのPC / お客様のスマホ
            │ https
            ▼
 ┌─────────────────────┐   ┌──────────────────────┐
 │ Cloud Run            │──▶│ Cloud SQL（PostgreSQL）│  お預かり・荷物・棚
 │ smart-cloak          │   │ smart-cloak-db         │
 │ （サーバー＋画面）   │   └──────────────────────┘
 │                      │──▶ Cloud Storage            荷物の写真
 │                      │──▶ Secret Manager           DBパスワード、スタッフ用パスコード
 └─────────────────────┘
            ▲
            │ main にマージされると自動でビルド・デプロイ（Cloud Build）
         GitHub
```

| 項目             | 値                                                        |
|------------------|-----------------------------------------------------------|
| プロジェクト     | `project-pjwork12-ai07ae`                                 |
| リージョン       | `asia-northeast1`（東京）                                 |
| Cloud SQL        | インスタンス `smart-cloak-db`、DB `smartcloak`            |
| DBユーザー       | `postgres`（DB担当）、`app_user`（サーバー用・構造変更不可） |
| Cloud Storage    | バケット `smart-cloak-photos-pjwork12`（公開しない）      |
| Secret Manager   | `db-password`（app_user のパスワード）、`staff-passcode`  |
| Cloud Run        | サービス `smart-cloak`                                    |

## 費用の目安

| サービス        | 目安                                                     |
|-----------------|----------------------------------------------------------|
| Cloud SQL       | 最小構成で月 1,500 円前後（**止めている間はストレージ代のみ**） |
| Cloud Run       | 授業・発表で使う程度なら無料枠内の見込み                 |
| Cloud Storage   | 写真数百枚なら数円                                       |
| Secret Manager  | 無料枠内の見込み                                         |

使わない期間は Cloud SQL を「停止」すると費用を抑えられます（Cloud SQL → インスタンス → 停止）。

## 手順

### 1. Cloud SQL

1. Cloud SQL → インスタンスを作成 → PostgreSQL。
2. エディション：Enterprise、プリセット：サンドボックス（最小）、リージョン：東京、ゾーン：単一。
3. インスタンスID：`smart-cloak-db`。`postgres` のパスワードは「生成」を使い、DB担当が安全に保管する。
4. 作成後、データベース → `smartcloak` を作成。
5. Cloud SQL Studio で `smartcloak` に `postgres` としてログインし、次の順に**中身を貼り付けて実行**：
   1. `db/migrations/001_init.sql`
   2. `db/migrations/002_app_user.sql`
   3. `db/seed.sql`（スタッフ名・棚は本番前に実際の内容へ変更）
   - `db/seed_test.sql` は本番には入れない。
6. ユーザー → `app_user` のパスワードを設定（または Studio で
   `ALTER ROLE app_user PASSWORD '...'`）。DB担当が入力し、どこにも書き残さない。

### 2. Cloud Storage

1. バケットを作成：名前 `smart-cloak-photos-pjwork12`、リージョン 東京、
   「公開アクセスの防止」を有効、アクセス制御は「均一」。

### 3. Secret Manager

1. シークレット `db-password`：`app_user` のパスワード。
2. シークレット `staff-passcode`：スタッフが画面を開くときのパスコード。

### 4. Cloud Run

1. Cloud Run → サービスを作成 →「リポジトリから継続的にデプロイ」→ GitHub の
   `gerahertzjpn/smart-cloak`、ブランチ `^main$`、ビルドタイプ **Dockerfile**。
2. サービス名 `smart-cloak`、リージョン 東京、認証「未認証の呼び出しを許可」
   （お客様の引換券ページを開けるようにするため。スタッフ画面はパスコードで保護）。
3. コンテナ → 変数とシークレット：

   | 名前             | 種類         | 値                                                              |
   |------------------|--------------|-----------------------------------------------------------------|
   | `DB_HOST`        | 環境変数     | `/cloudsql/project-pjwork12-ai07ae:asia-northeast1:smart-cloak-db` |
   | `DB_NAME`        | 環境変数     | `smartcloak`                                                    |
   | `DB_USER`        | 環境変数     | `app_user`                                                      |
   | `PHOTO_BUCKET`   | 環境変数     | `smart-cloak-photos-pjwork12`                                   |
   | `DB_PASSWORD`    | シークレット | `db-password`（latest）                                         |
   | `STAFF_PASSCODE` | シークレット | `staff-passcode`（latest）                                      |

4. 接続 → Cloud SQL 接続に `smart-cloak-db` を追加。
5. サービスアカウントに次のロールを付与：
   - Cloud SQL クライアント
   - Secret Manager のシークレット アクセサー
   - バケット `smart-cloak-photos-pjwork12` に対する Storage オブジェクト ユーザー
6. デプロイ後、表示された URL を開き、パスコードを入力して動作確認する。

## スキーマを変更したとき（新しいマイグレーション）

1. PR が `main` にマージされたら、DB担当が Cloud SQL Studio で新しい
   `db/migrations/00N_*.sql` を `postgres` として実行する。
2. 実行済みかどうかは `SELECT * FROM schema_migrations;` で確認できる。
3. **マイグレーションの適用 → サーバーのデプロイ** の順になるよう、
   新しい列やテーブルを使うコードは、マイグレーション適用後にマージする。

## 引換券メール（任意）

メールを送る場合は、Cloud Run に `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`MAIL_FROM` と、
シークレット `SMTP_PASS` を追加する。設定しない場合は、画面に表示される QR を
お客様のスマートフォンで撮影していただく運用になる。
