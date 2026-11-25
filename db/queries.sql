-- システムの主要クエリ例（サーバー担当向けの参考）。
-- :param はサーバーが渡すパラメータ（実装では $1, $2 を使う）。

-- 1. お預かり：必要なサイズの空き棚を提案し、確保する。
--    1つのトランザクション内で行う。FOR UPDATE で棚の行をロックし、
--    2台のPCが同時に同じ棚を割り当てないようにする。
BEGIN;
SELECT l.location_id, l.code
FROM locations l
WHERE l.is_active
  AND l.size_class = :size_class
  AND l.capacity > (SELECT COUNT(*) FROM items i
                    WHERE i.location_id = l.location_id AND i.status = 'stored')
ORDER BY l.code
LIMIT 1
FOR UPDATE OF l SKIP LOCKED;
-- ... INSERT INTO items (..., location_id) VALUES (..., <選んだ location_id>);
COMMIT;

-- 2. お引き取り受付：お客様の引換券QRを読み取ったとき
SELECT * FROM v_ticket_items
WHERE ticket_token = :ticket_token AND item_status = 'stored';

-- 3. 照合：荷物タグを読み取ったとき、この引換券の荷物かどうか
SELECT i.item_id, (i.deposit_id = d.deposit_id) AS matches
FROM items i, deposits d
WHERE i.tag_token = :tag_token
  AND d.ticket_token = :ticket_token;

-- 4. お渡し：荷物を返却済みにし、お預かり全体の状態を更新する
UPDATE items
SET status = 'returned', returned_by = :staff_id, returned_at = now()
WHERE item_id = :item_id AND status = 'stored';

UPDATE deposits d
SET status = CASE WHEN NOT EXISTS (SELECT 1 FROM items i
                                   WHERE i.deposit_id = d.deposit_id AND i.status = 'stored')
                  THEN 'returned' ELSE 'partially_returned' END,
    returned_at = CASE WHEN NOT EXISTS (SELECT 1 FROM items i
                                        WHERE i.deposit_id = d.deposit_id AND i.status = 'stored')
                       THEN now() END
WHERE d.deposit_id = :deposit_id;

-- 5. タグ脱落：イベント・荷物の種類から候補を探す（写真で最終確認）
SELECT * FROM v_ticket_items v
JOIN deposits d USING (deposit_id)
WHERE d.event_id = :event_id
  AND v.item_type = :item_type
  AND v.item_status = 'stored';

-- 6. イベント終了時：まだ返却されていない荷物
SELECT d.guest_name, d.guest_email, l.code, t.name
FROM items i
JOIN deposits d   ON d.deposit_id = i.deposit_id
JOIN item_types t ON t.item_type_id = i.item_type_id
LEFT JOIN locations l ON l.location_id = i.location_id
WHERE d.event_id = :event_id AND i.status = 'stored'
ORDER BY l.code;

-- 7. 個人情報：返却から30日経過したメールアドレスを削除
UPDATE deposits
SET guest_email = NULL
WHERE returned_at < now() - INTERVAL '30 days' AND guest_email IS NOT NULL;
