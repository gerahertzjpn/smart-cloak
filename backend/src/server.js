// サーバーの入口。API（/api/...）と画面（frontend/ のファイル）を1つのサーバーで配信する。
//
// 自分のPC：  cd backend → npm install → npm run dev → http://localhost:8080
// Cloud Run： 環境変数（docs/deploy.md）で Cloud SQL・Cloud Storage につなぐ
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { createPhotoStore } from './storage.js';
import { createMailer } from './mail.js';
import { staffAuth } from './auth.js';
import { apiRouter, HttpError } from './api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(here, '..');
const FRONTEND_DIR = path.resolve(here, '../../frontend');

export function createApp({ db, photos, mailer, passcode = process.env.STAFF_PASSCODE, publicUrl = process.env.PUBLIC_URL }) {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(staffAuth(passcode));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiRouter({ db, photos, mailer, publicUrl }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API が見つかりません' }));

  // お客様用の引換券ページ（メールのリンク先）
  app.get('/t/:token', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'ticket.html')));
  app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));

  // エラーは JSON で返す。想定外のエラーの詳細は画面に出さず、ログにだけ出す。
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'ファイルが大きすぎます' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON の形式が正しくありません' });
    const pgErrors = { 23503: '関連するデータが見つかりません', 23514: '入力内容がルールに合いません', '22P02': '入力形式が正しくありません' };
    if (pgErrors[err.code]) return res.status(400).json({ error: pgErrors[err.code] });
    console.error(err);
    res.status(500).json({ error: 'サーバーでエラーが発生しました' });
  });

  return app;
}

async function main() {
  // Cloud Run 上（K_SERVICE がある）では、設定漏れのまま動かないようにする
  if (process.env.K_SERVICE) {
    const missing = ['DB_HOST', 'DB_PASSWORD', 'PHOTO_BUCKET', 'STAFF_PASSCODE'].filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Cloud Run の環境変数が足りません: ${missing.join(', ')}`);
  }
  const local = !process.env.DB_HOST;
  const db = await createDb({ local, dataDir: local ? path.join(BACKEND_DIR, '.data', 'pglite') : undefined });
  const photos = await createPhotoStore({ localDir: path.join(BACKEND_DIR, '.data', 'photos') });
  const mailer = createMailer();
  const app = createApp({ db, photos, mailer });
  const port = Number(process.env.PORT || 8080);
  app.listen(port, () => {
    console.log(`スマートクローク起動: http://localhost:${port}`);
    console.log(`  DB: ${db.kind} / 写真: ${photos.kind} / メール: ${mailer.enabled ? '送信する' : '送信しない'}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
