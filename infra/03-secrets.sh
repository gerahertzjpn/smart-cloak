#!/usr/bin/env bash
# パスワード類を設定する（DB担当が自分で入力する）。入力した文字は画面に表示されない。
#   bash infra/03-secrets.sh
# - app_user（サーバー用DBユーザー）のパスワード → Cloud SQL と Secret Manager「db-password」
# - スタッフ用パスコード → Secret Manager「staff-passcode」
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh
gcloud config set project "$PROJECT_ID" >/dev/null

ask() { # ask <説明> <最小文字数> → 変数 REPLY_VALUE
  local label=$1 min=$2 a b
  while true; do
    read -rsp "$label（${min}文字以上・表示されません）: " a; echo
    read -rsp "もう一度入力: " b; echo
    if [ "$a" != "$b" ]; then echo "  一致しません。もう一度。"; continue; fi
    if [ "${#a}" -lt "$min" ]; then echo "  短すぎます。もう一度。"; continue; fi
    REPLY_VALUE=$a
    return
  done
}

save_secret() { # save_secret <名前> <値>
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=- >/dev/null
  else
    printf '%s' "$2" | gcloud secrets create "$1" --replication-policy=automatic --data-file=- >/dev/null
  fi
  gcloud secrets add-iam-policy-binding "$1" \
    --member="serviceAccount:$RUN_SA_EMAIL" --role=roles/secretmanager.secretAccessor >/dev/null
  echo "   Secret Manager に保存しました：$1"
}

echo "== DB（app_user）のパスワード"
ask "app_user のパスワード" 12
gcloud sql users set-password app_user --instance="$SQL_INSTANCE" --password="$REPLY_VALUE" >/dev/null
echo "   Cloud SQL の app_user に設定しました"
save_secret db-password "$REPLY_VALUE"

echo "== スタッフ用パスコード（スタッフが画面を開くときに入力する）"
ask "スタッフ用パスコード" 8
save_secret staff-passcode "$REPLY_VALUE"

unset REPLY_VALUE
echo "完了。次は：bash infra/04-deploy.sh"
