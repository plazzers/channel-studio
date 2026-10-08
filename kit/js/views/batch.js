// Batch mode: paste a table (or upload a CSV) → render all pins → preview
// grid → fix and re-render any pin → export.

import * as store from '../store.js';
import { TEMPLATES, BATCH_COLUMNS, parseBatch, plainText } from '../pins/logic.js';
import { renderPin } from '../pins/render.js';
import { fillThumbs, brandFor, thumbFor } from '../pins/thumbs.js';
import { $, esc, toast, pref, readText, downloadText } from '../util.js';
import { channelOptions, defaultChannelId, noChannelHtml } from './common.js';
import { pinTile } from './pins.js';

let draftText = null;

export const EXAMPLE_ROWS = [
  ['5 morning habits that *actually* stick', '5 morning habits that *actually* stick', 'Drink water first | Make your bed | 10 minutes outside | Plan 3 tasks | No phone for 30 min', '', 'list', 'https://example.com/habits', 'Productivity'],
  ['The 2-minute rule', 'Use the *2-minute rule* today', "If it takes less than two minutes, do it now. Small tasks stop piling up and your list gets shorter.", 'QUICK TIP', 'tip', 'https://example.com/2-minute-rule', 'Productivity'],
  ['Morning pages', 'Write *3 pages* before you check your phone', 'A simple journaling habit that clears your head', 'TRY THIS', 'bold', 'https://example.com/morning-pages', 'Journaling'],
  ['Weekly reset checklist', 'Sunday *reset* checklist', 'Clear your desk | Review the calendar | Plan meals | Pick 3 priorities | Inbox to zero | Lay out clothes', 'SAVE THIS', 'checklist', 'https://example.com/reset', 'Productivity'],
  ['Phone vs paper planner', 'Paper planner vs *app* (per year)', 'Paper planner: $24 | Premium app: $72 | Pick the one you will actually open.', '', 'money', 'https://example.com/planners', 'Planning'],
  ['To-do list do and dont', 'To-do lists: *do* vs *don’t*', "Don't: Write 25 tasks | Don't: Use vague verbs | Do: Pick 3 must-dos | Do: Start each task with a verb", '', 'compare', 'https://example.com/todo', 'Planning'],
  ['Habit quote', 'You do not rise to your goals, you *fall to your systems*.', '— A popular idea from habit research', 'WORTH SAVING', 'quote', 'https://example.com/systems', 'Motivation'],
  ['Focus box', 'The *Focus Box* method', 'Time: 25 min | Breaks: 5 min | Level: Easy | Put your phone in a box and set a timer.', 'METHOD', 'card', 'https://example.com/focus', 'Productivity'],
  ['Evening routine', '*7 steps* to a calm evening routine', 'Dim the lights | Tidy for 10 minutes | Write tomorrow’s top task | Screens off at 9 | Read 10 pages | Stretch | Same bedtime', '', 'list', 'https://example.com/evening', 'Self care'],
  ['Single tasking', 'Do *one thing* at a time', 'Multitasking feels fast but costs focus. Finish one task, then start the next.', 'REMINDER', 'bold', 'https://example.com/single-tasking', 'Productivity'],
];

export function exampleTable(sep = '\t') {
  const cell = (c) => (sep === ',' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return [BATCH_COLUMNS, ...EXAMPLE_ROWS].map((r) => r.map(cell).join(sep)).join('\n');
}

export function render(el) {
  if (!store.state.channels.length) {
    el.innerHTML = noChannelHtml('batch mode');
    return;
  }
  const batchId = pref.get('lastBatch', '');
  const pins = store.state.pins.filter((p) => batchId && p.batchId === batchId);
  el.innerHTML = `
    <section class="batch-view">
      <div class="pagehead"><h1>Batch mode</h1></div>
      <div class="panel">
        <h2>1. Paste your table</h2>
        <p class="muted">Copy rows from Google Sheets, Excel or Numbers (tab-separated) or paste CSV. First row = header with these columns:
          ${BATCH_COLUMNS.map((c) => `<code>${c}</code>`).join(' ')}. In <code>body</code>, separate lines with <code>|</code>. <code>template</code> can be a number 1–8 or a name: ${TEMPLATES.map((t, i) => `${i + 1} ${esc(t.id)}`).join(', ')}.</p>
        <label class="field"><span class="sr">Table</span><textarea id="bt-text" rows="9" spellcheck="false" placeholder="${esc(BATCH_COLUMNS.join('\t'))}">${esc(draftText ?? '')}</textarea></label>
        <div class="row wrap">
          <label class="btn sm filebtn">Upload CSV<input type="file" id="bt-file" accept=".csv,.tsv,.txt,text/csv" /></label>
          <button class="btn sm ghost" type="button" id="bt-example">Fill with an example (10 pins)</button>
          <button class="btn sm ghost" type="button" id="bt-dlex">Download example CSV</button>
        </div>
        <div class="row wrap">
          <label class="field"><span>Channel (brand kit)</span><select id="bt-ch">${channelOptions(defaultChannelId())}</select></label>
          <label class="field"><span>Template when the cell is empty</span><select id="bt-tpl">${TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
        </div>
        <div id="bt-msg"></div>
        <div class="row end"><button class="btn primary big" type="button" id="bt-go">Render pins</button></div>
      </div>
      <div class="panel" id="bt-result" ${pins.length ? '' : 'hidden'}>
        <div class="panel-head"><h2>2. Check your pins <span class="count" id="bt-count">${pins.length}</span></h2>
          <a class="btn primary" href="#/export?batch=${esc(batchId)}" id="bt-export">3. Export this batch →</a></div>
        <p class="muted small">Click a pin to fix it — it re-renders right away. Pins with a ! need a look.</p>
        <div class="pingrid" id="bt-grid">${pins.map(pinTile).join('')}</div>
      </div>
    </section>
    <dialog class="dlg wide" id="bt-dlg"></dialog>`;
  const ta = $('#bt-text', el);
  ta.addEventListener('input', () => (draftText = ta.value));
  $('#bt-example', el).addEventListener('click', () => {
    ta.value = draftText = exampleTable('\t');
  });
  $('#bt-dlex', el).addEventListener('click', () => {
    downloadText('pin-batch-example.csv', exampleTable(','), 'text/csv');
  });
  $('#bt-file', el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    ta.value = draftText = await readText(f);
    toast(`Loaded ${f.name}`);
  });
  $('#bt-go', el).addEventListener('click', () => go(el));
  $('#bt-grid', el).addEventListener('click', (e) => {
    const tile = e.target.closest('[data-pin]');
    if (!tile) return;
    e.preventDefault();
    openFix(el, tile.dataset.pin);
  });
  markWarnings(el);
  fillThumbs(el);
}

async function go(el) {
  const msg = $('#bt-msg', el);
  const res = parseBatch($('#bt-text', el).value, { defaultTemplate: $('#bt-tpl', el).value });
  const notes = [...res.errors.map((x) => `<li class="bad">✕ ${esc(x)}</li>`), ...res.warnings.map((x) => `<li class="warn">! ${esc(x)}</li>`)];
  msg.innerHTML = notes.length ? `<ul class="errors">${notes.join('')}</ul>` : '';
  if (!res.pins.length) return;
  const ch = store.channel($('#bt-ch', el).value);
  const batchId = 'batch-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '-' + Math.random().toString(36).slice(2, 5);
  const pins = res.pins.map((p, i) =>
    store.newPin({ ...p, row: undefined, channelId: ch.id, batchId, order: i, keywords: (ch.keywords || []).join(', ') }),
  );
  await store.saveMany('pins', pins);
  pref.set('lastBatch', batchId);
  const btn = $('#bt-go', el);
  btn.disabled = true;
  btn.textContent = 'Rendering…';
  // Render every pin once (fills the preview cache, finds overflow).
  for (const [i, p] of pins.entries()) {
    btn.textContent = `Rendering ${i + 1}/${pins.length}…`;
    await thumbFor(p);
  }
  toast(`${pins.length} pins rendered`);
  render(el);
  $('#bt-result', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Add a ! badge to pins whose text does not fit. */
async function markWarnings(el) {
  for (const tile of el.querySelectorAll('#bt-grid [data-pin]')) {
    const p = store.pin(tile.dataset.pin);
    if (!p) continue;
    const { warnings } = await renderPin(p, brandFor(p));
    tile.classList.toggle('flag', warnings.length > 0);
    tile.title = warnings.join(' ');
  }
}

function openFix(el, id) {
  const p = store.pin(id);
  const dlg = $('#bt-dlg', el);
  dlg.innerHTML = `<form method="dialog" class="fixform">
    <div class="panel-head"><h2>Fix pin</h2><button class="iconbtn" value="cancel" aria-label="Close">✕</button></div>
    <div class="editor-grid">
      <div>
        <label class="field"><span>Template</span><select name="template">${TEMPLATES.map((t) => `<option value="${t.id}" ${t.id === p.template ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Headline (*highlight*)</span><textarea name="headline" rows="2">${esc(p.headline)}</textarea></label>
        <label class="field"><span>Body</span><textarea name="body" rows="5">${esc(p.body)}</textarea></label>
        <label class="field"><span>Tag</span><input name="tag" value="${esc(p.tag)}" /></label>
        <label class="field"><span>Title</span><input name="title" value="${esc(p.title)}" /></label>
        <label class="field"><span>Link</span><input name="link" value="${esc(p.link)}" /></label>
        <label class="field"><span>Board</span><input name="board" value="${esc(p.board)}" /></label>
      </div>
      <div class="preview"><canvas id="fx-canvas" width="1000" height="1500"></canvas><div id="fx-warn" class="pin-warn"></div></div>
    </div>
    <div class="row end"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="save" id="fx-save">Save &amp; re-render</button></div>
  </form>`;
  const form = $('form', dlg);
  const draft = { ...p };
  const draw = async () => {
    const { warnings } = await renderPin(draft, brandFor(draft), $('#fx-canvas', dlg));
    $('#fx-warn', dlg).innerHTML = warnings.map((w) => `<p class="warn">! ${esc(w)}</p>`).join('');
  };
  form.addEventListener('input', (e) => {
    if (e.target.name) draft[e.target.name] = e.target.value;
    draw();
  });
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'save') return;
    Object.assign(p, draft);
    if (!p.title) p.title = plainText(p.headline);
    await store.save('pins', p, { silent: true });
    const tile = $(`#bt-grid [data-pin="${id}"]`, el);
    tile.outerHTML = pinTile(p);
    fillThumbs($('#bt-grid', el));
    markWarnings(el);
    toast('Pin re-rendered');
  };
  dlg.returnValue = '';
  dlg.showModal();
  draw();
}

export function cleanup() {}

