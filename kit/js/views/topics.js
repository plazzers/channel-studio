// Topics bank: ideas not on the board yet, with a duplicate checker.

import * as store from '../store.js';
import { matchesChannel } from '../ctx.js';
import { videoTitle } from '../logic.js';
import { $, esc, toast } from '../util.js';
import { channelOptions, defaultChannelId, chDot, noChannelHtml } from './common.js';
import { similarHtml } from './board.js';

let query = '';

export function render(el) {
  if (!store.state.channels.length) {
    el.innerHTML = noChannelHtml('the topics bank');
    return;
  }
  el.innerHTML = `
    <section class="topics-view">
      <div class="pagehead"><h1>Topics bank</h1></div>
      <form class="panel" id="t-add" autocomplete="off">
        <h2>Save a topic idea</h2>
        <div class="row wrap">
          <label class="field grow"><span>Topic</span><input id="t-text" maxlength="160" placeholder="An idea you might make later…" /></label>
          <label class="field"><span>Channel</span><select id="t-ch">${channelOptions(defaultChannelId())}</select></label>
        </div>
        <label class="field"><span>Note (optional)</span><input id="t-note" maxlength="200" placeholder="Angle, source, format…" /></label>
        <div id="t-sim"></div>
        <div class="row end"><button class="btn primary" type="submit">Save topic</button></div>
      </form>
      <div class="filters"><label for="t-search" class="sr">Search topics</label><input id="t-search" type="search" placeholder="Search topics and past titles…" value="${esc(query)}" /></div>
      <div class="grid2" id="t-lists"></div>
    </section>`;
  const text = $('#t-text', el);
  text.addEventListener('input', () => ($('#t-sim', el).innerHTML = similarHtml(text.value)));
  $('#t-add', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!text.value.trim()) return text.focus();
    await store.save('topics', { id: store.uid('t'), channelId: $('#t-ch', el).value, text: text.value.trim(), note: $('#t-note', el).value.trim() }, { silent: true });
    text.value = '';
    $('#t-note', el).value = '';
    $('#t-sim', el).innerHTML = '';
    toast('Topic saved');
    paint(el);
  });
  $('#t-search', el).addEventListener('input', (e) => {
    query = e.target.value;
    paint(el);
  });
  $('#t-lists', el).addEventListener('click', async (e) => {
    const use = e.target.closest('[data-use]');
    const del = e.target.closest('[data-del]');
    if (use) {
      const t = store.state.topics.find((x) => x.id === use.dataset.use);
      const ch = store.channel(t.channelId);
      const v = store.newVideo({ channelId: t.channelId, title: t.text, titles: [t.text, '', ''], notes: t.note || '' });
      v.prompt.audience = (ch && ch.audience) || '';
      v.prompt.minutes = (ch && ch.defaultLength) || 10;
      v.description.products = ((ch && ch.products) || []).map((p) => p.id);
      await store.save('videos', v, { silent: true });
      await store.remove('topics', t.id, { silent: true });
      toast('Moved to the board as an idea');
      location.hash = `#/video/${v.id}`;
    }
    if (del) {
      await store.remove('topics', del.dataset.del, { silent: true });
      paint(el);
    }
  });
  paint(el);
}

function paint(el) {
  const q = query.trim().toLowerCase();
  const has = (s) => !q || String(s).toLowerCase().includes(q);
  const topics = store.state.topics.filter(matchesChannel).filter((t) => has(t.text + ' ' + (t.note || '')));
  const used = store.state.videos.filter(matchesChannel).filter((v) => has([v.title, ...(v.titles || [])].join(' ')));
  $('#t-lists', el).innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Ideas</h2><span class="count">${topics.length}</span></div>
      ${topics.length ? `<ul class="topic-list">${topics.map((t) => `<li><div><span>${chDot(t.channelId)}${esc(t.text)}</span>${t.note ? `<small class="muted">${esc(t.note)}</small>` : ''}</div>
        <div class="row"><button class="btn sm" data-use="${esc(t.id)}">To board →</button><button class="iconbtn" data-del="${esc(t.id)}" aria-label="Delete topic">✕</button></div></li>`).join('')}</ul>` : '<p class="muted">No saved topics.</p>'}
    </div>
    <div class="panel"><div class="panel-head"><h2>Already on the board</h2><span class="count">${used.length}</span></div>
      ${used.length ? `<ul class="topic-list">${used.map((v) => `<li><a href="#/video/${esc(v.id)}">${chDot(v.channelId)}${esc(videoTitle(v))}</a></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}
    </div>`;
}

export function cleanup() {}
