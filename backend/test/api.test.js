// API の自動テスト。DB はメモリ上の PGlite を使うので、何もインストールせずに実行できる。
// 実行：cd backend → npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../src/db.js';
import { createPhotoStore } from '../src/storage.js';
import { createApp } from '../src/server.js';

let server, base, db, tmpDir;
const noMail = { enabled: false, async sendTicket() {} };

async function call(method, url, { body, headers = {}, raw } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: raw ? headers : { 'content-type': 'application/json', ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
}

async function startApp(options = {}) {
  const app = createApp({ db, photos: await createPhotoStore({ localDir: tmpDir }), mailer: noMail, passcode: '', ...options });
  return new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloak-test-'));
  db = await createDb({ local: true }); // メモリ上。マイグレーション＋テストデータ入り
  server = await startApp();
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.close();
  await db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let created; // 下のテストで作ったお預かり

test('マスタを取得できる', async () => {
  const { status, body } = await call('GET', '/api/meta');
  assert.equal(status, 200);
  assert.equal(body.staff.length, 2);
  assert.deepEqual(body.itemTypes.map((t) => t.name), ['キャリー', '手荷物', '紙袋', 'コート']);
  assert.equal(body.db, 'pglite');
});

test('お預かりを登録すると、空き棚が自動で割り当てられる', async () => {
  const { status, body } = await call('POST', '/api/deposits', {
    body: {
      guest_name: '鈴木 一郎',
      guest_email: 'ichiro@example.com',
      staff_id: 1,
      event_id: 1,
      items: [{ item_type_id: 1 }, { item_type_id: 3, note: '割れ物' }, { item_type_id: 3 }],
    },
  });
  assert.equal(status, 201);
  created = body.deposit;
  assert.equal(created.items.length, 3);
  // A-1 はテストデータで使用中なので、キャリーは A-2
  assert.equal(created.items[0].location_code, 'A-2');
  // 紙袋は C-1（収容3、使用1）にまとめて入る
  assert.equal(created.items[1].location_code, 'C-1');
  assert.equal(created.items[2].location_code, 'C-1');
  assert.match(created.ticket_url, /\/t\/[0-9a-f-]{36}$/);
  assert.equal(body.mail.sent, false); // メール未設定
});

test('入力ミスは 400 とわかりやすいメッセージを返す', async () => {
  const noName = await call('POST', '/api/deposits', { body: { staff_id: 1, items: [{ item_type_id: 1 }] } });
  assert.equal(noName.status, 400);
  assert.equal(noName.body.error, 'お名前を入力してください');

  const noItems = await call('POST', '/api/deposits', { body: { guest_name: 'A', staff_id: 1, items: [] } });
  assert.equal(noItems.status, 400);

  const badEmail = await call('POST', '/api/deposits', {
    body: { guest_name: 'A', guest_email: 'abc', staff_id: 1, items: [{ item_type_id: 1 }] },
  });
  assert.equal(badEmail.status, 400);

  const badStaff = await call('POST', '/api/deposits', { body: { guest_name: 'A', staff_id: 999, items: [{ item_type_id: 1 }] } });
  assert.equal(badStaff.status, 400);
});

test('写真をアップロードして取り出せる', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const up = await call('POST', `/api/items/${created.items[0].item_id}/photos`, {
    raw: bytes,
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(up.status, 201);
  const got = await call('GET', `/api/photos/${up.body.photo_id}`);
  assert.equal(got.status, 200);
  assert.deepEqual(Buffer.from(got.body), bytes);
});

test('引換券QR（URLでも可）で荷物・棚・写真が表示される', async () => {
  const { status, body } = await call('GET', `/api/tickets/${encodeURIComponent(created.ticket_url)}?staff_id=1`);
  assert.equal(status, 200);
  assert.equal(body.guest_name, '鈴木 一郎');
  assert.equal(body.items.length, 3);
  assert.equal(body.items[0].photo_ids.length, 1);

  const missing = await call('GET', '/api/tickets/00000000-0000-4000-8000-000000000000');
  assert.equal(missing.status, 404);
});

test('他のお客様の荷物タグは「不一致」になる', async () => {
  const other = await call('GET', '/api/deposits/2'); // テストデータの田中様
  const { body } = await call('POST', `/api/tickets/${created.ticket_token}/verify`, {
    body: { tag: other.body.items[0].tag_token, staff_id: 1 },
  });
  assert.equal(body.match, false);
  assert.equal(body.result, 'mismatch');
});

test('照合していない荷物はお渡しできない。照合後はお渡しできる', async () => {
  const item = created.items[0];
  const before = await call('POST', `/api/tickets/${created.ticket_token}/items/${item.item_id}/return`, {
    body: { staff_id: 1, method: 'tag' },
  });
  assert.equal(before.status, 409);

  const verify = await call('POST', `/api/tickets/${created.ticket_token}/verify`, {
    body: { tag: item.tag_token, staff_id: 1 },
  });
  assert.equal(verify.body.match, true);

  const ret = await call('POST', `/api/tickets/${created.ticket_token}/items/${item.item_id}/return`, {
    body: { staff_id: 1, method: 'tag' },
  });
  assert.equal(ret.status, 200);
  assert.equal(ret.body.deposit_status, 'partially_returned');
  assert.equal(ret.body.remaining, 2);

  const again = await call('POST', `/api/tickets/${created.ticket_token}/items/${item.item_id}/return`, {
    body: { staff_id: 1, method: 'tag' },
  });
  assert.equal(again.status, 409);
});

test('別の引換券では、その荷物をお渡しできない', async () => {
  const other = await call('GET', '/api/deposits/2');
  const res = await call('POST', `/api/tickets/${other.body.ticket_token}/items/${created.items[1].item_id}/return`, {
    body: { staff_id: 1, method: 'photo' },
  });
  assert.equal(res.status, 404);
});

test('タグ脱落時は写真確認でお渡しでき、全部渡すと返却済みになる', async () => {
  for (const item of created.items.slice(1)) {
    const res = await call('POST', `/api/tickets/${created.ticket_token}/items/${item.item_id}/return`, {
      body: { staff_id: 2, method: 'photo' },
    });
    assert.equal(res.status, 200);
  }
  const { body } = await call('GET', `/api/deposits/${created.deposit_id}`);
  assert.equal(body.status, 'returned');
  assert.ok(body.items.every((i) => i.status === 'returned'));
});

test('棚が満杯なら、より大きい棚、それもなければ「未割当」になる', async () => {
  // 手荷物（M）を B 棚が埋まるまで預ける：B は 8 棚×2 = 16、テストデータで 1 使用中
  const items = Array.from({ length: 20 }, () => ({ item_type_id: 2 }));
  const { body } = await call('POST', '/api/deposits', { body: { guest_name: '大人数', staff_id: 1, items } });
  const codes = body.deposit.items.map((i) => i.location_code);
  assert.equal(codes.filter((c) => c?.startsWith('B-')).length, 15);
  assert.equal(codes.filter((c) => c?.startsWith('A-')).length, 5); // 空いている A-2〜A-6 を使う
  const third = await call('POST', '/api/deposits', { body: { guest_name: '追加', staff_id: 1, items: [{ item_type_id: 2 }] } });
  assert.equal(third.body.deposit.items[0].location_code, null);

  const shelves = await call('GET', '/api/locations');
  assert.equal(shelves.body.unassigned.length, 1);
  assert.equal(shelves.body.shelves.find((s) => s.code === 'B-1').free, 0);
});

test('お客様用ページはメールアドレスを返さない', async () => {
  const dep = await call('GET', '/api/deposits/1');
  const { status, body } = await call('GET', `/api/public/tickets/${dep.body.ticket_token}`);
  assert.equal(status, 200);
  assert.equal(body.guest_name, '山田 太郎');
  assert.equal(body.item_count, 2);
  assert.equal(body.guest_email, undefined);
});

test('パスコード設定時：スタッフ用APIは要ログイン、お客様用は不要', async () => {
  const s = await startApp({ passcode: 'secret-123' });
  const url = `http://localhost:${s.address().port}`;
  try {
    assert.equal((await fetch(`${url}/api/meta`)).status, 401);
    assert.equal((await fetch(`${url}/checkin.html`)).status, 401);
    const auth = { authorization: 'Basic ' + Buffer.from('staff:secret-123').toString('base64') };
    assert.equal((await fetch(`${url}/api/meta`, { headers: auth })).status, 200);
    const wrong = { authorization: 'Basic ' + Buffer.from('staff:nope').toString('base64') };
    assert.equal((await fetch(`${url}/api/meta`, { headers: wrong })).status, 401);
    const dep = await call('GET', '/api/deposits/1');
    assert.equal((await fetch(`${url}/api/public/tickets/${dep.body.ticket_token}`)).status, 200);
    assert.equal((await fetch(`${url}/t/${dep.body.ticket_token}`)).status, 200);
  } finally {
    s.close();
  }
});
