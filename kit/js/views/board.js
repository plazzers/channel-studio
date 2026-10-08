// Board: every video across the production stages.

import * as store from '../store.js';
import { matchesChannel } from '../ctx.js';
import { STATUSES, statusLabel, findSimilar, videoTitle } from '../logic.js';
import { $, $$, esc, toast, fmtDate } from '../util.js';
import { channelOptions, defaultChannelId, chDot, noChannelHtml } from './common.js';

let root;
let query = '';

export function topicItems() {
  return [
    ...store.state.videos.map((v) => ({ id: v.id, href: `#/video/${v.id}`, channelId: v.channelId, texts: [v.title, ...(v.titles || [])].filter((t) => t && t.trim()) })),
    ...store.state.topics.map((t) => ({ id: t.id, href: '#/topics', channelId: t.channelId, texts: [t.text] })),
  ];
}

/** "Similar to: …" box, or '' when nothing is similar. */
export function similarHtml(title, { excludeId } = {}) {
  const hits = findSimilar(title, topicItems(), { min: 3, excludeId });
  if (!hits.length) return '';
  const rows = hits
    .slice(0, 3)
    .map((h) => `<li><a href="${esc(h.item.href)}">${chDot(h.item.channelId)} ${esc(h.text)}</a> <span class="muted">shares: ${esc(h.shared.join(', '))}</span></li>`)
    .join('');
  return `<div class="similar-box" role="status"><strong>Similar to:</strong><ul>${rows}</ul></div>`;
}

export function render(el) {
  root = el;
  if (!store.state.channels.length) {
    el.innerHTML = noChannelHtml('the board');
    return;
  }
  el.innerHTML = `
    <section class="board-view">
      <div class="pagehead"><h1>Board</h1>
        <div class="filters"><label for="b-search" class="sr">Search</label><input id="b-search" type="search" placeholder="Search videos…" value="${esc(query)}" /></div>
      </div>
      <form class="quickadd panel" id="quickadd" autocomplete="off">
        <label for="qa-title" class="sr">New video idea</label>
        <input id="qa-title" placeholder="+ New video idea…" maxlength="140" />
        <label for="qa-ch" class="sr">Channel</label>
        <select id="qa-ch">${channelOptions(defaultChannelId())}</select>
        <button class="btn primary" type="submit">Add idea</button>
        <div id="qa-similar" class="qa-similar"></div>
      </form>
      <nav class="stagejump" aria-label="Jump to stage">${STATUSES.map((s) => `<button type="button" data-jump="${s.id}">${esc(s.label)}</button>`).join('')}</nav>
      <div class="board" id="board"></div>
    </section>`;
  const title = $('#qa-title', el);
  title.addEventListener('input', () => ($('#qa-similar', el).innerHTML = similarHtml(title.value)));
  $('#quickadd', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) {
      toast('Type a title first', 'info');
      title.focus();
      return;
    }
    const ch = store.channel($('#qa-ch', el).value);
    const v = store.newVideo({ channelId: ch.id, title: t, titles: [t, '', ''] });
    v.prompt.audience = ch.audience || '';
    v.prompt.minutes = ch.defaultLength || 10;
    v.description.products = (ch.products || []).map((p) => p.id);
    await store.save('videos', v);
    title.value = '';
    $('#qa-similar', el).innerHTML = '';
    toast('Idea added');
    draw();
    title.focus();
  });
  $('#b-search', el).addEventListener('input', (e) => {
    query = e.target.value;
    draw();
  });
  $('.stagejump', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]');
    if (b) $(`[data-col="${b.dataset.jump}"]`, el).scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  });
  bind($('#board', el));
  draw();
}

function draw() {
  const q = query.trim().toLowerCase();
  const vids = store.state.videos.filter(matchesChannel).filter((v) => !q || [v.title, ...(v.titles || [])].join(' ').toLowerCase().includes(q));
  $('#board', root).innerHTML = STATUSES.map((s) => {
    const list = vids.filter((v) => v.status === s.id).sort((a, b) => (s.id === 'published' ? (b.publishDate || '').localeCompare(a.publishDate || '') : (a.order ?? 0) - (b.order ?? 0)));
    return `<section class="col" data-col="${s.id}" aria-label="${esc(s.label)}">
      <header><h2>${esc(s.label)}</h2><span class="count">${list.length}</span></header>
      <div class="cards" data-drop="${s.id}">${list.map(card).join('') || '<p class="empty-col">Drop a card here</p>'}</div>
    </section>`;
  }).join('');
}

function card(v) {
  const shorts = store.state.shorts.filter((s) => s.videoId === v.id).length;
  const opts = STATUSES.map((s) => `<option value="${s.id}" ${s.id === v.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
  return `<article class="vcard" draggable="true" data-id="${esc(v.id)}">
    <a class="vtitle" href="#/video/${esc(v.id)}">${chDot(v.channelId)}${esc(videoTitle(v))}</a>
    <div class="vmeta">
      ${v.publishDate ? `<span class="pill">${esc(fmtDate(v.publishDate))}</span>` : ''}
      ${shorts ? `<span class="pill">${shorts} Short${shorts > 1 ? 's' : ''}</span>` : ''}
      <label class="move"><span class="sr">Move to</span><select data-move="${esc(v.id)}" aria-label="Move to stage">${opts}</select></label>
    </div>
  </article>`;
}

async function moveTo(id, status) {
  const v = store.video(id);
  if (!v || v.status === status) return;
  store.setStatus(v, status);
  v.order = -Date.now();
  await store.save('videos', v, { silent: true });
  toast(`Moved to ${statusLabel(status)}`);
  draw();
}

function bind(boardEl) {
  boardEl.addEventListener('change', (e) => {
    const s = e.target.closest('[data-move]');
    if (s) moveTo(s.dataset.move, s.value);
  });
  boardEl.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.vcard');
    if (!c) return;
    e.dataTransfer.setData('text/plain', c.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    c.classList.add('dragging');
  });
  boardEl.addEventListener('dragend', () => $$('.dragging, .over', boardEl).forEach((x) => x.classList.remove('dragging', 'over')));
  boardEl.addEventListener('dragover', (e) => {
    const z = e.target.closest('[data-drop]');
    if (!z) return;
    e.preventDefault();
    $$('.over', boardEl).forEach((x) => x !== z && x.classList.remove('over'));
    z.classList.add('over');
  });
  boardEl.addEventListener('drop', (e) => {
    const z = e.target.closest('[data-drop]');
    if (!z) return;
    e.preventDefault();
    moveTo(e.dataTransfer.getData('text/plain'), z.dataset.drop);
  });
}

export function cleanup() {}
