-- =====================================================================
-- マイグレーション 001：スマートクローク管理システムの初期スキーマ
-- 対象DB：Cloud SQL for PostgreSQL（15以上）
-- 写真は Cloud Storage に保存し、DBにはパスのみを保存する。
--
-- ルール：Cloud SQL に適用した後は、このファイルを編集しない。
-- スキーマの変更は新しいファイル 00N_説明.sql で行う。
-- =====================================================================

BEGIN;

-- 適用済みマイグレーションの記録。同じマイグレーションを再実行すると
-- 主キー（またはテーブルの重複）でエラーになり、全体がロールバックされる。
CREATE TABLE schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (version) VALUES ('001_init');

-- ---------- マスタ ----------------------------------------------------

CREATE TABLE staff (                          -- スタッフ
  staff_id    SERIAL PRIMARY KEY,
  name        TEXT    NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (                         -- 宴会・イベント
  event_id    SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,                  -- 例：山田家・佐藤家 披露宴
  venue       TEXT,                           -- 会場名
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ,
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE locations (                      -- 棚・エリア（QRシール付き）
  location_id SERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,           -- 'A-3'：棚のQRと同じ値
  area        TEXT NOT NULL,                  -- 'A'
  size_class  TEXT NOT NULL CHECK (size_class IN ('S','M','L')),
  capacity    INT  NOT NULL DEFAULT 1 CHECK (capacity > 0),  -- 置ける荷物の数
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE item_types (                     -- キャリー / 手荷物 / 紙袋 / コート など
  item_type_id SERIAL PRIMARY KEY,
  name         TEXT UNIQUE NOT NULL,
  size_class   TEXT NOT NULL CHECK (size_class IN ('S','M','L'))  -- 必要な棚のサイズ
);

-- ---------- 業務データ ------------------------------------------------

CREATE TABLE deposits (                       -- お預かり（＝引換券1枚）
  deposit_id    BIGSERIAL PRIMARY KEY,
  ticket_token  UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),  -- 引換券QRの中身
  event_id      INT REFERENCES events,
  guest_name    TEXT NOT NULL,
  guest_email   TEXT,                         -- 個人情報：保存期間後に削除
  note          TEXT,                         -- 特記事項
  status        TEXT NOT NULL DEFAULT 'stored'
                CHECK (status IN ('stored','partially_returned','returned','cancelled')),
  received_by   INT NOT NULL REFERENCES staff,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ticket_sent_at TIMESTAMPTZ,                 -- 引換券メールの送信日時
  returned_at   TIMESTAMPTZ,
  CHECK ((status = 'returned') = (returned_at IS NOT NULL))
);

CREATE TABLE items (                          -- 荷物（物理的な1点）
  item_id       BIGSERIAL PRIMARY KEY,
  deposit_id    BIGINT NOT NULL REFERENCES deposits,
  tag_token     UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),  -- 荷物タグQRの中身
  item_type_id  INT NOT NULL REFERENCES item_types,
  location_id   INT REFERENCES locations,
  status        TEXT NOT NULL DEFAULT 'stored'
                CHECK (status IN ('stored','returned','lost')),
  note          TEXT,                         -- 割れ物、貴重品など
  returned_by   INT REFERENCES staff,
  returned_at   TIMESTAMPTZ,
  CHECK ((status = 'returned') = (returned_at IS NOT NULL AND returned_by IS NOT NULL))
);

CREATE TABLE item_photos (                    -- 荷物の写真
  photo_id      BIGSERIAL PRIMARY KEY,
  item_id       BIGINT NOT NULL REFERENCES items ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,                -- 'gs://<bucket>/photos/<item_id>/<uuid>.jpg'
  taken_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 履歴 ------------------------------------------------------

CREATE TABLE item_movements (                 -- 棚から棚への移動履歴
  movement_id       BIGSERIAL PRIMARY KEY,
  item_id           BIGINT NOT NULL REFERENCES items,
  from_location_id  INT REFERENCES locations,
  to_location_id    INT REFERENCES locations,
  staff_id          INT NOT NULL REFERENCES staff,
  moved_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scan_logs (                      -- すべての読み取り（照合エラーを含む）
  scan_id     BIGSERIAL PRIMARY KEY,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  staff_id    INT REFERENCES staff,
  kind        TEXT NOT NULL CHECK (kind IN ('ticket','item_tag','location')),
  token       TEXT NOT NULL,
  deposit_id  BIGINT REFERENCES deposits,
  item_id     BIGINT REFERENCES items,
  result      TEXT NOT NULL CHECK (result IN ('ok','mismatch','not_found'))
);

-- ---------- インデックス ----------------------------------------------

CREATE INDEX items_deposit_idx         ON items (deposit_id);
CREATE INDEX items_stored_loc_idx      ON items (location_id) WHERE status = 'stored';
CREATE INDEX deposits_event_status_idx ON deposits (event_id, status);
CREATE INDEX item_photos_item_idx      ON item_photos (item_id);
CREATE INDEX scan_logs_time_idx        ON scan_logs (scanned_at);

-- ---------- 画面用のビュー --------------------------------------------

-- 棚ごとの使用数と空き数
CREATE VIEW v_location_usage AS
SELECT l.location_id, l.code, l.area, l.size_class, l.capacity,
       COUNT(i.item_id)              AS used,
       l.capacity - COUNT(i.item_id) AS free
FROM locations l
LEFT JOIN items i ON i.location_id = l.location_id AND i.status = 'stored'
WHERE l.is_active
GROUP BY l.location_id;

-- 「お引き取り受付」画面：引換券1枚分の荷物・棚・写真
CREATE VIEW v_ticket_items AS
SELECT d.ticket_token, d.deposit_id, d.guest_name, d.status AS deposit_status,
       i.item_id, i.tag_token, t.name AS item_type, i.status AS item_status,
       l.code AS location_code, i.note,
       (SELECT array_agg(p.storage_path ORDER BY p.taken_at)
          FROM item_photos p WHERE p.item_id = i.item_id) AS photos
FROM deposits d
JOIN items i      ON i.deposit_id = d.deposit_id
JOIN item_types t ON t.item_type_id = i.item_type_id
LEFT JOIN locations l ON l.location_id = i.location_id;

COMMIT;
