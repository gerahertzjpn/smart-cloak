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
            │ make deploy でビルド・デプロイ（Cloud Build）※ main への自動デプロイは今後
   Cloud Shell（GitHub から取得したコード）
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
| Cloud SQL       | db-f1-micro（東京）$0.014/時間 ≈ 月 $10.2 ＋ HDD 10GB ≈ 月 $1.2 → **合計 約 $11.5/月**（**停止中はディスク代のみ**） |
| Cloud Run       | 授業・発表で使う程度なら無料枠内の見込み                 |
| Cloud Storage   | 写真数百枚なら数円                                       |
| Secret Manager  | 無料枠内の見込み                                         |

> 注意：コンソールの作成画面のプリセット「サンドボックス」でも 2 vCPU / 8 GB（約 $100/月）になる。
> 必ず下のスクリプト（db-f1-micro）で作成すること。

使わない期間は Cloud SQL を停止すると費用を抑えられます：

```bash
gcloud sql instances patch smart-cloak-db --activation-policy=NEVER    # 停止
gcloud sql instances patch smart-cloak-db --activation-policy=ALWAYS   # 再開
```

## 手順（Cloud Shell で実行）

コンソール右上の「Cloud Shell をアクティブにする」で開いたターミナルで実行します。
設定値は `infra/config.sh`、各処理は `infra/` のスクリプトにあります。

```bash
git clone https://github.com/gerahertzjpn/smart-cloak.git
cd smart-cloak
make create        # 1. API の有効化、Cloud SQL・DB・バケット・サービスアカウントと権限
make migrate-init  # 2. 001・002 のマイグレーションと seed.sql（マスタ）を Cloud SQL に適用
make secrets       # 3. app_user のパスワードとスタッフ用パスコードを入力（画面に表示されない）
make deploy        # 4. ビルドして Cloud Run にデプロイ → URL が表示される
```

- `make create` は作成済みのものをスキップするので、途中で失敗しても再実行できる。
- `db/seed_test.sql`（テスト用のお客様）は本番には入れない。
- `db/seed.sql` のスタッフ名と棚は、本番前に実際の内容へ変更する（新しいSQLで更新する）。
- Cloud Run は「未認証の呼び出しを許可」で公開する（お客様の引換券ページのため）。
  スタッフ画面と API はスタッフ用パスコードで保護される。

### Cloud Run の設定（スクリプトが設定する内容）

| 名前             | 種類         | 値                                                              |
|------------------|--------------|-----------------------------------------------------------------|
| `DB_HOST`        | 環境変数     | `/cloudsql/project-pjwork12-ai07ae:asia-northeast1:smart-cloak-db` |
| `DB_NAME`        | 環境変数     | `smartcloak`                                                    |
| `DB_USER`        | 環境変数     | `app_user`                                                      |
| `PHOTO_BUCKET`   | 環境変数     | `smart-cloak-photos-pjwork12`                                   |
| `DB_PASSWORD`    | シークレット | `db-password`（latest）                                         |
| `STAFF_PASSCODE` | シークレット | `staff-passcode`（latest）                                      |

サービスアカウント `smart-cloak-run` の権限：Cloud SQL クライアント、
バケットの Storage オブジェクト ユーザー、2つのシークレットのアクセサー。

## スキーマを変更したとき（新しいマイグレーション）

1. PR が `main` にマージされたら、DB担当が Cloud Shell で適用する：
   `bash infra/02-migrate.sh db/migrations/00N_xxx.sql`
2. 実行済みかどうかは Cloud SQL Studio で `SELECT * FROM schema_migrations;` を確認する。
3. **マイグレーションの適用 → サーバーのデプロイ（make deploy）** の順にする。

## 引換券メール（任意）

メールを送る場合は、Cloud Run に `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`MAIL_FROM` と、
シークレット `SMTP_PASS` を追加する。設定しない場合は、画面に表示される QR を
お客様のスマートフォンで撮影していただく運用になる。
