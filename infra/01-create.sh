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

echo "== 4/5 Cloud Run 用のサービスアカウントと権限"
if gcloud iam service-accounts describe "$RUN_SA_EMAIL" >/dev/null 2>&1; then
  echo "   作成済み：$RUN_SA_EMAIL"
else
  gcloud iam service-accounts create "$RUN_SA" --display-name="Smart Cloak (Cloud Run)"
  sleep 10 # 作成直後は権限付与に失敗することがあるため少し待つ
fi
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUN_SA_EMAIL" --role=roles/cloudsql.client --condition=None >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$RUN_SA_EMAIL" --role=roles/storage.objectUser >/dev/null
echo "   Cloud SQL クライアント、バケットの読み書きを付与しました"

echo "== 5/5 完了"
echo "次は DB のマイグレーション：bash infra/02-migrate.sh db/migrations/001_init.sql db/migrations/002_app_user.sql db/seed.sql"
