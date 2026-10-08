// Brand kit per channel: colors, fonts, logo/photo (circle crop + ring),
// footer text and CTA tag — with a live preview of every template.

import * as store from '../store.js';
import { ui } from '../ctx.js';
import { FONTS, brandOf, renderPin } from '../pins/render.js';
import { TEMPLATES, contrast } from '../pins/logic.js';
import { $, esc, toast, debounce, readDataURL } from '../util.js';
import { channelOptions, defaultChannelId, noChannelHtml } from './common.js';

let chId = '';

export function render(el) {
  if (!store.state.channels.length) {
    el.innerHTML = noChannelHtml('the brand kit');
    return;
  }
  if (!store.channel(chId) || (ui.channel !== 'all' && ui.channel !== chId)) chId = defaultChannelId();
  const ch = store.channel(chId);
  const b = brandOf(ch);
  ch.brand = b;
  const fontOpts = (sel) => Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
  el.innerHTML = `
    <section class="brand-view">
      <div class="pagehead"><h1>Brand kit</h1>
        <label class="field inline"><span>Channel</span><select id="bk-ch">${channelOptions(chId)}</select></label></div>
      <div class="editor-grid">
        <form class="panel" id="bk-form" autocomplete="off">
          <fieldset class="field"><legend>Colors</legend>
            <div class="colors3">
              ${['Main (backgrounds)', 'Accent (highlights)', 'Light (paper)'].map((l, i) => `<label class="colorfield"><input type="color" data-color="${i}" value="${esc(b.colors[i])}" /><span>${esc(l)}<code>${esc(b.colors[i])}</code></span></label>`).join('')}
            </div>
            <p class="small" id="bk-contrast"></p>
          </fieldset>
          <div class="row wrap">
            <label class="field"><span>Heading font</span><select name="headingFont">${fontOpts(b.headingFont)}</select></label>
            <label class="field"><span>Body font</span><select name="bodyFont">${fontOpts(b.bodyFont)}</select></label>
          </div>
          <fieldset class="field"><legend>Logo or photo</legend>
            <div class="logo-row">
              <div class="logo-prev ${b.ring ? 'ring' : ''}" style="--ring:${esc(b.colors[1])}">${b.logo ? `<img src="${esc(b.logo)}" alt="Your logo" />` : '<span>No logo</span>'}</div>
              <div>
                <label class="btn sm filebtn">Upload image<input type="file" id="bk-logo" accept="image/png,image/jpeg,image/webp" /></label>
                ${b.logo ? '<button class="btn sm ghost" type="button" id="bk-nologo">Remove</button>' : ''}
                <label class="check"><input type="checkbox" name="ring" ${b.ring ? 'checked' : ''}/> Accent ring around it</label>
                <p class="muted small">Cropped to a circle. Stored on this device only.</p>
              </div>
            </div>
          </fieldset>
          <label class="field"><span>Footer text (your site or handle)</span><input name="footer" value="${esc(b.footer)}" maxlength="50" /></label>
          <label class="field"><span>CTA tag (bottom right)</span><input name="cta" value="${esc(b.cta)}" maxlength="24" placeholder="SAVE FOR LATER" /></label>
        </form>
        <div class="panel">
          <h2>Preview</h2>
          <div class="brandgrid">${TEMPLATES.map((t) => `<figure><canvas data-prev="${t.id}" width="1000" height="1500" aria-label="${esc(t.name)} preview"></canvas><figcaption>${esc(t.name)}</figcaption></figure>`).join('')}</div>
        </div>
      </div>
    </section>`;
  const save = debounce(() => store.save('channels', ch), 250);
  const paint = debounce(async () => {
    if (!$('#bk-contrast', el)) return; // left the page
    const c = contrast(b.colors[0], b.colors[2]);
    $('#bk-contrast', el).innerHTML = c < 3 ? `<span class="warn">! Main and Light colors are too similar (contrast ${c.toFixed(1)}:1). Text may be hard to read.</span>` : `<span class="good">✓ Good contrast (${c.toFixed(1)}:1).</span>`;
    for (const t of TEMPLATES) {
      const sample = { ...t.sample, template: t.id };
      const cv = $(`[data-prev="${t.id}"]`, el);
      if (cv) await renderPin(sample, b, cv);
    }
  }, 120);
  $('#bk-ch', el).addEventListener('change', (e) => {
    chId = e.target.value;
    render(el);
  });
  $('#bk-form', el).addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.color != null) {
      b.colors[+t.dataset.color] = t.value;
      t.nextElementSibling.querySelector('code').textContent = t.value;
    } else if (t.name === 'ring') b.ring = t.checked;
    else if (t.name) b[t.name] = t.value;
    else return;
    paint();
    save();
  });
  $('#bk-logo', el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast('That image is over 8 MB — pick a smaller one', 'error');
    b.logo = await shrinkImage(await readDataURL(f), 400);
    await store.save('channels', ch);
    toast('Logo saved');
    render(el);
  });
  const rm = $('#bk-nologo', el);
  if (rm) {
    rm.addEventListener('click', async () => {
      b.logo = '';
      await store.save('channels', ch);
      render(el);
    });
  }
  paint();
}

/** Downscale an image (data URL) to a square-ish max size, as PNG. */
function shrinkImage(src, max) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

export function cleanup() {}
