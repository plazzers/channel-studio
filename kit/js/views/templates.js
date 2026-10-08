// Prompt templates: edit the three built-in ones, add your own, and set a
// fixed ending line that is always the last line of the prompt.

import * as store from '../store.js';
import { PROMPT_PLACEHOLDERS, DEFAULT_TEMPLATES, buildPrompt, unknownPlaceholders } from '../logic.js';
import { $, esc, toast, debounce, confirmBox, pref } from '../util.js';

const SAMPLE = {
  title: '7 Mistakes Beginners Make',
  channel: 'Your Channel',
  niche: 'your niche',
  audience: 'beginners',
  minutes: 10,
  wpm: 150,
  points: 'First mistake\nSecond mistake\nThird mistake',
  keywords: 'keyword one, keyword two',
  product: 'Free checklist',
  notes: '',
};

export function render(el) {
  const list = store.state.templates;
  let cur = list.find((t) => t.id === pref.get('tplOpen', '')) || list[0];
  el.innerHTML = `
    <section class="templates-view">
      <div class="pagehead"><h1>Prompt templates</h1><button class="btn primary" id="tp-new" type="button">+ New template</button></div>
      <div class="tpl-layout">
        <nav class="panel tpl-list" aria-label="Templates">${list.map((t) => `<button type="button" data-open="${esc(t.id)}" class="${t.id === cur.id ? 'on' : ''}">${esc(t.name)}${t.builtIn ? ' <small class="muted">built-in</small>' : ''}</button>`).join('')}</nav>
        <div class="panel" id="tp-edit"></div>
      </div>
    </section>`;
  const open = (t) => {
    cur = t;
    pref.set('tplOpen', t.id);
    $('#tp-edit', el).innerHTML = `
      <label class="field"><span>Name</span><input id="te-name" value="${esc(t.name)}" maxlength="60" /></label>
      <label class="field"><span>Template text</span><textarea id="te-body" rows="16" spellcheck="false">${esc(t.body)}</textarea></label>
      <p class="small">Placeholders: ${PROMPT_PLACEHOLDERS.map(([k, d]) => `<code title="${esc(d)}">{${k}}</code>`).join(' ')}. A line like <code>Notes: {notes}</code> disappears when it is empty.</p>
      <p id="te-unknown" class="small"></p>
      <label class="field"><span>Fixed ending line (always the very last line)</span><input id="te-end" value="${esc(t.endLine || '')}" maxlength="200" /></label>
      <h3>Preview with sample values</h3>
      <pre class="output small" id="te-prev"></pre>
      <div class="row between">
        ${t.builtIn ? '<button class="btn ghost" type="button" id="te-reset">Restore original text</button>' : '<span></span>'}
        <button class="btn danger ghost" type="button" id="te-del" ${list.length <= 1 ? 'disabled' : ''}>Delete template</button>
      </div>`;
    const prev = () => {
      $('#te-prev', el).textContent = buildPrompt(t, SAMPLE);
      const unk = unknownPlaceholders(t.body);
      $('#te-unknown', el).innerHTML = unk.length ? `<span class="warn">! Unknown placeholder${unk.length > 1 ? 's' : ''}: ${unk.map((k) => `{${esc(k)}}`).join(', ')} — left as typed.</span>` : '';
    };
    prev();
    const save = debounce(() => store.saveTemplates(), 300);
    $('#te-name', el).addEventListener('input', (e) => {
      t.name = e.target.value;
      $(`[data-open="${t.id}"]`, el).firstChild.textContent = t.name;
      save();
    });
    $('#te-body', el).addEventListener('input', (e) => {
      t.body = e.target.value;
      prev();
      save();
    });
    $('#te-end', el).addEventListener('input', (e) => {
      t.endLine = e.target.value;
      prev();
      save();
    });
    const reset = $('#te-reset', el);
    if (reset) {
      reset.addEventListener('click', async () => {
        const orig = DEFAULT_TEMPLATES.find((d) => d.id === t.id);
        if (!orig || !(await confirmBox('Restore the original text of this template?', { ok: 'Restore' }))) return;
        Object.assign(t, JSON.parse(JSON.stringify(orig)));
        await store.saveTemplates();
        render(el);
      });
    }
    $('#te-del', el).addEventListener('click', async () => {
      if (!(await confirmBox(`Delete the template “${t.name}”?`, { ok: 'Delete', danger: true }))) return;
      store.state.templates = store.state.templates.filter((x) => x.id !== t.id);
      await store.saveTemplates();
      render(el);
    });
  };
  $('.tpl-list', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    pref.set('tplOpen', b.dataset.open);
    render(el);
  });
  $('#tp-new', el).addEventListener('click', async () => {
    const t = {
      id: store.uid('tpl'),
      name: 'My template',
      builtIn: false,
      endLine: 'Write the full script now.',
      body: 'Write a script for my YouTube channel "{channel}" about {niche}.\n\nTITLE: {title}\nAUDIENCE: {audience}\nLENGTH: about {minutes} minutes ({words} spoken words)\n\nCover these points in order:\n{points}\n\nNotes: {notes}',
    };
    store.state.templates.push(t);
    await store.saveTemplates();
    pref.set('tplOpen', t.id);
    toast('Template added');
    render(el);
  });
  open(cur);
}

export function cleanup() {}
