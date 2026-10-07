// Topic memory: every title and topic ever used, per channel, plus a
// "would this repeat an old video?" checker.

import * as store from '../store.js';
import { ui } from '../ctx.js';
import { statusLabel, videoTitle } from '../logic.js';
import { $, esc, fmtDate } from '../util.js';
import { similarHtml } from './board.js';

let query = '';

export function render(el) {
  const chans = Object.values(store.state.channels).filter((c) => ui.channel === 'both' || c.id === ui.channel);
  el.innerHTML = `
    <section class="topics-view">
      <h1>Topic memory</h1>
      <div class="panel">
        <label class="field"><span>Check a new idea</span>
          <input id="tp-check" placeholder="Type a title to see if it repeats an old one…" /></label>
        <div id="tp-similar"><p class="muted">Shows "Similar to: …" when 3 or more meaningful words match an existing title.</p></div>
      </div>
      <div class="filters">
        <label for="tp-search" class="sr">Search topics</label>
        <input id="tp-search" data-search type="search" placeholder="Search titles… (press /)" value="${esc(query)}" />
      </div>
      <div class="topic-cols ${chans.length === 1 ? 'one' : ''}" id="tp-cols"></div>
    </section>`;
  $('#tp-check', el).addEventListener('input', (e) => {
    const html = similarHtml(e.target.value);
    $('#tp-similar', el).innerHTML =
      html || (e.target.value.trim() ? '<p class="good">✓ Nothing similar found.</p>' : '<p class="muted">Shows "Similar to: …" when 3 or more meaningful words match an existing title.</p>');
  });
  $('#tp-search', el).addEventListener('input', (e) => {
    query = e.target.value;
    paint();
  });
  const paint = () => {
    const q = query.trim().toLowerCase();
    $('#tp-cols', el).innerHTML = chans
      .map((c) => {
        const vids = store.state.videos
          .filter((v) => v.channel === c.id)
          .filter((v) => !q || [v.title, ...(v.titles || [])].join(' ').toLowerCase().includes(q))
          .sort((a, b) => (b.publishDate || b.createdAt || '').localeCompare(a.publishDate || a.createdAt || ''));
        return `<div class="panel topic-col" data-ch="${c.id}">
          <div class="panel-head"><h2><span class="tag">${esc(c.short)}</span> ${esc(c.name)}</h2><span class="count">${vids.length}</span></div>
          ${
            vids.length
              ? `<ul class="topic-list">${vids
                  .map((v) => {
                    const others = [...new Set([v.title, ...(v.titles || [])].filter((t) => t && t.trim() && t !== videoTitle(v)))];
                    return `<li><a href="#/video/${esc(v.id)}"><span class="t">${esc(videoTitle(v))}</span>
                      <span class="st ${v.status}">${esc(statusLabel(v.status))}${v.publishDate ? ' · ' + esc(fmtDate(v.publishDate, true)) : ''}</span></a>
                      ${others.length ? `<div class="alts">Also: ${others.map(esc).join(' · ')}</div>` : ''}</li>`;
                  })
                  .join('')}</ul>`
              : '<p class="muted">No titles yet.</p>'
          }
        </div>`;
      })
      .join('');
  };
  paint();
}

export function cleanup() {}
