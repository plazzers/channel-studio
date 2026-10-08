// Channels: add, edit and delete channels — name, color, niche, product
// links, keywords, default link line, disclaimer and hashtags.

import * as store from '../store.js';
import { ui, setChannelFilter } from '../ctx.js';
import { wordList } from '../logic.js';
import { $, $$, esc, toast, debounce, confirmBox } from '../util.js';
import { paintChannelPicker } from '../app.js';

export function render(el, r) {
  const id = r.parts[0];
  if (id === 'new') return create();
  if (id && store.channel(id)) return edit(el, store.channel(id));
  list(el);
}

async function create() {
  const ch = store.newChannel({ name: `Channel ${store.state.channels.length + 1}` });
  await store.save('channels', ch);
  location.replace(`#/channels/${ch.id}`);
}

function list(el) {
  const words = store.state.settings.titleWords;
  el.innerHTML = `
    <section class="channels-view">
      <div class="pagehead"><h1>Channels</h1><a class="btn primary" href="#/channels/new">+ New channel</a></div>
      <div class="chlist">${store.state.channels
        .map((c) => {
          const n = store.state.videos.filter((v) => v.channelId === c.id).length;
          const p = store.state.pins.filter((v) => v.channelId === c.id).length;
          return `<a class="panel chcard" href="#/channels/${esc(c.id)}" style="--c:${esc(c.color)}"><span class="chbar"></span>
            <strong>${esc(c.name)}</strong>${c.demo ? ' <span class="pill">demo</span>' : ''}<span class="muted small">${esc(c.niche || 'No niche set')}</span>
            <span class="small">${n} video${n === 1 ? '' : 's'} · ${p} pin${p === 1 ? '' : 's'} · ${(c.products || []).length} product link${(c.products || []).length === 1 ? '' : 's'}</span></a>`;
        })
        .join('') || '<p class="muted panel">No channels yet.</p>'}</div>
      <div class="panel">
        <h2>Title lab word lists (all channels)</h2>
        <p class="muted small">Used by the title score. One word or phrase per line or comma separated.</p>
        <div class="grid2 tight">
          <label class="field"><span>Curiosity / pain words (+15 points)</span><textarea id="tw-power" rows="5">${esc(words.power.join(', '))}</textarea></label>
          <label class="field"><span>Clickbait words (lose 10 points)</span><textarea id="tw-cb" rows="5">${esc(words.clickbait.join(', '))}</textarea></label>
        </div>
      </div>
    </section>`;
  const persist = debounce(() => store.saveSettings('titleWords'), 400);
  const saveWords = () => {
    words.power = wordList($('#tw-power', el).value);
    words.clickbait = wordList($('#tw-cb', el).value);
    persist();
  };
  $('#tw-power', el).addEventListener('input', saveWords);
  $('#tw-cb', el).addEventListener('input', saveWords);
}

function edit(el, ch) {
  el.innerHTML = `
    <section class="channel-edit">
      <a class="back" href="#/channels">← Channels</a>
      <div class="pagehead"><h1>${esc(ch.name)}</h1>${ch.demo ? '<span class="pill">demo channel</span>' : ''}</div>
      <form class="grid2" id="ch-form" autocomplete="off">
        <div class="panel">
          <h2>About</h2>
          <div class="row wrap">
            <label class="field grow"><span>Name</span><input name="name" value="${esc(ch.name)}" maxlength="60" /></label>
            <label class="field"><span>Color</span><input type="color" name="color" value="${esc(ch.color)}" /></label>
          </div>
          <label class="field"><span>Niche</span><input name="niche" value="${esc(ch.niche)}" maxlength="120" /></label>
          <label class="field"><span>Audience</span><input name="audience" value="${esc(ch.audience)}" maxlength="160" /></label>
          <label class="field"><span>Default video length (minutes)</span><input type="number" min="1" max="180" name="defaultLength" value="${esc(ch.defaultLength)}" /></label>
          <label class="field"><span>Keywords (comma separated) — used by the title score and pins</span><textarea name="keywords" rows="2">${esc((ch.keywords || []).join(', '))}</textarea></label>
        </div>
        <div class="panel">
          <h2>Product links</h2>
          <div id="ch-prods">${prodRows(ch)}</div>
          <button class="btn sm ghost" type="button" id="ch-addp">+ Add a product link</button>
          <h2>Description defaults</h2>
          <label class="field"><span>Default link line (top of each description)</span><input name="linkLine" value="${esc(ch.linkLine)}" /></label>
          <label class="field"><span>Disclaimer</span><textarea name="disclaimer" rows="2">${esc(ch.disclaimer)}</textarea></label>
          <label class="field"><span>Hashtags</span><input name="hashtags" value="${esc(ch.hashtags)}" placeholder="#tag1 #tag2" /></label>
        </div>
      </form>
      <div class="panel danger-zone">
        <h2>Delete this channel</h2>
        <p class="muted">Deletes the channel with all its videos, Shorts, stats, topics and pins. This cannot be undone (make a backup first if unsure).</p>
        <button class="btn danger" type="button" id="ch-del">Delete “${esc(ch.name)}”</button>
      </div>
    </section>`;
  const form = $('#ch-form', el);
  const save = debounce(() => store.save('channels', ch), 300);
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.p != null) {
      const p = ch.products[+t.dataset.p];
      p[t.dataset.k] = t.value;
      t.classList.toggle('invalid', t.dataset.k === 'url' && t.value.trim() !== '' && !/^https?:\/\//i.test(t.value.trim()));
    } else if (t.name === 'keywords') ch.keywords = wordList(t.value);
    else if (t.name === 'defaultLength') ch.defaultLength = Number(t.value) || 10;
    else if (t.name) ch[t.name] = t.value;
    if (t.name === 'name') $('h1', el).textContent = t.value;
    save();
  });
  $('#ch-addp', el).addEventListener('click', () => {
    ch.products.push({ id: store.uid('p'), label: '', url: '' });
    $('#ch-prods', el).innerHTML = prodRows(ch);
    $$('#ch-prods [data-k="label"]', el).pop().focus();
    save();
  });
  $('#ch-prods', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-delp]');
    if (!b) return;
    ch.products.splice(+b.dataset.delp, 1);
    $('#ch-prods', el).innerHTML = prodRows(ch);
    save();
  });
  $('#ch-del', el).addEventListener('click', async () => {
    if (!(await confirmBox(`Delete “${ch.name}” and everything in it?`, { ok: 'Delete channel', danger: true }))) return;
    await store.removeChannel(ch.id);
    if (ui.channel === ch.id) setChannelFilter('all');
    paintChannelPicker();
    toast('Channel deleted');
    location.hash = '#/channels';
  });
}

function prodRows(ch) {
  if (!ch.products.length) return '<p class="muted small">No product links yet.</p>';
  return ch.products
    .map(
      (p, i) => `<div class="prod-row">
      <label class="field"><span>Label</span><input data-p="${i}" data-k="label" value="${esc(p.label)}" /></label>
      <label class="field"><span>Link</span><input data-p="${i}" data-k="url" value="${esc(p.url)}" inputmode="url" placeholder="https://…" /></label>
      <button class="iconbtn" type="button" data-delp="${i}" aria-label="Remove ${esc(p.label || 'product')}">✕</button></div>`,
    )
    .join('');
}

export function cleanup() {}
