-- app_user がDBの構造を変更できないことを確認する。
-- スーパーユーザー（CI）から SET ROLE で実行する。

DO $$
BEGIN
  SET LOCAL ROLE app_user;

  -- データの参照・更新はできる
  PERFORM 1 FROM deposits LIMIT 1;
  UPDATE deposits SET note = note WHERE deposit_id = 1;

  -- テーブルの削除はできない
  BEGIN
    EXECUTE 'DROP TABLE items CASCADE';
    RAISE EXCEPTION 'app_user がテーブル items を削除できてしまった';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- テーブルの作成はできない
  BEGIN
    EXECUTE 'CREATE TABLE hack (id int)';
    RAISE EXCEPTION 'app_user がテーブルを作成できてしまった';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- お預かりレコードの削除はできない
  BEGIN
    EXECUTE 'DELETE FROM deposits WHERE deposit_id = -1';  -- 行がなくても権限はチェックされる
    RAISE EXCEPTION 'app_user が deposits のレコードを削除できてしまった';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- マイグレーション履歴の改ざんはできない
  BEGIN
    EXECUTE 'INSERT INTO schema_migrations (version) VALUES (''999_fake'')';
    RAISE EXCEPTION 'app_user が schema_migrations に書き込めてしまった';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
  RAISE NOTICE 'permissions：すべてのチェックに合格';
END
$$;
