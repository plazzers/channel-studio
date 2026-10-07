// Settings: channel config, prompt defaults, title lab words, checklist,
// backup (JSON + CSV zip), theme.

import * as store from '../store.js';
import { ui } from '../ctx.js';
import { formatProductLine, wordList, DEFAULT_TITLE_WORDS } from '../logic.js';
import { $, $$, esc, toast, downloadText, debounce, pref, todayISO } from '../util.js';
import { csvZip, downloadBytes } from '../export.js';
import { DEFAULT_CHANNELS } from '../../data/channels.js';

const SECTIONS = [
  { id: 'channel', label: 'Channel & products' },
  { id: 'prompt', label: 'Prompt defaults' },
  { id: 'lab', label: 'Title lab' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'backup', label: 'Backup' },
  { id: 'theme', label: 'Theme' },
];

const PROMPT_KEYS = [
  ['narrator', 'NARRATOR'],
  ['audience', 'AUDIENCE'],
  ['outputFormat', 'OUTPUT FORMAT'],
  ['structure', 'STRUCTURE'],
  ['safety', 'SAFETY/ACCURACY'],
  ['productMentions', 'PRODUCT MENTIONS'],
  ['styleRules', 'STYLE RULES'],
];

let editCh = null;
const saveChannels = debounce(() => store.saveChannels(), 300);
const saveChecklist = debounce(() => store.saveChecklist(), 300);
const saveTitleWords = debounce(() => store.saveTitleWords(), 300);

export function render(el, r) {
  const sec = SECTIONS.some((s) => s.id === r.params.s) ? r.params.s : 'channel';
  if (!editCh) editCh = ui.channel === 'both' ? pref.get('settingsCh', 'walter') : ui.channel;
  el.innerHTML = `
    <section class="settings-view">
      <h1>Settings</h1>
      <nav class="tabs" aria-label="Settings sections">
        ${SECTIONS.map((s) => `<a href="#/settings?s=${s.id}" class="${s.id === sec ? 'on' : ''}" aria-current="${s.id === sec ? 'page' : 'false'}">${esc(s.label)}</a>`).join('')}
      </nav>
      <div id="st-body"></div>
    </section>`;
  const body = $('#st-body', el);
  ({ channel: channelSec, prompt: promptSec, lab: labSec, checklist: checklistSec, backup: backupSec, theme: themeSec })[sec](body);
}

function chPicker() {
  return `<div class="segmented" role="group" aria-label="Channel to edit">
    ${Object.values(store.state.channels)
      .map((c) => `<button type="button" data-pick="${c.id}" data-ch="${c.id}" class="${c.id === editCh ? 'on' : ''}" aria-pressed="${c.id === editCh}">${esc(c.name)}</button>`)
      .join('')}
  </div>`;
}

function bindPicker(body, rerender) {
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    editCh = b.dataset.pick;
    pref.set('settingsCh', editCh);
    rerender(body);
  });
}

/* ---------------- Channel & products ---------------- */

function channelSec(body) {
  const fresh = body.cloneNode(false);
  body.replaceWith(fresh);
  body = fresh;
  const c = store.channel(editCh);
  const products = [...c.products].sort((a, b) => a.order - b.order);
  body.innerHTML = `
    ${chPicker()}
    <div class="grid2" data-ch="${c.id}">
      <div class="panel">
        <h2>${esc(c.name)}</h2>
        <div class="row2">
          <label class="field"><span>Handle</span><input data-c="handle" value="${esc(c.handle)}" /></label>
          <label class="field"><span>Store link</span><input data-c="store" type="url" value="${esc(c.store)}" /></label>
        </div>
        <div class="row2">
          <label class="field"><span>Words per minute</span><input data-c="wpm" type="number" min="60" max="260" step="5" value="${esc(c.wpm)}" /></label>
          <label class="field"><span>Default length (minutes)</span><input data-c="defaultLength" type="number" min="1" max="120" value="${esc(c.defaultLength)}" /></label>
        </div>
        <label class="field"><span>Default hashtags</span><input data-c="hashtags" value="${esc(c.hashtags)}" /></label>
        <label class="field"><span>Sign-off line (description)</span><input data-c="signOff" value="${esc(c.signOff)}" /></label>
        <label class="field"><span>Description line style</span><input data-c="lineFormat" value="${esc(c.lineFormat)}" />
          <small class="muted">Use {emoji} {text} {url}. Example: <span id="st-example"></span></small></label>
        <label class="field"><span>Pitch rule (reminder shown on each video)</span><textarea data-c="pitchRule" rows="3">${esc(c.pitchRule)}</textarea></label>
        <label class="field"><span>Pinned comment template</span><textarea data-t="pinned" rows="3">${esc(c.templates.pinned)}</textarea></label>
        <label class="field"><span>Community post template</span><textarea data-t="community" rows="3">${esc(c.templates.community)}</textarea>
          <small class="muted">Placeholders: {title} {freeName} {freeUrl} {freeLine} {productName} {productUrl} {store} {handle}</small></label>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Products</h2><button type="button" class="btn small" id="st-addp">+ Add product</button></div>
        <div id="st-products">
          ${products.map((p, i) => productCard(p, i, products.length)).join('')}
        </div>
      </div>
    </div>`;

  const example = () => {
    const p = [...c.products].sort((a, b) => a.order - b.order)[0];
    $('#st-example', body).textContent = p ? formatProductLine(p, c.lineFormat) : '';
  };
  example();
  bindPicker(body, channelSec);

  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.c) {
      c[t.dataset.c] = t.type === 'number' ? Number(t.value) || 0 : t.value;
      example();
    } else if (t.dataset.t) {
      c.templates[t.dataset.t] = t.value;
    } else if (t.dataset.p) {
      const p = c.products.find((x) => x.id === t.closest('[data-pid]').dataset.pid);
      const k = t.dataset.p;
      p[k] = t.type === 'checkbox' ? t.checked : k === 'price' ? Number(t.value) || 0 : t.value;
      if (k === 'url') t.classList.toggle('invalid', !!t.value && !/^https?:\/\/\S+$/i.test(t.value));
      example();
    } else return;
    saveChannels();
  });
  body.addEventListener('change', (e) => {
    if (e.target.dataset.p === 'inDescription' || e.target.dataset.p === 'type') {
      const p = c.products.find((x) => x.id === e.target.closest('[data-pid]').dataset.pid);
      p[e.target.dataset.p] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      saveChannels();
    }
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('[data-pid]').dataset.pid;
    const list = [...c.products].sort((a, b2) => a.order - b2.order);
    const i = list.findIndex((p) => p.id === id);
    if (b.dataset.act === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    else if (b.dataset.act === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    else if (b.dataset.act === 'del') {
      if (!confirm(`Remove "${list[i].name}"? Videos that pitch it will show no product.`)) return;
      list.splice(i, 1);
    } else return;
    list.forEach((p, n) => (p.order = n + 1));
    c.products = list;
    store.saveChannels();
    channelSec(body);
  });
  $('#st-addp', body).addEventListener('click', () => {
    c.products.push({
      id: `${c.id[0]}-${Date.now().toString(36)}`,
      name: 'New product',
      line: 'New product',
      url: 'https://',
      price: 0,
      type: 'paid',
      emoji: '⭐',
      inDescription: false,
      order: c.products.length + 1,
    });
    store.saveChannels();
    channelSec(body);
    const last = $$('[data-pid]', body).pop();
    last.querySelector('input').focus();
  });
}

function productCard(p, i, n) {
  return `<div class="product" data-pid="${esc(p.id)}">
    <div class="row2">
      <label class="field"><span>Name</span><input data-p="name" value="${esc(p.name)}" /></label>
      <label class="field small"><span>Emoji</span><input data-p="emoji" value="${esc(p.emoji)}" maxlength="4" /></label>
    </div>
    <label class="field"><span>Description line text</span><input data-p="line" value="${esc(p.line)}" /></label>
    <label class="field"><span>Link</span><input data-p="url" type="url" value="${esc(p.url)}" /></label>
    <div class="row3">
      <label class="field"><span>Price ($)</span><input data-p="price" type="number" min="0" step="0.01" value="${esc(p.price)}" /></label>
      <label class="field"><span>Type</span><select data-p="type">${['free', 'paid', 'app'].map((t) => `<option ${t === p.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-p="inDescription" ${p.inDescription ? 'checked' : ''} /><span>In description by default</span></label>
    </div>
    <div class="actions">
      <button type="button" class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(p.name)} up">↑</button>
      <button type="button" class="btn small" data-act="down" ${i === n - 1 ? 'disabled' : ''} aria-label="Move ${esc(p.name)} down">↓</button>
      <button type="button" class="btn small danger" data-act="del">Remove</button>
    </div>
  </div>`;
}

/* ---------------- Prompt defaults ---------------- */

function promptSec(body) {
  const fresh = body.cloneNode(false);
  body.replaceWith(fresh);
  body = fresh;
  const c = store.channel(editCh);
  body.innerHTML = `
    ${chPicker()}
    <div class="panel narrow" data-ch="${c.id}">
      <h2>Crafter prompt defaults — ${esc(c.name)}</h2>
      <p class="hint">New prompts start with these. The last line "create me a prompt for the video" is always added by the app.</p>
      ${PROMPT_KEYS.map(([k, label]) => `<label class="field"><span>${label}</span><textarea data-k="${k}" rows="3">${esc(c.prompt[k])}</textarea></label>`).join('')}
    </div>`;
  bindPicker(body, promptSec);
  body.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    c.prompt[k] = e.target.value;
    saveChannels();
  });
}

/* ---------------- Title lab words ---------------- */

function labSec(body) {
  const fresh = body.cloneNode(false);
  body.replaceWith(fresh);
  body = fresh;
  const c = store.channel(editCh);
  const tw = store.state.titleWords;
  const lines = (list) => esc((list || []).join('\n'));
  body.innerHTML = `
    ${chPicker()}
    <div class="grid2">
      <div class="panel" data-ch="${c.id}">
        <div class="panel-head"><h2>Keywords — ${esc(c.name)}</h2><button type="button" class="btn small" data-lreset="keywords">Reset</button></div>
        <p class="hint">A title scores points when it has one of these. Shorts titles are checked against the long video's title instead. One per line.</p>
        <label class="field"><span class="sr">Channel keywords</span><textarea id="lab-keywords" rows="8">${lines(c.keywords)}</textarea></label>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Curiosity / pain words</h2><button type="button" class="btn small" data-lreset="power">Reset</button></div>
        <p class="hint">Used for both channels. One word or phrase per line ("mistake" also matches "mistakes").</p>
        <label class="field"><span class="sr">Curiosity and pain words</span><textarea id="lab-power" rows="8">${lines(tw.power)}</textarea></label>
        <div class="panel-head"><h2>Clickbait words (warning)</h2><button type="button" class="btn small" data-lreset="clickbait">Reset</button></div>
        <label class="field"><span class="sr">Clickbait words</span><textarea id="lab-clickbait" rows="5">${lines(tw.clickbait)}</textarea></label>
      </div>
    </div>`;
  bindPicker(body, labSec);
  body.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'lab-keywords') {
      c.keywords = wordList(e.target.value);
      saveChannels();
    } else if (id === 'lab-power' || id === 'lab-clickbait') {
      tw[id.slice(4)] = wordList(e.target.value);
      saveTitleWords();
    }
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lreset]');
    if (!b) return;
    const k = b.dataset.lreset;
    if (k === 'keywords') {
      c.keywords = [...(DEFAULT_CHANNELS[c.id]?.keywords || [])];
      store.saveChannels();
    } else {
      tw[k] = [...DEFAULT_TITLE_WORDS[k]];
      store.saveTitleWords();
    }
    labSec(body);
    toast('Reset to the starting list');
  });
}

/* ---------------- Checklist ---------------- */

function checklistSec(body) {
  const fresh = body.cloneNode(false);
  body.replaceWith(fresh);
  body = fresh;
  const items = store.state.checklist;
  body.innerHTML = `
    <div class="panel narrow">
      <div class="panel-head"><h2>Publish checklist items</h2><button type="button" class="btn small" id="ck-add">+ Add item</button></div>
      <p class="hint">Used on every video. Ticks already made on videos are kept.</p>
      <ol class="cklist">
        ${items
          .map(
            (it, i) => `<li data-cid="${esc(it.id)}">
          <label class="grow"><span class="sr">Item ${i + 1}</span><input data-ck value="${esc(it.text)}" /></label>
          <button type="button" class="btn icon" data-ca="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button type="button" class="btn icon" data-ca="down" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button type="button" class="btn icon danger" data-ca="del" aria-label="Remove item">✕</button></li>`,
          )
          .join('')}
      </ol>
    </div>`;
  body.addEventListener('input', (e) => {
    if (e.target.dataset.ck == null) return;
    const it = items.find((x) => x.id === e.target.closest('[data-cid]').dataset.cid);
    it.text = e.target.value;
    saveChecklist();
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ca]');
    if (!b) return;
    const i = items.findIndex((x) => x.id === b.closest('[data-cid]').dataset.cid);
    if (b.dataset.ca === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
    else if (b.dataset.ca === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
    else if (b.dataset.ca === 'del') items.splice(i, 1);
    store.saveChecklist();
    checklistSec(body);
  });
  $('#ck-add', body).addEventListener('click', () => {
    items.push({ id: 'c-' + Date.now().toString(36), text: '' });
    store.saveChecklist();
    checklistSec(body);
    $$('[data-ck]').pop().focus();
  });
}

/* ---------------- Backup ---------------- */

function backupSec(body) {
  body.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h2>Export backup</h2>
        <p>Saves everything (videos, Shorts, A/B log, weekly notes, stats, products, prompt defaults, checklist) into one file. Do this every week and keep the file in iCloud Drive or Google Drive.</p>
        <button type="button" class="btn primary" id="bk-export">Export backup file</button>
      </div>
      <div class="panel">
        <h2>Export for spreadsheets</h2>
        <p>One .zip with a CSV file per table: videos, Shorts, A/B log, weekly notes and stats. Opens in Numbers, Excel or Google Sheets. (This is for reading — to restore, use the backup file.)</p>
        <button type="button" class="btn" id="bk-csv">Export CSV files (.zip)</button>
      </div>
      <div class="panel">
        <h2>Import backup</h2>
        <p>Replaces <strong>everything</strong> in the app with the backup file. Use it on a new computer or to undo a mistake.</p>
        <label class="btn file-btn">Choose backup file…<input type="file" id="bk-import" accept="application/json,.json" /></label>
        <p class="msgline" id="bk-msg" role="status"></p>
      </div>
      <div class="panel">
        <h2>Reset demo data</h2>
        <p>Deletes all your videos and settings and brings back the starter cards and default products.</p>
        <button type="button" class="btn danger" id="bk-reset">Reset to demo data</button>
      </div>
      <div class="panel">
        <h2>Where is my data?</h2>
        <p>Only in this browser on this device. Nothing is sent anywhere. Another computer or phone has its own separate copy — move data with Export/Import.</p>
        <p class="muted">${store.state.videos.length} videos, ${store.state.shorts.length} Shorts saved here.</p>
      </div>
    </div>`;
  $('#bk-export', body).addEventListener('click', () => {
    downloadText(`channel-studio-backup-${todayISO()}.json`, JSON.stringify(store.exportData(), null, 2), 'application/json');
    toast('Backup file saved');
  });
  $('#bk-csv', body).addEventListener('click', () => {
    downloadBytes(`channel-studio-csv-${todayISO()}.zip`, csvZip(), 'application/zip');
    toast('CSV files saved (.zip)');
  });
  $('#bk-import', body).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const msg = $('#bk-msg', body);
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      msg.className = 'msgline bad';
      msg.textContent = 'That file could not be read. Pick a .json backup made by Channel Studio.';
      return;
    }
    const err = store.checkBackup(data);
    if (err) {
      msg.className = 'msgline bad';
      msg.textContent = err;
      return;
    }
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'unknown date';
    if (!confirm(`Replace everything with this backup?\n\n${data.videos.length} videos, ${(data.shorts || []).length} Shorts, saved ${when}.`)) return;
    await store.importData(data);
    toast(`Backup restored — ${data.videos.length} videos`);
  });
  $('#bk-reset', body).addEventListener('click', async () => {
    if (!confirm('Delete all videos and settings and bring back the demo data?')) return;
    await store.resetDemo();
    toast('Demo data restored');
  });
}

/* ---------------- Theme ---------------- */

function themeSec(body) {
  body.innerHTML = `
    <div class="panel narrow">
      <h2>Theme</h2>
      <div class="segmented" role="radiogroup" aria-label="Theme">
        ${['system', 'light', 'dark']
          .map((t) => `<label class="seg"><input type="radio" name="theme" value="${t}" ${store.state.theme === t ? 'checked' : ''} /><span>${t[0].toUpperCase() + t.slice(1)}</span></label>`)
          .join('')}
      </div>
      <p class="hint">"System" follows your Mac or phone setting.</p>
      <h2>Keyboard shortcuts</h2>
      <dl class="keys">
        <dt><kbd>N</kbd></dt><dd>New idea</dd>
        <dt><kbd>/</kbd></dt><dd>Search</dd>
        <dt><kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Copy the prompt or description you are looking at</dd>
      </dl>
    </div>`;
  body.addEventListener('change', (e) => {
    if (e.target.name === 'theme') store.setTheme(e.target.value);
  });
}

export function cleanup() {}
