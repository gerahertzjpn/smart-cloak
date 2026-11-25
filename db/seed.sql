-- マスタデータ（スタッフ、荷物の種類、棚）。Cloud SQL にも投入する。
-- 本番前に、実際のスタッフ名とクロークの棚の配置に合わせて変更すること。
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

COMMIT;
