// Board (home): kanban of all videos across the 8 production stages.

import * as store from '../store.js';
import { ui, matchesChannel } from '../ctx.js';
import { STATUSES, statusIndex, statusLabel, findSimilar, videoTitle } from '../logic.js';
import { $, $$, esc, toast, fmtDate, pref } from '../util.js';

let root;
let pendingFocus = null;
const filters = { status: pref.get('boardStatus', ''), q: '' };

export function focusNewIdea() {
  const el = $('#qa-title');
  if (el) el.focus();
  else {
    pendingFocus = 'qa-title';
    location.hash = '#/board';
  }
}

export function focusSearch() {
  pendingFocus = 'board-search';
  location.hash = '#/board';
}

export function topicItems() {
  return store.state.videos.map((v) => ({
    id: v.id,
    channel: v.channel,
    title: videoTitle(v),
    texts: [v.title, ...(v.titles || [])].filter((t) => t && t.trim()),
  }));
}

/** HTML for a "Similar to: …" warning, or '' when nothing is similar. */
export function similarHtml(title, { excludeId } = {}) {
  const hits = findSimilar(title, topicItems(), { min: 3, excludeId });
  if (!hits.length) return '';
  const rows = hits
    .slice(0, 3)
    .map((h) => {
      const c = store.channel(h.item.channel);
      return `<li><a href="#/video/${esc(h.item.id)}" data-ch="${esc(h.item.channel)}"><span class="tag sm">${esc(c.short)}</span> ${esc(h.text)}</a> <span class="muted">shares: ${esc(h.shared.join(', '))}</span></li>`;
    })
    .join('');
  return `<div class="similar-box" role="status"><strong>Similar to:</strong><ul>${rows}</ul></div>`;
}

export function render(el) {
  root = el;
  const defCh = ui.channel === 'both' ? pref.get('lastChannel', 'walter') : ui.channel;
  const chOpts = Object.values(store.state.channels)
    .map((c) => `<option value="${c.id}" ${c.id === defCh ? 'selected' : ''}>${esc(c.short)}</option>`)
    .join('');
  const stOpts = STATUSES.map(
    (s) => `<option value="${s.id}" ${s.id === filters.status ? 'selected' : ''}>${esc(s.label)}</option>`,
  ).join('');
  el.innerHTML = `
    <section class="board-view">
      <h1 class="sr">Board</h1>
      <div class="toolbar">
        <form class="quickadd" id="quickadd" autocomplete="off">
          <label for="qa-title" class="sr">New idea title</label>
          <input id="qa-title" name="title" placeholder="+ New idea… (press N)" maxlength="140" />
          <label for="qa-channel" class="sr">Channel</label>
          <select id="qa-channel" name="channel" data-ch="${esc(defCh)}">${chOpts}</select>
          <button class="btn primary" type="submit">Add idea</button>
          <div id="qa-similar" class="qa-similar"></div>
        </form>
        <div class="filters">
          <label for="board-search" class="sr">Search</label>
          <input id="board-search" data-search type="search" placeholder="Search… (press /)" value="${esc(filters.q)}" />
          <label for="board-status" class="sr">Stage</label>
          <select id="board-status"><option value="">All stages</option>${stOpts}</select>
        </div>
      </div>
      <nav class="stagejump" id="stagejump" aria-label="Jump to stage"></nav>
      <div class="board" id="board"></div>
    </section>`;

  const form = $('#quickadd', el);
  const title = $('#qa-title', el);
  const chSel = $('#qa-channel', el);
  title.addEventListener('input', () => {
    $('#qa-similar', el).innerHTML = similarHtml(title.value);
  });
  chSel.addEventListener('change', () => {
    chSel.dataset.ch = chSel.value;
    pref.set('lastChannel', chSel.value);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) {
      toast('Type a title first', 'info');
      title.focus();
      return;
    }
    await store.createVideo({ title: t, channel: chSel.value });
    pref.set('lastChannel', chSel.value);
    title.value = '';
    $('#qa-similar', el).innerHTML = '';
    toast('Idea added');
    drawColumns();
    title.focus();
  });
  $('#board-search', el).addEventListener('input', (e) => {
    filters.q = e.target.value;
    drawColumns();
  });
  $('#board-status', el).addEventListener('change', (e) => {
    filters.status = e.target.value;
    pref.set('boardStatus', filters.status);
    drawColumns();
  });

  drawColumns();
  bindBoard($('#board', el));
  $('#stagejump', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]');
    if (!b) return;
    const col = $(`.column[data-status="${b.dataset.jump}"]`, el);
    if (col) col.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
  });
  if (pendingFocus) {
    const f = $('#' + pendingFocus, el);
    pendingFocus = null;
    if (f) f.focus();
  }
}

function visibleVideos() {
  const q = filters.q.trim().toLowerCase();
  return store.state.videos.filter((v) => {
    if (!matchesChannel(v)) return false;
    if (!q) return true;
    const hay = [v.title, ...(v.titles || []), ...(v.thumbTexts || []), v.notes?.text].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));

function cardHtml(v) {
  const c = store.channel(v.channel);
  const p = store.productById(v.channel, v.product);
  const si = statusIndex(v.status);
  const dots = STATUSES.map((s, i) => `<i class="${i <= si ? 'on' : ''}"></i>`).join('');
  const items = store.state.checklist;
  const done = items.filter((it) => v.checklist?.[it.id]).length;
  const date = v.publishDate ? `<span class="date" title="Target publish date">${esc(fmtDate(v.publishDate))}</span>` : '';
  const moveOpts = STATUSES.map(
    (s) => `<option value="${s.id}" ${s.id === v.status ? 'selected' : ''}>${esc(s.label)}</option>`,
  ).join('');
  return `
    <article class="card" data-id="${esc(v.id)}" data-ch="${esc(v.channel)}" draggable="true">
      <div class="card-top"><span class="tag">${esc(c.short)}</span>${date}</div>
      <a class="card-title" href="#/video/${esc(v.id)}">${esc(videoTitle(v))}</a>
      ${p ? `<div class="card-meta" title="Product to pitch">${esc(p.emoji || '•')} ${esc(p.name)}</div>` : ''}
      <div class="card-foot">
        <span class="dots" role="img" aria-label="Stage ${si + 1} of ${STATUSES.length}: ${esc(statusLabel(v.status))}">${dots}</span>
        <span class="ckcount" title="Publish checklist">${done}/${items.length}</span>
        <label class="move"><span class="sr">Move to…</span>
          <select data-move aria-label="Move to…"><option value="" disabled>Move to…</option>${moveOpts}</select>
        </label>
      </div>
    </article>`;
}

function drawColumns() {
  const boardEl = $('#board', root);
  if (!boardEl) return;
  const vids = visibleVideos();
  const cols = filters.status ? STATUSES.filter((s) => s.id === filters.status) : STATUSES;
  boardEl.classList.toggle('single', !!filters.status);
  const jump = $('#stagejump', root);
  jump.innerHTML = cols
    .map((s) => `<button type="button" data-jump="${s.id}">${esc(s.label)} <b>${vids.filter((v) => v.status === s.id).length}</b></button>`)
    .join('');
  boardEl.innerHTML = cols
    .map((s) => {
      const list = vids.filter((v) => v.status === s.id).sort(byOrder);
      return `
      <section class="column" data-status="${s.id}" aria-label="${esc(s.label)}">
        <header><h2>${esc(s.label)}</h2><span class="count">${list.length}</span></header>
        <div class="cards" data-drop="${s.id}">
          ${list.map(cardHtml).join('') || '<p class="empty">Nothing here</p>'}
        </div>
      </section>`;
    })
    .join('');
}

async function moveVideo(id, status, beforeId) {
  const v = store.getVideo(id);
  if (!v) return;
  const col = store.state.videos.filter((x) => x.status === status && x.id !== id).sort(byOrder);
  let order;
  const idx = beforeId ? col.findIndex((x) => x.id === beforeId) : -1;
  if (idx === -1) order = col.length ? (col[col.length - 1].order ?? 0) + 1 : 0;
  else {
    const next = col[idx].order ?? 0;
    const prev = idx > 0 ? col[idx - 1].order ?? 0 : next - 2;
    order = (prev + next) / 2;
  }
  const changed = v.status !== status;
  v.status = status;
  v.order = order;
  await store.saveVideo(v, { silent: true });
  drawColumns();
  if (changed) toast(`Moved to ${statusLabel(status)}`);
}

function bindBoard(boardEl) {
  let dragId = null;

  boardEl.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-move]');
    if (!sel) return;
    const card = sel.closest('.card');
    moveVideo(card.dataset.id, sel.value, null);
  });

  boardEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  boardEl.addEventListener('dragend', () => {
    dragId = null;
    $$('.dragging, .drop-target', boardEl).forEach((n) => n.classList.remove('dragging', 'drop-target'));
  });
  boardEl.addEventListener('dragover', (e) => {
    const zone = e.target.closest('.column');
    if (!zone || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.drop-target', boardEl).forEach((n) => n !== zone && n.classList.remove('drop-target'));
    zone.classList.add('drop-target');
  });
  boardEl.addEventListener('drop', (e) => {
    const zone = e.target.closest('.column');
    const id = dragId || e.dataTransfer.getData('text/plain');
    if (!zone || !id) return;
    e.preventDefault();
    const cards = $$('.card', zone).filter((c) => c.dataset.id !== id);
    const before = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    moveVideo(id, zone.dataset.status, before ? before.dataset.id : null);
  });
}

export function cleanup() {}
