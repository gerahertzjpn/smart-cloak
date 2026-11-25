// API のルート定義（/api/...）。
// 画面とサーバーの取り決めは docs/api.md を参照。ここを変えたら docs/api.md も更新すること。
// SQL の値は必ず $1, $2 のパラメータで渡す（文字列連結しない）。
import express from 'express';
import QRCode from 'qrcode';
import { contentTypeOf } from './storage.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- 入力チェック用の小さな関数 ----------

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 必要なサイズの棚が空いていないときは、より大きい棚を使う
const SIZE_FALLBACK = { S: ['S', 'M', 'L'], M: ['M', 'L'], L: ['L'] };

// スキャナーで読んだ文字列やURLから UUID（引換券・タグのトークン）を取り出す
export const extractUuid = (text) => {
  const m = String(text ?? '').match(UUID_RE);
  return m ? m[0].toLowerCase() : null;
};

const toId = (value, label) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label}が正しくありません`);
  return n;
};
const optionalId = (value, label) => (value == null || value === '' ? null : toId(value, label));

const text = (value, label, { required = false, max = 200 } = {}) => {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) throw new HttpError(400, `${label}を入力してください`);
  if (s.length > max) throw new HttpError(400, `${label}は${max}文字以内で入力してください`);
  return s || null;
};

const tokenParam = (value, label) => {
  const token = extractUuid(value);
  if (!token) throw new HttpError(400, `${label}を読み取れませんでした`);
  return token;
};

// ---------- DB の読み取り ----------

// お預かり1件と、その荷物・写真をまとめて取得する。where は下の2種類のみ（利用者の入力は入らない）。
async function loadDeposit(q, by, value) {
  const where = { id: 'd.deposit_id', token: 'd.ticket_token' }[by];
  const [deposit] = await q(
    `SELECT d.deposit_id, d.ticket_token, d.guest_name, d.guest_email, d.note, d.status,
            d.received_at, d.ticket_sent_at, d.returned_at,
            d.event_id, e.name AS event_name, s.name AS received_by_name
       FROM deposits d
       LEFT JOIN events e ON e.event_id = d.event_id
       JOIN staff s ON s.staff_id = d.received_by
      WHERE ${where} = $1`,
    [value],
  );
  if (!deposit) return null;
  deposit.items = await q(
    `SELECT i.item_id, i.tag_token, i.status, i.note, i.returned_at,
            t.item_type_id, t.name AS item_type, t.size_class,
            l.code AS location_code,
            COALESCE((SELECT json_agg(p.photo_id ORDER BY p.photo_id)
                        FROM item_photos p WHERE p.item_id = i.item_id), '[]'::json) AS photo_ids
       FROM items i
       JOIN item_types t ON t.item_type_id = i.item_type_id
       LEFT JOIN locations l ON l.location_id = i.location_id
      WHERE i.deposit_id = $1
      ORDER BY i.item_id`,
    [deposit.deposit_id],
  );
  return deposit;
}

// 空き棚を1つ選んでロックする（同じトランザクション内で荷物を登録すること）
async function pickLocation(q, sizeClass) {
  const sizes = SIZE_FALLBACK[sizeClass] ?? ['S', 'M', 'L'];
  const [loc] = await q(
    `SELECT l.location_id, l.code
       FROM locations l
      WHERE l.is_active
        AND l.size_class = ANY($1::text[])
        AND l.capacity > (SELECT COUNT(*) FROM items i
                           WHERE i.location_id = l.location_id AND i.status = 'stored')
      ORDER BY array_position($1::text[], l.size_class), l.area, length(l.code), l.code
      LIMIT 1
      FOR UPDATE OF l SKIP LOCKED`,
    [sizes],
  );
  return loc ?? null;
}

async function logScan(q, { staffId = null, kind, token, depositId = null, itemId = null, result }) {
  await q(
    `INSERT INTO scan_logs (staff_id, kind, token, deposit_id, item_id, result)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [staffId, kind, String(token).slice(0, 200), depositId, itemId, result],
  );
}

// ---------- ルート ----------

export function apiRouter({ db, photos, mailer, publicUrl }) {
  const r = express.Router();
  const baseUrl = (req) => (publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const ticketUrl = (req, token) => `${baseUrl(req)}/t/${token}`;

  async function sendTicket(req, deposit) {
    if (!deposit.guest_email) return { sent: false, reason: 'メールアドレスが未入力です' };
    if (!mailer.enabled) return { sent: false, reason: 'メール送信が未設定です' };
    try {
      await mailer.sendTicket({
        to: deposit.guest_email,
        guestName: deposit.guest_name,
        eventName: deposit.event_name,
        itemCount: deposit.items.length,
        ticketUrl: ticketUrl(req, deposit.ticket_token),
      });
      await db.query('UPDATE deposits SET ticket_sent_at = now() WHERE deposit_id = $1', [deposit.deposit_id]);
      return { sent: true };
    } catch (err) {
      console.error('[mail] 送信に失敗しました', err);
      return { sent: false, reason: 'メール送信に失敗しました' };
    }
  }

  // ===== お客様向け（パスコード不要） =====

  // 引換券ページ用。メールアドレスなどは返さない。
  r.get('/public/tickets/:token', async (req, res) => {
    const token = extractUuid(req.params.token);
    if (!token) throw new HttpError(404, '引換券が見つかりません');
    const [ticket] = await db.query(
      `SELECT d.ticket_token, d.guest_name, d.status, d.received_at, e.name AS event_name,
              (SELECT COUNT(*)::int FROM items i WHERE i.deposit_id = d.deposit_id) AS item_count,
              (SELECT COUNT(*)::int FROM items i WHERE i.deposit_id = d.deposit_id
                                                  AND i.status = 'stored') AS stored_count
         FROM deposits d LEFT JOIN events e ON e.event_id = d.event_id
        WHERE d.ticket_token = $1`,
      [token],
    );
    if (!ticket) throw new HttpError(404, '引換券が見つかりません');
    res.json(ticket);
  });

  // QRコードの画像（SVG）
  r.get('/qr.svg', async (req, res) => {
    const data = String(req.query.data ?? '');
    if (!data || data.length > 300) throw new HttpError(400, 'QRにする文字列が正しくありません');
    const svg = await QRCode.toString(data, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
  });

  // ===== スタッフ向け =====

  // 画面の初期表示に必要なマスタと設定
  r.get('/meta', async (req, res) => {
    const staff = await db.query('SELECT staff_id, name FROM staff WHERE is_active ORDER BY staff_id');
    const itemTypes = await db.query('SELECT item_type_id, name, size_class FROM item_types ORDER BY item_type_id');
    const events = await db.query(
      `SELECT event_id, name, venue, starts_at, ends_at FROM events ORDER BY starts_at DESC LIMIT 50`,
    );
    res.json({ staff, itemTypes, events, mailEnabled: mailer.enabled, storage: photos.kind, db: db.kind });
  });

  // イベント（宴会）の登録
  r.post('/events', async (req, res) => {
    const name = text(req.body?.name, 'イベント名', { required: true, max: 100 });
    const venue = text(req.body?.venue, '会場', { max: 100 });
    let startsAt = text(req.body?.starts_at, '開始日時', { required: true, max: 40 });
    // 画面の datetime-local（タイムゾーンなし）は日本時間として扱う
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt)) startsAt += ':00+09:00';
    if (Number.isNaN(Date.parse(startsAt))) throw new HttpError(400, '開始日時が正しくありません');
    const [event] = await db.query(
      `INSERT INTO events (name, venue, starts_at) VALUES ($1, $2, $3)
       RETURNING event_id, name, venue, starts_at, ends_at`,
      [name, venue, startsAt],
    );
    res.status(201).json(event);
  });

  // お預かりの登録：お客様情報＋荷物。荷物ごとに空き棚を自動で割り当てる。
  r.post('/deposits', async (req, res) => {
    const body = req.body ?? {};
    const guestName = text(body.guest_name, 'お名前', { required: true, max: 100 });
    const guestEmail = text(body.guest_email, 'メールアドレス', { max: 254 });
    if (guestEmail && !EMAIL_RE.test(guestEmail)) throw new HttpError(400, 'メールアドレスの形式が正しくありません');
    const note = text(body.note, '特記事項', { max: 500 });
    const staffId = toId(body.staff_id, '担当スタッフ');
    const eventId = optionalId(body.event_id, 'イベント');
    if (!Array.isArray(body.items) || body.items.length === 0) throw new HttpError(400, '荷物を1点以上追加してください');
    if (body.items.length > 20) throw new HttpError(400, '1回のお預かりは20点までです');
    const items = body.items.map((it) => ({
      typeId: toId(it?.item_type_id, '荷物の種類'),
      note: text(it?.note, '荷物のメモ', { max: 200 }),
    }));

    const depositId = await db.tx(async (q) => {
      const types = new Map(
        (await q('SELECT item_type_id, size_class FROM item_types')).map((t) => [t.item_type_id, t.size_class]),
      );
      const [d] = await q(
        `INSERT INTO deposits (event_id, guest_name, guest_email, note, received_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING deposit_id`,
        [eventId, guestName, guestEmail, note, staffId],
      );
      for (const it of items) {
        if (!types.has(it.typeId)) throw new HttpError(400, '荷物の種類が正しくありません');
        const loc = await pickLocation(q, types.get(it.typeId));
        await q(
          `INSERT INTO items (deposit_id, item_type_id, location_id, note) VALUES ($1, $2, $3, $4)`,
          [d.deposit_id, it.typeId, loc?.location_id ?? null, it.note],
        );
      }
      return d.deposit_id;
    });

    const deposit = await loadDeposit(db.query, 'id', depositId);
    const mail = await sendTicket(req, deposit);
    deposit.ticket_url = ticketUrl(req, deposit.ticket_token);
    res.status(201).json({ deposit, mail });
  });

  // 氏名でお預かりを検索（引換券を表示できないお客様のため）
  r.get('/deposits', async (req, res) => {
    const name = text(req.query.q, '検索する名前', { required: true, max: 100 });
    const pattern = `%${name.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await db.query(
      `SELECT d.deposit_id, d.ticket_token, d.guest_name, d.status, d.received_at, e.name AS event_name,
              (SELECT COUNT(*)::int FROM items i WHERE i.deposit_id = d.deposit_id) AS item_count
         FROM deposits d LEFT JOIN events e ON e.event_id = d.event_id
        WHERE d.status IN ('stored', 'partially_returned') AND d.guest_name ILIKE $1
        ORDER BY d.received_at DESC LIMIT 20`,
      [pattern],
    );
    res.json(rows);
  });

  r.get('/deposits/:id', async (req, res) => {
    const deposit = await loadDeposit(db.query, 'id', toId(req.params.id, 'お預かり番号'));
    if (!deposit) throw new HttpError(404, 'お預かりが見つかりません');
    deposit.ticket_url = ticketUrl(req, deposit.ticket_token);
    res.json(deposit);
  });

  // 引換券メールの再送
  r.post('/deposits/:id/send-ticket', async (req, res) => {
    const deposit = await loadDeposit(db.query, 'id', toId(req.params.id, 'お預かり番号'));
    if (!deposit) throw new HttpError(404, 'お預かりが見つかりません');
    res.json(await sendTicket(req, deposit));
  });

  // 荷物の写真をアップロード（本文が画像そのもの）
  r.post(
    '/items/:id/photos',
    express.raw({ type: ['image/jpeg', 'image/png'], limit: '8mb' }),
    async (req, res) => {
      const itemId = toId(req.params.id, '荷物番号');
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new HttpError(400, 'JPEG または PNG の画像を送ってください');
      }
      const [item] = await db.query('SELECT item_id FROM items WHERE item_id = $1', [itemId]);
      if (!item) throw new HttpError(404, '荷物が見つかりません');
      const storagePath = await photos.save(itemId, req.body, req.get('content-type'));
      const [photo] = await db.query(
        'INSERT INTO item_photos (item_id, storage_path) VALUES ($1, $2) RETURNING photo_id',
        [itemId, storagePath],
      );
      res.status(201).json(photo);
    },
  );

  r.get('/photos/:id', async (req, res) => {
    const [photo] = await db.query('SELECT storage_path FROM item_photos WHERE photo_id = $1', [
      toId(req.params.id, '写真番号'),
    ]);
    const data = photo && (await photos.read(photo.storage_path));
    if (!data) throw new HttpError(404, '写真が見つかりません');
    res.type(contentTypeOf(photo.storage_path)).set('Cache-Control', 'private, max-age=3600').send(data);
  });

  // お引き取り受付：引換券QRを読み取ったとき
  r.get('/tickets/:token', async (req, res) => {
    const token = tokenParam(req.params.token, '引換券');
    const staffId = optionalId(req.query.staff_id, '担当スタッフ');
    const deposit = await loadDeposit(db.query, 'token', token);
    await logScan(db.query, {
      staffId, kind: 'ticket', token, depositId: deposit?.deposit_id, result: deposit ? 'ok' : 'not_found',
    });
    if (!deposit) throw new HttpError(404, '引換券が見つかりません');
    res.json(deposit);
  });

  // 照合：荷物タグを読み取り、この引換券の荷物かどうかを判定する
  r.post('/tickets/:token/verify', async (req, res) => {
    const token = tokenParam(req.params.token, '引換券');
    const tag = tokenParam(req.body?.tag, '荷物タグ');
    const staffId = optionalId(req.body?.staff_id, '担当スタッフ');

    const [deposit] = await db.query('SELECT deposit_id FROM deposits WHERE ticket_token = $1', [token]);
    if (!deposit) throw new HttpError(404, '引換券が見つかりません');
    const [item] = await db.query(
      `SELECT i.item_id, i.deposit_id, i.status, t.name AS item_type, l.code AS location_code
         FROM items i JOIN item_types t ON t.item_type_id = i.item_type_id
         LEFT JOIN locations l ON l.location_id = i.location_id
        WHERE i.tag_token = $1`,
      [tag],
    );
    const result = !item ? 'not_found' : item.deposit_id === deposit.deposit_id ? 'ok' : 'mismatch';
    await logScan(db.query, {
      staffId, kind: 'item_tag', token: tag, depositId: deposit.deposit_id, itemId: item?.item_id, result,
    });

    if (result === 'not_found') return res.json({ match: false, result, message: 'このタグは登録されていません' });
    if (result === 'mismatch') {
      return res.json({ match: false, result, message: 'この荷物は別のお客様のお預かり品です。お渡ししないでください。' });
    }
    res.json({
      match: true,
      result,
      item_id: item.item_id,
      already_returned: item.status === 'returned',
      message: item.status === 'returned' ? 'この荷物はすでにお渡し済みです' : '照合OK',
    });
  });

  // お渡し：method = 'tag'（タグ照合済み）または 'photo'（タグ脱落時、写真とお客様で確認）
  r.post('/tickets/:token/items/:itemId/return', async (req, res) => {
    const token = tokenParam(req.params.token, '引換券');
    const itemId = toId(req.params.itemId, '荷物番号');
    const staffId = toId(req.body?.staff_id, '担当スタッフ');
    const method = req.body?.method;
    if (!['tag', 'photo'].includes(method)) throw new HttpError(400, '確認方法が正しくありません');

    const status = await db.tx(async (q) => {
      const [item] = await q(
        `SELECT i.item_id, i.deposit_id, i.status, i.tag_token
           FROM items i JOIN deposits d ON d.deposit_id = i.deposit_id
          WHERE i.item_id = $1 AND d.ticket_token = $2
          FOR UPDATE OF i`,
        [itemId, token],
      );
      if (!item) throw new HttpError(404, 'この引換券の荷物ではありません');
      if (item.status !== 'stored') throw new HttpError(409, 'この荷物はすでにお渡し済みです');

      if (method === 'tag') {
        const [scan] = await q(
          `SELECT 1 FROM scan_logs WHERE kind = 'item_tag' AND item_id = $1 AND deposit_id = $2 AND result = 'ok'
              AND scanned_at > now() - INTERVAL '1 hour' LIMIT 1`,
          [itemId, item.deposit_id],
        );
        if (!scan) throw new HttpError(409, '先に荷物のタグを読み取って照合してください');
      } else {
        // タグなしでのお渡しも記録に残す
        await logScan(q, {
          staffId, kind: 'item_tag', token: 'photo-check', depositId: item.deposit_id, itemId, result: 'ok',
        });
      }

      await q(
        `UPDATE items SET status = 'returned', returned_by = $2, returned_at = now() WHERE item_id = $1`,
        [itemId, staffId],
      );
      const [{ remaining }] = await q(
        `SELECT COUNT(*)::int AS remaining FROM items WHERE deposit_id = $1 AND status = 'stored'`,
        [item.deposit_id],
      );
      const newStatus = remaining === 0 ? 'returned' : 'partially_returned';
      await q(
        `UPDATE deposits SET status = $2, returned_at = CASE WHEN $2 = 'returned' THEN now() END
          WHERE deposit_id = $1`,
        [item.deposit_id, newStatus],
      );
      return { deposit_status: newStatus, remaining };
    });
    res.json({ item_id: itemId, status: 'returned', ...status });
  });

  // 棚の状況：棚ごとの空き状況と、保管中の荷物
  r.get('/locations', async (req, res) => {
    const shelves = await db.query(
      `SELECT location_id, code, area, size_class, capacity, used::int, free::int
         FROM v_location_usage ORDER BY area, length(code), code`,
    );
    const stored = await storedItems(db.query, {});
    for (const shelf of shelves) shelf.items = stored.filter((it) => it.location_id === shelf.location_id);
    res.json({ shelves, unassigned: stored.filter((it) => it.location_id == null) });
  });

  // 保管中の荷物の一覧（タグ脱落時の写真検索、イベント終了時の確認）
  r.get('/items', async (req, res) => {
    res.json(
      await storedItems(db.query, {
        eventId: optionalId(req.query.event_id, 'イベント'),
        itemTypeId: optionalId(req.query.item_type_id, '荷物の種類'),
      }),
    );
  });

  return r;
}

async function storedItems(q, { eventId = null, itemTypeId = null }) {
  return q(
    `SELECT i.item_id, i.location_id, l.code AS location_code, t.name AS item_type, i.note,
            d.deposit_id, d.guest_name, d.received_at, e.name AS event_name,
            COALESCE((SELECT json_agg(p.photo_id ORDER BY p.photo_id)
                        FROM item_photos p WHERE p.item_id = i.item_id), '[]'::json) AS photo_ids
       FROM items i
       JOIN deposits d ON d.deposit_id = i.deposit_id
       JOIN item_types t ON t.item_type_id = i.item_type_id
       LEFT JOIN locations l ON l.location_id = i.location_id
       LEFT JOIN events e ON e.event_id = d.event_id
      WHERE i.status = 'stored'
        AND ($1::int IS NULL OR d.event_id = $1)
        AND ($2::int IS NULL OR i.item_type_id = $2)
      ORDER BY l.area NULLS FIRST, length(l.code), l.code, i.item_id`,
    [eventId, itemTypeId],
  );
}
