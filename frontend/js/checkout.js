// お引き取り画面：引換券QR → 荷物の表示（写真・棚）→ タグで照合 → お渡し
// ハンドスキャナーはキーボードと同じように「文字＋Enter」を入力するので、入力欄で受け取る。
import { api, initPage, state, requireStaff, esc, iconFor, toast, showError, beep, fmtTime, photoHtml } from './common.js';

await initPage({ needsStaff: true });
const $ = (id) => document.getElementById(id);

let deposit = null;
const verified = new Set(); // 照合OKの item_id

// ---------- ステップ表示 ----------
function updateSteps() {
  const stored = deposit?.items.filter((i) => i.status === 'stored') ?? [];
  const current = !deposit ? 1 : stored.length === 0 ? 5 : verified.size === 0 ? 2 : 4;
  for (const li of $('steps').children) {
    const n = Number(li.dataset.step);
    li.className = n < current ? 'done' : n === current || (current === 2 && n === 3) ? 'current' : '';
  }
}

// ---------- 1. 引換券 ----------
async function openTicket(tokenText) {
  try {
    deposit = await api(`/tickets/${encodeURIComponent(tokenText)}?staff_id=${state.staffId ?? ''}`);
    verified.clear();
    beep(true);
    render();
  } catch (err) {
    beep(false);
    showError(err);
  }
}

$('ticket-input').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const value = e.target.value.trim();
  e.target.value = '';
  if (value) openTicket(value);
});

$('name-search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('name-input').value.trim();
  if (!q) return;
  try {
    const rows = await api(`/deposits?q=${encodeURIComponent(q)}`);
    $('name-results').innerHTML = rows.length
      ? rows
          .map(
            (r) => `<button class="btn" data-token="${esc(r.ticket_token)}">
              <span><strong>${esc(r.guest_name)}</strong> 様　${r.item_count}点</span>
              <span class="muted">${esc(r.event_name ?? '')} ${fmtTime(r.received_at)}</span>
            </button>`,
          )
          .join('')
      : '<div class="empty">見つかりませんでした</div>';
  } catch (err) {
    showError(err);
  }
});
$('name-results').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-token]');
  if (b) openTicket(b.dataset.token);
});

// ---------- 2〜4. 表示 ----------
function render() {
  $('scan-ticket').hidden = !!deposit;
  $('deposit-view').hidden = !deposit;
  updateSteps();
  if (!deposit) {
    $('ticket-input').focus();
    return;
  }
  const stored = deposit.items.filter((i) => i.status === 'stored');
  $('guest-name').textContent = `${deposit.guest_name} 様`;
  $('deposit-meta').textContent = [
    deposit.event_name,
    `お預かり ${fmtTime(deposit.received_at)}（${deposit.received_by_name}）`,
    `${deposit.items.length}点`,
  ].filter(Boolean).join('　/　');
  $('deposit-note').hidden = !deposit.note;
  $('deposit-note').textContent = deposit.note ? `特記事項：${deposit.note}` : '';
  $('verify-count').textContent = `照合 ${verified.size} / ${stored.length} 点`;

  $('item-cards').innerHTML = deposit.items
    .map((it) => {
      const returned = it.status === 'returned';
      const ok = verified.has(it.item_id);
      return `<div class="item-card ${returned ? 'returned' : ok ? 'verified' : ''}" data-id="${it.item_id}">
        <div class="photo">${photoHtml(it.photo_ids, it.item_type)}</div>
        <div class="body">
          <div class="row">
            <span class="type">${iconFor(it.item_type)} ${esc(it.item_type)}</span>
            ${it.location_code ? `<span class="shelf-code">${esc(it.location_code)}</span>` : '<span class="shelf-code none">棚なし</span>'}
          </div>
          ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
          <div class="row">
            ${returned ? '<span class="badge">お渡し済み</span>' : ok ? '<span class="badge ok">✓ 照合OK</span>' : '<span class="badge">未照合</span>'}
            ${!returned && !ok ? '<button class="btn-link" data-action="photo">タグがない場合</button>' : ''}
          </div>
        </div>
      </div>`;
    })
    .join('');

  const allDone = stored.length === 0;
  $('done-msg').hidden = !allDone;
  $('tag-input').hidden = allDone;
  const count = stored.filter((i) => verified.has(i.item_id)).length;
  $('return-btn').disabled = count === 0;
  $('return-btn').textContent = allDone ? '次のお客様へ' : `照合済みの荷物をお渡しする（${count}点）`;
  if (allDone) $('return-btn').disabled = false;
  if (!allDone) $('tag-input').focus();
}

// ---------- 3. タグで照合 ----------
$('tag-input').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const tag = e.target.value.trim();
  e.target.value = '';
  if (!tag || !deposit) return;
  try {
    const result = await api(`/tickets/${deposit.ticket_token}/verify`, {
      method: 'POST',
      body: { tag, staff_id: state.staffId },
    });
    if (result.match) {
      beep(true);
      if (result.already_returned) toast(result.message, 'ng');
      else {
        verified.add(result.item_id);
        toast('照合OK');
      }
      render();
    } else {
      beep(false);
      showBigAlert(result.message);
    }
  } catch (err) {
    beep(false);
    showError(err);
  }
});

function showBigAlert(message) {
  $('big-alert-text').textContent = message;
  $('big-alert').hidden = false;
  $('big-alert-close').focus();
}
$('big-alert-close').addEventListener('click', () => {
  $('big-alert').hidden = true;
  $('tag-input').focus();
});

// タグが脱落した荷物：写真とお客様のお話で確認してからお渡し
$('item-cards').addEventListener('click', async (e) => {
  if (!e.target.matches('[data-action="photo"]')) return;
  const staffId = requireStaff();
  if (!staffId) return;
  const itemId = Number(e.target.closest('.item-card').dataset.id);
  const ok = confirm(
    'タグを読み取らずにお渡しします。\n\n写真と実物が一致し、お客様に荷物の特徴を確認できましたか？\n（この操作は記録されます）',
  );
  if (!ok) return;
  await returnItems([itemId], 'photo');
});

// ---------- 4. お渡し ----------
async function returnItems(itemIds, method) {
  const staffId = requireStaff();
  if (!staffId) return;
  try {
    for (const id of itemIds) {
      await api(`/tickets/${deposit.ticket_token}/items/${id}/return`, {
        method: 'POST',
        body: { staff_id: staffId, method },
      });
      verified.delete(id);
    }
    deposit = await api(`/tickets/${deposit.ticket_token}?staff_id=${staffId}`);
    toast(`${itemIds.length}点をお渡ししました`);
    render();
  } catch (err) {
    showError(err);
  }
}

$('return-btn').addEventListener('click', () => {
  const stored = deposit.items.filter((i) => i.status === 'stored');
  if (stored.length === 0) return reset();
  returnItems(stored.filter((i) => verified.has(i.item_id)).map((i) => i.item_id), 'tag');
});

function reset() {
  deposit = null;
  verified.clear();
  $('name-results').innerHTML = '';
  render();
}
$('cancel-btn').addEventListener('click', reset);

// スキャナーの入力を逃さないように、画面のどこかをクリックしても入力欄に戻す
document.addEventListener('click', (e) => {
  if (e.target.closest('input, textarea, select, button, a, details, .big-alert')) return;
  (deposit ? $('tag-input') : $('ticket-input')).focus();
});

render();
