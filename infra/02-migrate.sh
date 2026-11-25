#!/usr/bin/env bash
# SQL ファイルを Cloud SQL に postgres ユーザーとして適用する（DB担当用）。
# パスワード不要（Cloud SQL のインポート機能を使う）。指定した順に実行する。
#   bash infra/02-migrate.sh db/migrations/003_xxx.sql
# 適用済みかどうかは Cloud SQL Studio で SELECT * FROM schema_migrations; を確認する。
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh
gcloud config set project "$PROJECT_ID" >/dev/null

if [ "$#" -eq 0 ]; then
  echo "使い方：bash infra/02-migrate.sh <SQLファイル>..." >&2
  exit 1
fi

# Cloud SQL がバケットの SQL ファイルを読めるようにする
SQL_SA=$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(serviceAccountEmailAddress)')
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SQL_SA" --role=roles/storage.objectViewer >/dev/null

for file in "$@"; do
  object="gs://$BUCKET/admin/sql/$(date +%Y%m%d%H%M%S)-$(basename "$file")"
  echo "== $file を適用します"
  gcloud storage cp "$file" "$object" --quiet
  gcloud sql import sql "$SQL_INSTANCE" "$object" --database="$DB_NAME" --user=postgres --quiet
  gcloud storage rm "$object" --quiet
  echo "   OK"
done
