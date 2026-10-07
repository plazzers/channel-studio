// Video detail: Overview · Title lab · Crafter prompt · Description · Shorts · Checklist · Notes

import * as store from '../store.js';
import { ui } from '../ctx.js';
import {
  STATUSES,
  PROMPT_LAST_LINE,
  DESCRIPTION_LIMIT,
  buildCrafterPrompt,
  spokenWords,
  productMentionsText,
  parsePoints,
  parseChapterText,
  validateChapters,
  buildDescription,
  descriptionWarnings,
  formatProductLine,
  orderProducts,
  normalizeHashtags,
  insertProductLine,
  diffLines,
  checkThumbText,
  thumbOverlap,
  fillTemplate,
  videoTitle,
} from '../logic.js';
import { $, $$, esc, toast, copyText, downloadText, slug, debounce } from '../util.js';
import { similarHtml } from './board.js';
import { renderLab } from './lab.js';
import { renderShortsTab } from './shorts-tab.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'lab', label: 'Title lab' },
  { id: 'prompt', label: 'Crafter prompt' },
  { id: 'description', label: 'Description' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'notes', label: 'Notes' },
];

let v; // the video being edited
let c; // its channel
let panel;
const saveSoon = debounce(() => v && store.saveVideo(v, { silent: true }), 250);
function touch() {
  saveSoon();
  const h = $('#d-title');
  if (h) h.textContent = videoTitle(v);
}

export function render(el, r) {
  const id = r.parts[0];
  v = store.getVideo(id);
  if (!v) {
    el.innerHTML = `<div class="panel narrow"><h1>Video not found</h1><p>It may have been deleted.</p><p><a class="btn" href="#/board">Back to the board</a></p></div>`;
    return;
  }
  c = store.channel(v.channel);
  const tab = TABS.some((t) => t.id === r.parts[1]) ? r.parts[1] : 'overview';
  el.innerHTML = `
    <section class="detail" data-ch="${esc(v.channel)}">
      <div class="detail-head">
        <a class="back" href="#/board">← Board</a>
        <div class="detail-title">
          <span class="tag">${esc(c.short)}</span>
          <h1 id="d-title">${esc(videoTitle(v))}</h1>
        </div>
        <label class="stage-pick"><span>Stage</span>
          <select id="d-status">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === v.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        </label>
      </div>
      <nav class="tabs" role="tablist" aria-label="Video sections">
        ${TABS.map((t) => `<a role="tab" href="#/video/${esc(v.id)}/${t.id}" aria-selected="${t.id === tab}" class="${t.id === tab ? 'on' : ''}" data-tab="${t.id}">${esc(t.label)}</a>`).join('')}
      </nav>
      <div class="tabpanel" id="panel" role="tabpanel"></div>
    </section>`;
  panel = $('#panel', el);
  $('#d-status', el).addEventListener('change', (e) => {
    store.setStatus(v, e.target.value);
    touch();
    const ov = $('#ov-status');
    if (ov) ov.value = v.status;
    toast(`Stage: ${STATUSES.find((s) => s.id === v.status).label}`);
  });
  const lab = () => renderLab(panel, v, c, touch);
  const shorts = () => renderShortsTab(panel, v, c, { touch, descriptionText, params: r.params });
  ({ overview, lab, prompt, description, shorts, checklist, notes })[tab]();
}

export function cleanup() {
  if (v) store.saveVideo(v, { silent: true });
}

/* ---------------------------------------------------------------- */
/* Overview                                                          */
/* ---------------------------------------------------------------- */

function overview() {
  const products = [...c.products].sort((a, b) => a.order - b.order);
  const wpm = v.wpm ?? c.wpm;
  panel.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h2>Titles</h2>
        <label class="field"><span>Working title</span>
          <input id="ov-title" value="${esc(v.title)}" maxlength="140" />
        </label>
        <div id="ov-similar"></div>
        <fieldset class="titleopts">
          <legend>Title options — pick the one to use</legend>
          ${['A', 'B', 'C']
            .map(
              (L, i) => `
            <div class="titleopt">
              <label class="radio"><input type="radio" name="chosen" value="${i}" ${v.chosenTitle === i ? 'checked' : ''} /><span>${L}</span></label>
              <label class="grow"><span class="sr">Title ${L}</span><input data-title="${i}" value="${esc(v.titles[i] || '')}" placeholder="Title ${L}" maxlength="100" /></label>
              <span class="counter" data-count="${i}"></span>
            </div>`,
            )
            .join('')}
        </fieldset>
        <h2>Thumbnail text</h2>
        <p class="hint">2–5 words each. It must not repeat words from the title. See it at real size in the <a href="#/video/${esc(v.id)}/lab">Title lab</a>.</p>
        <div id="ov-thumbs"></div>
        <button type="button" class="btn small" id="ov-addthumb">+ Add thumbnail option</button>
      </div>
      <div class="panel">
        <h2>Plan</h2>
        <label class="field"><span>Main product to pitch</span>
          <select id="ov-product">
            <option value="">— none —</option>
            ${products.map((p) => `<option value="${esc(p.id)}" ${p.id === v.product ? 'selected' : ''}>${esc(p.emoji || '')} ${esc(p.name)}${p.price ? ` ($${p.price})` : p.type === 'free' ? ' (free)' : ''}</option>`).join('')}
          </select>
        </label>
        ${c.pitchRule ? `<p class="hint">${esc(c.pitchRule)}</p>` : ''}
        <div class="row2">
          <label class="field"><span>Length target (minutes)</span>
            <input id="ov-len" type="number" min="1" max="120" step="0.5" value="${esc(v.lengthMin)}" />
          </label>
          <label class="field"><span>Words per minute</span>
            <input id="ov-wpm" type="number" min="60" max="260" step="5" value="${esc(wpm)}" />
          </label>
        </div>
        <p class="bignum" id="ov-words"></p>
        <div class="row2">
          <label class="field"><span>Publish date</span>
            <input id="ov-date" type="date" value="${esc(v.publishDate)}" />
          </label>
          <label class="field"><span>Time (ET)</span>
            <input id="ov-time" type="time" value="${esc(v.publishTime)}" />
          </label>
        </div>
        <div class="row2">
          <label class="field"><span>Stage</span>
            <select id="ov-status">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === v.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Channel</span>
            <select id="ov-channel">${Object.values(store.state.channels).map((ch) => `<option value="${ch.id}" ${ch.id === v.channel ? 'selected' : ''}>${esc(ch.name)}</option>`).join('')}</select>
          </label>
        </div>
        <div class="danger-zone">
          <button type="button" class="btn danger" id="ov-delete">Delete this video</button>
        </div>
      </div>
    </div>`;

  const titles = () => [v.title, ...v.titles].filter(Boolean);
  const paintCounters = () => {
    $$('[data-count]', panel).forEach((s) => {
      const n = (v.titles[+s.dataset.count] || '').length;
      s.textContent = `${n}/100`;
      s.classList.toggle('warn', n > 70);
      s.title = n > 70 ? 'Over 70 characters — the end may be cut off on phones' : '';
    });
  };
  const paintThumbs = () => {
    const box = $('#ov-thumbs', panel);
    const focused = document.activeElement?.dataset?.thumb;
    box.innerHTML = v.thumbTexts
      .map((t, i) => {
        const r = checkThumbText(t, titles());
        const o = thumbOverlap(t, titles());
        let msg = '';
        let cls = '';
        if (!r.empty) {
          if (o.level === 'bad') {
            cls = 'bad';
            msg = `Repeats words from the title: ${r.repeats.join(', ')} (${Math.round(o.ratio * 100)}%). Thumbnail text must differ from the title.`;
          } else if (o.level === 'warn') {
            cls = 'warn';
            msg = `Shares a word with the title: ${o.repeats.join(', ')}. Try a different word.`;
          } else if (r.tooShort || r.tooLong) {
            cls = 'warn';
            msg = `${r.words} word${r.words === 1 ? '' : 's'} — use 2–5 words.`;
          } else {
            cls = 'good';
            msg = `${r.words} words ✓`;
          }
        }
        return `<div class="thumbrow ${cls}">
          <label class="grow"><span class="sr">Thumbnail text ${i + 1}</span><input data-thumb="${i}" value="${esc(t)}" placeholder="Thumbnail text ${i + 1}" maxlength="60" /></label>
          <button type="button" class="btn icon" data-delthumb="${i}" aria-label="Remove thumbnail option ${i + 1}">✕</button>
          ${msg ? `<p class="msg" role="status">${esc(msg)}</p>` : ''}
        </div>`;
      })
      .join('');
    if (focused != null) {
      const inp = $(`[data-thumb="${focused}"]`, box);
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  };
  const paintWords = () => {
    const w = spokenWords(v.lengthMin, v.wpm ?? c.wpm);
    $('#ov-words', panel).innerHTML = `≈ <strong>${w}</strong> spoken words <span class="muted">(${esc(v.lengthMin)} min × ${esc(v.wpm ?? c.wpm)} wpm)</span>`;
  };
  paintCounters();
  paintThumbs();
  paintWords();

  $('#ov-title', panel).addEventListener('input', (e) => {
    v.title = e.target.value;
    $('#ov-similar', panel).innerHTML = similarHtml(v.title, { excludeId: v.id });
    touch();
    paintThumbs();
  });
  panel.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.title != null) {
      v.titles[+t.dataset.title] = t.value;
      paintCounters();
      touch();
      paintThumbs();
    } else if (t.dataset.thumb != null) {
      v.thumbTexts[+t.dataset.thumb] = t.value;
      touch();
      paintThumbs();
    }
  });
  panel.addEventListener('change', (e) => {
    if (e.target.name === 'chosen') {
      v.chosenTitle = +e.target.value;
      touch();
    }
  });
  panel.addEventListener('click', (e) => {
    const d = e.target.closest('[data-delthumb]');
    if (!d) return;
    v.thumbTexts.splice(+d.dataset.delthumb, 1);
    if (!v.thumbTexts.length) v.thumbTexts.push('');
    touch();
    paintThumbs();
  });
  $('#ov-addthumb', panel).addEventListener('click', () => {
    if (v.thumbTexts.length >= 6) return toast('Six options is plenty', 'info');
    v.thumbTexts.push('');
    paintThumbs();
    $(`[data-thumb="${v.thumbTexts.length - 1}"]`, panel).focus();
  });
  $('#ov-product', panel).addEventListener('change', (e) => {
    v.product = e.target.value;
    touch();
  });
  $('#ov-len', panel).addEventListener('input', (e) => {
    v.lengthMin = Number(e.target.value) || 0;
    paintWords();
    touch();
  });
  $('#ov-wpm', panel).addEventListener('input', (e) => {
    const n = Number(e.target.value);
    v.wpm = n && n !== c.wpm ? n : null;
    paintWords();
    touch();
  });
  $('#ov-date', panel).addEventListener('change', (e) => {
    v.publishDate = e.target.value;
    touch();
  });
  $('#ov-time', panel).addEventListener('change', (e) => {
    v.publishTime = e.target.value;
    touch();
  });
  $('#ov-status', panel).addEventListener('change', (e) => {
    store.setStatus(v, e.target.value);
    $('#d-status').value = v.status;
    touch();
  });
  $('#ov-channel', panel).addEventListener('change', async (e) => {
    v.channel = e.target.value;
    v.product = '';
    v.description = {};
    v.pinned = null;
    v.community = null;
    await store.saveVideo(v, { silent: true });
    await store.videoChannelChanged(v);
    toast('Channel changed — pick the product again');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  $('#ov-delete', panel).addEventListener('click', async () => {
    if (!confirm(`Delete "${videoTitle(v)}"? This cannot be undone (unless you have a backup).`)) return;
    const id = v.id;
    v = null;
    await store.deleteVideo(id);
    toast('Video deleted');
    location.hash = '#/board';
  });
}

/* ---------------------------------------------------------------- */
/* Crafter prompt                                                    */
/* ---------------------------------------------------------------- */

const PROMPT_FIELDS = [
  { key: 'narrator', label: 'NARRATOR' },
  { key: 'audience', label: 'AUDIENCE' },
  { key: 'outputFormat', label: 'OUTPUT FORMAT' },
  { key: 'structure', label: 'STRUCTURE' },
  { key: 'points', label: 'Points / segments (one per line — they become the numbered list)' },
  { key: 'safety', label: 'SAFETY/ACCURACY' },
  { key: 'productMentions', label: 'PRODUCT MENTIONS' },
  { key: 'styleRules', label: 'STYLE RULES' },
];

function promptDefaults() {
  return {
    title: videoTitle(v),
    ...c.prompt,
    productMentions: productMentionsText(
      c.prompt.productMentions,
      store.productById(v.channel, v.product),
      store.freeProduct(v.channel),
    ),
    points: '',
  };
}

export function promptText(video = v) {
  const saved = v;
  v = video;
  c = store.channel(v.channel);
  const d = promptDefaults();
  const f = {};
  for (const k of Object.keys(d)) f[k] = v.prompt?.[k] ?? d[k];
  const out = buildCrafterPrompt({ ...f, minutes: v.lengthMin, wpm: v.wpm ?? c.wpm });
  v = saved;
  if (v) c = store.channel(v.channel);
  return out;
}

function prompt() {
  v.prompt = v.prompt || {};
  const d = promptDefaults();
  const val = (k) => v.prompt[k] ?? d[k];
  panel.innerHTML = `
    <div class="grid2 wide-left">
      <div class="panel">
        <div class="panel-head"><h2>Prompt fields</h2>
          <button type="button" class="btn small" id="pr-reset">Reset to channel defaults</button></div>
        <p class="hint">Pre-filled from Settings → Prompt defaults. Changes here only affect this video.</p>
        <label class="field"><span>TITLE</span>
          <input id="pr-title" value="${esc(val('title'))}" />
          <small class="muted">Follows the chosen title until you change it here.</small>
        </label>
        <div class="row2">
          <label class="field"><span>Minutes</span><input id="pr-len" type="number" min="1" max="120" step="0.5" value="${esc(v.lengthMin)}" /></label>
          <label class="field"><span>Words per minute</span><input id="pr-wpm" type="number" min="60" max="260" step="5" value="${esc(v.wpm ?? c.wpm)}" /></label>
        </div>
        ${PROMPT_FIELDS.map(
          (f) => `<label class="field"><span>${esc(f.label)}</span>
            <textarea data-pf="${f.key}" rows="${f.key === 'points' ? 7 : 3}" ${f.key === 'points' ? 'placeholder="The hook promise\nFirst thing to check…\nSecond thing…"' : ''}>${esc(val(f.key))}</textarea></label>`,
        ).join('')}
        <p class="locked" aria-label="Locked last line">🔒 Last line is always <code>${esc(PROMPT_LAST_LINE)}</code> — added automatically.</p>
      </div>
      <div class="panel sticky">
        <div class="panel-head"><h2>Output</h2><span class="muted" id="pr-stats"></span></div>
        <pre class="output" id="pr-out" tabindex="0" aria-label="Crafter prompt output"></pre>
        <p class="warnline" id="pr-warn" role="status"></p>
        <div class="actions">
          <button type="button" class="btn primary" id="pr-copy">Copy prompt <kbd>⌘↵</kbd></button>
          <button type="button" class="btn" id="pr-dl">Export to file</button>
        </div>
      </div>
    </div>`;

  const paint = () => {
    const text = promptText();
    $('#pr-out', panel).textContent = text;
    const words = spokenWords(v.lengthMin, v.wpm ?? c.wpm);
    $('#pr-stats', panel).textContent = `${v.lengthMin} min ≈ ${words} words`;
    const pts = parsePoints(v.prompt.points ?? '');
    $('#pr-warn', panel).textContent = pts.length ? '' : 'Tip: add the points / segments — they become the numbered list.';
  };
  paint();

  panel.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.pf) {
      v.prompt[t.dataset.pf] = t.value;
    } else if (t.id === 'pr-title') {
      v.prompt.title = t.value;
    } else if (t.id === 'pr-len') {
      v.lengthMin = Number(t.value) || 0;
    } else if (t.id === 'pr-wpm') {
      const n = Number(t.value);
      v.wpm = n && n !== c.wpm ? n : null;
    } else return;
    touch();
    paint();
  });
  $('#pr-reset', panel).addEventListener('click', () => {
    v.prompt = { points: v.prompt.points };
    touch();
    prompt();
    toast('Fields reset to channel defaults');
  });
  const copy = async () => {
    const ok = await copyText(promptText());
    if (ok && v.status === 'idea') {
      store.setStatus(v, 'prompt');
      $('#d-status').value = 'prompt';
      touch();
    }
  };
  ui.copyCurrent = copy;
  $('#pr-copy', panel).addEventListener('click', copy);
  $('#pr-dl', panel).addEventListener('click', () => downloadText(`prompt-${slug(videoTitle(v))}.txt`, promptText()));
}

/* ---------------------------------------------------------------- */
/* Description                                                       */
/* ---------------------------------------------------------------- */

function descState() {
  v.description = v.description || {};
  const d = v.description;
  return {
    hook: d.hook ?? '',
    products: d.products ?? c.products.filter((p) => p.inDescription).map((p) => p.id),
    chapters: d.chapters ?? [],
    signOff: d.signOff ?? c.signOff,
    hashtags: d.hashtags ?? c.hashtags,
  };
}

export function descriptionText(video = v) {
  const saved = v;
  v = video;
  c = store.channel(v.channel);
  const s = descState();
  const lines = orderProducts(c.products, s.products, v.product).map((p) => formatProductLine(p, c.lineFormat));
  const text = buildDescription({ ...s, productLines: lines });
  v = saved;
  if (v) c = store.channel(v.channel);
  return text;
}

function templateVars() {
  const free = store.freeProduct(v.channel);
  const main = store.productById(v.channel, v.product);
  return {
    title: videoTitle(v),
    freeName: free?.name || '',
    freeUrl: free?.url || '',
    freeLine: free ? formatProductLine(free, c.lineFormat) : '',
    productName: main?.name || '',
    productUrl: main?.url || '',
    store: c.store,
    handle: c.handle,
  };
}

function description() {
  const s = descState();
  const products = [...c.products].sort((a, b) => a.order - b.order);
  const appProduct = products.find((p) => p.type === 'app') || products[0];
  panel.innerHTML = `
    <div class="grid2 wide-left">
      <div class="panel">
        <h2>Build the description</h2>
        <label class="field"><span>Hook paragraph (1–3 sentences)</span>
          <textarea id="ds-hook" rows="3" placeholder="What the viewer gets from this video…">${esc(s.hook)}</textarea>
          <small id="ds-hookinfo" class="muted"></small>
        </label>
        <fieldset class="field">
          <legend>Product lines</legend>
          <p class="hint">The main product (★) goes first.</p>
          <div class="checks" id="ds-products">
            ${products
              .map(
                (p) => `<label class="check"><input type="checkbox" value="${esc(p.id)}" ${s.products.includes(p.id) ? 'checked' : ''} />
                <span>${p.id === v.product ? '★ ' : ''}${esc(formatProductLine(p, c.lineFormat))}</span></label>`,
              )
              .join('')}
          </div>
        </fieldset>
        <fieldset class="field">
          <legend>Chapters</legend>
          <div id="ds-chapters"></div>
          <div class="actions">
            <button type="button" class="btn small" id="ds-addch">+ Add chapter</button>
          </div>
          <details class="paste" ${s.chapters.length ? '' : 'open'}>
            <summary>Paste chapter lines</summary>
            <label class="field"><span class="sr">Paste chapters</span>
              <textarea id="ds-paste" rows="5" placeholder="0:00 Intro\n0:45 The first thing\n2:10 The second thing"></textarea></label>
            <button type="button" class="btn small" id="ds-usepaste">Use these lines</button>
          </details>
          <div id="ds-chvalid" class="validation" role="status"></div>
        </fieldset>
        <label class="field"><span>Sign-off line</span>
          <input id="ds-signoff" value="${esc(s.signOff)}" />
        </label>
        <label class="field"><span>Hashtags</span>
          <input id="ds-tags" value="${esc(s.hashtags)}" />
          <small class="muted">The first 3 show above your title on YouTube.</small>
        </label>
      </div>
      <div class="panel sticky">
        <div class="panel-head"><h2>Preview</h2><span class="counter" id="ds-count"></span></div>
        <pre class="output" id="ds-out" tabindex="0" aria-label="Description preview"></pre>
        <div id="ds-warn" class="validation" role="status"></div>
        <div class="actions">
          <button type="button" class="btn primary" id="ds-copy">Copy description <kbd>⌘↵</kbd></button>
          <button type="button" class="btn" id="ds-dl">Export to file</button>
        </div>
      </div>
    </div>

    <div class="grid2">
      <div class="panel">
        <div class="panel-head"><h2>Pinned comment</h2><button type="button" class="btn small" data-reset="pinned">Reset from template</button></div>
        <label class="field"><span class="sr">Pinned comment</span><textarea id="ds-pinned" rows="4"></textarea></label>
        <div class="actions"><button type="button" class="btn" data-copy="pinned">Copy pinned comment</button>
        <button type="button" class="btn" data-dl="pinned">Export to file</button></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Community post teaser</h2><button type="button" class="btn small" data-reset="community">Reset from template</button></div>
        <label class="field"><span class="sr">Community post</span><textarea id="ds-community" rows="4"></textarea></label>
        <div class="actions"><button type="button" class="btn" data-copy="community">Copy community post</button>
        <button type="button" class="btn" data-dl="community">Export to file</button></div>
      </div>
    </div>

    <div class="panel">
      <h2>Insert a product line into an old description</h2>
      <p class="hint">For when a new product launches: paste an existing description, pick the product, and the line goes right after the first product link.</p>
      <div class="grid2 tight">
        <div>
          <label class="field"><span>Old description</span>
            <textarea id="in-old" rows="9" placeholder="Paste the description from YouTube Studio…"></textarea></label>
          <div class="row2 end">
            <label class="field"><span>Product to add</span>
              <select id="in-product">${products.map((p) => `<option value="${esc(p.id)}" ${p.id === appProduct?.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
            </label>
            <button type="button" class="btn primary" id="in-go">Insert line</button>
          </div>
          <p class="msgline" id="in-msg" role="status"></p>
        </div>
        <div>
          <div class="panel-head"><h3>Changes</h3></div>
          <div class="diff" id="in-diff" aria-label="Changes"><p class="muted">The result shows here, new line in green.</p></div>
          <div class="actions">
            <button type="button" class="btn" id="in-copy" disabled>Copy new description</button>
            <button type="button" class="btn" id="in-dl" disabled>Export to file</button>
          </div>
        </div>
      </div>
    </div>`;

  const d = v.description;
  const paintChapters = () => {
    const rows = s.chapters.length ? s.chapters : [];
    $('#ds-chapters', panel).innerHTML = rows.length
      ? `<div class="chrows">${rows
          .map(
            (ch, i) => `<div class="chrow">
          <label><span class="sr">Time ${i + 1}</span><input data-cht="${i}" value="${esc(ch.time)}" placeholder="0:00" inputmode="numeric" /></label>
          <label class="grow"><span class="sr">Chapter title ${i + 1}</span><input data-chn="${i}" value="${esc(ch.title)}" placeholder="Chapter title" /></label>
          <button type="button" class="btn icon" data-delch="${i}" aria-label="Remove chapter ${i + 1}">✕</button></div>`,
          )
          .join('')}</div>`
      : '<p class="muted">No chapters yet. Add rows or paste lines below.</p>';
  };
  const paintValidation = () => {
    const box = $('#ds-chvalid', panel);
    const rows = s.chapters.filter((x) => x.time || x.title);
    if (!rows.length) {
      box.className = 'validation';
      box.innerHTML = '<p class="muted">No chapters — the description will have none. (YouTube needs at least 3 if you add them.)</p>';
      return;
    }
    const r = validateChapters(rows);
    box.className = 'validation ' + (r.ok ? 'good' : 'bad');
    box.innerHTML = r.ok
      ? `<p>✓ ${rows.length} chapters look good.</p>`
      : `<ul>${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
  };
  const paint = () => {
    const text = descriptionText();
    $('#ds-out', panel).textContent = text;
    const cnt = $('#ds-count', panel);
    cnt.textContent = `${text.length}/${DESCRIPTION_LIMIT}`;
    cnt.classList.toggle('bad', text.length > DESCRIPTION_LIMIT);
    const warns = descriptionWarnings(text, { hashtags: s.hashtags });
    const sentences = (s.hook.match(/[^.!?]+[.!?]+/g) || []).length + (/[^.!?\s]\s*$/.test(s.hook) ? 1 : 0);
    $('#ds-hookinfo', panel).textContent = s.hook.trim()
      ? `${sentences} sentence${sentences === 1 ? '' : 's'}${sentences > 3 ? ' — keep it to 1–3' : ''}`
      : '';
    const ordered = orderProducts(c.products, s.products, v.product);
    const notes = [];
    if (ordered.length && ordered[0].type !== 'free') {
      notes.push(`Note: the script calls the free PDF "the first link in the description", but the first link here is ${ordered[0].name}.`);
    }
    if (normalizeHashtags(s.hashtags).length > 3) notes.push('Only the first 3 hashtags show above the title.');
    const w = $('#ds-warn', panel);
    w.className = 'validation' + (warns.length ? ' bad' : '');
    w.innerHTML = [...warns.map((x) => `<p>⚠ ${esc(x)}</p>`), ...notes.map((x) => `<p class="muted">${esc(x)}</p>`)].join('');
  };
  const saveChapters = () => {
    d.chapters = s.chapters;
    touch();
    paintValidation();
    paint();
  };
  paintChapters();
  paintValidation();
  paint();

  // Pinned comment + community post: follow the template until edited.
  const gen = (k) => fillTemplate(c.templates[k], templateVars());
  const pin = $('#ds-pinned', panel);
  const com = $('#ds-community', panel);
  pin.value = v.pinned ?? gen('pinned');
  com.value = v.community ?? gen('community');
  pin.addEventListener('input', () => {
    v.pinned = pin.value;
    touch();
  });
  com.addEventListener('input', () => {
    v.community = com.value;
    touch();
  });

  panel.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'ds-hook') {
      s.hook = d.hook = t.value;
    } else if (t.id === 'ds-signoff') {
      s.signOff = d.signOff = t.value;
    } else if (t.id === 'ds-tags') {
      s.hashtags = d.hashtags = t.value;
    } else if (t.dataset.cht != null) {
      s.chapters[+t.dataset.cht].time = t.value;
      return saveChapters();
    } else if (t.dataset.chn != null) {
      s.chapters[+t.dataset.chn].title = t.value;
      return saveChapters();
    } else return;
    touch();
    paint();
  });
  $('#ds-products', panel).addEventListener('change', () => {
    s.products = d.products = $$('#ds-products input:checked', panel).map((i) => i.value);
    touch();
    paint();
  });
  $('#ds-addch', panel).addEventListener('click', () => {
    s.chapters.push({ time: s.chapters.length ? '' : '0:00', title: '' });
    saveChapters();
    paintChapters();
    const rows = $$('[data-cht]', panel);
    const last = rows[rows.length - 1];
    (last.value ? $$('[data-chn]', panel).pop() : last).focus();
  });
  panel.addEventListener('click', (e) => {
    const del = e.target.closest('[data-delch]');
    if (del) {
      s.chapters.splice(+del.dataset.delch, 1);
      saveChapters();
      paintChapters();
      return;
    }
    const rs = e.target.closest('[data-reset]');
    if (rs) {
      const k = rs.dataset.reset;
      v[k] = null;
      (k === 'pinned' ? pin : com).value = gen(k);
      touch();
      toast('Reset from template');
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      copyText((cp.dataset.copy === 'pinned' ? pin : com).value);
      return;
    }
    const dl = e.target.closest('[data-dl]');
    if (dl) {
      const k = dl.dataset.dl;
      downloadText(`${k === 'pinned' ? 'pinned-comment' : 'community-post'}-${slug(videoTitle(v))}.txt`, (k === 'pinned' ? pin : com).value);
    }
  });
  $('#ds-usepaste', panel).addEventListener('click', () => {
    const r = parseChapterText($('#ds-paste', panel).value);
    if (!r.chapters.length) {
      toast('No chapter lines found', 'error');
      $('#ds-chvalid', panel).className = 'validation bad';
      $('#ds-chvalid', panel).innerHTML = `<ul>${(r.errors.length ? r.errors : ['Paste lines like "0:00 Intro".']).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
      return;
    }
    s.chapters = r.chapters;
    saveChapters();
    paintChapters();
    if (r.errors.length) {
      $('#ds-chvalid', panel).insertAdjacentHTML('afterbegin', `<ul class="bad">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`);
      $('#ds-chvalid', panel).classList.add('bad');
    }
    $('#ds-paste', panel).value = '';
    toast(`${r.chapters.length} chapters added`);
  });

  const copy = async () => {
    const text = descriptionText();
    const ok = await copyText(text);
    if (ok && store.state.checklist.some((x) => x.id === 'c-desc')) {
      v.checklist = v.checklist || {};
      v.checklist['c-desc'] = true;
      touch();
    }
  };
  ui.copyCurrent = copy;
  $('#ds-copy', panel).addEventListener('click', copy);
  $('#ds-dl', panel).addEventListener('click', () => downloadText(`description-${slug(videoTitle(v))}.txt`, descriptionText()));

  // Insert helper
  let insertResult = '';
  $('#in-go', panel).addEventListener('click', () => {
    const old = $('#in-old', panel).value;
    const p = c.products.find((x) => x.id === $('#in-product', panel).value);
    const msg = $('#in-msg', panel);
    if (!old.trim()) {
      msg.className = 'msgline bad';
      msg.textContent = 'Paste the old description first.';
      return;
    }
    const line = formatProductLine(p, c.lineFormat);
    const r = insertProductLine(old, line, { productUrls: [...c.products.map((x) => x.url), c.store], url: p.url });
    insertResult = r.text;
    const msgs = {
      exists: `This description already has the ${p.name} link — nothing added.`,
      'after-product-link': 'Added right after the first product link.',
      'after-first-link': 'No product link found, so it went after the first link.',
      'no-link': 'No links found, so it went after the first paragraph.',
      'empty-description': 'The description was empty.',
    };
    msg.className = 'msgline ' + (r.inserted ? 'good' : 'warn');
    msg.textContent = msgs[r.reason] || '';
    const diff = diffLines(old.replace(/\r\n/g, '\n'), r.text);
    $('#in-diff', panel).innerHTML = diff
      .map((x) => `<div class="dl ${x.type}"><span class="mark">${x.type === 'add' ? '+' : x.type === 'del' ? '−' : ' '}</span>${esc(x.text) || '&nbsp;'}</div>`)
      .join('');
    $('#in-copy', panel).disabled = false;
    $('#in-dl', panel).disabled = false;
  });
  $('#in-copy', panel).addEventListener('click', () => copyText(insertResult));
  $('#in-dl', panel).addEventListener('click', () => downloadText(`updated-description.txt`, insertResult));
}

/* ---------------------------------------------------------------- */
/* Checklist                                                         */
/* ---------------------------------------------------------------- */

function checklist() {
  v.checklist = v.checklist || {};
  const items = store.state.checklist;
  const paint = () => {
    const done = items.filter((it) => v.checklist[it.id]).length;
    $('#ck-progress', panel).innerHTML = `<div class="bar"><i style="width:${items.length ? (done / items.length) * 100 : 0}%"></i></div><span>${done} of ${items.length} done</span>`;
  };
  panel.innerHTML = `
    <div class="panel narrow">
      <div class="panel-head"><h2>Publish checklist</h2><a class="btn small" href="#/settings?s=checklist">Edit items</a></div>
      <div id="ck-progress" class="progress"></div>
      <ul class="checklist">
        ${items
          .map(
            (it) => `<li><label class="check big"><input type="checkbox" data-ck="${esc(it.id)}" ${v.checklist[it.id] ? 'checked' : ''} /><span>${esc(it.text)}</span></label></li>`,
          )
          .join('')}
      </ul>
      <p class="hint">"Description copied" ticks itself when you copy the description.</p>
    </div>`;
  paint();
  panel.addEventListener('change', (e) => {
    const id = e.target.dataset.ck;
    if (!id) return;
    v.checklist[id] = e.target.checked;
    touch();
    paint();
  });
}

/* ---------------------------------------------------------------- */
/* Notes                                                             */
/* ---------------------------------------------------------------- */

function notes() {
  v.notes = v.notes || { text: '', scriptDoc: '', headcast: '', thumbPath: '' };
  const n = v.notes;
  const linkField = (key, label, ph) => `
    <label class="field"><span>${label}</span>
      <div class="inline">
        <input data-note="${key}" value="${esc(n[key])}" placeholder="${ph}" />
        <a class="btn small" data-open="${key}" target="_blank" rel="noopener noreferrer">Open</a>
      </div>
    </label>`;
  panel.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h2>Notes</h2>
        <label class="field"><span class="sr">Notes</span>
          <textarea data-note="text" rows="14" placeholder="Anything about this video…">${esc(n.text)}</textarea></label>
      </div>
      <div class="panel">
        <h2>Links</h2>
        ${linkField('scriptDoc', 'Script doc', 'https://docs.google.com/…')}
        ${linkField('headcast', 'Headcast project', 'https://…')}
        <label class="field"><span>Thumbnail file path</span>
          <div class="inline">
            <input data-note="thumbPath" value="${esc(n.thumbPath)}" placeholder="~/Thumbnails/walter-winter.png" />
            <button type="button" class="btn small" id="nt-copypath">Copy</button>
          </div>
        </label>
      </div>
    </div>`;
  const paintLinks = () =>
    $$('[data-open]', panel).forEach((a) => {
      const u = (n[a.dataset.open] || '').trim();
      const ok = /^https?:\/\//i.test(u);
      if (ok) a.href = u;
      else a.removeAttribute('href');
      a.classList.toggle('disabled', !ok);
      a.setAttribute('aria-disabled', String(!ok));
    });
  paintLinks();
  panel.addEventListener('input', (e) => {
    const k = e.target.dataset.note;
    if (!k) return;
    n[k] = e.target.value;
    touch();
    paintLinks();
  });
  $('#nt-copypath', panel).addEventListener('click', () => {
    if (!n.thumbPath.trim()) return toast('No path yet', 'info');
    copyText(n.thumbPath.trim());
  });
}
