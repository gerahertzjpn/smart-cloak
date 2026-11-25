# Google Cloud の設定値（スクリプト共通）。パスワード類はここに書かない。
PROJECT_ID=project-pjwork12-ai07ae
REGION=asia-northeast1                 # 東京
SQL_INSTANCE=smart-cloak-db
DB_NAME=smartcloak
BUCKET=smart-cloak-photos-pjwork12
SERVICE=smart-cloak
RUN_SA=smart-cloak-run
RUN_SA_EMAIL="${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
INSTANCE_CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
