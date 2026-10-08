// One video: overview, title & thumbnail lab, prompt builder, description
// builder and the Shorts planner, as tabs.

import * as store from '../store.js';
import {
  STATUSES,
  videoTitle,
  scoreTitle,
  checkThumb,
  buildPrompt,
  parseChapterText,
  validateChapters,
  buildGenericDescription,
  productLines,
  descriptionWarnings,
  DESCRIPTION_LIMIT,
  shortsFromChapters,
  checkShort,
  SHORT_STATUSES,
  MAX_SHORTS,
  SHORT_TITLE_MAX,
  spokenWords,
} from '../logic.js';
import { $, $$, esc, toast, copyText, debounce, confirmBox, pref } from '../util.js';
import { channelOptions, lvlIcon } from './common.js';
import { similarHtml } from './board.js';

const TABS = [
  ['overview', 'Overview'],
  ['lab', 'Title & thumbnail lab'],
  ['prompt', 'Prompt'],
  ['description', 'Description'],
  ['shorts', 'Shorts'],
];

let root;
let v;

export function render(el, r) {
  root = el;
  v = store.video(r.parts[0]);
  if (!v) {
    el.innerHTML = `<div class="panel empty"><h1>Video not found</h1><p>It may have been deleted.</p><a class="btn" href="#/board">Back to the board</a></div>`;
    return;
  }
  const tab = TABS.some(([id]) => id === r.parts[1]) ? r.parts[1] : pref.get('videoTab', 'overview');
  el.innerHTML = `
    <section class="video-view">
      <a class="back" href="#/board">← Board</a>
      <div class="pagehead"><h1 id="vtitle">${esc(videoTitle(v))}</h1><span class="stage st-${esc(v.status)}">${esc(STATUSES.find((s) => s.id === v.status)?.label || '')}</span></div>
      <nav class="tabs" role="tablist" aria-label="Video sections">
        ${TABS.map(([id, label]) => `<a role="tab" href="#/video/${esc(v.id)}/${id}" aria-selected="${id === tab}" class="${id === tab ? 'on' : ''}">${esc(label)}</a>`).join('')}
      </nav>
      <div id="tab" class="tabpanel"></div>
    </section>`;
  pref.set('videoTab', tab);
  ({ overview, lab, prompt, description, shorts })[tab]($('#tab', el));
}

const ch = () => store.channel(v.channelId) || store.state.channels[0] || { products: [], keywords: [] };
const save = debounce(() => store.save('videos', v, { silent: true }), 250);
const refreshTitle = () => ($('#vtitle', root).textContent = videoTitle(v));

/* ---------------- Overview ---------------- */

function overview(el) {
  el.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h2>Basics</h2>
        <label class="field"><span>Working title</span><input id="o-title" value="${esc(v.title)}" maxlength="140" /></label>
        <div id="o-similar"></div>
        <div class="row wrap">
          <label class="field"><span>Channel</span><select id="o-ch">${channelOptions(v.channelId)}</select></label>
          <label class="field"><span>Stage</span><select id="o-status">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === v.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
        </div>
        <div class="row wrap">
          <label class="field"><span>Publish date</span><input type="date" id="o-date" value="${esc(v.publishDate)}" /></label>
          <label class="field"><span>Time</span><input type="time" id="o-time" value="${esc(v.publishTime)}" /></label>
          <label class="field"><span>Length (min)</span><input type="number" min="1" max="180" id="o-len" value="${esc(v.prompt.minutes || '')}" /></label>
        </div>
      </div>
      <div class="panel">
        <h2>Notes</h2>
        <label class="field"><span class="sr">Notes</span><textarea id="o-notes" rows="9" placeholder="Script doc link, voice settings, thumbnail ideas, sources to double-check…">${esc(v.notes)}</textarea></label>
        <div class="row end"><button class="btn danger ghost" id="o-del" type="button">Delete video</button></div>
      </div>
    </div>`;
  const t = $('#o-title', el);
  const sim = () => ($('#o-similar', el).innerHTML = similarHtml(t.value, { excludeId: v.id }));
  sim();
  t.addEventListener('input', () => {
    v.title = t.value;
    if (!v.titles[v.chosenTitle]) refreshTitle();
    refreshTitle();
    sim();
    save();
  });
  $('#o-ch', el).addEventListener('change', (e) => {
    v.channelId = e.target.value;
    save();
  });
  $('#o-status', el).addEventListener('change', (e) => {
    store.setStatus(v, e.target.value);
    save();
    toast('Stage updated');
  });
  for (const [id, set] of [
    ['#o-date', (x) => (v.publishDate = x)],
    ['#o-time', (x) => (v.publishTime = x)],
    ['#o-len', (x) => (v.prompt.minutes = x)],
    ['#o-notes', (x) => (v.notes = x)],
  ]) {
    $(id, el).addEventListener('input', (e) => {
      set(e.target.value);
      save();
    });
  }
  $('#o-del', el).addEventListener('click', async () => {
    if (!(await confirmBox(`Delete "${videoTitle(v)}" and its Shorts and stats?`, { ok: 'Delete', danger: true }))) return;
    await store.remove('videos', v.id);
    toast('Video deleted');
    location.hash = '#/board';
  });
}

/* ---------------- Title & thumbnail lab ---------------- */

function scoreHtml(title) {
  const words = store.state.settings.titleWords;
  const s = scoreTitle(title, { power: words.power, clickbait: words.clickbait, keywords: ch().keywords || [] });
  const lvl = s.score >= 75 ? 'good' : s.score >= 50 ? 'warn' : 'bad';
  return `<div class="score ${lvl}"><span class="num">${s.score}</span><span class="of">/100</span></div>
    <ul class="reasons">${s.reasons.map((r) => `<li class="${r.level}"><span class="ri" aria-hidden="true">${lvlIcon(r.level)}</span>${esc(r.text)} <span class="pts">${r.points}/${r.max}</span></li>`).join('')}</ul>`;
}

function thumbHtml(text) {
  const c = checkThumb(text, v.titles.filter(Boolean).concat(v.title));
  if (c.empty) return '<p class="muted">Type 2–5 words that add something the title does not say.</p>';
  const items = [
    [c.wordsOk ? 'good' : 'warn', `${c.words} word${c.words === 1 ? '' : 's'} ${c.wordsOk ? '— good' : '(aim for 2–5)'}`],
    [c.level, c.repeats.length ? `Repeats the title: ${c.repeats.join(', ')}${c.level === 'bad' ? ' — half or more of the words' : ''}` : 'Adds new words (does not repeat the title).'],
    [c.linesOk ? 'good' : 'warn', c.linesOk ? 'Fits on 2 short lines.' : `Longest line is ${c.longest} characters — keep each line under 20.`],
  ];
  return `<div class="thumbmock"><div>${c.lines.map(esc).join('<br>')}</div></div>
    <ul class="reasons">${items.map(([l, t]) => `<li class="${l}"><span class="ri" aria-hidden="true">${lvlIcon(l)}</span>${esc(t)}</li>`).join('')}</ul>`;
}

function lab(el) {
  el.innerHTML = `
    <p class="muted">Scores are simple, transparent rules — every point is explained. They are a checklist, not a prediction.</p>
    <div class="grid3">${[0, 1, 2]
      .map(
        (i) => `<div class="panel labcol">
        <h2>Option ${'ABC'[i]}</h2>
        <label class="radio"><input type="radio" name="chosen" value="${i}" ${v.chosenTitle === i ? 'checked' : ''}/> Use this title</label>
        <label class="field"><span>Title</span><textarea rows="2" data-title="${i}" maxlength="140">${esc(v.titles[i] || '')}</textarea></label>
        <p class="count" data-len="${i}"></p>
        <div data-score="${i}"></div>
        <label class="field"><span>Thumbnail text</span><input data-thumb="${i}" value="${esc(v.thumbTexts[i] || '')}" maxlength="60" /></label>
        <div data-tcheck="${i}"></div>
      </div>`,
      )
      .join('')}</div>`;
  const paint = (i) => {
    const t = v.titles[i] || '';
    $(`[data-len="${i}"]`, el).textContent = `${t.length} characters`;
    $(`[data-score="${i}"]`, el).innerHTML = t.trim() ? scoreHtml(t) : '<p class="muted">Write a title to see its score.</p>';
    $(`[data-tcheck="${i}"]`, el).innerHTML = thumbHtml(v.thumbTexts[i] || '');
  };
  [0, 1, 2].forEach(paint);
  el.addEventListener('input', (e) => {
    const ti = e.target.dataset.title;
    const th = e.target.dataset.thumb;
    if (ti != null) {
      v.titles[+ti] = e.target.value;
      [0, 1, 2].forEach(paint);
      refreshTitle();
    }
    if (th != null) {
      v.thumbTexts[+th] = e.target.value;
      paint(+th);
    }
    save();
  });
  el.addEventListener('change', (e) => {
    if (e.target.name === 'chosen') {
      v.chosenTitle = +e.target.value;
      refreshTitle();
      save();
    }
  });
}

/* ---------------- Prompt ---------------- */

function promptVars() {
  const c = ch();
  const product = (c.products || []).find((p) => p.id === v.prompt.product);
  return {
    title: videoTitle(v),
    channel: c.name,
    niche: c.niche,
    audience: v.prompt.audience || c.audience,
    minutes: v.prompt.minutes,
    wpm: store.state.settings.wpm,
    points: v.prompt.points,
    keywords: (c.keywords || []).join(', '),
    product: product ? product.label : '',
    notes: v.prompt.notes,
  };
}

function prompt(el) {
  const c = ch();
  const tplOpts = store.state.templates.map((t) => `<option value="${esc(t.id)}" ${t.id === v.templateId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const prodOpts = `<option value="">— none —</option>` + (c.products || []).map((p) => `<option value="${esc(p.id)}" ${p.id === v.prompt.product ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  el.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h2>Fill in</h2>
        <label class="field"><span>Template <a class="small" href="#/templates">edit templates</a></span><select id="p-tpl">${tplOpts}</select></label>
        <label class="field"><span>Audience</span><input id="p-aud" value="${esc(v.prompt.audience || '')}" placeholder="${esc(c.audience || 'Who is this video for?')}" /></label>
        <div class="row wrap">
          <label class="field"><span>Minutes</span><input id="p-min" type="number" min="1" max="180" value="${esc(v.prompt.minutes || '')}" /></label>
          <label class="field"><span>Words per minute</span><input id="p-wpm" type="number" min="80" max="220" value="${esc(store.state.settings.wpm)}" /></label>
          <p class="field calc" id="p-words"></p>
        </div>
        <label class="field"><span>Points / beats / steps — one per line</span><textarea id="p-points" rows="8" placeholder="First point&#10;Second point&#10;Third point">${esc(v.prompt.points || '')}</textarea></label>
        <label class="field"><span>Product to mention</span><select id="p-prod">${prodOpts}</select></label>
        <label class="field"><span>Extra notes</span><textarea id="p-notes" rows="2">${esc(v.prompt.notes || '')}</textarea></label>
      </div>
      <div class="panel out">
        <div class="panel-head"><h2>Your prompt</h2><button class="btn primary" id="p-copy" type="button">Copy prompt</button></div>
        <pre id="p-out" class="output" tabindex="0"></pre>
        <p class="muted small">Paste it into the AI tool you use for scripts. The template's fixed ending line is always added last.</p>
      </div>
    </div>`;
  const paint = () => {
    $('#p-out', el).textContent = buildPrompt(store.template(v.templateId), promptVars());
    $('#p-words', el).textContent = `≈ ${spokenWords(v.prompt.minutes, store.state.settings.wpm)} spoken words`;
  };
  paint();
  const bindings = {
    '#p-tpl': (x) => (v.templateId = x),
    '#p-aud': (x) => (v.prompt.audience = x),
    '#p-min': (x) => (v.prompt.minutes = x),
    '#p-points': (x) => (v.prompt.points = x),
    '#p-prod': (x) => (v.prompt.product = x),
    '#p-notes': (x) => (v.prompt.notes = x),
  };
  for (const [sel, set] of Object.entries(bindings)) {
    $(sel, el).addEventListener('input', (e) => {
      set(e.target.value);
      paint();
      save();
    });
  }
  $('#p-wpm', el).addEventListener('input', (e) => {
    store.state.settings.wpm = Number(e.target.value) || 150;
    paint();
    store.saveSettings('wpm');
  });
  $('#p-copy', el).addEventListener('click', () => copyText($('#p-out', el).textContent, 'Prompt copied'));
}

/* ---------------- Description ---------------- */

function descText() {
  const c = ch();
  const d = v.description;
  const { chapters } = parseChapterText(d.chapters);
  return buildGenericDescription({
    hook: d.hook,
    linkLine: d.useLinkLine !== false ? c.linkLine : '',
    products: productLines(c.products, d.products),
    chapters,
    disclaimer: d.useDisclaimer !== false ? c.disclaimer : '',
    hashtags: d.hashtags || c.hashtags,
  });
}

function description(el) {
  const c = ch();
  const d = v.description;
  el.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h2>Build it</h2>
        <label class="field"><span>Hook (first 2 lines show in search)</span><textarea id="d-hook" rows="3">${esc(d.hook || '')}</textarea></label>
        <label class="check"><input type="checkbox" id="d-ll" ${d.useLinkLine !== false ? 'checked' : ''}/> Default link line ${c.linkLine ? `<span class="muted">(${esc(c.linkLine)})</span>` : '<span class="muted">(none set — add it in Channels)</span>'}</label>
        <fieldset class="field"><legend>Product links</legend>
          ${(c.products || []).length ? (c.products || []).map((p) => `<label class="check"><input type="checkbox" data-prod="${esc(p.id)}" ${(d.products || []).includes(p.id) ? 'checked' : ''}/> ${esc(p.label)} <span class="muted small">${esc(p.url)}</span></label>`).join('') : '<p class="muted">No products yet. <a href="#/channels/' + esc(c.id) + '">Add them in Channels</a>.</p>'}
        </fieldset>
        <label class="field"><span>Chapters — one per line, like <code>0:00 Intro</code></span><textarea id="d-ch" rows="7" placeholder="0:00 Intro&#10;0:45 First point&#10;2:10 Second point">${esc(d.chapters || '')}</textarea></label>
        <div id="d-cherr"></div>
        <label class="check"><input type="checkbox" id="d-disc" ${d.useDisclaimer !== false ? 'checked' : ''}/> Disclaimer ${c.disclaimer ? '' : '<span class="muted">(none set — add it in Channels)</span>'}</label>
        <label class="field"><span>Hashtags</span><input id="d-tags" value="${esc(d.hashtags || '')}" placeholder="${esc(c.hashtags || '#tag1 #tag2')}" /></label>
      </div>
      <div class="panel out">
        <div class="panel-head"><h2>Description</h2><button class="btn primary" id="d-copy" type="button">Copy description</button></div>
        <pre id="d-out" class="output" tabindex="0"></pre>
        <p class="count" id="d-count"></p>
        <div id="d-warn"></div>
      </div>
    </div>`;
  const paint = () => {
    const text = descText();
    $('#d-out', el).textContent = text || '(Start typing on the left.)';
    $('#d-count', el).textContent = `${text.length} / ${DESCRIPTION_LIMIT} characters`;
    const warns = descriptionWarnings(text, { hashtags: d.hashtags || c.hashtags });
    $('#d-warn', el).innerHTML = warns.map((w) => `<p class="bad">✕ ${esc(w)}</p>`).join('');
    const pc = parseChapterText(d.chapters);
    const errs = d.chapters && d.chapters.trim() ? [...pc.errors, ...validateChapters(pc.chapters).errors] : [];
    $('#d-cherr', el).innerHTML = errs.length ? `<ul class="errors">${errs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : d.chapters && d.chapters.trim() ? '<p class="good">✓ Chapters look right for YouTube.</p>' : '';
  };
  paint();
  el.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'd-hook') d.hook = e.target.value;
    else if (id === 'd-ch') d.chapters = e.target.value;
    else if (id === 'd-tags') d.hashtags = e.target.value;
    else if (id === 'd-ll') d.useLinkLine = e.target.checked;
    else if (id === 'd-disc') d.useDisclaimer = e.target.checked;
    else if (e.target.dataset.prod) {
      d.products = $$('[data-prod]', el).filter((x) => x.checked).map((x) => x.dataset.prod);
    }
    paint();
    save();
  });
  $('#d-copy', el).addEventListener('click', () => copyText(descText(), 'Description copied'));
}

/* ---------------- Shorts ---------------- */

const shortsOf = () => store.state.shorts.filter((s) => s.videoId === v.id).sort((a, b) => (a.n ?? 0) - (b.n ?? 0));

function shorts(el) {
  el.innerHTML = '<div id="shorts-wrap"></div>';
  drawShorts();
  bindShorts(el);
}

function drawShorts() {
  const el = $('#shorts-wrap', root);
  const list = shortsOf();
  el.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>Shorts from this video <span class="count">${list.length}/${MAX_SHORTS}</span></h2>
        <div class="row wrap"><button class="btn" id="s-chap" type="button">Make Shorts from chapters</button><button class="btn primary" id="s-add" type="button">+ Add a Short</button></div></div>
      <p class="muted small">Each Short: a 15–60 second piece of the long video, a hook of up to 12 words, on-screen text of up to 6 words and a title under ${SHORT_TITLE_MAX} characters. Chapters come from the Description tab.</p>
    </div>
    <div class="shorts-list">${list.map(shortCard).join('') || '<p class="muted panel">No Shorts planned yet.</p>'}</div>`;
}

function bindShorts(el) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('#s-add')) addShort({});
    if (e.target.closest('#s-chap')) fromChapters();
  });
  async function fromChapters() {
    const props = shortsFromChapters(v.description.chapters || '').filter((p) => p.title && !/^intro|outro$/i.test(p.title));
    if (!props.length) {
      toast('Add chapters in the Description tab first', 'info');
      return;
    }
    const have = new Set(shortsOf().map((s) => s.range));
    let n = 0;
    for (const p of props) {
      if (shortsOf().length >= MAX_SHORTS) break;
      if (have.has(p.range)) continue;
      await addShort({ title: p.title, range: p.range }, true);
      n++;
    }
    toast(n ? `${n} Short${n > 1 ? 's' : ''} added` : 'Nothing new to add', n ? 'ok' : 'info');
    drawShorts();
  }
  el.addEventListener('input', (e) => {
    const card = e.target.closest('[data-short]');
    const f = e.target.dataset.f;
    if (!card || !f) return;
    const s = store.state.shorts.find((x) => x.id === card.dataset.short);
    s[f] = e.target.value;
    store.save('shorts', s, { silent: true });
    $('.checks', card).innerHTML = shortChecks(s);
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delshort]');
    if (!b) return;
    await store.remove('shorts', b.dataset.delshort, { silent: true });
    drawShorts();
  });
}

async function addShort(fields, quiet) {
  if (shortsOf().length >= MAX_SHORTS) {
    toast(`Up to ${MAX_SHORTS} Shorts per video`, 'info');
    return;
  }
  const n = Math.max(0, ...shortsOf().map((s) => s.n ?? 0)) + 1;
  await store.save('shorts', { id: store.uid('sh'), videoId: v.id, n, hook: '', range: '', onScreen: '', title: '', status: 'planned', ...fields }, { silent: true });
  if (!quiet) drawShorts();
}

function shortChecks(s) {
  const c = checkShort(s, [videoTitle(v)]);
  const items = [
    [c.range.ok ? 'good' : c.range.empty ? 'warn' : 'bad', c.range.ok ? `${c.range.duration} seconds` : c.range.error],
    [c.hookOk ? 'good' : 'bad', `Hook: ${c.hookWords}/12 words`],
    [c.textOk ? 'good' : 'bad', `On-screen text: ${c.textWords}/6 words`],
    [c.titleOk ? 'good' : 'bad', `Title: ${c.titleLen}/${SHORT_TITLE_MAX} characters`],
  ];
  return items.map(([l, t]) => `<li class="${l}"><span class="ri">${lvlIcon(l)}</span>${esc(t)}</li>`).join('');
}

function shortCard(s) {
  return `<article class="panel short" data-short="${esc(s.id)}">
    <div class="panel-head"><h3>Short ${s.n}</h3>
      <div class="row"><label class="field inline"><span class="sr">Status</span><select data-f="status">${SHORT_STATUSES.map((x) => `<option value="${x.id}" ${x.id === s.status ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
      <button class="iconbtn" type="button" data-delshort="${esc(s.id)}" aria-label="Delete Short ${s.n}">✕</button></div></div>
    <div class="grid2 tight">
      <label class="field"><span>Source range (mm:ss–mm:ss)</span><input data-f="range" value="${esc(s.range)}" placeholder="1:05–1:50" /></label>
      <label class="field"><span>On-screen text</span><input data-f="onScreen" value="${esc(s.onScreen)}" /></label>
      <label class="field"><span>Hook (first words spoken)</span><input data-f="hook" value="${esc(s.hook)}" /></label>
      <label class="field"><span>Title</span><input data-f="title" value="${esc(s.title)}" /></label>
    </div>
    <ul class="reasons checks">${shortChecks(s)}</ul>
  </article>`;
}

export function cleanup() {}
