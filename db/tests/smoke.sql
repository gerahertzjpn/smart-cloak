-- マイグレーションと seed.sql の後に実行するチェック。エラーが出たら失敗。
-- 実行：psql -v ON_ERROR_STOP=1 -f db/tests/smoke.sql

DO $$
DECLARE
  n INT;
  ok BOOLEAN;
BEGIN
  -- 1. マイグレーションが記録されている
  SELECT COUNT(*) INTO n FROM schema_migrations;
  IF n < 2 THEN RAISE EXCEPTION 'schema_migrations：2件以上のはずが % 件', n; END IF;

  -- 2. お客様1の引換券で荷物が2点見える
  SELECT COUNT(*) INTO n FROM v_ticket_items
  WHERE deposit_id = 1 AND item_status = 'stored';
  IF n <> 2 THEN RAISE EXCEPTION 'v_ticket_items：2点のはずが % 点', n; END IF;

  -- 3. 照合：荷物3（お客様2）はお客様1の引換券と一致しない
  SELECT (i.deposit_id = d.deposit_id) INTO ok
  FROM items i, deposits d WHERE i.item_id = 3 AND d.deposit_id = 1;
  IF ok THEN RAISE EXCEPTION '照合：他のお客様の荷物が一致と判定された'; END IF;

  -- 4. 棚 A-1（収容数1）は満杯で空き0
  SELECT free INTO n FROM v_location_usage WHERE code = 'A-1';
  IF n <> 0 THEN RAISE EXCEPTION 'v_location_usage A-1：空き0のはずが %', n; END IF;

  -- 5. 返却スタッフ・時刻なしで返却済みにできない
  BEGIN
    UPDATE items SET status = 'returned' WHERE item_id = 1;
    RAISE EXCEPTION 'CHECK制約が効いていない：returned_by / returned_at なしで returned';
  EXCEPTION WHEN check_violation THEN
    NULL; -- 期待どおりのエラー
  END;

  -- 6. 未定義の状態は登録できない
  BEGIN
    UPDATE deposits SET status = 'unknown' WHERE deposit_id = 1;
    RAISE EXCEPTION 'CHECK制約が効いていない：未定義の状態';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  RAISE NOTICE 'smoke：すべてのチェックに合格';
END
$$;
