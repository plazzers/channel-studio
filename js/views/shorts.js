// Shorts board: every planned / cut / posted Short across videos, with a
// weekly calendar strip on top.

import * as store from '../store.js';
import { matchesChannel } from '../ctx.js';
import { SHORT_STATUSES, isoWeek, parseWeekKey, weekDays, shiftWeek, validateShortRange, videoTitle } from '../logic.js';
import { $, esc, toast, fmtDate, todayISO, pref } from '../util.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let statusFilter = pref.get('shortsStatus', '');

const channelOf = (s) => store.getVideo(s.videoId)?.channel || s.channel;
const label = (s) => s.title || s.hook || 'Untitled Short';

export function render(el, r) {
  const today = todayISO();
  const week = parseWeekKey(r.params.w) ? r.params.w : isoWeek(today).key;
  const days = weekDays(week);
  const all = store.state.shorts.filter((s) => matchesChannel({ channel: channelOf(s) }));
  const shown = all.filter((s) => !statusFilter || s.status === statusFilter);

  const strip = days
    .map((d, i) => {
      const items = all.filter((s) => s.postedDate === d);
      return `<div class="wday ${d === today ? 'today' : ''}" data-day="${d}">
        <div class="wday-head"><span>${DOW[i]}</span> <b>${+d.slice(8)}</b></div>
        ${items.map((s) => `<a class="wchip ${esc(s.status)}" data-ch="${esc(channelOf(s))}" href="#/video/${esc(s.videoId)}/shorts?s=${esc(s.id)}" title="${esc(label(s))}">${esc(label(s))}</a>`).join('') || '<span class="wnone" aria-hidden="true">·</span>'}
      </div>`;
    })
    .join('');

  const cols = (statusFilter ? SHORT_STATUSES.filter((x) => x.id === statusFilter) : SHORT_STATUSES)
    .map((st) => {
      const list = shown
        .filter((s) => s.status === st.id)
        .sort((a, b) => (a.postedDate || '9999').localeCompare(b.postedDate || '9999') || String(a.createdAt).localeCompare(String(b.createdAt)));
      return `<section class="column" data-sstatus="${st.id}" aria-label="${st.label}">
        <header><h2>${st.label}</h2><span class="count">${list.length}</span></header>
        <div class="cards">${list.map(card).join('') || '<p class="empty">Nothing here</p>'}</div>
      </section>`;
    })
    .join('');

  el.innerHTML = `
    <section class="shorts-view">
      <div class="cal-head">
        <h1>Shorts</h1>
        <div class="filters">
          <label for="sb-status" class="sr">Status</label>
          <select id="sb-status"><option value="">All statuses</option>${SHORT_STATUSES.map((x) => `<option value="${x.id}" ${x.id === statusFilter ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
        </div>
      </div>
      <div class="panel weekstrip-panel">
        <div class="panel-head">
          <h2>Week ${+week.slice(6)} <span class="muted">· ${esc(fmtDate(days[0]))} – ${esc(fmtDate(days[6], true))}</span></h2>
          <div class="actions tight">
            <a class="btn small" href="#/shorts?w=${shiftWeek(week, -1)}" aria-label="Previous week">‹</a>
            <a class="btn small" href="#/shorts">This week</a>
            <a class="btn small" href="#/shorts?w=${shiftWeek(week, 1)}" aria-label="Next week">›</a>
          </div>
        </div>
        <div class="weekstrip">${strip}</div>
        <p class="hint">Shorts show on their post date (planned or posted). Outline = planned, light = cut, solid = posted.</p>
      </div>
      <div class="board shorts-board ${statusFilter ? 'single' : ''}" id="sb-board">${cols}</div>
      ${store.state.shorts.length ? '' : '<p class="muted">No Shorts yet. Open a video and use its <strong>Shorts</strong> tab to plan up to 5.</p>'}
    </section>`;

  $('#sb-status', el).addEventListener('change', (e) => {
    statusFilter = e.target.value;
    pref.set('shortsStatus', statusFilter);
    render(el, r);
  });
  $('#sb-board', el).addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-smove]');
    if (!sel) return;
    const s = store.state.shorts.find((x) => x.id === sel.closest('[data-sid]').dataset.sid);
    s.status = sel.value;
    if (s.status === 'posted' && !s.postedDate) s.postedDate = todayISO();
    await store.saveShort(s);
    toast(`Short marked ${s.status}`);
    render(el, r);
  });
}

function card(s) {
  const v = store.getVideo(s.videoId);
  const ch = channelOf(s);
  const c = store.channel(ch);
  const rg = validateShortRange(s.range);
  return `<article class="card shortc" data-sid="${esc(s.id)}" data-ch="${esc(ch)}">
    <div class="card-top"><span class="tag">${esc(c?.short || ch)}</span>${s.postedDate ? `<span class="date">${esc(fmtDate(s.postedDate))}</span>` : ''}</div>
    <a class="card-title" href="#/video/${esc(s.videoId)}/shorts?s=${esc(s.id)}">${esc(label(s))}</a>
    <div class="card-meta">From: ${esc(v ? videoTitle(v) : '(deleted video)')}</div>
    <div class="card-meta ${rg.ok || rg.empty ? '' : 'badtext'}">${s.range ? `${esc(s.range)}${rg.duration > 0 ? ` · ${rg.duration} s` : ''}${rg.ok ? '' : ' ⚠'}` : 'No time range yet'}</div>
    <div class="card-foot">
      <label class="move"><span class="sr">Status</span>
        <select data-smove aria-label="Status">${SHORT_STATUSES.map((x) => `<option value="${x.id}" ${x.id === s.status ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
      </label>
    </div>
  </article>`;
}

export function cleanup() {}
