// 荷物タグの印刷ページ。タグのQRには荷物のトークン（tag_token）だけを入れる。
import { api, esc, qrUrl } from './common.js';

const id = new URLSearchParams(location.search).get('deposit');
const box = document.getElementById('labels');

try {
  const deposit = await api(`/deposits/${encodeURIComponent(id)}`);
  const total = deposit.items.length;
  const surname = deposit.guest_name.split(/\s/)[0];
  box.innerHTML = deposit.items
    .map(
      (it, i) => `<div class="label">
        <img src="${qrUrl(it.tag_token)}" alt="">
        <div>
          <div class="shelf">${esc(it.location_code ?? '—')}</div>
          <div class="type">${esc(it.item_type)}</div>
          <div class="guest">${esc(surname)} 様</div>
          <div class="count">${i + 1} / ${total}</div>
          <div class="brand">LUGGAGE CLOAK</div>
        </div>
      </div>`,
    )
    .join('');
  document.getElementById('print').addEventListener('click', () => window.print());
} catch (err) {
  box.innerHTML = `<div class="error">${esc(err.message)}</div>`;
}
