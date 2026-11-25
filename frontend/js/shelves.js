// 棚の状況：棚ごとの空き状況（棚マップ）と、保管中の荷物を写真で探す画面
import { api, initPage, esc, iconFor, showError, fmtTime, photoHtml, photoUrl } from './common.js';

const meta = await initPage();
const $ = (id) => document.getElementById(id);
const AREA_NAMES = { A: 'エリア A（大：キャリー）', B: 'エリア B（中）', C: 'エリア C（小）' };

// ---------- タブ ----------
document.querySelector('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('button[data-tab]')?.dataset.tab;
  if (!tab) return;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  $('tab-map').hidden = tab !== 'map';
  $('tab-search').hidden = tab !== 'search';
  if (tab === 'search') loadSearch();
});

// ---------- 棚マップ ----------
async function loadMap() {
  try {
    const { shelves, unassigned } = await api('/locations');
    const used = shelves.reduce((n, s) => n + s.used, 0);
    const cap = shelves.reduce((n, s) => n + s.capacity, 0);
    $('summary').textContent = `保管中 ${used + unassigned.length} 点 ／ 空き ${cap - used} 枠（全 ${shelves.length} 棚）　最終更新 ${fmtTime(new Date())}`;

    $('unassigned').innerHTML = unassigned.length
      ? `<div class="alert ng"><strong>棚が割り当てられていない荷物が ${unassigned.length} 点あります。</strong>
          ${unassigned.map((it) => `${esc(it.guest_name)} 様の${esc(it.item_type)}`).join('、')}</div>`
      : '';

    const areas = [...new Set(shelves.map((s) => s.area))];
    $('areas').innerHTML = areas
      .map(
        (area) => `<h2 class="area-title">${esc(AREA_NAMES[area] ?? `エリア ${area}`)}</h2>
        <div class="shelves">
          ${shelves
            .filter((s) => s.area === area)
            .map(
              (s) => `<div class="shelf ${s.free === 0 ? 'full' : ''}">
                <div class="head"><span class="code">${esc(s.code)}</span><span class="cap">${s.used} / ${s.capacity}　${esc(s.size_class)}</span></div>
                <div class="bar"><span style="width:${(s.used / s.capacity) * 100}%"></span></div>
                <div class="mini">
                  ${s.items.length
                    ? s.items
                        .map(
                          (it) => `<div title="${esc(it.guest_name)} 様 ${esc(it.item_type)}">
                            <div class="thumb">${photoHtml(it.photo_ids, '')}</div>
                            <div class="who">${iconFor(it.item_type)} ${esc(it.guest_name.split(/\s/)[0])}</div>
                          </div>`,
                        )
                        .join('')
                    : '<span class="muted" style="font-size:12px">空き</span>'}
                </div>
              </div>`,
            )
            .join('')}
        </div>`,
      )
      .join('');
  } catch (err) {
    showError(err);
  }
}

// ---------- 写真で探す ----------
$('f-type').innerHTML += meta.itemTypes.map((t) => `<option value="${t.item_type_id}">${esc(t.name)}</option>`).join('');
$('f-event').innerHTML += meta.events.map((e) => `<option value="${e.event_id}">${esc(e.name)}</option>`).join('');
$('f-type').addEventListener('change', loadSearch);
$('f-event').addEventListener('change', loadSearch);

async function loadSearch() {
  try {
    const params = new URLSearchParams();
    if ($('f-type').value) params.set('item_type_id', $('f-type').value);
    if ($('f-event').value) params.set('event_id', $('f-event').value);
    const items = await api(`/items?${params}`);
    $('search-results').innerHTML = items.length
      ? items
          .map(
            (it) => `<div class="item-card">
              <div class="photo">${it.photo_ids.length ? `<a href="${photoUrl(it.photo_ids.at(-1))}" target="_blank" rel="noopener">${photoHtml(it.photo_ids, it.item_type)}</a>` : '<span>写真なし</span>'}</div>
              <div class="body">
                <div class="row">
                  <span class="type">${iconFor(it.item_type)} ${esc(it.item_type)}</span>
                  ${it.location_code ? `<span class="shelf-code">${esc(it.location_code)}</span>` : '<span class="shelf-code none">棚なし</span>'}
                </div>
                <div><strong>${esc(it.guest_name)}</strong> 様</div>
                <div class="muted" style="font-size:13px">${esc(it.event_name ?? '')} ${fmtTime(it.received_at)}</div>
                ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
              </div>
            </div>`,
          )
          .join('')
      : '<div class="empty">保管中の荷物はありません</div>';
  } catch (err) {
    showError(err);
  }
}

loadMap();
setInterval(() => {
  if (!$('tab-map').hidden) loadMap();
}, 15000);
