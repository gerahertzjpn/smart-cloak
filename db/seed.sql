-- スキーマ確認用のテストデータ（本番用ではありません）
BEGIN;

INSERT INTO staff (name) VALUES ('佐藤'), ('鈴木');

INSERT INTO item_types (name, size_class) VALUES
  ('キャリー', 'L'),
  ('手荷物',   'M'),
  ('紙袋',     'S'),
  ('コート',   'M');

-- 棚：A＝大（キャリー）、B＝中、C＝小
INSERT INTO locations (code, area, size_class, capacity)
SELECT 'A-' || n, 'A', 'L', 1 FROM generate_series(1, 6)  n
UNION ALL
SELECT 'B-' || n, 'B', 'M', 2 FROM generate_series(1, 8)  n
UNION ALL
SELECT 'C-' || n, 'C', 'S', 3 FROM generate_series(1, 10) n;

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

INSERT INTO item_photos (item_id, storage_path) VALUES
  (1, 'gs://smart-cloak-photos/photos/1/sample.jpg'),
  (2, 'gs://smart-cloak-photos/photos/2/sample.jpg'),
  (3, 'gs://smart-cloak-photos/photos/3/sample.jpg');

COMMIT;
