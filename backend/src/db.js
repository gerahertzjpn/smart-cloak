// データベース接続。
// - DB_HOST が設定されている → Cloud SQL（PostgreSQL）に app_user で接続する。
// - DB_HOST がない（自分のPC）→ PGlite（PC内で動く PostgreSQL）を使う。インストール不要。
//
// どちらも同じ形で使える：
//   await db.query(sql, params)        … 結果の行（配列）を返す
//   await db.tx(async (q) => { ... })   … 1つのトランザクションで実行する
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(here, '../../db');

export async function createDb({ local = !process.env.DB_HOST, dataDir, withTestData = true } = {}) {
  return local ? createLocalDb({ dataDir, withTestData }) : createCloudDb();
}

async function createCloudDb() {
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT を数値として受け取る
  const pool = new pg.Pool({
    host: process.env.DB_HOST, // Cloud Run では /cloudsql/プロジェクト:リージョン:インスタンス
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'app_user',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'smartcloak',
    max: 5,
  });
  const query = async (sql, params = []) => (await pool.query(sql, params)).rows;
  const tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(async (sql, params = []) => (await client.query(sql, params)).rows);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
  return { kind: 'cloudsql', query, tx, close: () => pool.end() };
}

async function createLocalDb({ dataDir, withTestData }) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const db = dataDir ? new PGlite(dataDir) : new PGlite(); // dataDir なし＝メモリ上（テスト用）
  await migrateLocal(db, withTestData);
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const tx = (fn) =>
    db.transaction(async (t) => fn(async (sql, params = []) => (await t.query(sql, params)).rows));
  return { kind: 'pglite', query, tx, close: () => db.close() };
}

// ローカル専用：まだ適用していないマイグレーションを番号順に適用する。
// 初回だけ seed.sql（マスタ）と seed_test.sql（テスト用のお客様）も入れる。
// ※ Cloud SQL では、DB担当が手動で適用する（AGENTS.md を参照）。
async function migrateLocal(db, withTestData) {
  const [{ t: exists }] = (await db.query(`SELECT to_regclass('schema_migrations')::text AS t`)).rows;
  const applied = new Set(
    exists ? (await db.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version) : [],
  );
  const files = fs
    .readdirSync(path.join(DB_DIR, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (applied.has(file.replace(/\.sql$/, ''))) continue;
    await db.exec(fs.readFileSync(path.join(DB_DIR, 'migrations', file), 'utf8'));
    console.log(`[db] マイグレーションを適用しました: ${file}`);
  }
  if (!exists) {
    const seeds = withTestData ? ['seed.sql', 'seed_test.sql'] : ['seed.sql'];
    for (const file of seeds) {
      await db.exec(fs.readFileSync(path.join(DB_DIR, file), 'utf8'));
      console.log(`[db] データを投入しました: ${file}`);
    }
  }
}
