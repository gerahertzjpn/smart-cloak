// お客様用の引換券ページ（/t/<トークン>）。スタッフ用のパスコードなしで表示できる。
import { esc, qrUrl, fmtTime } from './common.js';

const token = location.pathname.split('/').pop();
const box = document.getElementById('content');

try {
  const res = await fetch(`/api/public/tickets/${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error('引換券が見つかりません。クロークスタッフにお声がけください。');
  const t = await res.json();
  const head = `<p class="guest">${esc(t.guest_name)} 様</p>
    <p class="muted">${t.event_name ? `${esc(t.event_name)}<br>` : ''}お預かり品 ${t.item_count} 点（${fmtTime(t.received_at)}）</p>`;
  box.className = '';
  box.innerHTML =
    t.status === 'returned'
      ? `${head}<p class="done">✓ すべてのお荷物を<br>お渡し済みです</p><p class="muted">ご利用ありがとうございました。</p>`
      : `${head}
        <div class="qr"><img src="${qrUrl(t.ticket_token)}" alt="引換券のQRコード"></div>
        <p>お引き取りの際は、この画面を<br>クロークスタッフにお見せください。</p>
        ${t.status === 'partially_returned' ? `<p class="muted">（残り ${t.stored_count} 点をお預かり中です）</p>` : ''}`;
} catch (err) {
  box.textContent = err.message;
}
