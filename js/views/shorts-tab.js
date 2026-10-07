// Shorts tab on the video page: plan up to 5 Shorts cut from this video,
// plus the "Generate Shorts plan" helper (chapters -> one Short per chapter).

import * as store from '../store.js';
import {
  SHORT_STATUSES,
  MAX_SHORTS,
  SHORT_HOOK_MAX_WORDS,
  SHORT_TEXT_MAX_WORDS,
  SHORT_TITLE_MAX,
  shortsFromChapters,
  checkShort,
  buildShortDescription,
  formatProductLine,
  parseChapterText,
  formatTime,
  parseTime,
  videoTitle,
} from '../logic.js';
import { $, $$, esc, toast, copyText } from '../util.js';

export function shortText(s) {
  const c = store.channel(s.channel);
  const p = c && store.productById(s.channel, s.product);
  return buildShortDescription(s.description, p ? formatProductLine(p, c.lineFormat) : '');
}

export function renderShortsTab(panel, v, c, { touch, params = {} }) {
  const products = [...c.products].sort((a, b) => a.order - b.order);
  const longTitles = () => [videoTitle(v), v.title].filter(Boolean);
  let proposals = [];

  const shortCard = (s, i) => {
    const productOpts = products
      .map((p) => `<option value="${esc(p.id)}" ${p.id === s.product ? 'selected' : ''}>${esc(p.emoji || '')} ${esc(p.name)}${p.type === 'free' ? ' (free)' : ''}</option>`)
      .join('');
    return `<article class="panel shortcard" data-sid="${esc(s.id)}" id="short-${esc(s.id)}">
      <div class="panel-head">
        <h3>Short ${i + 1}</h3>
        <div class="inline">
          <label class="field compact"><span class="sr">Status</span>
            <select data-sf="status" class="st-${esc(s.status)}">${SHORT_STATUSES.map((x) => `<option value="${x.id}" ${x.id === s.status ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
          <button type="button" class="btn icon danger" data-sdel aria-label="Delete Short ${i + 1}">✕</button>
        </div>
      </div>
      <label class="field"><span>Hook line <small class="muted">(first 2 seconds)</small> <span class="counter" data-cnt="hook"></span></span>
        <input data-sf="hook" value="${esc(s.hook)}" placeholder="The one thing you say in the first 2 seconds" /></label>
      <div class="row2">
        <label class="field"><span>Source time range <span class="counter" data-cnt="range"></span></span>
          <input data-sf="range" value="${esc(s.range)}" placeholder="1:05–1:50" inputmode="numeric" />
          <small class="fieldmsg" data-msg="range"></small></label>
        <label class="field"><span>On-screen text <span class="counter" data-cnt="onScreen"></span></span>
          <input data-sf="onScreen" value="${esc(s.onScreen)}" placeholder="Up to 6 words" /></label>
      </div>
      <label class="field"><span>Title <span class="counter" data-cnt="title"></span></span>
        <input data-sf="title" value="${esc(s.title)}" maxlength="140" placeholder="Short title" />
        <small class="fieldmsg" data-msg="title"></small></label>
      <div class="row2">
        <label class="field"><span>Description</span>
          <textarea data-sf="description" rows="3" placeholder="One or two lines for the Short">${esc(s.description)}</textarea></label>
        <label class="field"><span>Link line</span>
          <select data-sf="product"><option value="">— no link —</option>${productOpts}</select>
          <small class="muted">Default: the free PDF.</small></label>
      </div>
      <pre class="output small" data-out aria-label="Short description preview"></pre>
      <div class="row2 end">
        <label class="field"><span>${s.status === 'posted' ? 'Posted date' : 'Post date (planned)'}</span>
          <input type="date" data-sf="postedDate" value="${esc(s.postedDate)}" /></label>
        <div class="actions">
          <button type="button" class="btn small" data-scopy="title">Copy title</button>
          <button type="button" class="btn small" data-scopy="desc">Copy description</button>
        </div>
      </div>
    </article>`;
  };

  const paintCard = (s) => {
    const card = $(`[data-sid="${s.id}"]`, panel);
    if (!card) return;
    const r = checkShort(s, longTitles());
    const set = (k, text, bad) => {
      const el = $(`[data-cnt="${k}"]`, card);
      el.textContent = text;
      el.classList.toggle('bad', !!bad);
    };
    set('hook', `${r.hookWords}/${SHORT_HOOK_MAX_WORDS} words`, !r.hookOk);
    set('onScreen', `${r.textWords}/${SHORT_TEXT_MAX_WORDS} words`, !r.textOk);
    set('title', `${r.titleLen}/${SHORT_TITLE_MAX}`, !r.titleOk);
    set('range', r.range.duration != null && r.range.duration > 0 ? `${r.range.duration} s` : '', !r.range.ok && !r.range.empty);
    const rm = $('[data-msg="range"]', card);
    rm.textContent = r.range.ok ? `✓ ${r.range.duration} seconds` : r.range.empty ? '15–60 seconds, like 1:05–1:50' : r.range.error;
    rm.className = 'fieldmsg ' + (r.range.ok ? 'good' : r.range.empty ? 'muted' : 'bad');
    $('[data-sf="range"]', card).classList.toggle('invalid', !r.range.ok && !r.range.empty);
    const tm = $('[data-msg="title"]', card);
    tm.textContent = !r.titleOk
      ? `Too long: ${r.titleLen} characters (max ${SHORT_TITLE_MAX}).`
      : !r.titleKeyword
        ? 'No keyword from the long video’s title — add one so the Short and the video connect.'
        : r.shared.length
          ? `✓ Shares: ${r.shared.join(', ')}`
          : '';
    tm.className = 'fieldmsg ' + (!r.titleOk ? 'bad' : !r.titleKeyword ? 'warn' : 'good');
    $('[data-out]', card).textContent = shortText(s) || '(description preview)';
    for (const k of ['hook', 'onScreen', 'title']) {
      const ok = k === 'hook' ? r.hookOk : k === 'onScreen' ? r.textOk : r.titleOk;
      $(`[data-sf="${k}"]`, card).classList.toggle('invalid', !ok);
    }
  };

  const paint = () => {
    const list = store.shortsFor(v.id);
    const left = MAX_SHORTS - list.length;
    panel.innerHTML = `
      <div class="grid2 wide-left">
        <div>
          <div class="panel-head"><h2>Shorts from this video <span class="count">${list.length}/${MAX_SHORTS}</span></h2>
            <div class="inline"><a class="btn small" href="#/shorts">Shorts board</a>
            <button type="button" class="btn small primary" id="sh-add" ${left ? '' : 'disabled'}>+ Add a Short</button></div></div>
          <div id="sh-list">${list.length ? list.map(shortCard).join('') : '<div class="panel"><p class="muted">No Shorts planned yet. Add one, or generate a plan from the chapters.</p></div>'}</div>
        </div>
        <div class="panel sticky">
          <h2>Generate Shorts plan</h2>
          <p class="hint">Paste the chapter list. You get one Short per chapter: the chapter name as the title, from the chapter start to the next chapter (45 seconds at most).</p>
          <label class="field"><span class="sr">Chapters</span>
            <textarea id="sh-chapters" rows="6" placeholder="0:00 Intro\n0:42 Why attics need to breathe\n3:15 Blocked soffit vents"></textarea></label>
          <div class="actions">
            <button type="button" class="btn small" id="sh-fromdesc">Use chapters from Description</button>
            <button type="button" class="btn primary" id="sh-gen">Propose Shorts</button>
          </div>
          <div id="sh-proposals"></div>
        </div>
      </div>`;
    list.forEach(paintCard);
    paintProposals();
    if (params.s) {
      const el = $(`#short-${CSS.escape(params.s)}`, panel);
      if (el) el.scrollIntoView({ block: 'start' });
      params.s = null;
    }
  };

  const paintProposals = () => {
    const box = $('#sh-proposals', panel);
    if (!proposals.length) {
      box.innerHTML = '';
      return;
    }
    const left = MAX_SHORTS - store.shortsFor(v.id).length;
    box.innerHTML = `
      <ul class="proposals">${proposals
        .map(
          (p, i) => `<li class="${p.valid ? '' : 'bad'}"><label class="check"><input type="checkbox" data-prop="${i}" ${p.pick ? 'checked' : ''} />
          <span><strong>${esc(p.title || '(no title)')}</strong><br /><span class="muted">${esc(p.range)} · ${p.duration} s${p.valid ? '' : ' — outside 15–60 s'}</span></span></label></li>`,
        )
        .join('')}</ul>
      <p class="hint">${left ? `Room for ${left} more Short${left === 1 ? '' : 's'} on this video (max ${MAX_SHORTS}).` : `This video already has ${MAX_SHORTS} Shorts.`}</p>
      <button type="button" class="btn primary" id="sh-addprops" ${left ? '' : 'disabled'}>Add selected Shorts</button>`;
  };

  paint();

  panel.addEventListener('input', (e) => {
    const t = e.target;
    const card = t.closest('[data-sid]');
    if (!card || !t.dataset.sf) return;
    const s = store.state.shorts.find((x) => x.id === card.dataset.sid);
    s[t.dataset.sf] = t.value;
    store.saveShort(s);
    paintCard(s);
  });
  panel.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.prop != null) {
      proposals[+t.dataset.prop].pick = t.checked;
      return;
    }
    const card = t.closest('[data-sid]');
    if (!card || !t.dataset.sf) return;
    const s = store.state.shorts.find((x) => x.id === card.dataset.sid);
    s[t.dataset.sf] = t.value;
    if (t.dataset.sf === 'status') {
      t.className = `st-${s.status}`;
      if (s.status === 'posted' && !s.postedDate) s.postedDate = new Date().toISOString().slice(0, 10);
      // "Shorts cut from this video" ticks itself once one is cut or posted.
      if (s.status !== 'planned' && store.state.checklist.some((x) => x.id === 'c-shorts')) {
        v.checklist = v.checklist || {};
        v.checklist['c-shorts'] = true;
        touch();
      }
      await store.saveShort(s);
      paint();
      toast(`Short marked ${s.status}`);
      return;
    }
    await store.saveShort(s);
    paintCard(s);
  });
  panel.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('#sh-add')) {
      const s = await store.createShort(v, { title: '' });
      if (!s) return toast(`Max ${MAX_SHORTS} Shorts per video`, 'info');
      paint();
      $(`[data-sid="${s.id}"] [data-sf="hook"]`, panel).focus();
      return;
    }
    const del = t.closest('[data-sdel]');
    if (del) {
      const id = del.closest('[data-sid]').dataset.sid;
      if (!confirm('Delete this Short plan?')) return;
      await store.deleteShort(id);
      paint();
      toast('Short deleted');
      return;
    }
    const cp = t.closest('[data-scopy]');
    if (cp) {
      const s = store.state.shorts.find((x) => x.id === cp.closest('[data-sid]').dataset.sid);
      copyText(cp.dataset.scopy === 'title' ? s.title : shortText(s));
      return;
    }
    if (t.closest('#sh-fromdesc')) {
      const ch = (v.description?.chapters || []).filter((x) => x.time && x.title);
      if (!ch.length) return toast('No chapters on the Description tab yet', 'info');
      $('#sh-chapters', panel).value = ch.map((x) => `${parseTime(x.time) != null ? formatTime(parseTime(x.time)) : x.time} ${x.title}`).join('\n');
      return;
    }
    if (t.closest('#sh-gen')) {
      const text = $('#sh-chapters', panel).value;
      const parsed = parseChapterText(text);
      proposals = shortsFromChapters(parsed.chapters);
      if (!proposals.length) {
        toast('No chapter lines found — paste lines like "0:42 Title"', 'error');
        paintProposals();
        return;
      }
      const left = MAX_SHORTS - store.shortsFor(v.id).length;
      let n = 0;
      proposals.forEach((p) => (p.pick = p.valid && n < left && ++n > 0));
      paintProposals();
      return;
    }
    if (t.closest('#sh-addprops')) {
      const picked = proposals.filter((p) => p.pick);
      if (!picked.length) return toast('Tick at least one proposal', 'info');
      let added = 0;
      for (const p of picked) {
        const s = await store.createShort(v, { title: p.title, range: p.range });
        if (s) added++;
      }
      proposals = [];
      paint();
      toast(added < picked.length ? `${added} added — max ${MAX_SHORTS} per video` : `${added} Short${added === 1 ? '' : 's'} added`);
    }
  });
}
