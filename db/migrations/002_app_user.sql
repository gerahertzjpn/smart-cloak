-- =====================================================================
-- マイグレーション 002：サーバー（backend）用のDBユーザー
--
-- app_user はデータの読み書きはできるが、テーブルの作成・変更・削除はできない。
-- サーバーのコードに危険なSQL（DROP TABLE など）が紛れ込んでも、
-- DBの構造は壊れない。
--
-- パスワードはここでは設定しない。DB担当が Cloud SQL コンソール
-- （ユーザー → app_user → パスワードを変更）で設定し、Secret Manager に保存する。
-- =====================================================================

BEGIN;
INSERT INTO schema_migrations (version) VALUES ('002_app_user');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN;
  END IF;
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;

-- データ：参照・追加・更新
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- 削除できるのは写真だけ（撮り直しのため）。
-- それ以外のレコードは削除せず、status を変更する。
GRANT DELETE ON item_photos TO app_user;

-- マイグレーション履歴は参照のみ
REVOKE INSERT, UPDATE ON schema_migrations FROM app_user;

-- 今後のマイグレーションで追加されるテーブルにも同じ権限を自動で付与
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

COMMIT;
