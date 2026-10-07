// Calendar: month view of scheduled and published videos.

import * as store from '../store.js';
import { matchesChannel } from '../ctx.js';
import { statusLabel, videoTitle } from '../logic.js';
import { esc, fmtTime, todayISO } from '../util.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');

export function render(el, r) {
  const today = todayISO();
  const [ty, tm] = today.split('-').map(Number);
  let [y, m] = (r.params.m || '').split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) [y, m] = [ty, tm];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  const monthKey = `${y}-${pad(m)}`;

  const vids = store.state.videos
    .filter((v) => matchesChannel(v) && (v.status === 'scheduled' || v.status === 'published') && v.publishDate)
    .sort((a, b) => (a.publishDate + a.publishTime).localeCompare(b.publishDate + b.publishTime));
  const byDay = {};
  for (const v of vids) (byDay[v.publishDate] = byDay[v.publishDate] || []).push(v);
  const undated = store.state.videos.filter((v) => matchesChannel(v) && v.status === 'scheduled' && !v.publishDate);

  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<div class="day out" aria-hidden="true"></div>');
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const items = byDay[iso] || [];
    cells.push(`<div class="day ${iso === today ? 'today' : ''} ${items.length ? 'has' : ''}">
      <span class="num">${d}</span>
      ${items.map((v) => chip(v)).join('')}
    </div>`);
  }
  while (cells.length % 7) cells.push('<div class="day out" aria-hidden="true"></div>');

  const monthItems = vids.filter((v) => v.publishDate.startsWith(monthKey));
  el.innerHTML = `
    <section class="calendar-view">
      <div class="cal-head">
        <h1>${MONTHS[m - 1]} ${y}</h1>
        <div class="actions">
          <a class="btn" href="#/calendar?m=${prev}" aria-label="Previous month">‹</a>
          <a class="btn" href="#/calendar?m=${ty}-${pad(tm)}">Today</a>
          <a class="btn" href="#/calendar?m=${next}" aria-label="Next month">›</a>
        </div>
      </div>
      <div class="legend"><span class="key" data-ch="walter"><i></i>Walter</span><span class="key" data-ch="sal"><i></i>Sal</span><span class="key pub"><i></i>Published (solid) / Scheduled (outline)</span></div>
      <div class="cal" role="grid" aria-label="${MONTHS[m - 1]} ${y}">
        ${DAYS.map((d) => `<div class="dow" role="columnheader">${d}</div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="panel agenda">
        <h2>This month</h2>
        ${monthItems.length ? `<ul class="agenda-list">${monthItems.map(agendaRow).join('')}</ul>` : '<p class="muted">Nothing scheduled or published this month.</p>'}
        ${undated.length ? `<h3>Scheduled, no date yet</h3><ul class="agenda-list">${undated.map(agendaRow).join('')}</ul>` : ''}
      </div>
    </section>`;
}

function chip(v) {
  const t = v.publishTime ? `${fmtTime(v.publishTime)} · ` : '';
  return `<a class="calchip ${v.status}" data-ch="${esc(v.channel)}" href="#/video/${esc(v.id)}" title="${esc(t + videoTitle(v))} (${esc(statusLabel(v.status))})">${esc(videoTitle(v))}</a>`;
}

function agendaRow(v) {
  const c = store.channel(v.channel);
  const [, mm, dd] = (v.publishDate || '--').split('-');
  const date = v.publishDate ? `${MONTHS[+mm - 1].slice(0, 3)} ${+dd}` : '—';
  return `<li data-ch="${esc(v.channel)}"><a href="#/video/${esc(v.id)}">
    <span class="when">${date}${v.publishTime ? ` · ${fmtTime(v.publishTime)} ET` : ''}</span>
    <span class="tag sm">${esc(c.short)}</span>
    <span class="t">${esc(videoTitle(v))}</span>
    <span class="st ${v.status}">${esc(statusLabel(v.status))}</span></a></li>`;
}

export function cleanup() {}
