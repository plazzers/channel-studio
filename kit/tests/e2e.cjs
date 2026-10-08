// End-to-end check of the Faceless Creator Kit with Playwright (preinstalled
// Chromium) at desktop 1440x900 and phone 390x844.
//   node kit/tests/e2e.cjs            (from the repo root)
// Flow: gate → onboarding → create channel → 8 pin templates → batch of 10 →
// export ZIP + CSV (opened and checked in Python) → planner flows.
// Fails on any console error. Screenshots go to kit/docs/screens/.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')));
}

const REPO = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(REPO, 'kit', 'docs', 'screens');
const PORT = 4175;
const ORIGIN = `http://localhost:${PORT}`;
const KIT = `${ORIGIN}/kit/`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-e2e-'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(REPO, p);
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

const results = [];
function check(label, cond, detail = '') {
  results.push({ label, ok: !!cond, detail });
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail ? `\n      ${detail}` : ''}`);
}

async function runSize(browser, name, viewport, phone) {
  console.log(`\n=== ${name} ${viewport.width}x${viewport.height} ===`);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  let n = 0;
  const shot = async (label, full = false) => {
    n++;
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${String(n).padStart(2, '0')}-${label}.png`), fullPage: full });
  };
  const go = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(250);
  };
  const noHScroll = async (where) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${where}: no sideways scrolling (${w}px)`, w <= viewport.width + 1, `scrollWidth ${w}`);
  };
  const canvasInk = (sel) =>
    page.evaluate((s) => {
      const c = document.querySelector(s);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const colors = new Set();
      for (let i = 0; i < d.length; i += 4 * 997) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return { w: c.width, h: c.height, colors: colors.size };
    }, sel);

  /* ---------- Gate ---------- */
  await page.goto(KIT);
  await page.waitForSelector('#gate:not([hidden])');
  check('gate is the first screen', await page.isVisible('#gate-code'));
  check('app is hidden behind the gate', await page.isHidden('#app'));
  await page.fill('#gate-code', 'KIT-TEST-0000');
  await page.click('#gate-form button');
  await page.waitForTimeout(200);
  check('test code is refused without ?testcode=1', /did not work/.test(await page.textContent('#gate-msg')));
  await page.fill('#gate-code', 'KIT-AAAA-BBBB');
  await page.click('#gate-form button');
  await page.waitForTimeout(100);
  check('a wrong code shows a clear message', /did not work/.test(await page.textContent('#gate-msg')));
  await page.goto(KIT + '?testcode=1');
  await page.waitForSelector('#gate:not([hidden])');
  await page.fill('#gate-code', '  kit-test-0000 ');
  await shot('gate');
  await page.click('#gate-form button');
  await page.waitForSelector('html[data-ready]', { state: 'attached' });

  /* ---------- Onboarding ---------- */
  check('first run opens onboarding', /#\/welcome/.test(page.url()));
  check('demo channel is loaded', (await page.$$eval('#chpick option', (o) => o.map((x) => x.textContent))).some((t) => /Demo/.test(t)));
  await shot('onboarding-1');
  await noHScroll('onboarding');
  await page.click('#wz button[type=submit]');
  check('channel name is required', /#\/welcome/.test(page.url()) && (await page.isVisible('#wz-name')));
  await page.fill('#wz-name', 'Money Made Simple');
  await page.fill('#wz [name=niche]', 'personal finance for beginners');
  await page.fill('#wz [name=audience]', 'people starting their first job');
  await page.click('#wz [data-color="#00A884"]');
  await page.click('#wz button[type=submit]');
  await page.fill('#wz [name=pl-0]', 'Free budget template');
  await page.fill('#wz [name=pu-0]', 'https://example.com/budget');
  await page.fill('#wz [name=pl-1]', 'Starter course');
  await page.fill('#wz [name=pu-1]', 'https://example.com/course');
  await page.fill('#wz [name=linkLine]', 'FREE budget template: https://example.com/budget');
  await shot('onboarding-2');
  await page.click('#wz button[type=submit]');
  await page.fill('#wz [name=video]', '7 Money Mistakes to Avoid in Your 20s');
  await shot('onboarding-3');
  await page.click('#wz button[type=submit]');
  await page.waitForURL(/#\/video\//);
  check('onboarding ends on the new video', (await page.textContent('#vtitle')) === '7 Money Mistakes to Avoid in Your 20s');
  check('new channel is selected', (await page.$eval('#chpick', (s) => s.selectedOptions[0].textContent)) === 'Money Made Simple');

  /* ---------- Planner: video page ---------- */
  await go(page.url().replace(/^.*#/, '#').replace(/\/?$/, '') + '/lab');
  await page.fill('[data-title="1"]', 'Never Make These 7 Money Mistakes in Your 20s');
  await page.fill('[data-thumb="1"]', 'BROKE BY 30?');
  await page.check('input[name=chosen][value="1"]');
  await page.waitForTimeout(200);
  const scoreB = Number(await page.textContent('[data-score="1"] .num'));
  check('title lab scores with reasons', scoreB >= 70 && (await page.$$('[data-score="1"] .reasons li')).length === 7, `score ${scoreB}`);
  check('chosen title becomes the page title', (await page.textContent('#vtitle')).startsWith('Never Make'));
  await shot('title-lab', true);
  const vid = page.url().match(/#\/video\/([^/]+)/)[1];
  await go(`#/video/${vid}/prompt`);
  await page.fill('#p-points', 'Lifestyle creep\nNo emergency fund\nIgnoring the company match');
  await page.waitForTimeout(150);
  const prompt = await page.textContent('#p-out');
  check('prompt has the points numbered', /1\. Lifestyle creep\n2\. No emergency fund/.test(prompt));
  check('prompt ends with the fixed ending line', prompt.trim().endsWith('Write the full script now.'));
  await page.click('#p-copy');
  await page.waitForTimeout(150);
  check('copy puts the prompt on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === prompt);
  await shot('prompt', true);
  await go(`#/video/${vid}/description`);
  await page.fill('#d-hook', 'Most money mistakes are boring — and expensive.');
  await page.fill('#d-ch', '0:00 Intro\n0:05 Too early\n1:30 Lifestyle creep');
  await page.waitForTimeout(150);
  check('chapter mistakes are shown', /at least 10 seconds apart|at least 3 chapters/.test(await page.textContent('#d-cherr')));
  await page.fill('#d-ch', '0:00 Intro\n0:40 Lifestyle creep\n2:10 No emergency fund\n3:30 The company match');
  await page.waitForTimeout(150);
  const desc = await page.textContent('#d-out');
  check('description has link line, products and chapters', desc.includes('FREE budget template: https://example.com/budget') && desc.includes('Starter course: https://example.com/course') && desc.includes('2:10 No emergency fund'));
  check('the link already in the link line is not repeated', desc.split('https://example.com/budget').length === 2);
  await shot('description', true);
  await go(`#/video/${vid}/shorts`);
  await page.click('#s-chap');
  await page.waitForTimeout(400);
  check('Shorts made from chapters', (await page.$$('[data-short]')).length === 3);
  await shot('shorts', true);

  /* ---------- Board ---------- */
  await go('#/board');
  await page.fill('#qa-title', 'The 7 Money Mistakes People Make in Their 20s');
  await page.waitForTimeout(150);
  check('similar-title warning on the board', await page.isVisible('#qa-similar .similar-box'));
  await page.fill('#qa-title', 'How to Build an Emergency Fund on a Small Salary');
  await page.press('#qa-title', 'Enter');
  await page.waitForTimeout(300);
  check('new idea lands in the Idea column', (await page.textContent('[data-col="idea"]')).includes('Emergency Fund on a Small Salary'));
  const card = await page.$('[data-col="idea"] .vcard:has-text("Emergency Fund") select[data-move]');
  await card.selectOption('script');
  await page.waitForTimeout(300);
  check('card moved to Script with the Move menu', (await page.textContent('[data-col="script"]')).includes('Emergency Fund'));
  await shot('board');
  await noHScroll('board');

  /* ---------- Brand kit & 8 templates ---------- */
  await go('#/brand');
  await page.waitForTimeout(1200);
  await page.fill('#bk-form [name=footer]', 'moneymadesimple.example');
  await page.selectOption('#bk-form [name=headingFont]', 'anton');
  await page.waitForTimeout(1200);
  const prev = await page.$$('canvas[data-prev]');
  check('brand kit previews all 8 templates', prev.length === 8);
  let inked = 0;
  for (const c of await page.$$eval('canvas[data-prev]', (cs) => cs.map((x) => x.dataset.prev))) if ((await canvasInk(`canvas[data-prev="${c}"]`)).colors > 4) inked++;
  check('all 8 template previews are drawn', inked === 8, `${inked}/8`);
  await shot('brand-kit', true);
  await page.selectOption('#bk-form [name=headingFont]', 'montserrat');
  await page.waitForTimeout(300);

  const TPLS = ['bold', 'list', 'tip', 'card', 'quote', 'compare', 'money', 'checklist'];
  for (const t of TPLS) {
    await go(`#/pins/new?template=${t}`);
    await page.waitForURL(/#\/pins\/pin-/);
    await page.waitForTimeout(500);
    const ink = await canvasInk('#pe-canvas');
    check(`template "${t}" renders 1000x1500`, ink.w === 1000 && ink.h === 1500 && ink.colors > 4, JSON.stringify(ink));
    if (t === 'list' || t === 'money' || t === 'compare') await shot(`pin-${t}`, !phone);
  }
  // Undo + duplicate in the single-pin editor.
  await page.fill('#pe-form [name=headline]', 'Changed *headline*');
  await page.waitForTimeout(600);
  await page.click('#pe-undo');
  await page.waitForTimeout(300);
  check('undo restores the headline', (await page.inputValue('#pe-form [name=headline]')) !== 'Changed *headline*');
  const before = page.url();
  await page.click('#pe-dup');
  await page.waitForTimeout(400);
  check('duplicate opens a copy', page.url() !== before && (await page.inputValue('#pe-form [name=title]')).endsWith('(copy)'));
  await go('#/pins');
  await page.waitForTimeout(1500);
  await shot('pins-library', !phone);

  /* ---------- Batch of 10 ---------- */
  await go('#/batch');
  await page.click('#bt-example');
  await shot('batch-paste');
  await page.click('#bt-go');
  await page.waitForSelector('#bt-grid [data-pin]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  check('batch renders 10 pins', (await page.$$('#bt-grid [data-pin]')).length === 10);
  await shot('batch-grid', !phone);
  await page.click('#bt-grid [data-pin]:nth-child(3)');
  await page.waitForSelector('#bt-dlg[open]');
  await page.fill('#bt-dlg [name=headline]', 'Write *3 pages* every morning');
  await page.waitForTimeout(300);
  await shot('batch-fix');
  await page.click('#fx-save');
  await page.waitForTimeout(800);
  check('fixed pin is re-rendered with the new title', (await page.textContent('#bt-grid [data-pin]:nth-child(3)')).includes('Write 3 pages every morning') || (await page.textContent('#bt-grid')).includes('Morning pages'));

  /* ---------- Export ZIP + CSV ---------- */
  await page.click('#bt-export');
  await page.waitForURL(/#\/export/);
  await page.waitForTimeout(300);
  check('export starts with the 10 batch pins', /10 selected/.test(await page.textContent('#ex-n')));
  check('CSV is blocked until a base URL is set', /public base URL/.test(await page.textContent('#ex-problems')));
  await page.fill('#ex-base', 'https://example.github.io/pins');
  await page.fill('#ex-camp', 'launch');
  await page.fill('#ex-start', '2026-11-02');
  await page.fill('#ex-per', '3');
  await page.fill('#ex-times', '09:00, 13:00, 19:30');
  const fmt = phone ? 'png' : 'jpg';
  await page.check(`input[name=fmt][value=${fmt}]`);
  await page.waitForTimeout(200);
  check('ready message once everything is valid', /Ready/.test(await page.textContent('#ex-problems')));
  await shot('export', true);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#ex-zip')]);
  const zipPath = path.join(TMP, `${name}-pins.zip`);
  await dl.saveAs(zipPath);
  const [dlCsv] = await Promise.all([page.waitForEvent('download'), page.click('#ex-csv')]);
  const csvPath = path.join(TMP, `${name}-pins.csv`);
  await dlCsv.saveAs(csvPath);
  const info = JSON.parse(execFileSync('python3', [path.join(__dirname, 'check_export.py'), zipPath, csvPath]).toString());
  check('ZIP opens and every CRC is good', info.testzip === null, JSON.stringify(info.testzip));
  check('ZIP has 10 images + CSV + read-me', info.images === 10 && info.names.includes('pinterest-bulk.csv') && info.names.includes('READ-ME.txt'), info.names.join(', '));
  check('images are 1000x1500', info.sizes.every((s) => s[0] === 1000 && s[1] === 1500), JSON.stringify(info.sizes));
  check(`images are ${fmt.toUpperCase()}`, info.formats.every((f) => f === (fmt === 'jpg' ? 'JPEG' : 'PNG')), info.formats.join());
  if (fmt === 'jpg') check('every JPG is under 350 KB', info.maxBytes < 350 * 1024, `${info.maxBytes} bytes`);
  check('CSV header is exactly Pinterest’s', info.header === 'Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords', info.header);
  check('CSV has 10 rows', info.rows === 10);
  check('Media URL = base + file name (and the file is in the ZIP)', info.mediaOk);
  check('links carry UTM tags', info.utmOk, info.sampleLink);
  check('publish dates: 3 a day from Nov 2 at the given times', JSON.stringify(info.dates.slice(0, 4)) === JSON.stringify(['2026-11-02T09:00:00', '2026-11-02T13:00:00', '2026-11-02T19:30:00', '2026-11-03T09:00:00']), info.dates.join(' '));
  check('no two pins with the same link on one day', info.sameDayDupes === 0);
  check('titles ≤ 100, descriptions ≤ 500', info.maxTitle <= 100 && info.maxDesc <= 500);
  check('separate CSV download equals the one in the ZIP', info.csvSame);

  /* ---------- Calendar, topics, week, templates, backup ---------- */
  await go('#/calendar');
  await shot('calendar');
  await noHScroll('calendar');
  await go('#/topics');
  await page.fill('#t-text', 'Index funds explained in 5 minutes');
  await page.click('#t-add button[type=submit]');
  await page.waitForTimeout(200);
  check('topic saved to the bank', (await page.textContent('#t-lists')).includes('Index funds explained'));
  await shot('topics');
  await page.selectOption('#chpick', 'demo');
  await go('#/week');
  await page.waitForTimeout(200);
  check('weekly review shows sparklines', (await page.$$('.spark polyline')).length >= 4);
  await page.fill('#w-worked', 'Shorter hooks kept people watching.');
  await shot('weekly-review', true);
  await page.selectOption('#chpick', 'all');
  await go('#/templates');
  await page.click('#tp-new');
  await page.waitForTimeout(200);
  await page.fill('#te-end', 'End with exactly this line.');
  await page.waitForTimeout(150);
  check('custom template with a fixed ending line', (await page.textContent('#te-prev')).trim().endsWith('End with exactly this line.'));
  await shot('templates', !phone);
  await go('#/backup');
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#bk-dl')]);
  const bkPath = path.join(TMP, `${name}-backup.json`);
  await bk.saveAs(bkPath);
  const backup = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  check('backup has channels, videos and pins', backup.app === 'faceless-creator-kit' && backup.channels.length === 2 && backup.pins.length >= 19, `${backup.channels.length} ch, ${backup.pins.length} pins`);
  const [tz] = await Promise.all([page.waitForEvent('download'), page.click('#bk-csv')]);
  const tzPath = path.join(TMP, `${name}-tables.zip`);
  await tz.saveAs(tzPath);
  const tables = JSON.parse(execFileSync('python3', ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps([z.testzip(),z.namelist()]))', tzPath]).toString());
  check('CSV ZIP of planner tables', tables[0] === null && tables[1].includes('videos.csv') && tables[1].includes('pins.csv'));
  // Restore: delete the demo channel, then restore the backup.
  await go('#/channels/demo');
  await page.click('#ch-del');
  await page.click('dialog[open] button[value=yes]');
  await page.waitForTimeout(400);
  check('demo channel can be deleted', !(await page.$$eval('#chpick option', (o) => o.map((x) => x.value))).includes('demo'));
  await go('#/backup');
  await page.setInputFiles('#bk-up', bkPath);
  await page.click('dialog[open] button[value=yes]');
  await page.waitForTimeout(500);
  check('restore brings everything back', (await page.$$eval('#chpick option', (o) => o.map((x) => x.value))).includes('demo'));
  await shot('backup');

  // Dark theme.
  await go('#/pins');
  await page.click('#themebtn');
  await page.waitForTimeout(1200);
  check('dark theme switch', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await shot('pins-dark');
  await go(`#/video/${vid}/lab`);
  await shot('title-lab-dark');
  // Reload keeps the unlock and the data.
  await page.reload();
  await page.waitForSelector('html[data-ready]', { state: 'attached' });
  check('unlock and data survive a reload', (await page.isHidden('#gate')) && (await page.textContent('#vtitle')).startsWith('Never Make'));
  // Offline: the service worker serves the app.
  const swReady = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active && reg.scope;
  });
  check('service worker scope is the kit folder', String(swReady).endsWith('/kit/'), swReady);
  await page.reload();
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 10000 }).catch(() => {});
  check('works offline after the first visit', await page.isVisible('#vtitle'));
  await ctx.setOffline(false);

  check(`no console errors (${name})`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
  const server = await serve();
  const browser = await chromium.launch();
  try {
    await runSize(browser, 'desktop', { width: 1440, height: 900 }, false);
    await runSize(browser, 'phone', { width: 390, height: 844 }, true);
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
