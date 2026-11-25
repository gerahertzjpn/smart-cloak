#!/usr/bin/env bash
# 自分のアカウントがこのプロジェクトで何をできるかを確認する（読み取りのみ・何も変更しない）。
#   make check
set -uo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh

ACCOUNT=$(gcloud config get account 2>/dev/null)
TOKEN=$(gcloud auth print-access-token)
NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null)

echo "== 権限のテスト（true = できる）"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}:testIamPermissions" \
  -d '{"permissions":[
    "resourcemanager.projects.getIamPolicy","resourcemanager.projects.setIamPolicy",
    "iam.serviceAccounts.create","iam.serviceAccounts.list","iam.serviceAccounts.actAs",
    "run.services.create","run.services.setIamPolicy",
    "cloudbuild.builds.create","artifactregistry.repositories.create",
    "secretmanager.secrets.create","secretmanager.secrets.setIamPolicy",
    "storage.buckets.create","storage.buckets.setIamPolicy",
    "cloudsql.instances.import","cloudsql.users.update","cloudsql.instances.connect"]}' \
  | python3 -c '
import json, sys
wanted = """resourcemanager.projects.getIamPolicy resourcemanager.projects.setIamPolicy iam.serviceAccounts.create
iam.serviceAccounts.list iam.serviceAccounts.actAs run.services.create run.services.setIamPolicy cloudbuild.builds.create
artifactregistry.repositories.create secretmanager.secrets.create secretmanager.secrets.setIamPolicy storage.buckets.create
storage.buckets.setIamPolicy cloudsql.instances.import cloudsql.users.update cloudsql.instances.connect""".split()
have = set(json.load(sys.stdin).get("permissions", []))
for p in wanted: print(f"  {str(p in have):5}  {p}")'

echo "== 自分のロール"
gcloud projects get-iam-policy "$PROJECT_ID" --flatten=bindings \
  --filter="bindings.members:user:$ACCOUNT" --format='value(bindings.role)' 2>&1 | sed 's/^/  /'

echo "== 既定のサービスアカウント（${NUMBER}-compute）のロール"
gcloud projects get-iam-policy "$PROJECT_ID" --flatten=bindings \
  --filter="bindings.members:serviceAccount:${NUMBER}-compute@developer.gserviceaccount.com" \
  --format='value(bindings.role)' 2>&1 | sed 's/^/  /'

echo "== サービスアカウント一覧"
gcloud iam service-accounts list --format='value(email)' 2>&1 | sed 's/^/  /'
