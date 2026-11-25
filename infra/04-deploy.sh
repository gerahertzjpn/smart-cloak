#!/usr/bin/env bash
# 今のフォルダのコードをビルドして Cloud Run にデプロイする。
#   bash infra/04-deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh
gcloud config set project "$PROJECT_ID" >/dev/null

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$RUN_SA_EMAIL" \
  --add-cloudsql-instances "$INSTANCE_CONNECTION" \
  --set-env-vars "DB_HOST=/cloudsql/${INSTANCE_CONNECTION},DB_NAME=${DB_NAME},DB_USER=app_user,PHOTO_BUCKET=${BUCKET}" \
  --set-secrets "DB_PASSWORD=db-password:latest,STAFF_PASSCODE=staff-passcode:latest" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --quiet

echo
echo "URL：$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
