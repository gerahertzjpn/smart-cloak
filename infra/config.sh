# Google Cloud の設定値（スクリプト共通）。パスワード類はここに書かない。
PROJECT_ID=project-pjwork12-ai07ae
PROJECT_NUMBER=1062656635598
REGION=asia-northeast1                 # 東京
SQL_INSTANCE=smart-cloak-db
DB_NAME=smartcloak
BUCKET=smart-cloak-photos-pjwork12
SERVICE=smart-cloak
# Cloud Run が使うサービスアカウント。学生アカウントではサービスアカウントを作成できないため、
# プロジェクトの既定のサービスアカウントを使う（必要な権限は docs/deploy.md の「管理者に依頼すること」）。
RUN_SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
INSTANCE_CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
