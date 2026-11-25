// 荷物の写真の保存先。
// - PHOTO_BUCKET が設定されている → Cloud Storage のバケットに保存する。
// - 設定がない（自分のPC）→ backend/.data/photos フォルダに保存する。
// DB（item_photos.storage_path）には保存先のパスだけを記録する。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png' };

export async function createPhotoStore({ bucket = process.env.PHOTO_BUCKET, localDir } = {}) {
  return bucket ? createGcsStore(bucket) : createLocalStore(localDir);
}

async function createGcsStore(bucketName) {
  const { Storage } = await import('@google-cloud/storage');
  const bucket = new Storage().bucket(bucketName);
  const prefix = `gs://${bucketName}/`;
  return {
    kind: 'cloud-storage',
    async save(itemId, buffer, contentType) {
      const name = `photos/${itemId}/${crypto.randomUUID()}.${EXT[contentType] ?? 'jpg'}`;
      await bucket.file(name).save(buffer, { contentType, resumable: false });
      return prefix + name;
    },
    async read(storagePath) {
      if (!storagePath.startsWith(prefix)) return null;
      try {
        const [data] = await bucket.file(storagePath.slice(prefix.length)).download();
        return data;
      } catch (err) {
        if (err.code === 404) return null;
        throw err;
      }
    },
  };
}

function createLocalStore(localDir) {
  fs.mkdirSync(localDir, { recursive: true });
  return {
    kind: 'local',
    async save(itemId, buffer, contentType) {
      const name = `${itemId}-${crypto.randomUUID()}.${EXT[contentType] ?? 'jpg'}`;
      await fs.promises.writeFile(path.join(localDir, name), buffer);
      return `local:${name}`;
    },
    async read(storagePath) {
      if (!storagePath.startsWith('local:')) return null; // テストデータの gs://... は手元にない
      const name = path.basename(storagePath.slice('local:'.length));
      return fs.promises.readFile(path.join(localDir, name)).catch(() => null);
    },
  };
}

export function contentTypeOf(storagePath) {
  return storagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
}
