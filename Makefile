# Google Cloud の操作（Cloud Shell で実行）。手順は docs/deploy.md を参照。
#   make create        初期構築（Cloud SQL・バケット・権限）
#   make migrate-init  初期スキーマとマスタデータを Cloud SQL に適用
#   make secrets       DBパスワードとスタッフ用パスコードを設定（自分で入力）
#   make deploy        Cloud Run にデプロイ
.PHONY: create migrate-init secrets deploy test

create:
	bash infra/01-create.sh

migrate-init:
	bash infra/02-migrate.sh db/migrations/001_init.sql db/migrations/002_app_user.sql db/seed.sql

secrets:
	bash infra/03-secrets.sh

deploy:
	bash infra/04-deploy.sh

test:
	cd backend && npm ci && npm test
