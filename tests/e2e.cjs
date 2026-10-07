// End-to-end check with Playwright at desktop (1440x900) and phone (390x844).
// Run from the repo root:   node tests/e2e.cjs
// (Playwright must be installed; it uses the preinstalled Chromium.)
// Screenshots are written to docs/screens/.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'screens');
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const LAST = 'create me a prompt for the video';
const SECTIONS = ['TITLE', 'NARRATOR', 'AUDIENCE', 'LENGTH', 'OUTPUT FORMAT', 'STRUCTURE', 'SAFETY/ACCURACY', 'PRODUCT MENTIONS', 'STYLE RULES'];

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/plain',
};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, BASE).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  const shot = async (n, opts = {}) => {
    // Sticky bars repeat in stitched full-page shots; flatten them just for the picture.
    const tag = opts.fullPage ? await page.addStyleTag({ content: '.topbar,.sticky{position:static!important}' }) : null;
    await page.screenshot({ path: path.join(SHOTS, `${name}-${n}.png`), ...opts });
    if (tag) await tag.evaluate((t) => t.remove());
  };
  const ready = () => page.waitForSelector('html[data-ready="1"]');
  const clip = () => page.evaluate(() => navigator.clipboard.readText());
  const toastSays = async (text) => {
    try {
      await page.waitForFunction((t) => {
        const el = document.querySelector('#toast');
        return el.classList.contains('show') && el.textContent.includes(t);
      }, text, { timeout: 2500 });
      return true;
    } catch {
      return false;
    }
  };

  await page.goto(BASE + 'index.html');
  await ready();
  await page.waitForSelector('.card');
  check('board shows the seeded videos', (await page.locator('.card').count()) === 6);
  check('8 columns in the right order', JSON.stringify(await page.$$eval('.column h2', (h) => h.map((x) => x.textContent))) ===
    JSON.stringify(['Idea', 'Prompt ready', 'Script', 'Voice/Avatar', 'Edit', 'Thumbnail', 'Scheduled', 'Published']));
  check('robots noindex meta present', (await page.getAttribute('meta[name="robots"]', 'content')).includes('noindex'));
  check('no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('01-board');

  // ---- Create an idea (+ similar-topic warning)
  if (!phone) {
    await page.keyboard.press('n');
    check('N focuses "New idea"', await page.evaluate(() => document.activeElement.id === 'qa-title'));
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    check('/ focuses search', await page.evaluate(() => document.activeElement.id === 'board-search'));
  }
  await page.fill('#qa-title', 'How to check your house before winter: homeowners guide');
  check('"Similar to" shows for a repeated topic', (await page.textContent('#qa-similar')).includes('Similar to'));
  await shot('02-similar-warning');
  const TITLE = 'Attic Ventilation Mistakes That Rot Your Roof';
  await page.fill('#qa-title', TITLE);
  check('no "Similar to" for a new topic', !(await page.textContent('#qa-similar')).includes('Similar to'));
  await page.selectOption('#qa-channel', 'walter');
  await page.click('#quickadd button[type=submit]');
  const card = page.locator('.card', { hasText: TITLE });
  await card.waitFor();
  check('new idea lands in Idea column', (await card.evaluate((c) => c.closest('.column').dataset.status)) === 'idea');
  check('toast after adding', await toastSays('Idea added'));

  // ---- Move across columns
  if (!phone) {
    await card.dragTo(page.locator('.column[data-status="prompt"] .cards'));
    await page.waitForFunction((t) => [...document.querySelectorAll('.column[data-status="prompt"] .card')].some((c) => c.textContent.includes(t)), TITLE);
    check('drag & drop to "Prompt ready"', true);
    await page.locator('.card', { hasText: TITLE }).locator('select[data-move]').selectOption('script');
  } else {
    await card.locator('select[data-move]').selectOption('prompt');
    check('"Move to…" menu to Prompt ready', await page.waitForFunction((t) => [...document.querySelectorAll('.column[data-status="prompt"] .card')].some((c) => c.textContent.includes(t)), TITLE, { timeout: 3000 }).then(() => true, () => false));
    await page.locator('.card', { hasText: TITLE }).locator('select[data-move]').selectOption('script');
  }
  const inCol = (st) =>
    page
      .waitForFunction(([t, s]) => [...document.querySelectorAll(`.column[data-status="${s}"] .card`)].some((c) => c.textContent.includes(t)), [TITLE, st], { timeout: 3000 })
      .then(() => true, () => false);
  await inCol('script');
  const col = await page.locator('.card', { hasText: TITLE }).evaluate((c) => c.closest('.column').dataset.status);
  check('"Move to…" menu to Script', col === 'script', col);
  await page.reload();
  await ready();
  check('stage survives reload', (await page.locator('.card', { hasText: TITLE }).evaluate((c) => c.closest('.column').dataset.status)) === 'script');
  if (phone) await page.locator('.card', { hasText: TITLE }).scrollIntoViewIfNeeded();
  await shot('03-board-moved');

  // ---- Video detail: overview
  await page.locator('.card', { hasText: TITLE }).locator('.card-title').click();
  await page.waitForSelector('#ov-title');
  const vid = page.url().split('/video/')[1].split('/')[0];
  await page.fill('[data-title="1"]', 'The Attic Problem That Quietly Rots Your Roof (Most Homeowners Never Look)');
  check('title counter warns over 70 chars', await page.locator('[data-count="1"]').evaluate((e) => e.classList.contains('warn')));
  await page.fill('[data-thumb="0"]', 'ROOF ROT');
  check('red warning when thumbnail repeats title words', (await page.locator('.thumbrow.bad .msg').count()) === 1);
  await page.fill('[data-thumb="0"]', 'SILENT DAMAGE');
  check('warning clears for different words', (await page.locator('.thumbrow.bad').count()) === 0);
  await page.fill('[data-thumb="1"]', 'LOOK UP HERE');
  await page.fill('#ov-date', '2026-10-21');
  await page.fill('#ov-time', '12:00');
  check('target spoken words 10 min × 150 = 1500', (await page.textContent('#ov-words')).includes('1500'));
  await page.selectOption('#ov-product', 'w-manual');
  await shot('04-overview', { fullPage: !phone });

  // ---- Crafter prompt
  await page.click('[data-tab="prompt"]');
  await page.waitForSelector('[data-pf="points"]');
  await page.fill('[data-pf="points"]', 'Why attics need to breathe\nBlocked soffit vents\nBathroom fans venting into the attic\nSOURCES: should be dropped\nWhen to call a roofer');
  await page.click('#pr-copy');
  check('toast "Copied!" on prompt copy', await toastSays('Copied!'));
  let prompt = await clip();
  let lines = prompt.split('\n');
  check('prompt last line is exact', lines[lines.length - 1] === LAST && prompt.endsWith(LAST), JSON.stringify(lines.slice(-2)));
  const headers = lines.map((l) => (l.match(/^([A-Z/ ]+):/) || [])[1]).filter(Boolean);
  check('prompt sections in exact order', JSON.stringify(headers) === JSON.stringify(SECTIONS), headers.join(','));
  check('prompt has no SOURCES section', !/^\s*(\d+\.\s*)?SOURCES?\s*:/im.test(prompt));
  check('prompt LENGTH line', lines.includes('LENGTH: 10 minutes (about 1500 spoken words)'));
  check('prompt numbered points', lines.includes('1. Why attics need to breathe') && lines.includes('4. When to call a roofer'));
  check('prompt names main product', prompt.includes('Main product: The Home Check Manual.'));
  check('copying the prompt moves Idea → Prompt ready only from Idea', (await page.inputValue('#d-status')) === 'script');
  // Cmd/Ctrl+Enter copies too
  await page.evaluate(() => navigator.clipboard.writeText('x'));
  await page.locator('#pr-out').click();
  await page.keyboard.press('Control+Enter');
  check('Ctrl+Enter copies the prompt', (await clip()) === prompt);
  await shot('05-crafter-prompt', { fullPage: !phone });

  // ---- Description
  await page.click('[data-tab="description"]');
  await page.waitForSelector('#ds-hook');
  await page.fill('#ds-hook', 'Most attic damage starts with one small mistake. Here is how to spot it from your hallway, safely.');
  await page.fill('#ds-paste', '0:05 Intro\n0:10 Vents');
  await page.click('#ds-usepaste');
  const bad = await page.textContent('#ds-chvalid');
  check('chapter errors: must start at 0:00', bad.includes('0:00'));
  check('chapter errors: at least 3', bad.includes('at least 3'));
  await shot('06-chapter-errors', { fullPage: !phone });
  // replace with good chapters
  await page.click('details.paste summary').catch(() => {});
  if (!(await page.locator('details.paste').evaluate((d) => d.open))) await page.click('details.paste summary');
  await page.fill('#ds-paste', '0:00 Intro\n0:42 Why attics need to breathe\n3:15 Blocked soffit vents\n6:40 Bathroom fans\n9:05 When to call a roofer');
  await page.click('#ds-usepaste');
  check('valid chapters accepted', await page.locator('#ds-chvalid.good').count() === 1, await page.textContent('#ds-chvalid'));
  await page.click('[data-delch="4"]');
  await page.click('#ds-addch');
  const t = page.locator('[data-cht]').last();
  await t.fill('9:05');
  await page.locator('[data-chn]').last().fill('When to call a roofer');
  check('chapter rows editable', await page.locator('#ds-chvalid.good').count() === 1);
  const preview = await page.textContent('#ds-out');
  check('description starts with hook', preview.startsWith('Most attic damage'));
  check('main product line first', preview.split('\n\n')[1].split('\n')[0] === 'The Home Check Manual ($17) 👉 https://payhip.com/b/ABaxT', preview.split('\n\n')[1]);
  check('description has chapters', preview.includes('0:00 Intro\n0:42 Why attics need to breathe'));
  check('description ends with hashtags', preview.trim().endsWith('#homeinspection #homeowner #homemaintenance'));
  check('character counter', (await page.textContent('#ds-count')) === `${preview.length}/5000`);
  await page.click('#ds-copy');
  check('toast on description copy', await toastSays('Copied!'));
  check('copied description equals preview', (await clip()) === preview);
  check('pinned comment mentions free PDF', (await page.inputValue('#ds-pinned')).includes('https://payhip.com/b/hiIm1'));
  await page.click('[data-copy="pinned"]');
  check('pinned comment copy', (await clip()).includes('first link in the description'));
  await shot('07-description', { fullPage: !phone });

  // ---- Insert helper
  const OLD = 'Seven things I would never ignore when buying a house.\n\nFREE: The Weekend Home Check (25 things in 30 minutes) 👉 https://payhip.com/b/hiIm1\nThe Home Check Manual ($17) 👉 https://payhip.com/b/ABaxT\n\n0:00 Intro\n0:30 Cracks\n2:00 Water\n\n#homeinspection';
  await page.fill('#in-old', OLD);
  await page.selectOption('#in-product', 'w-app');
  await page.click('#in-go');
  const adds = await page.$$eval('#in-diff .dl.add', (els) => els.map((e) => e.textContent));
  check('insert helper adds exactly the app line', adds.length === 1 && adds[0].includes("Walter's Home Check App ($29) 👉 https://payhip.com/b/OZeda"), JSON.stringify(adds));
  const diffLinesText = await page.$$eval('#in-diff .dl', (els) => els.map((e) => e.textContent.slice(1)));
  check('app line goes right after the first product link', diffLinesText[3].includes('OZeda') && diffLinesText[2].includes('hiIm1'), JSON.stringify(diffLinesText.slice(0, 5)));
  await page.click('#in-copy');
  const newDesc = await clip();
  check('insert result copied', newDesc.split('\n')[3] === "Walter's Home Check App ($29) 👉 https://payhip.com/b/OZeda");
  await page.click('#in-go'); // second time on the same old text: still one add
  await page.fill('#in-old', newDesc);
  await page.click('#in-go');
  check('insert helper refuses a duplicate', (await page.textContent('#in-msg')).includes('already'));
  await page.fill('#in-old', OLD);
  await page.click('#in-go');
  await page.locator('#in-diff').scrollIntoViewIfNeeded();
  await shot('08-insert-helper');

  // Export to file
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ds-dl')]);
  const dlText = fs.readFileSync(await dl.path(), 'utf8');
  check('description "Export to file"', dlText === preview);

  // ---- Checklist
  await page.click('[data-tab="checklist"]');
  await page.waitForSelector('[data-ck]');
  check('"Description copied" auto-ticked', await page.isChecked('[data-ck="c-desc"]'));
  await page.check('[data-ck="c-title"]');
  await page.check('[data-ck="c-synthetic"]');
  await page.waitForTimeout(400);
  await page.reload();
  await ready();
  await page.waitForSelector('[data-ck]');
  check('checklist state saved', (await page.isChecked('[data-ck="c-title"]')) && (await page.isChecked('[data-ck="c-synthetic"]')));
  check('11 checklist items', (await page.locator('[data-ck]').count()) === 11);
  await shot('09-checklist', { fullPage: !phone });

  // ---- Notes
  await page.click('[data-tab="notes"]');
  await page.fill('[data-note="scriptDoc"]', 'https://docs.google.com/document/d/abc');
  check('notes link becomes clickable', (await page.getAttribute('[data-open="scriptDoc"]', 'href')) === 'https://docs.google.com/document/d/abc');
  await page.fill('[data-note="text"]', 'Use the attic B-roll from the October shoot.');
  await page.waitForTimeout(400);
  await shot('10-notes');

  // ---- Calendar
  await page.goto(BASE + 'index.html#/calendar?m=2026-10');
  await ready();
  await page.waitForSelector('.cal');
  check('calendar shows Sal on Oct 8', (await page.locator('.calchip[data-ch="sal"]').count()) >= 1);
  check('calendar shows Walter published Oct 2', (await page.locator('.calchip.published[data-ch="walter"]').count()) === 1);
  await shot('11-calendar', { fullPage: true });
  if (phone) await page.locator('.agenda-list a', { hasText: 'Restaurant Tricks' }).click();
  else await page.locator('.calchip[data-ch="sal"]').first().click();
  await page.waitForSelector('#ov-title');
  check('calendar click opens the video', (await page.inputValue('#ov-title')).includes('Restaurant Tricks'));

  // ---- Topics
  await page.goto(BASE + 'index.html#/topics');
  await ready();
  await page.fill('#tp-check', 'Restaurant tricks customers never notice');
  check('topic memory similar check', (await page.textContent('#tp-similar')).includes('Similar to'));
  check('topic memory lists all titles', (await page.locator('.topic-list li').count()) === 7);
  await shot('12-topics', { fullPage: !phone });

  // ---- Settings
  await page.goto(BASE + 'index.html#/settings');
  await ready();
  await page.click('[data-pick="sal"]');
  check('settings lists Sal products', (await page.locator('.product').count()) === 5);
  await shot('13-settings-products');
  await page.goto(BASE + 'index.html#/settings?s=prompt');
  await ready();
  check('prompt defaults editable', (await page.locator('[data-k]').count()) === 7);

  // ---- Backup export / import
  await page.goto(BASE + 'index.html#/settings?s=backup');
  await ready();
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#bk-export')]);
  const bkPath = path.join(os.tmpdir(), `cs-backup-${name}.json`);
  await bk.saveAs(bkPath);
  const data = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  check('backup file has all 7 videos', data.app === 'channel-studio' && data.videos.length === 7);
  await shot('14-backup');
  await page.click('#bk-reset');
  await page.waitForFunction(() => document.querySelector('#bk-msg') !== null);
  await page.goto(BASE + 'index.html#/board');
  await ready();
  check('reset demo data removes the new video', (await page.locator('.card', { hasText: TITLE }).count()) === 0);
  await page.goto(BASE + 'index.html#/settings?s=backup');
  await ready();
  // a broken file is refused
  const junk = path.join(os.tmpdir(), 'cs-junk.json');
  fs.writeFileSync(junk, '{"hello": 1}');
  await page.setInputFiles('#bk-import', junk);
  await page.waitForFunction(() => document.querySelector('#bk-msg').textContent.length > 0);
  check('import refuses a non-backup file', (await page.textContent('#bk-msg')).includes('not a Channel Studio backup'));
  await page.setInputFiles('#bk-import', bkPath);
  check('toast after import', await toastSays('Backup restored'));
  await page.goto(BASE + 'index.html#/board');
  await ready();
  check('import brings the video back', (await page.locator('.card', { hasText: TITLE }).count()) === 1);
  await page.goto(BASE + `index.html#/video/${vid}/description`);
  await ready();
  await page.waitForSelector('#ds-out');
  check('imported video keeps its description', (await page.textContent('#ds-out')) === preview);

  // ---- Offline reload
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ready();
  check('service worker controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));
  await ctx.setOffline(true);
  await page.goto(BASE + 'index.html#/board');
  await page.reload();
  await ready();
  await page.waitForSelector('.card');
  check('offline reload shows the board', (await page.locator('.card').count()) === 7);
  await page.goto(BASE + `index.html#/video/${vid}/prompt`);
  await page.waitForSelector('#pr-out');
  check('offline: prompt still works', (await page.textContent('#pr-out')).endsWith(LAST));
  await ctx.setOffline(false);

  // ---- Dark mode
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(BASE + 'index.html#/board');
  await ready();
  await shot('15-board-dark');
  await page.goto(BASE + `index.html#/video/${vid}/description`);
  await ready();
  await page.waitForSelector('#ds-out');
  await shot('16-description-dark');
  check('no horizontal page scroll (detail)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.emulateMedia({ colorScheme: 'light' });

  // ---- Self-tests page
  await page.goto(BASE + 'tests/tests.html');
  await page.waitForFunction(() => window.__testResults && window.__testResults.done);
  const tr = await page.evaluate(() => window.__testResults);
  check(`self-tests pass (${tr.passed} passed, ${tr.failed} failed)`, tr.failed === 0 && tr.passed > 0, tr.failures.join('\n      '));
  if (!phone) await shot('17-self-tests', { fullPage: true });

  check('no console errors', errors.length === 0, errors.join('\n      '));
  await ctx.close();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  try {
    await runSize(browser, 'desktop', { width: 1440, height: 900 }, false);
    await runSize(browser, 'phone', { width: 390, height: 844 }, true);
  } catch (e) {
    check('run finished without crashing', false, e.stack);
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
