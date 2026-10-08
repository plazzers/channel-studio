// Weekly review: what shipped, what is stuck, numbers typed in by hand
// (with 8-week sparklines) and notes for next week.

import * as store from '../store.js';
import { matchesChannel } from '../ctx.js';
import { isoWeek, weekDays, shiftWeek, lastWeeks, inRange, stuckVideos, weeklySeries, sparkPoints, videoTitle, statusLabel } from '../logic.js';
import { $, esc, todayISO, fmtDate, debounce } from '../util.js';
import { chDot } from './common.js';

const FIELDS = [
  ['views', 'Views'],
  ['watchHours', 'Watch hours'],
  ['subs', 'New subscribers'],
  ['ctr', 'CTR %'],
];
let week = null;

export function render(el) {
  if (!week) week = isoWeek(todayISO()).key;
  const days = weekDays(week);
  const from = days[0];
  const to = days[6];
  const vids = store.state.videos.filter(matchesChannel);
  const shipped = vids.filter((v) => inRange(v.publishDate, from, to));
  const stuck = stuckVideos(vids, todayISO(), 7);
  const published = vids.filter((v) => v.status === 'published' || (v.publishDate && v.publishDate <= to)).sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''));
  const weeks = lastWeeks(week, 8);
  const vidChannel = (s) => (store.video(s.videoId) || {}).channelId;
  const statsHere = store.state.stats.filter((s) => {
    const v = store.video(s.videoId);
    return v && matchesChannel(v);
  });
  const note = store.state.weekly.find((w) => w.week === week) || { week, worked: '', toTry: '' };
  el.innerHTML = `
    <section class="week-view">
      <div class="pagehead"><h1>Weekly review</h1>
        <div class="row"><button class="btn" id="w-prev" aria-label="Previous week">←</button><strong>${esc(week)} · ${esc(fmtDate(from))} – ${esc(fmtDate(to, true))}</strong><button class="btn" id="w-next" aria-label="Next week">→</button></div>
      </div>
      <div class="sparks">${FIELDS.map(([f, label]) => {
        const series = weeklySeries(statsHere, weeks, f, { channel: null, videoChannel: vidChannel });
        const segs = sparkPoints(series, 160, 40);
        const last = series[series.length - 1];
        return `<div class="panel spark"><span class="muted small">${esc(label)} · last 8 weeks</span><strong>${last == null ? '—' : esc(String(last))}</strong>
          <svg viewBox="0 0 160 40" width="160" height="40" role="img" aria-label="${esc(label)} trend">${segs.map((p) => `<polyline points="${p}" />`).join('')}</svg></div>`;
      }).join('')}</div>
      <div class="grid2">
        <div class="panel"><h2>Shipped this week</h2>
          ${shipped.length ? `<ul class="plain">${shipped.map((v) => `<li><a href="#/video/${esc(v.id)}">${chDot(v.channelId)}${esc(videoTitle(v))}</a> <span class="muted small">${esc(fmtDate(v.publishDate))}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing with a publish date this week.</p>'}
          <h2>Stuck for more than 7 days</h2>
          ${stuck.length ? `<ul class="plain">${stuck.map((s) => `<li><a href="#/video/${esc(s.video.id)}">${chDot(s.video.channelId)}${esc(videoTitle(s.video))}</a> <span class="muted small">${esc(statusLabel(s.video.status))} · ${s.days} days</span></li>`).join('')}</ul>` : '<p class="good">✓ Nothing is stuck.</p>'}
        </div>
        <div class="panel"><h2>Notes</h2>
          <label class="field"><span>What worked</span><textarea id="w-worked" rows="4">${esc(note.worked)}</textarea></label>
          <label class="field"><span>What to try next week</span><textarea id="w-try" rows="4">${esc(note.toTry)}</textarea></label>
        </div>
      </div>
      <div class="panel"><h2>Numbers this week</h2>
        <p class="muted small">Type the numbers from YouTube Studio for each video (for this week only). Empty is fine.</p>
        ${published.length ? `<div class="tablewrap"><table class="stats"><thead><tr><th>Video</th>${FIELDS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>
          ${published.map((v) => {
            const row = store.state.stats.find((s) => s.id === `${v.id}@${week}`) || {};
            return `<tr data-vid="${esc(v.id)}"><td>${chDot(v.channelId)}${esc(videoTitle(v))}</td>${FIELDS.map(([f, l]) => `<td><input type="number" step="any" min="0" data-f="${f}" value="${esc(row[f] ?? '')}" aria-label="${esc(l)}" /></td>`).join('')}</tr>`;
          }).join('')}
        </tbody></table></div>` : '<p class="muted">No published videos yet.</p>'}
      </div>
    </section>`;
  $('#w-prev', el).addEventListener('click', () => {
    week = shiftWeek(week, -1);
    render(el);
  });
  $('#w-next', el).addEventListener('click', () => {
    week = shiftWeek(week, 1);
    render(el);
  });
  // Read the fields now (the debounced save may run after leaving the page).
  const persist = debounce((row) => store.save('weekly', row, { silent: true }), 300);
  const saveNote = () => persist({ ...note, worked: $('#w-worked', el).value, toTry: $('#w-try', el).value });
  $('#w-worked', el).addEventListener('input', saveNote);
  $('#w-try', el).addEventListener('input', saveNote);
  const table = $('table.stats', el);
  if (table) {
    table.addEventListener('change', async (e) => {
      const tr = e.target.closest('[data-vid]');
      if (!tr) return;
      const id = `${tr.dataset.vid}@${week}`;
      const row = store.state.stats.find((s) => s.id === id) || { id, videoId: tr.dataset.vid, week };
      row[e.target.dataset.f] = e.target.value === '' ? '' : Number(e.target.value);
      if (FIELDS.every(([f]) => row[f] === '' || row[f] == null)) await store.remove('stats', id, { silent: true });
      else await store.save('stats', row, { silent: true });
      render(el);
    });
  }
}

export function cleanup() {}
