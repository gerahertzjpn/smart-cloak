// 全画面で共通の処理：API呼び出し、ヘッダー（担当スタッフ・イベントの選択）、表示用の小さな関数。

// ---------- API ----------
export async function api(path, { method = 'GET', body, image } = {}) {
  const options = { method, headers: {} };
  if (image) {
    options.headers['content-type'] = image.type || 'image/jpeg';
    options.body = image;
  } else if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, options);
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(data?.error || `エラーが発生しました（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const photoUrl = (id) => `/api/photos/${id}`;
export const qrUrl = (data) => `/api/qr.svg?data=${encodeURIComponent(data)}`;

// ---------- 担当スタッフ・イベント（このPCに記憶する） ----------
const read = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key, value) => {
  try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* 保存できなくても動く */ }
};
export const state = {
  get staffId() { return Number(read('cloak.staffId')) || null; },
  set staffId(v) { write('cloak.staffId', v ? String(v) : ''); },
  get eventId() { return Number(read('cloak.eventId')) || null; },
  set eventId(v) { write('cloak.eventId', v ? String(v) : ''); },
};

// ---------- ヘッダー ----------
const PAGES = [
  ['/', 'メニュー'],
  ['/checkin.html', 'お預かり'],
  ['/checkout.html', 'お引き取り'],
  ['/shelves.html', '棚の状況'],
];

export async function initPage({ needsStaff = false } = {}) {
  const meta = await api('/meta');
  const header = document.getElementById('app-header');
  const here = location.pathname === '/index.html' ? '/' : location.pathname;
  header.className = 'app-header';
  header.innerHTML = `
    <div class="inner">
      <a class="brand" href="/">
        <div class="name">LUGGAGE CLOAK</div>
        <div class="sub">スマートお預かりシステム</div>
      </a>
      <nav class="nav">
        ${PAGES.map(([href, label]) => `<a href="${href}" class="${href === here ? 'active' : ''}">${label}</a>`).join('')}
      </nav>
      <div class="header-selects">
        ${meta.db === 'pglite' ? '<span class="mode-badge" title="自分のPCのテスト用DBで動いています">ローカル</span>' : ''}
        <label>担当スタッフ
          <select id="staff-select">
            <option value="">選んでください</option>
            ${meta.staff.map((s) => `<option value="${s.staff_id}">${esc(s.name)}</option>`).join('')}
          </select>
        </label>
        <label>イベント
          <select id="event-select">
            <option value="">指定なし</option>
            ${meta.events.map((e) => `<option value="${e.event_id}">${esc(e.name)}（${fmtDate(e.starts_at)}）</option>`).join('')}
          </select>
        </label>
      </div>
    </div>`;

  const staffSelect = header.querySelector('#staff-select');
  const eventSelect = header.querySelector('#event-select');
  if (meta.staff.some((s) => s.staff_id === state.staffId)) staffSelect.value = state.staffId;
  if (meta.events.some((e) => e.event_id === state.eventId)) eventSelect.value = state.eventId;
  const mark = () => staffSelect.classList.toggle('needs', needsStaff && !staffSelect.value);
  staffSelect.addEventListener('change', () => {
    state.staffId = staffSelect.value;
    mark();
    document.dispatchEvent(new CustomEvent('staffchange'));
  });
  eventSelect.addEventListener('change', () => { state.eventId = eventSelect.value; });
  mark();

  if (!document.getElementById('toast')) {
    const t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.append(t);
  }
  return meta;
}

// 担当スタッフが選ばれていなければ知らせる
export function requireStaff() {
  if (state.staffId) return state.staffId;
  toast('右上の「担当スタッフ」を選んでください', 'ng');
  document.getElementById('staff-select')?.focus();
  return null;
}

// ---------- 表示用 ----------
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' });
}

export function fmtTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  });
}

export const ICONS = { キャリー: '🧳', 手荷物: '👜', 紙袋: '🛍️', コート: '🧥' };
export const iconFor = (typeName) => ICONS[typeName] ?? '📦';

let toastTimer;
export function toast(message, kind = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = kind; }, 3200);
}

// スキャン結果を音で知らせる（OK：高い音1回、NG：低い音3回）
let audio;
export function beep(ok = true) {
  try {
    audio ??= new AudioContext();
    const times = ok ? [0] : [0, 0.22, 0.44];
    for (const t of times) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = ok ? 1320 : 330;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + t);
      osc.stop(audio.currentTime + t + (ok ? 0.12 : 0.18));
    }
  } catch { /* 音が出せない環境でも動く */ }
}

export function photoHtml(photoIds, alt = '') {
  return photoIds?.length
    ? `<img src="${photoUrl(photoIds[photoIds.length - 1])}" alt="${esc(alt)}" loading="lazy"
         onerror="this.replaceWith(Object.assign(document.createElement('span'), { textContent: '写真を表示できません' }))">`
    : '<span>写真なし</span>';
}

export function showError(err) {
  console.error(err);
  toast(err.message || 'エラーが発生しました', 'ng');
}
