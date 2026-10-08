// First-run onboarding: 1) create your channel, 2) add products,
// 3) add your first video. The demo channel stays until you delete it.

import * as store from '../store.js';
import { setChannelFilter } from '../ctx.js';
import { $, $$, esc, toast } from '../util.js';
import { paintChannelPicker } from '../app.js';

const COLORS = ['#6C5CE7', '#00A884', '#E8590C', '#1C7ED6', '#D6336C', '#2F9E44', '#F59F00', '#212529'];
let step = 1;
let draft = null;

function freshDraft() {
  return { name: '', niche: '', audience: '', color: COLORS[0], products: [{ label: '', url: '' }, { label: '', url: '' }], linkLine: '', video: '' };
}

export function render(el) {
  if (!draft) draft = freshDraft();
  const steps = ['Create your channel', 'Add your products', 'Add your first video'];
  el.innerHTML = `
    <section class="welcome">
      <div class="welcome-head">
        <p class="eyebrow">Welcome to the Faceless Creator Kit</p>
        <h1>Let's set up your first channel</h1>
        <p class="muted">Three quick steps. Everything is saved on this device only. A demo channel is already loaded so you can look around — delete it any time in <strong>Channels</strong>.</p>
      </div>
      <ol class="stepper" aria-label="Progress">
        ${steps.map((s, i) => `<li class="${i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}" ${i + 1 === step ? 'aria-current="step"' : ''}><span>${i + 1 < step ? '✓' : i + 1}</span>${esc(s)}</li>`).join('')}
      </ol>
      <form class="panel welcome-card" id="wz" autocomplete="off">${stepHtml()}</form>
      <p class="center"><button class="linkbtn" type="button" id="wz-skip">Skip for now — just explore the demo</button></p>
    </section>`;
  const form = $('#wz', el);
  form.addEventListener('input', () => collect(form));
  form.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-color]');
    if (sw) {
      draft.color = sw.dataset.color;
      $$('[data-color]', form).forEach((b) => b.setAttribute('aria-pressed', String(b === sw)));
    }
    if (e.target.closest('#wz-addp')) {
      collect(form);
      draft.products.push({ label: '', url: '' });
      render(el);
    }
    if (e.target.closest('#wz-back')) {
      collect(form);
      step--;
      render(el);
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    collect(form);
    if (step === 1 && !draft.name.trim()) {
      toast('Give your channel a name', 'info');
      $('#wz-name', form).focus();
      return;
    }
    if (step === 2) {
      const bad = draft.products.find((p) => p.url.trim() && !/^https?:\/\//i.test(p.url.trim()));
      if (bad) {
        toast('Links must start with https://', 'error');
        return;
      }
    }
    if (step < 3) {
      step++;
      render(el);
      const f = $('input', el);
      if (f) f.focus();
      return;
    }
    await finish();
  });
  $('#wz-skip', el).addEventListener('click', async () => {
    store.state.settings.onboarded = true;
    await store.saveSettings();
    draft = null;
    step = 1;
    location.hash = '#/board';
  });
}

function stepHtml() {
  if (step === 1) {
    return `<h2>1. Create your channel</h2>
      <label class="field"><span>Channel name</span><input id="wz-name" name="name" value="${esc(draft.name)}" placeholder="e.g. Money Made Simple" maxlength="60" required /></label>
      <label class="field"><span>Niche — what is it about?</span><input name="niche" value="${esc(draft.niche)}" placeholder="e.g. personal finance for beginners" maxlength="120" /></label>
      <label class="field"><span>Who is it for?</span><input name="audience" value="${esc(draft.audience)}" placeholder="e.g. people in their 20s starting their first job" maxlength="160" /></label>
      <fieldset class="field"><legend>Channel color</legend><div class="swatches">
        ${COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="--c:${c}" aria-label="Color ${c}" aria-pressed="${c === draft.color}"></button>`).join('')}
      </div></fieldset>
      <div class="row end"><button class="btn primary" type="submit">Next: products →</button></div>`;
  }
  if (step === 2) {
    return `<h2>2. Add your products</h2>
      <p class="muted">Links you mention in descriptions and pins: a free download, your shop, an affiliate link… You can add more later.</p>
      <div class="prod-rows">
        ${draft.products
          .map(
            (p, i) => `<div class="prod-row">
          <label class="field"><span>Label</span><input name="pl-${i}" value="${esc(p.label)}" placeholder="e.g. Free budget template" /></label>
          <label class="field"><span>Link</span><input name="pu-${i}" value="${esc(p.url)}" placeholder="https://…" inputmode="url" /></label></div>`,
          )
          .join('')}
      </div>
      <button type="button" class="btn ghost sm" id="wz-addp">+ Another product</button>
      <label class="field"><span>Default link line (goes at the top of every description)</span><input name="linkLine" value="${esc(draft.linkLine)}" placeholder="e.g. FREE budget template: https://…" /></label>
      <div class="row between"><button class="btn" type="button" id="wz-back">← Back</button><button class="btn primary" type="submit">Next: first video →</button></div>`;
  }
  return `<h2>3. Add your first video</h2>
    <p class="muted">Just a working title. It lands in the <strong>Idea</strong> column of your board.</p>
    <label class="field"><span>Video title</span><input name="video" value="${esc(draft.video)}" placeholder="e.g. 7 Money Mistakes to Avoid in Your 20s" maxlength="140" /></label>
    <div class="row between"><button class="btn" type="button" id="wz-back">← Back</button><button class="btn primary" type="submit">Finish setup ✓</button></div>`;
}

function collect(form) {
  const fd = new FormData(form);
  for (const k of ['name', 'niche', 'audience', 'linkLine', 'video']) if (fd.has(k)) draft[k] = String(fd.get(k));
  draft.products.forEach((p, i) => {
    if (fd.has(`pl-${i}`)) p.label = String(fd.get(`pl-${i}`));
    if (fd.has(`pu-${i}`)) p.url = String(fd.get(`pu-${i}`));
  });
}

async function finish() {
  const products = draft.products
    .filter((p) => p.label.trim() || p.url.trim())
    .map((p, i) => ({ id: 'p' + (i + 1) + '-' + Math.random().toString(36).slice(2, 6), label: p.label.trim() || 'Link', url: p.url.trim() }));
  const ch = store.newChannel({
    name: draft.name.trim(),
    niche: draft.niche.trim(),
    audience: draft.audience.trim(),
    color: draft.color,
    products,
    linkLine: draft.linkLine.trim(),
    order: store.state.channels.length,
  });
  ch.brand.colors = ['#1C1A27', draft.color, '#F7F3EC'];
  await store.save('channels', ch);
  let target = '#/board';
  if (draft.video.trim()) {
    const v = store.newVideo({ channelId: ch.id, title: draft.video.trim(), titles: [draft.video.trim(), '', ''] });
    v.prompt.audience = ch.audience;
    v.prompt.minutes = ch.defaultLength;
    v.description.products = products.map((p) => p.id);
    await store.save('videos', v);
    target = `#/video/${v.id}`;
  }
  store.state.settings.onboarded = true;
  await store.saveSettings();
  setChannelFilter(ch.id);
  paintChannelPicker();
  draft = null;
  step = 1;
  toast('Your channel is ready');
  location.hash = target;
}

export function cleanup() {}
