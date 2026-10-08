// Calendar: month grid of planned publish dates (videos) and scheduled pins.

import * as store from '../store.js';
import { matchesChannel } from '../ctx.js';
import { videoTitle, addDays } from '../logic.js';
import { $, esc, todayISO, pref } from '../util.js';
import { chDot } from './common.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let month = null; // "YYYY-MM"

export function render(el) {
  if (!month) month = pref.get('calMonth', todayISO().slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const startDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const gridStart = addDays(first, -startDow);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const vids = store.state.videos.filter(matchesChannel).filter((v) => v.publishDate);
  const unscheduled = store.state.videos.filter(matchesChannel).filter((v) => !v.publishDate && v.status !== 'published' && v.status !== 'idea');
  const today = todayISO();
  el.innerHTML = `
    <section class="cal-view">
      <div class="pagehead"><h1>Calendar</h1>
        <div class="row"><button class="btn" id="c-prev" aria-label="Previous month">←</button><strong class="cal-month">${MONTHS[m - 1]} ${y}</strong><button class="btn" id="c-next" aria-label="Next month">→</button><button class="btn ghost" id="c-today">Today</button></div>
      </div>
      <div class="calgrid" role="grid">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow" role="columnheader">${d}</div>`).join('')}
        ${days
          .map((d) => {
            const items = vids.filter((v) => v.publishDate === d).sort((a, b) => (a.publishTime || '').localeCompare(b.publishTime || ''));
            return `<div class="day ${d.slice(0, 7) !== month ? 'other' : ''} ${d === today ? 'today' : ''}" role="gridcell">
              <span class="dnum">${Number(d.slice(8))}</span>
              ${items.map((v) => `<a class="calitem st-${esc(v.status)}" href="#/video/${esc(v.id)}">${chDot(v.channelId)}${v.publishTime ? `<b>${esc(v.publishTime)}</b> ` : ''}${esc(videoTitle(v))}</a>`).join('')}
            </div>`;
          })
          .join('')}
      </div>
      <div class="panel"><h2>In production, no date yet</h2>
        ${unscheduled.length ? `<ul class="plain">${unscheduled.map((v) => `<li><a href="#/video/${esc(v.id)}">${chDot(v.channelId)}${esc(videoTitle(v))}</a></li>`).join('')}</ul>` : '<p class="muted">Everything in production has a date.</p>'}
      </div>
    </section>`;
  const go = (n) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    pref.set('calMonth', month);
    render(el);
  };
  $('#c-prev', el).addEventListener('click', () => go(-1));
  $('#c-next', el).addEventListener('click', () => go(1));
  $('#c-today', el).addEventListener('click', () => {
    month = today.slice(0, 7);
    pref.set('calMonth', month);
    render(el);
  });
}

export function cleanup() {}
