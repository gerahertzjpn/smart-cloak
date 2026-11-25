#!/usr/bin/env bash
# Google Cloud の初期構築（最初に1回だけ）。Cloud Shell で実行する：
#   bash infra/01-create.sh
# すでに作成済みのものはスキップするので、途中で失敗しても再実行できる。
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh
gcloud config set project "$PROJECT_ID" >/dev/null

echo "== 1/5 API を有効化"
gcloud services enable sqladmin.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com

echo "== 2/5 Cloud SQL（最小構成：db-f1-micro、HDD 10GB、単一ゾーン）"
if gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  echo "   作成済み：$SQL_INSTANCE"
else
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=enterprise \
    --tier=db-f1-micro \
    --region="$REGION" \
    --availability-type=zonal \
    --storage-type=HDD \
    --storage-size=10GB \
    --no-storage-auto-increase \
    --backup-start-time=18:00 \
    --no-enable-point-in-time-recovery
fi
if gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1; then
  echo "   作成済み：データベース $DB_NAME"
else
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
fi

echo "== 3/5 Cloud Storage（写真用バケット、公開しない）"
if gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  echo "   作成済み：gs://$BUCKET"
else
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
fi

echo "== 4/5 Cloud Run 用サービスアカウントの権限（$RUN_SA_EMAIL）"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$RUN_SA_EMAIL" --role=roles/storage.objectUser >/dev/null
echo "   バケットの読み書きを付与しました"
# プロジェクト全体の権限は、学生アカウントでは付与できないことがある（管理者に依頼）
for role in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
       --member="serviceAccount:$RUN_SA_EMAIL" --role="$role" --condition=None >/dev/null 2>&1; then
    echo "   $role を付与しました"
  else
    echo "   $role は権限がなく付与できません → 管理者に依頼（docs/deploy.md）"
  fi
done

echo "== 5/5 完了"
echo "次は DB のマイグレーション：bash infra/02-migrate.sh db/migrations/001_init.sql db/migrations/002_app_user.sql db/seed.sql"
