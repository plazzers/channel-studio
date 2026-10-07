// Weekly review: what went out this week, what's coming in the next 14 days,
// cards stuck in a stage, a note per ISO week, and typed-in stats with a
// tiny sparkline per channel.

import * as store from '../store.js';
import { ui, matchesChannel } from '../ctx.js';
import {
  isoWeek,
  parseWeekKey,
  weekStart,
  weekDays,
  shiftWeek,
  addDays,
  inRange,
  stuckVideos,
  lastWeeks,
  weeklySeries,
  sparkPoints,
  statusLabel,
  videoTitle,
} from '../logic.js';
import { $, esc, fmtDate, fmtTime, todayISO, debounce, pref } from '../util.js';

const METRICS = [
  { id: 'views', label: 'Views', step: '1' },
  { id: 'watchHours', label: 'Watch hours', step: '0.1' },
  { id: 'subs', label: 'Subs gained', step: '1' },
  { id: 'ctr', label: 'CTR %', step: '0.1' },
  { id: 'sales', label: 'Sales', step: '1' },
];
const SPARK_WEEKS = 8;
let metric = pref.get('weekMetric', 'views');

const shortChannel = (s) => store.getVideo(s.videoId)?.channel || s.channel;

export function render(el, r) {
  cleanup();
  const today = todayISO();
  const thisWeek = isoWeek(today).key;
  const week = parseWeekKey(r.params.w) ? r.params.w : thisWeek;
  const [from, to] = [weekStart(week), weekDays(week)[6]];
  const chans = Object.values(store.state.channels).filter((c) => ui.channel === 'both' || c.id === ui.channel);
  const vids = store.state.videos.filter(matchesChannel);
  const shorts = store.state.shorts.filter((s) => matchesChannel({ channel: shortChannel(s) }));

  /* published this week */
  const pubV = vids.filter((v) => v.status === 'published' && inRange(v.publishDate, from, to));
  const pubS = shorts.filter((s) => s.status === 'posted' && inRange(s.postedDate, from, to));
  const pubPanels = chans
    .map((c) => {
      const pv = pubV.filter((v) => v.channel === c.id);
      const ps = pubS.filter((s) => shortChannel(s) === c.id);
      return `<div class="panel" data-ch="${c.id}">
        <div class="panel-head"><h3><span class="tag">${esc(c.short)}</span> Published</h3>
          <span class="pubcount" data-pub="${c.id}"><b>${pv.length}</b> video${pv.length === 1 ? '' : 's'} · <b>${ps.length}</b> Short${ps.length === 1 ? '' : 's'}</span></div>
        ${pv.length || ps.length ? `<ul class="agenda-list">${pv.map((v) => row(v.publishDate, v.publishTime, `#/video/${v.id}`, videoTitle(v), 'Video', 'published', c)).join('')}${ps
          .map((s) => row(s.postedDate, '', `#/video/${s.videoId}/shorts?s=${s.id}`, s.title || s.hook || 'Untitled Short', 'Short', 'posted', c))
          .join('')}</ul>` : '<p class="muted">Nothing published this week.</p>'}
      </div>`;
    })
    .join('');

  /* next 14 days */
  const until = addDays(today, 13);
  const nextItems = [
    ...vids.filter((v) => v.status !== 'published' && inRange(v.publishDate, today, until)).map((v) => ({ date: v.publishDate, time: v.publishTime, href: `#/video/${v.id}`, title: videoTitle(v), kind: 'Video', st: statusLabel(v.status), ch: v.channel })),
    ...shorts.filter((s) => s.status !== 'posted' && inRange(s.postedDate, today, until)).map((s) => ({ date: s.postedDate, time: '', href: `#/video/${s.videoId}/shorts?s=${s.id}`, title: s.title || s.hook || 'Untitled Short', kind: 'Short', st: s.status === 'cut' ? 'Cut' : 'Planned', ch: shortChannel(s) })),
  ].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

  /* stuck */
  const stuck = stuckVideos(vids, today, 7);

  /* stats */
  const published = vids
    .filter((v) => v.status === 'published' && (!v.publishDate || v.publishDate <= to))
    .sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''));
  const weeks = lastWeeks(week, SPARK_WEEKS);
  const m = METRICS.find((x) => x.id === metric) || METRICS[0];

  const note = store.weeklyNote(week);
  el.innerHTML = `
    <section class="week-view">
      <div class="cal-head">
        <h1>Week ${+week.slice(6)} <span class="muted h1sub">${esc(fmtDate(from))} – ${esc(fmtDate(to, true))}${week === thisWeek ? ' · this week' : ''}</span></h1>
        <div class="actions">
          <a class="btn" href="#/week?w=${shiftWeek(week, -1)}" aria-label="Previous week">‹</a>
          <a class="btn" href="#/week">This week</a>
          <a class="btn" href="#/week?w=${shiftWeek(week, 1)}" aria-label="Next week">›</a>
        </div>
      </div>

      <div class="grid2">${pubPanels}</div>

      <div class="grid2">
        <div class="panel">
          <h2>Coming up — next 14 days</h2>
          ${nextItems.length ? `<ul class="agenda-list" id="wk-next">${nextItems.map((x) => row(x.date, x.time, x.href, x.title, x.kind, x.st, store.channel(x.ch))).join('')}</ul>` : '<p class="muted" id="wk-next">Nothing with a date in the next 14 days. Set publish dates on the Overview tab.</p>'}
        </div>
        <div class="panel ${stuck.length ? 'warnpanel' : ''}">
          <h2>${stuck.length ? '⚠ ' : ''}Stuck for more than 7 days</h2>
          ${stuck.length ? `<ul class="agenda-list" id="wk-stuck">${stuck.map((x) => `<li data-ch="${esc(x.video.channel)}"><a href="#/video/${esc(x.video.id)}"><span class="when">${x.days} days</span><span class="tag sm">${esc(store.channel(x.video.channel).short)}</span><span class="t">${esc(videoTitle(x.video))}</span><span class="st">in ${esc(statusLabel(x.video.status))}</span></a></li>`).join('')}</ul>` : '<p class="good" id="wk-stuck">✓ Nothing stuck. Every card moved in the last 7 days.</p>'}
        </div>
      </div>

      <div class="panel">
        <h2>Notes for week ${+week.slice(6)}</h2>
        <div class="grid2 tight">
          <label class="field"><span>What worked</span><textarea id="wk-worked" rows="4" placeholder="Titles, topics, thumbnails, Shorts that did well…">${esc(note.worked)}</textarea></label>
          <label class="field"><span>What to try next</span><textarea id="wk-try" rows="4" placeholder="One or two experiments for next week…">${esc(note.toTry)}</textarea></label>
        </div>
        <p class="hint">Saved automatically for this week (${esc(week)}).</p>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Stats for week ${+week.slice(6)}</h2>
          <label class="inline metricpick"><span>Trend</span>
            <select id="wk-metric">${METRICS.map((x) => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label></div>
        <div class="sparks" id="wk-sparks"></div>
        <p class="hint">Type this week's numbers from YouTube Studio (last 7 days) and Payhip for each published video. Each channel's line shows the last ${SPARK_WEEKS} weeks (CTR is the average, the rest are totals).</p>
        ${published.length ? `<div class="statgrid" id="wk-stats">
          <div class="statrow head" aria-hidden="true"><span>Video</span>${METRICS.map((x) => `<span>${x.label}</span>`).join('')}</div>
          ${published.map((v) => statRow(v, week)).join('')}
        </div>` : '<p class="muted">No published videos yet.</p>'}
      </div>
    </section>`;

  const paintSparks = () => {
    $('#wk-sparks', el).innerHTML = chans
      .map((c) => {
        const vals = weeklySeries(store.state.stats, weeks, m.id, { channel: c.id, videoChannel: (s) => store.getVideo(s.videoId)?.channel || s.channel });
        const segs = sparkPoints(vals, 160, 36);
        const last = vals[vals.length - 1];
        const known = vals.filter((x) => x != null);
        return `<figure class="spark" data-ch="${c.id}" data-spark="${c.id}">
          <figcaption><span class="tag sm">${esc(c.short)}</span> ${esc(m.label)}</figcaption>
          <svg viewBox="0 0 160 36" width="160" height="36" role="img" aria-label="${esc(c.short)} ${esc(m.label)} over the last ${SPARK_WEEKS} weeks: ${known.length ? vals.map((x) => (x == null ? 'no data' : x)).join(', ') : 'no data yet'}">
            <line x1="0" y1="35" x2="160" y2="35" class="base" />
            ${segs.map((p) => (p.includes(' ') ? `<polyline points="${p}" />` : `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2" />`)).join('')}
          </svg>
          <span class="sparkval">${last != null ? `<b>${last}</b> this week` : known.length ? 'no entry this week' : 'no data yet'}</span>
        </figure>`;
      })
      .join('');
  };
  paintSparks();

  let noteDirty = false;
  const writeNote = () => {
    if (!noteDirty) return;
    noteDirty = false;
    store.saveWeeklyNote(week, { worked: $('#wk-worked', el).value, toTry: $('#wk-try', el).value });
  };
  const saveNote = debounce(writeNote, 300);
  const onNote = () => {
    noteDirty = true;
    saveNote();
  };
  $('#wk-worked', el).addEventListener('input', onNote);
  $('#wk-try', el).addEventListener('input', onNote);
  $('#wk-metric', el).addEventListener('change', (e) => {
    metric = e.target.value;
    pref.set('weekMetric', metric);
    render(el, r);
  });
  const pending = new Map();
  const flushNow = async () => {
    const batch = [...pending];
    pending.clear();
    for (const [id, fields] of batch) {
      const v = store.getVideo(id);
      if (v) await store.saveStat(v, week, fields);
    }
  };
  const flush = debounce(() => flushNow().then(paintSparks), 300);
  const statsBox = $('#wk-stats', el);
  if (statsBox) {
    statsBox.addEventListener('input', (e) => {
      const k = e.target.dataset.stat;
      if (!k) return;
      const id = e.target.closest('[data-vid]').dataset.vid;
      pending.set(id, { ...(pending.get(id) || {}), [k]: e.target.value });
      flush();
    });
  }
  cleanupFns.push(() => {
    // Save anything typed in the last moment before leaving.
    flushNow();
    writeNote();
  });
}

function row(date, time, href, title, kind, st, c) {
  return `<li data-ch="${esc(c.id)}"><a href="${esc(href)}">
    <span class="when">${esc(fmtDate(date))}${time ? ` · ${esc(fmtTime(time))}` : ''}</span>
    <span class="tag sm">${esc(c.short)}</span>
    <span class="t">${esc(title)}</span>
    <span class="st ${st === 'published' || st === 'posted' ? 'published' : ''}">${esc(kind)}${st && st !== 'published' && st !== 'posted' ? ` · ${esc(st)}` : ''}</span></a></li>`;
}

function statRow(v, week) {
  const s = store.getStat(v.id, week) || {};
  const c = store.channel(v.channel);
  return `<div class="statrow" data-vid="${esc(v.id)}" data-ch="${esc(v.channel)}">
    <a class="statname" href="#/video/${esc(v.id)}"><span class="tag sm">${esc(c.short)}</span> ${esc(videoTitle(v))}${v.publishDate ? ` <span class="muted">· ${esc(fmtDate(v.publishDate))}</span>` : ''}</a>
    ${METRICS.map((m) => `<label><span class="statlabel">${m.label}</span><input type="number" min="0" step="${m.step}" inputmode="decimal" data-stat="${m.id}" value="${esc(s[m.id] ?? '')}" aria-label="${esc(m.label)} — ${esc(videoTitle(v))}" /></label>`).join('')}
  </div>`;
}

const cleanupFns = [];
export function cleanup() {
  while (cleanupFns.length) cleanupFns.pop()();
}
