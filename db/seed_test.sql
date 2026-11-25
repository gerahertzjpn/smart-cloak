-- テスト用のお客様データ（自動チェックと、自分のPCでの動作確認用）。
-- 本番の Cloud SQL には投入しない。seed.sql の後に実行する。
BEGIN;

INSERT INTO events (name, venue, starts_at, ends_at) VALUES
  ('山田家・佐藤家 披露宴', '鳳凰の間', '2026-12-05 11:00+09', '2026-12-05 14:30+09');

-- お客様1：キャリー＋紙袋
WITH d AS (
  INSERT INTO deposits (event_id, guest_name, guest_email, received_by)
  VALUES (1, '山田 太郎', 'guest1@example.com', 1)
  RETURNING deposit_id
)
INSERT INTO items (deposit_id, item_type_id, location_id)
SELECT d.deposit_id, v.type_id, v.loc_id
FROM d, (VALUES (1, 1), (3, 15)) AS v(type_id, loc_id);   -- A-1, C-1

-- お客様2：手荷物
WITH d AS (
  INSERT INTO deposits (event_id, guest_name, guest_email, received_by, note)
  VALUES (1, '田中 花子', 'guest2@example.com', 2, '割れ物あり')
  RETURNING deposit_id
)
INSERT INTO items (deposit_id, item_type_id, location_id, note)
SELECT d.deposit_id, 2, 7, '割れ物' FROM d;                -- B-1

-- 写真のパスだけ（実際の画像ファイルはない）
INSERT INTO item_photos (item_id, storage_path) VALUES
  (1, 'gs://smart-cloak-photos/photos/1/sample.jpg'),
  (2, 'gs://smart-cloak-photos/photos/2/sample.jpg'),
  (3, 'gs://smart-cloak-photos/photos/3/sample.jpg');

COMMIT;
