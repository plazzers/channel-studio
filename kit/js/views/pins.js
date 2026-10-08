// Pin Factory: library of pins and the single-pin editor with live
// preview, undo and duplicate.

import * as store from '../store.js';
import { matchesChannel } from '../ctx.js';
import { TEMPLATES, templateById, plainText, pinDescription, TITLE_MAX, DESC_MAX, pinFileName } from '../pins/logic.js';
import { renderPin, canvasBlob } from '../pins/render.js';
import { fillThumbs, brandFor } from '../pins/thumbs.js';
import { $, esc, toast, debounce, confirmBox, downloadBlob } from '../util.js';
import { channelOptions, defaultChannelId, noChannelHtml } from './common.js';


let pin = null;
let history = [];
let keyHandler = null;
let filter = '';

export function render(el, r) {

  if (!store.state.channels.length) {
    el.innerHTML = noChannelHtml('the Pin Factory');
    return;
  }
  if (r.parts[0] === 'new') return newPin(r.params.template);
  if (r.parts[0]) return editor(el, r.parts[0]);
  library(el);
}

/* ---------------- Library ---------------- */

function library(el) {
  const list = store.state.pins.filter(matchesChannel).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const shown = filter ? list.filter((p) => (filter === 'single' ? !p.batchId : p.batchId === filter)) : list;
  const batches = [...new Set(list.map((p) => p.batchId).filter(Boolean))];
  el.innerHTML = `
    <section class="pins-view">
      <div class="pagehead"><h1>Pins</h1>
        <div class="row wrap"><a class="btn" href="#/batch">Batch mode</a><a class="btn primary" href="#/pins/new">+ New pin</a></div></div>
      <div class="panel">
        <h2>Start from a template</h2>
        <div class="tplgrid">${TEMPLATES.map((t, i) => `<a class="tplcard" href="#/pins/new?template=${t.id}"><span class="tplnum">${i + 1}</span><strong>${esc(t.name)}</strong><small>${esc(t.bodyHint)}</small></a>`).join('')}</div>
      </div>
      <div class="pagehead sub"><h2>Your pins <span class="count">${shown.length}</span></h2>
        <label class="field inline"><span class="sr">Show</span><select id="pl-filter">
          <option value="">All pins</option><option value="single" ${filter === 'single' ? 'selected' : ''}>Single pins</option>
          ${batches.map((b) => `<option value="${esc(b)}" ${filter === b ? 'selected' : ''}>Batch ${esc(b.replace(/^batch-/, '').slice(0, 10))}</option>`).join('')}
        </select></label></div>
      <div class="pingrid">${shown.map(pinTile).join('') || '<p class="muted panel">No pins yet. Pick a template above or use Batch mode.</p>'}</div>
    </section>`;
  $('#pl-filter', el).addEventListener('change', (e) => {
    filter = e.target.value;
    library(el);
  });
  fillThumbs(el);
}

export function pinTile(p) {
  return `<a class="pintile" href="#/pins/${esc(p.id)}" data-pin="${esc(p.id)}">
    <img data-thumb="${esc(p.id)}" alt="${esc(plainText(p.headline))}" width="300" height="450" />
    <span class="pt-title">${esc(plainText(p.title || p.headline) || 'Untitled')}</span>
    <span class="pt-meta">${esc(templateById(p.template).name)}</span>
  </a>`;
}

async function newPin(template) {
  const t = templateById(template || 'bold');
  const ch = store.channel(defaultChannelId());
  const p = store.newPin({
    channelId: ch.id,
    template: t.id,
    headline: t.sample.headline,
    title: plainText(t.sample.headline),
    body: t.sample.body,
    tag: t.sample.tag,
    link: (ch.products[0] || {}).url || '',
  });
  await store.save('pins', p, { silent: true });
  location.replace(`#/pins/${p.id}`);
}

/* ---------------- Editor ---------------- */

function snapshot() {
  return JSON.stringify(pin);
}

function editor(el, id) {
  const found = store.pin(id);
  if (!found) {
    el.innerHTML = `<div class="panel empty"><h1>Pin not found</h1><a class="btn" href="#/pins">Back to pins</a></div>`;
    return;
  }
  if (!pin || pin.id !== id) history = [];
  pin = found;
  const t = templateById(pin.template);
  el.innerHTML = `
    <section class="pin-editor">
      <a class="back" href="#/pins">← Pins</a>
      <div class="pagehead"><h1>Edit pin</h1>
        <div class="row wrap">
          <button class="btn" id="pe-undo" type="button" disabled>↶ Undo</button>
          <button class="btn" id="pe-dup" type="button">Duplicate</button>
          <button class="btn" id="pe-dl" type="button">Download PNG</button>
          <button class="btn danger ghost" id="pe-del" type="button">Delete</button>
        </div></div>
      <div class="editor-grid">
        <form class="panel" id="pe-form" autocomplete="off">
          <div class="row wrap">
            <label class="field"><span>Channel (brand kit)</span><select name="channelId">${channelOptions(pin.channelId)}</select></label>
          </div>
          <fieldset class="field"><legend>Template</legend>
            <div class="tplpick">${TEMPLATES.map((x, i) => `<label class="tplopt"><input type="radio" name="template" value="${x.id}" ${x.id === pin.template ? 'checked' : ''}/><span>${i + 1}. ${esc(x.name)}</span></label>`).join('')}</div>
          </fieldset>
          <label class="field"><span>Headline — wrap key words in *asterisks* to highlight them</span><textarea name="headline" rows="2" maxlength="160">${esc(pin.headline)}</textarea></label>
          <label class="field"><span>Body <small class="muted" id="pe-hint">${esc(t.bodyHint)}</small></span><textarea name="body" rows="6">${esc(pin.body)}</textarea></label>
          <label class="field"><span>Tag (small label, optional)</span><input name="tag" value="${esc(pin.tag)}" maxlength="30" /></label>
          <details class="more" open><summary>Pinterest details</summary>
            <label class="field"><span>Pin title <small class="muted" data-len="title"></small></span><input name="title" value="${esc(pin.title)}" maxlength="140" /></label>
            <label class="field"><span>Description <small class="muted" data-len="description"></small></span><textarea name="description" rows="3" placeholder="Leave empty to use the headline + body">${esc(pin.description)}</textarea></label>
            <label class="field"><span>Link (where the pin sends people)</span><input name="link" value="${esc(pin.link)}" inputmode="url" placeholder="https://…" /></label>
            <label class="field"><span>Pinterest board</span><input name="board" value="${esc(pin.board)}" /></label>
            <label class="field"><span>Keywords (comma separated)</span><input name="keywords" value="${esc(pin.keywords)}" /></label>
          </details>
        </form>
        <div class="panel preview-panel">
          <div class="preview"><canvas id="pe-canvas" width="1000" height="1500" aria-label="Pin preview"></canvas></div>
          <div id="pe-warn" class="pin-warn"></div>
          <p class="muted small">1000 × 1500 px (2:3), the size Pinterest recommends. Edit the brand colors, fonts, logo and footer in <a href="#/brand">Brand kit</a>.</p>
        </div>
      </div>
    </section>`;
  const form = $('#pe-form', el);
  const draw = debounce(async () => {
    const canvas = $('#pe-canvas', el);
    if (!canvas) return; // left the page
    const { warnings } = await renderPin(pin, brandFor(pin), canvas);
    const w = $('#pe-warn', el);
    if (w) w.innerHTML = warnings.map((w) => `<p class="warn">! ${esc(w)}</p>`).join('');
  }, 60);
  const lens = () => {
    const title = plainText(pin.title || pin.headline);
    const desc = pinDescription(pin);
    $('[data-len="title"]', el).textContent = `${title.length}/${TITLE_MAX}`;
    $('[data-len="title"]', el).className = title.length > TITLE_MAX ? 'bad' : 'muted';
    $('[data-len="description"]', el).textContent = `${desc.length}/${DESC_MAX}`;
    $('[data-len="description"]', el).className = desc.length > DESC_MAX ? 'bad' : 'muted';
  };
  const persist = debounce(() => store.save('pins', pin, { silent: true }), 300);
  let lastSnap = snapshot();
  const pushHistory = debounce(() => {
    history.push(lastSnap);
    if (history.length > 50) history.shift();
    lastSnap = snapshot();
    const u = $('#pe-undo', el);
    if (u) u.disabled = false;
  }, 400);
  $('#pe-undo', el).disabled = !history.length;
  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (!name) return;
    const titleWasAuto = !pin.title || pin.title === plainText(pin.headline);
    pin[name] = e.target.value;
    if (name === 'headline' && titleWasAuto) {
      pin.title = plainText(pin.headline);
      form.elements.title.value = pin.title;
    }
    if (name === 'template') $('#pe-hint', el).textContent = templateById(pin.template).bodyHint;
    lens();
    draw();
    persist();
    pushHistory();
  });
  $('#pe-undo', el).addEventListener('click', undo);
  keyHandler = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      undo();
    }
  };
  document.addEventListener('keydown', keyHandler);
  $('#pe-dup', el).addEventListener('click', async () => {
    const copy = { ...JSON.parse(snapshot()), id: store.uid('pin'), createdAt: '', batchId: '' };
    copy.title = copy.title ? `${copy.title} (copy)` : '';
    await store.save('pins', copy, { silent: true });
    toast('Pin duplicated');
    location.hash = `#/pins/${copy.id}`;
  });
  $('#pe-dl', el).addEventListener('click', async () => {
    const { canvas } = await renderPin(pin, brandFor(pin));
    downloadBlob(pinFileName(pin, 0, 'png').replace(/^001-/, ''), await canvasBlob(canvas));
  });
  $('#pe-del', el).addEventListener('click', async () => {
    if (!(await confirmBox('Delete this pin?', { ok: 'Delete', danger: true }))) return;
    await store.remove('pins', pin.id, { silent: true });
    pin = null;
    location.hash = '#/pins';
  });

  function undo() {
    if (!history.length) return;
    const prev = JSON.parse(history.pop());
    Object.keys(pin).forEach((k) => delete pin[k]);
    Object.assign(pin, prev);
    lastSnap = snapshot();
    for (const f of form.elements) {
      if (!f.name || !(f.name in pin)) continue;
      if (f.type === 'radio') f.checked = f.value === pin[f.name];
      else f.value = pin[f.name];
    }
    $('#pe-hint', el).textContent = templateById(pin.template).bodyHint;
    $('#pe-undo', el).disabled = !history.length;
    store.save('pins', pin, { silent: true });
    lens();
    draw();
    toast('Undone', 'info');
  }

  lens();
  draw();
}

export function cleanup() {
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = null;
}
