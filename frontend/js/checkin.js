// お預かり画面：お客様情報 → 荷物を撮影して追加 → 確定（棚の自動割り当て）→ 引換券・タグ印刷
import { api, initPage, state, requireStaff, esc, iconFor, toast, showError, qrUrl, photoHtml } from './common.js';

const meta = await initPage({ needsStaff: true });
const $ = (id) => document.getElementById(id);

/** @type {{ typeId:number, typeName:string, note:string, photo:Blob|null, preview:string|null }[]} */
let items = [];
let lastDeposit = null;

// ---------- ステップ表示 ----------
function updateSteps() {
  const resultShown = !$('result').hidden;
  const hasName = $('guest-name').value.trim() !== '';
  const current = resultShown ? 4 : !hasName ? 1 : items.length === 0 ? 2 : 3;
  for (const li of $('steps').children) {
    const n = Number(li.dataset.step);
    li.className = n < current ? 'done' : n === current ? 'current' : '';
  }
}
$('guest-name').addEventListener('input', updateSteps);

// ---------- カメラ ----------
const video = $('video');
async function startCamera() {
  $('camera-retry').hidden = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } } });
    video.srcObject = stream;
    video.hidden = false;
    $('camera-msg').hidden = true;
  } catch (err) {
    console.warn(err);
    video.hidden = true;
    $('camera-msg').hidden = false;
    $('camera-msg').textContent = 'カメラを使えません（写真なしでも登録できます）。ブラウザのカメラ許可を確認してください。';
    $('camera-retry').hidden = false;
  }
}
$('camera-retry').addEventListener('click', startCamera);
startCamera();

// 今のカメラ映像を JPEG にする。カメラがなければ null。
function capture() {
  if (video.hidden || !video.videoWidth) return Promise.resolve(null);
  const scale = Math.min(1, 1280 / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  $('flash').classList.add('on');
  setTimeout(() => $('flash').classList.remove('on'), 60);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

// ---------- 荷物の種類ボタン ----------
$('type-cards').innerHTML = meta.itemTypes
  .map(
    (t) => `<button type="button" class="type-card" data-id="${t.item_type_id}" data-name="${esc(t.name)}">
      <div class="icon">${iconFor(t.name)}</div>
      <div class="label">${esc(t.name)}</div>
      <div class="size">棚サイズ ${esc(t.size_class)}</div>
    </button>`,
  )
  .join('');

$('type-cards').addEventListener('click', async (e) => {
  const card = e.target.closest('.type-card');
  if (!card) return;
  const photo = await capture();
  items.push({
    typeId: Number(card.dataset.id),
    typeName: card.dataset.name,
    note: '',
    photo,
    preview: photo ? URL.createObjectURL(photo) : null,
  });
  renderItems();
});

function renderItems() {
  $('item-total').textContent = items.length;
  $('item-rows').innerHTML = items.length
    ? items
        .map(
          (it, i) => `<div class="item-row" data-index="${i}">
            <div class="thumb">${it.preview ? `<img src="${it.preview}" alt="">` : '写真なし'}</div>
            <div class="meta">
              <div>${iconFor(it.typeName)} ${esc(it.typeName)} <span class="muted">（${i + 1}点目）</span></div>
              <input type="text" class="item-note" placeholder="メモ（割れ物 など）" value="${esc(it.note)}" maxlength="200">
            </div>
            <div class="row-actions actions">
              <button type="button" class="btn btn-small" data-action="retake">📷 撮り直す</button>
              <button type="button" class="btn btn-small" data-action="remove">削除</button>
            </div>
          </div>`,
        )
        .join('')
    : '<div class="empty">まだ荷物がありません。上の種類ボタンを押してください。</div>';
  updateSteps();
}

$('item-rows').addEventListener('input', (e) => {
  if (!e.target.classList.contains('item-note')) return;
  items[Number(e.target.closest('.item-row').dataset.index)].note = e.target.value;
});

$('item-rows').addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const index = Number(button.closest('.item-row').dataset.index);
  if (button.dataset.action === 'remove') {
    items.splice(index, 1);
  } else {
    const photo = await capture();
    if (!photo) return toast('カメラが使えないため撮影できません', 'ng');
    items[index].photo = photo;
    items[index].preview = URL.createObjectURL(photo);
  }
  renderItems();
});

// ---------- 確定 ----------
function formError(message) {
  $('form-error').hidden = !message;
  $('form-error').textContent = message ?? '';
}

$('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  formError(null);
  const staffId = requireStaff();
  if (!staffId) return formError('右上の「担当スタッフ」を選んでください。');
  if (!$('guest-name').value.trim()) {
    $('guest-name').focus();
    return formError('お名前を入力してください。');
  }
  if (items.length === 0) return formError('荷物を1点以上追加してください。');

  const button = $('submit-btn');
  button.disabled = true;
  button.textContent = '登録しています…';
  try {
    const { deposit, mail } = await api('/deposits', {
      method: 'POST',
      body: {
        guest_name: $('guest-name').value,
        guest_email: $('guest-email').value,
        note: $('deposit-note').value,
        event_id: state.eventId,
        staff_id: staffId,
        items: items.map((it) => ({ item_type_id: it.typeId, note: it.note })),
      },
    });
    // 写真をアップロード（荷物の順番は登録順と同じ）
    let photoErrors = 0;
    for (const [i, item] of deposit.items.entries()) {
      if (!items[i].photo) continue;
      try {
        const { photo_id } = await api(`/items/${item.item_id}/photos`, { method: 'POST', image: items[i].photo });
        item.photo_ids = [photo_id];
      } catch (err) {
        console.error(err);
        photoErrors += 1;
      }
    }
    if (photoErrors) toast(`写真 ${photoErrors} 枚のアップロードに失敗しました`, 'ng');
    showResult(deposit, mail);
  } catch (err) {
    formError(err.message);
    showError(err);
  } finally {
    button.disabled = false;
    button.textContent = 'お預かりを確定する';
  }
});

// ---------- 確定後 ----------
function mailText(deposit, mail) {
  if (mail.sent) return `✉ ${deposit.guest_email} に引換券を送信しました。`;
  if (!deposit.guest_email) return 'メールアドレスがないため、このQRをお客様のスマートフォンで撮影していただいてください。';
  return `⚠ メールを送信できませんでした（${mail.reason}）。このQRを撮影していただいてください。`;
}

function showResult(deposit, mail) {
  lastDeposit = deposit;
  $('checkin-form').hidden = true;
  $('result').hidden = false;
  $('ticket-qr').src = qrUrl(deposit.ticket_token);
  $('result-guest').textContent = `${deposit.guest_name} 様（${deposit.items.length}点）`;
  $('mail-status').textContent = mailText(deposit, mail);
  $('resend-btn').hidden = !deposit.guest_email;
  $('ticket-link').href = deposit.ticket_url;
  $('print-btn').href = `/label.html?deposit=${deposit.deposit_id}`;
  $('result-items').innerHTML = deposit.items
    .map(
      (it, i) => `<div class="item-card">
        <div class="photo">${photoHtml(it.photo_ids, it.item_type)}</div>
        <div class="body">
          <div class="row">
            <span class="type">${iconFor(it.item_type)} ${esc(it.item_type)}（${i + 1}/${deposit.items.length}）</span>
            ${it.location_code
              ? `<span class="shelf-code">${esc(it.location_code)}</span>`
              : '<span class="shelf-code none">空き棚なし</span>'}
          </div>
          ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
        </div>
      </div>`,
    )
    .join('');
  if (deposit.items.some((it) => !it.location_code)) {
    toast('空いている棚がない荷物があります。責任者に確認してください。', 'ng');
  }
  updateSteps();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('resend-btn').addEventListener('click', async () => {
  try {
    const mail = await api(`/deposits/${lastDeposit.deposit_id}/send-ticket`, { method: 'POST' });
    $('mail-status').textContent = mailText(lastDeposit, mail);
    toast(mail.sent ? 'メールを送信しました' : mail.reason, mail.sent ? 'ok' : 'ng');
  } catch (err) {
    showError(err);
  }
});

$('next-btn').addEventListener('click', () => {
  items = [];
  lastDeposit = null;
  $('checkin-form').reset();
  $('checkin-form').hidden = false;
  $('result').hidden = true;
  renderItems();
  $('guest-name').focus();
  window.scrollTo({ top: 0 });
});

renderItems();
$('guest-name').focus();
