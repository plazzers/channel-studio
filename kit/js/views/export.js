// Export pins: images (PNG, or JPG under 350 KB) in a ZIP plus the
// Pinterest bulk-upload CSV, with UTM links, a schedule and length checks.

import * as store from '../store.js';
import { matchesChannel } from '../ctx.js';
import {
  pinterestRows,
  pinterestCSV,
  splitRows,
  pinFileName,
  normalizeBaseUrl,
  addUtm,
  utmSlug,
  buildSchedule,
  parseTimes,
  defaultTimes,
  shorten,
  pinDescription,
  plainText,
  TITLE_MAX,
  DESC_MAX,
  CSV_MAX_ROWS,
  templateById,
} from '../pins/logic.js';
import { renderPin, canvasBlob, jpgUnder } from '../pins/render.js';
import { brandFor } from '../pins/thumbs.js';
import { makeZip } from '../zip.js';
import { $, $$, esc, toast, todayISO, downloadBlob, downloadText, debounce } from '../util.js';
import { chDot, noChannelHtml } from './common.js';
import { addDays } from '../logic.js';

let selection = null; // Set of pin ids
let source = '';

const cfg = () => store.state.settings.pinExport;

export function render(el, r) {
  if (!store.state.channels.length) {
    el.innerHTML = noChannelHtml('export');
    return;
  }
  if (r.params.batch != null && r.params.batch !== source) {
    source = r.params.batch;
    selection = null;
  }
  const all = store.state.pins.filter(matchesChannel);
  const batches = [...new Set(all.map((p) => p.batchId).filter(Boolean))];
  const inSource = all.filter((p) => !source || (source === 'single' ? !p.batchId : p.batchId === source)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  if (!selection) selection = new Set(inSource.map((p) => p.id));
  const c = cfg();
  if (!c.schedule.start) c.schedule.start = addDays(todayISO(), 1);
  el.innerHTML = `
    <section class="export-view">
      <div class="pagehead"><h1>Export pins</h1></div>
      <div class="grid2">
        <div class="panel">
          <div class="panel-head"><h2>1. Pick pins <span class="count" id="ex-n"></span></h2>
            <label class="field inline"><span class="sr">Source</span><select id="ex-src">
              <option value="">All pins</option><option value="single" ${source === 'single' ? 'selected' : ''}>Single pins</option>
              ${batches.map((b) => `<option value="${esc(b)}" ${b === source ? 'selected' : ''}>Batch ${esc(b.replace(/^batch-/, '').slice(0, 10))}</option>`).join('')}
            </select></label></div>
          <div class="row"><button class="btn sm ghost" id="ex-all" type="button">Select all</button><button class="btn sm ghost" id="ex-none" type="button">Select none</button></div>
          <ul class="picklist" id="ex-list">${inSource.map((p) => `<li><label class="check"><input type="checkbox" data-id="${esc(p.id)}" ${selection.has(p.id) ? 'checked' : ''}/> ${chDot(p.channelId)}<span>${esc(plainText(p.title || p.headline))}</span> <small class="muted">${esc(templateById(p.template).name)}</small></label></li>`).join('') || '<li class="muted">No pins here yet.</li>'}</ul>
        </div>
        <div class="panel">
          <h2>2. Images</h2>
          <div class="seg" role="radiogroup" aria-label="Image format">
            <label><input type="radio" name="fmt" value="png" ${c.format === 'png' ? 'checked' : ''}/> PNG (best quality)</label>
            <label><input type="radio" name="fmt" value="jpg" ${c.format === 'jpg' ? 'checked' : ''}/> JPG (under 350 KB each)</label>
          </div>
          <h2>3. Where will the images live?</h2>
          <label class="field"><span>Public base URL of your image folder</span><input id="ex-base" value="${esc(c.baseUrl)}" placeholder="https://yourname.github.io/pins/" inputmode="url" /></label>
          <p class="small" id="ex-baseinfo"></p>
          <details class="howto"><summary>How do I get a public URL? (free, ~5 minutes)</summary>
            <p>Pinterest downloads each image from the web, so the images must be online before you upload the CSV.</p>
            <ol>
              <li><strong>GitHub Pages (free):</strong> create a free account at github.com → <em>New repository</em> (e.g. <code>pins</code>, Public) → <em>Add file → Upload files</em> → drag in all images from the ZIP → <em>Commit</em>.</li>
              <li>In the repository: <em>Settings → Pages</em> → Source: <em>Deploy from a branch</em> → Branch: <em>main</em>, <em>/ (root)</em> → <em>Save</em>. Wait 1–2 minutes.</li>
              <li>Your base URL is <code>https://YOUR-USERNAME.github.io/pins/</code>. Open one image (base URL + file name) in your browser to check.</li>
              <li><strong>Any other host</strong> works too (your own website, Netlify, Cloudflare Pages…): upload the images to one folder and use that folder's address.</li>
            </ol>
            <p>Type the base URL <em>before</em> you download, so the CSV has the right addresses. File names in the ZIP must not be changed.</p>
          </details>
        </div>
      </div>
      <div class="grid2">
        <div class="panel">
          <h2>4. Links (UTM)</h2>
          <label class="check"><input type="checkbox" id="ex-utm" ${c.utm.on ? 'checked' : ''}/> Add UTM tags so you can see Pinterest visits in your analytics</label>
          <div class="row wrap">
            <label class="field"><span>Campaign</span><input id="ex-camp" value="${esc(c.utm.campaign)}" /></label>
            <label class="check"><input type="checkbox" id="ex-content" ${c.utm.content ? 'checked' : ''}/> utm_content = pin name</label>
          </div>
          <p class="small muted mono" id="ex-utmprev"></p>
          <label class="field"><span>Default keywords (used when a pin has none)</span><input id="ex-kw" value="${esc(c.keywords)}" placeholder="keyword one, keyword two" /></label>
        </div>
        <div class="panel">
          <h2>5. Schedule</h2>
          <label class="check"><input type="checkbox" id="ex-sch" ${c.schedule.on ? 'checked' : ''}/> Fill in publish dates</label>
          <div class="row wrap">
            <label class="field"><span>Start date</span><input type="date" id="ex-start" value="${esc(c.schedule.start)}" /></label>
            <label class="field"><span>Pins per day</span><input type="number" min="1" max="25" id="ex-per" value="${esc(c.schedule.perDay)}" /></label>
          </div>
          <label class="field"><span>Times (24 h, comma separated)</span><input id="ex-times" value="${esc(c.schedule.times)}" placeholder="09:00, 14:00, 20:00" /></label>
          <label class="check"><input type="checkbox" id="ex-spread" ${c.schedule.spread ? 'checked' : ''}/> Spread similar pins apart (same link or same board + template)</label>
          <p class="small muted" id="ex-schinfo"></p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>6. Check &amp; download</h2>
          <div class="row wrap"><button class="btn" id="ex-csv" type="button">Download CSV only</button><button class="btn primary big" id="ex-zip" type="button">Download ZIP (images + CSV)</button></div></div>
        <div id="ex-problems"></div>
        <div class="tablewrap"><table class="csvprev" id="ex-prev"></table></div>
        <p class="muted small">Upload the CSV at Pinterest: <em>Create → Create Pin → Bulk create Pins → Upload .csv</em> (wording can change; look for "bulk create"). Pinterest accepts up to ${CSV_MAX_ROWS} pins per file — bigger exports are split for you.</p>
        <progress id="ex-prog" max="1" value="0" hidden></progress>
      </div>
    </section>`;
  bind(el);
  paint(el);
}

/** The export plan: ordered items with file names, dates and final links. */
export function plan() {
  const c = cfg();
  const pins = store.state.pins.filter((p) => selection.has(p.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const ext = c.format === 'jpg' ? 'jpg' : 'png';
  const sched = buildSchedule(pins, { start: c.schedule.on ? c.schedule.start : '', perDay: c.schedule.perDay, times: c.schedule.times, spread: c.schedule.on && c.schedule.spread });
  return sched.map(({ item, date, time }, i) => {
    const fileName = pinFileName(item, i, ext);
    const link = c.utm.on ? addUtm(item.link, { campaign: c.utm.campaign, content: c.utm.content ? utmSlug(item.title || item.headline) : '' }) : item.link;
    return { pin: { ...item, link }, original: item, fileName, date, time };
  });
}

function paint(el) {
  const c = cfg();
  const items = plan();
  $('#ex-n', el).textContent = `${items.length} selected`;
  const base = normalizeBaseUrl(c.baseUrl);
  $('#ex-baseinfo', el).innerHTML = c.baseUrl && !base ? '<span class="bad">✕ That is not a web address. It must start with https://</span>' : base ? `<span class="good">✓ Media URL example: <code>${esc(base + (items[0] ? items[0].fileName : '001-my-pin.png'))}</code></span>` : '<span class="muted">Needed for the CSV (not for the images).</span>';
  const ex = items.find((x) => x.original.link);
  $('#ex-utmprev', el).textContent = ex ? `Example: ${ex.pin.link}` : 'Pins have no links yet.';
  const times = parseTimes(c.schedule.times);
  const usedTimes = times.length >= c.schedule.perDay ? times.slice(0, c.schedule.perDay) : defaultTimes(c.schedule.perDay);
  const lastDate = items.length && items[items.length - 1].date;
  $('#ex-schinfo', el).textContent = c.schedule.on
    ? `${items.length} pins · ${c.schedule.perDay} a day at ${usedTimes.join(', ')}${times.length < c.schedule.perDay ? ' (not enough times typed — spaced evenly)' : ''} · last one on ${lastDate || '—'}. Times are in the time zone of your Pinterest account.`
    : 'No dates: the pins publish as soon as Pinterest processes the file.';
  const { rows, problems } = pinterestRows(items, { baseUrl: c.baseUrl, keywords: c.keywords });
  const tooLong = problems.some((p) => /characters \(max/.test(p));
  $('#ex-problems', el).innerHTML = problems.length
    ? `<div class="problems"><ul class="errors">${problems.slice(0, 12).map((p) => `<li>${esc(p)}</li>`).join('')}${problems.length > 12 ? `<li>…and ${problems.length - 12} more</li>` : ''}</ul>
       ${tooLong ? `<button class="btn sm" id="ex-fix" type="button">Shorten long titles/descriptions automatically</button>` : ''}</div>`
    : items.length
      ? '<p class="good">✓ Ready: every title ≤ 100 and description ≤ 500 characters, every pin has a board.</p>'
      : '';
  const head = ['#', 'Title', 'Media URL', 'Pinterest board', 'Description', 'Link', 'Publish date', 'Keywords'];
  $('#ex-prev', el).innerHTML = rows.length
    ? `<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
        .slice(0, 8)
        .map((r, i) => `<tr><td>${i + 1}</td><td class="${r.Title.length > TITLE_MAX ? 'bad' : ''}">${esc(r.Title)}</td><td>${esc(r['Media URL'] || '—')}</td><td>${esc(r['Pinterest board'])}</td><td class="${r.Description.length > DESC_MAX ? 'bad' : ''}">${esc(shorten(r.Description, 90))}</td><td>${esc(shorten(r.Link, 60))}</td><td>${esc(r['Publish date'])}</td><td>${esc(r.Keywords)}</td></tr>`)
        .join('')}${rows.length > 8 ? `<tr><td colspan="8" class="muted">…and ${rows.length - 8} more rows</td></tr>` : ''}</tbody>`
    : '';
  const fix = $('#ex-fix', el);
  if (fix) {
    fix.addEventListener('click', async () => {
      const changed = [];
      for (const { original } of items) {
        const t = plainText(original.title || original.headline);
        const d = pinDescription(original);
        if (t.length > TITLE_MAX || d.length > DESC_MAX) {
          original.title = shorten(t, TITLE_MAX);
          original.description = shorten(d, DESC_MAX);
          changed.push(original);
        }
      }
      await store.saveMany('pins', changed);
      toast(`${changed.length} pin${changed.length === 1 ? '' : 's'} shortened`);
      paint(el);
    });
  }
  const blocked = !items.length;
  $('#ex-zip', el).disabled = blocked;
  $('#ex-csv', el).disabled = blocked;
}

function bind(el) {
  const c = cfg();
  const persist = debounce(() => store.saveSettings('pinExport'), 300);
  const changed = () => {
    paint(el);
    persist();
  };
  $('#ex-src', el).addEventListener('change', (e) => {
    location.hash = `#/export?batch=${encodeURIComponent(e.target.value)}`;
  });
  $('#ex-list', el).addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.checked) selection.add(id);
    else selection.delete(id);
    paint(el);
  });
  $('#ex-all', el).addEventListener('click', () => {
    $$('#ex-list [data-id]', el).forEach((x) => {
      x.checked = true;
      selection.add(x.dataset.id);
    });
    paint(el);
  });
  $('#ex-none', el).addEventListener('click', () => {
    $$('#ex-list [data-id]', el).forEach((x) => (x.checked = false));
    selection.clear();
    paint(el);
  });
  $('.seg', el).addEventListener('change', (e) => {
    if (e.target.name === 'fmt') {
      c.format = e.target.value;
      changed();
    }
  });
  const fields = {
    '#ex-base': (t) => (c.baseUrl = t.value.trim()),
    '#ex-utm': (t) => (c.utm.on = t.checked),
    '#ex-camp': (t) => (c.utm.campaign = t.value),
    '#ex-content': (t) => (c.utm.content = t.checked),
    '#ex-kw': (t) => (c.keywords = t.value),
    '#ex-sch': (t) => (c.schedule.on = t.checked),
    '#ex-start': (t) => (c.schedule.start = t.value),
    '#ex-per': (t) => (c.schedule.perDay = Math.max(1, Math.min(25, Number(t.value) || 1))),
    '#ex-times': (t) => (c.schedule.times = t.value),
    '#ex-spread': (t) => (c.schedule.spread = t.checked),
  };
  for (const [sel, set] of Object.entries(fields)) {
    $(sel, el).addEventListener('input', (e) => {
      set(e.target);
      changed();
    });
  }
  $('#ex-csv', el).addEventListener('click', () => {
    const files = csvFiles();
    if (!files) return;
    for (const f of files) downloadText(f.name, f.data, 'text/csv');
  });
  $('#ex-zip', el).addEventListener('click', () => downloadZip(el));
}

function csvFiles() {
  const c = cfg();
  const items = plan();
  const { rows, problems } = pinterestRows(items, { baseUrl: c.baseUrl, keywords: c.keywords });
  if (problems.length) {
    toast('Fix the problems listed above first', 'error');
    return null;
  }
  const parts = splitRows(rows);
  return parts.map((part, i) => ({ name: parts.length > 1 ? `pinterest-bulk-${i + 1}.csv` : 'pinterest-bulk.csv', data: pinterestCSV(part) }));
}

async function downloadZip(el) {
  const c = cfg();
  const items = plan();
  const { problems } = pinterestRows(items, { baseUrl: c.baseUrl, keywords: c.keywords });
  const csvs = problems.length ? [] : csvFiles();
  const btn = $('#ex-zip', el);
  const prog = $('#ex-prog', el);
  btn.disabled = true;
  prog.hidden = false;
  prog.max = items.length;
  const files = [];
  try {
    for (const [i, it] of items.entries()) {
      btn.textContent = `Rendering ${i + 1}/${items.length}…`;
      prog.value = i;
      const { canvas } = await renderPin(it.original, brandFor(it.original));
      const blob = c.format === 'jpg' ? (await jpgUnder(canvas)).blob : await canvasBlob(canvas);
      files.push({ name: it.fileName, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    for (const f of csvs) files.push(f);
    files.push({ name: 'READ-ME.txt', data: readme(c, items.length, !!csvs.length) });
    const zip = makeZip(files);
    downloadBlob(`pins-${todayISO()}.zip`, new Blob([zip], { type: 'application/zip' }));
    toast(csvs.length ? `ZIP ready: ${items.length} images + CSV` : `ZIP ready: ${items.length} images (no CSV — fix the problems listed)`, csvs.length ? 'ok' : 'info');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download ZIP (images + CSV)';
    prog.hidden = true;
  }
}

function readme(c, n, hasCsv) {
  const base = normalizeBaseUrl(c.baseUrl) || '(not set)';
  return [
    'Faceless Creator Kit — pin export',
    '',
    `${n} images. Base URL used in the CSV: ${base}`,
    '',
    '1. Upload ALL the images (do not rename them) to the folder at the base URL above.',
    '2. Open one image address in your browser to check it is public.',
    hasCsv ? '3. In Pinterest, use "Bulk create Pins" and upload pinterest-bulk.csv.' : '3. The CSV was not included because some pins had problems. Fix them in the kit and export again.',
    '',
    'Publish dates are in the time zone of your Pinterest account.',
    '',
  ].join('\r\n');
}

export function cleanup() {}
