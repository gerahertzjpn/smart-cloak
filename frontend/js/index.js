import { api, initPage, state, toast, showError, esc } from './common.js';

const meta = await initPage();

const labels = {
  db: { pglite: 'ローカル（このPCのテスト用DB）', cloudsql: 'Cloud SQL' },
  storage: { local: 'ローカル（このPCのフォルダ）', 'cloud-storage': 'Cloud Storage' },
};
document.getElementById('status').innerHTML = `
  <dt>データベース</dt><dd>${esc(labels.db[meta.db] ?? meta.db)}</dd>
  <dt>写真の保存先</dt><dd>${esc(labels.storage[meta.storage] ?? meta.storage)}</dd>
  <dt>引換券メール</dt><dd>${meta.mailEnabled ? '送信する' : '送信しない（画面のQRを使う）'}</dd>`;

document.getElementById('event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const event = await api('/events', {
      method: 'POST',
      body: {
        name: document.getElementById('ev-name').value,
        venue: document.getElementById('ev-venue').value,
        starts_at: document.getElementById('ev-start').value,
      },
    });
    state.eventId = event.event_id; // 登録したイベントを選択状態にする
    toast(`「${event.name}」を登録しました`);
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    showError(err);
  }
});
