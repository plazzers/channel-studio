// End-to-end check with Playwright at desktop (1440x900) and phone (390x844).
// Run from the repo root:   node tests/e2e.cjs
// (Playwright must be installed; it uses the preinstalled Chromium.)
// Screenshots are written to docs/screens/.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
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
    // Hide toasts (they'd cover the picture). In stitched full-page shots the
    // sticky/fixed bars would repeat or float mid-page, so flatten/hide them too.
    const css = '#toast{display:none!important}' + (opts.fullPage ? '.topbar,.sticky{position:static!important}' + (phone ? '.mainnav{display:none!important}' : '') : '');
    const tag = await page.addStyleTag({ content: css });
    await page.screenshot({ path: path.join(SHOTS, `${name}-${n}.png`), ...opts });
    await tag.evaluate((t) => t.remove());
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

  // ================= v2: Title lab, Shorts, Weekly review, Export =================
  await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('show'));
  const todayStr = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const plusDays = (iso, n) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // ---- Title lab
  await page.goto(BASE + `index.html#/video/${vid}/lab`);
  await ready();
  await page.waitForSelector('[data-labtitle="0"]');
  check('lab: 7 tabs on the video page', (await page.locator('.tabs [data-tab]').count()) === 7);
  const STRONG = '7 Attic Mistakes That Quietly Rot Your Roof';
  await page.fill('[data-labtitle="2"]', STRONG);
  check('lab: strong title scores 100', (await page.textContent('[data-score="2"]')) === '100', await page.textContent('[data-score="2"]'));
  check('lab: every rule explained (7 reasons)', (await page.locator('[data-score-row="2"] .reasons li').count()) === 7);
  await page.fill('[data-labtitle="1"]', 'In this video I show you SHOCKING ATTIC ROT');
  const weakText = await page.textContent('[data-score-row="1"]');
  check('lab: weak start, clickbait and caps flagged', weakText.includes('Starts weak') && weakText.includes('Clickbait') && weakText.includes('ALL CAPS'), weakText);
  check('lab: weak title marked red', await page.locator('[data-score-row="1"].bad').count() === 1);
  check('lab: typing keeps focus in the title box', await page.evaluate(() => document.activeElement.dataset.labtitle === '1'));
  await page.fill('[data-labthumb="0"]', 'ROOF ROT');
  check('lab: thumbnail repeating 50%+ of title words is red', (await page.locator('[data-thumb-row="0"].bad').count()) === 1 && (await page.textContent('[data-thumb-row="0"]')).includes('100%'));
  await page.fill('[data-labthumb="0"]', 'UNBELIEVABLY EXPENSIVE FOUNDATION CATASTROPHE');
  check('lab: over 20 characters per line is flagged', (await page.locator('.thumbmock.over').count()) === 2 && (await page.textContent('[data-thumb-row="0"]')).includes('Too long for 2 lines'));
  await page.fill('[data-labthumb="0"]', 'CHECK THIS VENT FIRST');
  check('lab: word count shown', (await page.textContent('[data-thumb-row="0"]')).includes('4 words'));
  check('lab: good thumbnail text passes', (await page.locator('[data-thumb-row="0"].good').count()) === 1, await page.textContent('[data-thumb-row="0"]'));
  const sizes = await page.$$eval('.thumbmock', (els) => els.map((e) => `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
  check('lab: mock previews at 246×138 and 360×202', JSON.stringify(sizes) === JSON.stringify(['246x138', '360x202']), sizes.join(','));
  const mockLines = await page.$$eval('.thumbmock[data-size="246x138"] .tm-text span', (els) => els.map((e) => e.textContent));
  check('lab: preview shows the text on 2 lines', JSON.stringify(mockLines) === '["CHECK THIS","VENT FIRST"]', JSON.stringify(mockLines));
  check('lab: no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('v2-01-title-lab', { fullPage: !phone });

  // A/B log
  await page.click('#ab-add');
  await page.waitForSelector('[data-ab]');
  await page.click('#ab-add');
  await page.waitForFunction(() => document.querySelectorAll('[data-ab]').length === 2);
  const abRows = page.locator('[data-ab]');
  check('lab: A/B table scrolls inside its box (no page scroll)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('lab: A/B rows prefilled with different titles', (await abRows.nth(0).locator('[data-abf="title"]').inputValue()) !== (await abRows.nth(1).locator('[data-abf="title"]').inputValue()));
  await abRows.nth(1).locator('[data-abf="title"]').fill(STRONG);
  const fillAb = async (i, vals) => {
    for (const [k, val] of Object.entries(vals)) await abRows.nth(i).locator(`[data-abf="${k}"]`).fill(String(val));
  };
  await fillAb(0, { ctr48: 3.1, views48: 900, ctr7: 4.2, views7: 5100 });
  await fillAb(1, { ctr48: 4.4, views48: 1200, ctr7: 5.6, views7: 6900 });
  check('lab: best 7-day CTR wins', (await abRows.nth(1).getAttribute('class')).includes('win') && (await page.textContent('#ab-msg')).includes('best CTR after 7 days'));
  await abRows.nth(0).locator('[data-abwin]').check();
  await page.waitForFunction(() => document.querySelector('[data-ab]').classList.contains('win'));
  check('lab: winner can be marked by hand', (await page.textContent('#ab-msg')).includes('marked by you'));
  await page.waitForTimeout(300);
  await page.reload();
  await ready();
  await page.waitForSelector('[data-ab]');
  check('lab: A/B log and titles saved', (await page.locator('[data-ab]').count()) === 2 && (await page.inputValue('[data-labtitle="2"]')) === STRONG && (await page.locator('[data-ab].win [data-abf="ctr7"]').inputValue()) === '4.2');
  await page.locator('.abtable').scrollIntoViewIfNeeded();
  await shot('v2-02-ab-log');

  // ---- Shorts tab
  await page.click('[data-tab="shorts"]');
  await page.waitForSelector('#sh-gen');
  await page.click('#sh-fromdesc');
  check('shorts: chapters pulled from the Description tab', (await page.inputValue('#sh-chapters')).startsWith('0:00 Intro\n0:42 Why attics need to breathe'));
  await page.click('#sh-gen');
  const props = await page.$$eval('.proposals li', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  check('shorts: one proposal per chapter', props.length === 5, JSON.stringify(props));
  check('shorts: range = chapter start to min(next, +45 s)', props[0].includes('0:00–0:42 · 42 s') && props[1].includes('0:42–1:27 · 45 s') && props[4].includes('9:05–9:50'), JSON.stringify(props));
  await page.click('#sh-addprops');
  await page.waitForFunction(() => document.querySelectorAll('.shortcard').length === 5);
  check('shorts: 5 Shorts added, "Add" disabled at the limit', await page.isDisabled('#sh-add'));
  const card2 = page.locator('.shortcard').nth(1);
  check('shorts: title from chapter name', (await card2.locator('[data-sf="title"]').inputValue()) === 'Why attics need to breathe');
  await card2.locator('[data-sf="hook"]').fill('This one small vent in your attic decides whether your whole roof rots early');
  check('shorts: hook over 12 words is flagged', (await card2.locator('[data-cnt="hook"]').textContent()) === '14/12 words' && (await card2.locator('[data-cnt="hook"].bad').count()) === 1);
  await card2.locator('[data-sf="hook"]').fill('This tiny attic vent decides when your roof rots');
  check('shorts: hook within 12 words', (await card2.locator('[data-cnt="hook"].bad').count()) === 0);
  await card2.locator('[data-sf="range"]').fill('0:42-0:50');
  check('shorts: range under 15 s rejected', (await card2.locator('[data-msg="range"]').textContent()).includes('Only 8 seconds'));
  await card2.locator('[data-sf="range"]').fill('0:42–1:27');
  check('shorts: valid range shows duration', (await card2.locator('[data-msg="range"]').textContent()).includes('45 seconds'));
  await card2.locator('[data-sf="onScreen"]').fill('YOUR ROOF IS SUFFOCATING RIGHT NOW TODAY');
  check('shorts: on-screen text over 6 words flagged', (await card2.locator('[data-cnt="onScreen"].bad').count()) === 1);
  await card2.locator('[data-sf="onScreen"]').fill('YOUR ROOF CAN’T BREATHE');
  await card2.locator('[data-sf="title"]').fill('Kitchen knives ranked');
  check('shorts: title without a long-video keyword warns', (await card2.locator('[data-msg="title"]').textContent()).includes('No keyword'));
  await card2.locator('[data-sf="title"]').fill('Your attic must breathe — here’s the 10-second check');
  check('shorts: title keyword found', (await card2.locator('[data-msg="title"]').textContent()).includes('attic'));
  await card2.locator('[data-sf="description"]').fill('The full attic video is on the channel.');
  check('shorts: link line defaults to the free PDF', (await card2.locator('[data-out]').textContent()).endsWith('👉 https://payhip.com/b/hiIm1'));
  await card2.locator('[data-scopy="desc"]').click();
  check('shorts: copy description', (await clip()) === 'The full attic video is on the channel.\n\nFREE: The Weekend Home Check (25 things in 30 minutes) 👉 https://payhip.com/b/hiIm1');
  await card2.locator('[data-sf="status"]').selectOption('posted');
  await page.waitForFunction(() => document.querySelectorAll('.shortcard')[1].querySelector('[data-sf="status"]').value === 'posted');
  check('shorts: posted date fills in today', (await page.locator('.shortcard').nth(1).locator('[data-sf="postedDate"]').inputValue()) === todayStr);
  const card3 = page.locator('.shortcard').nth(2);
  await card3.locator('[data-sf="postedDate"]').fill(plusDays(todayStr, 3));
  await card3.locator('[data-sf="status"]').selectOption('cut');
  await page.waitForFunction(() => document.querySelectorAll('.shortcard')[2].querySelector('[data-sf="status"]').value === 'cut');
  await page.locator('.shortcard').nth(4).locator('[data-sdel]').click();
  await page.waitForFunction(() => document.querySelectorAll('.shortcard').length === 4);
  check('shorts: delete frees a slot', !(await page.isDisabled('#sh-add')));
  await page.waitForTimeout(300);
  await page.reload();
  await ready();
  await page.waitForSelector('.shortcard');
  check('shorts: saved after reload', (await page.locator('.shortcard').count()) === 4 && (await page.locator('.shortcard').nth(1).locator('[data-sf="hook"]').inputValue()) === 'This tiny attic vent decides when your roof rots');
  await shot('v2-03-shorts-tab', { fullPage: !phone });
  await page.click('[data-tab="checklist"]');
  await page.waitForSelector('[data-ck]');
  check('shorts: "Shorts cut from this video" ticked itself', await page.isChecked('[data-ck="c-shorts"]'));

  // ---- Shorts board
  await page.goto(BASE + 'index.html#/shorts');
  await ready();
  await page.waitForSelector('.shorts-board');
  check('shorts board: 3 status columns', JSON.stringify(await page.$$eval('.shorts-board .column h2', (h) => h.map((x) => x.textContent))) === '["Planned","Cut","Posted"]');
  check('shorts board: all 4 Shorts listed', (await page.locator('.shortc').count()) === 4);
  check('shorts board: weekly strip has 7 days', (await page.locator('.weekstrip .wday').count()) === 7);
  check('shorts board: posted Short on today in the strip', (await page.locator(`.wday[data-day="${todayStr}"] .wchip.posted`).count()) === 1);
  check('shorts board: no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('v2-04-shorts-board', { fullPage: true });
  await page.locator('.column[data-sstatus="planned"] .shortc').first().locator('select[data-smove]').selectOption('cut');
  await page.waitForFunction(() => document.querySelectorAll('.column[data-sstatus="cut"] .shortc').length === 2);
  check('shorts board: status menu moves a card', true);
  await page.selectOption('#sb-status', 'cut');
  check('shorts board: status filter', (await page.locator('.shortc').count()) === 2 && (await page.locator('.shorts-board .column').count()) === 1);
  await page.selectOption('#sb-status', '');
  await page.click('.chswitch [data-ch="sal"]');
  check('shorts board: channel filter (Sal has none)', (await page.locator('.shortc').count()) === 0);
  await page.click('.chswitch [data-ch="both"]');
  const nextWeekHref = await page.getAttribute('a[aria-label="Previous week"]', 'href');
  check('shorts board: week navigation', /#\/shorts\?w=\d{4}-W\d{2}/.test(nextWeekHref), nextWeekHref);
  await page.locator('.shortc .card-title').first().click();
  await page.waitForSelector('.shortcard');
  check('shorts board: card opens the video Shorts tab', page.url().includes(`/video/${vid}/shorts`));

  // ---- Weekly review
  // Make one card old so it shows as "stuck" (shared module instance with the app).
  await page.evaluate(async (since) => {
    const s = await import('./js/store.js');
    const v = s.getVideo('seed-w2');
    v.statusSince = since;
    await s.saveVideo(v, { silent: true });
  }, plusDays(todayStr, -12) + 'T08:00:00.000Z');
  await page.goto(BASE + 'index.html#/week');
  await ready();
  await page.waitForSelector('.week-view');
  check('week: stuck list shows the 12-day-old card', (await page.textContent('#wk-stuck')).includes('12 days') && (await page.textContent('#wk-stuck')).includes('9 Things to Check Before Winter'));
  check('week: posted Short counted this week', (await page.textContent('[data-pub="walter"]')).includes('1 Short'));
  check('week: Short planned in 3 days is coming up', (await page.textContent('#wk-next')).includes('Blocked soffit vents'));
  await page.fill('#wk-worked', 'Numbers in titles beat questions.');
  await page.fill('#wk-try', 'Post Shorts at 7 pm ET.');
  const statRow = page.locator('.statrow[data-vid="seed-w1"]');
  await statRow.locator('[data-stat="views"]').fill('1200');
  await statRow.locator('[data-stat="watchHours"]').fill('85.5');
  await statRow.locator('[data-stat="subs"]').fill('14');
  await statRow.locator('[data-stat="ctr"]').fill('5.2');
  await statRow.locator('[data-stat="sales"]').fill('3');
  await page.waitForTimeout(500);
  check('week: sparkline shows this week', (await page.textContent('[data-spark="walter"] .sparkval')).includes('1200'));
  const prevHref = await page.getAttribute('a[aria-label="Previous week"]', 'href');
  await page.goto(BASE + 'index.html' + prevHref);
  await ready();
  await page.waitForSelector('.week-view');
  check('week: notes are per week', (await page.inputValue('#wk-worked')) === '');
  await page.locator('.statrow[data-vid="seed-w1"] [data-stat="views"]').fill('900');
  await page.waitForTimeout(500);
  await page.goto(BASE + 'index.html#/week');
  await ready();
  await page.waitForSelector('.week-view');
  check('week: notes saved for this week', (await page.inputValue('#wk-worked')) === 'Numbers in titles beat questions.' && (await page.inputValue('#wk-try')) === 'Post Shorts at 7 pm ET.');
  check('week: stats saved', (await page.inputValue('.statrow[data-vid="seed-w1"] [data-stat="ctr"]')) === '5.2');
  check('week: sparkline is an inline SVG line over 2 weeks', (await page.locator('[data-spark="walter"] svg polyline').count()) === 1);
  check('week: no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('v2-05-weekly-review', { fullPage: true });
  await page.selectOption('#wk-metric', 'sales');
  check('week: trend metric switch', (await page.textContent('[data-spark="walter"]')).includes('Sales'));

  // ---- Settings: title lab word lists
  await page.goto(BASE + 'index.html#/settings?s=lab');
  await ready();
  await page.click('[data-pick="walter"]');
  check('settings: Walter keywords seeded', (await page.inputValue('#lab-keywords')).split('\n').join(',') === 'home inspection,house,homeowner,buying a house,winter,basement,roof');
  await page.fill('#lab-keywords', (await page.inputValue('#lab-keywords')) + '\nattic');
  await page.fill('#lab-power', (await page.inputValue('#lab-power')) + '\nquietly');
  await page.waitForTimeout(500);
  await shot('v2-06-settings-title-lab', { fullPage: !phone });
  await page.goto(BASE + `index.html#/video/${vid}/lab`);
  await ready();
  await page.waitForSelector('[data-score-row="0"]');
  check('settings: edited keyword list used by the lab', (await page.textContent('[data-score-row="0"]')).includes('Channel keyword: roof, attic'), await page.textContent('[data-score-row="0"]'));

  // ---- Export: JSON backup has the new tables; CSV zip opens in Python
  await page.goto(BASE + 'index.html#/settings?s=backup');
  await ready();
  const [bk2] = await Promise.all([page.waitForEvent('download'), page.click('#bk-export')]);
  const bk2Path = path.join(os.tmpdir(), `cs-backup-v2-${name}.json`);
  await bk2.saveAs(bk2Path);
  const data2 = JSON.parse(fs.readFileSync(bk2Path, 'utf8'));
  check('backup v2: has Shorts, A/B log, weekly notes, stats', data2.version === 2 && data2.shorts.length === 4 && data2.abtests.length === 2 && data2.weekly.length === 1 && data2.stats.length === 2 && data2.settings.titleWords.power.includes('quietly'), JSON.stringify({ v: data2.version, s: data2.shorts?.length, a: data2.abtests?.length, w: data2.weekly?.length, st: data2.stats?.length }));
  const [zipDl] = await Promise.all([page.waitForEvent('download'), page.click('#bk-csv')]);
  check('csv: zip file name', /^channel-studio-csv-\d{4}-\d{2}-\d{2}\.zip$/.test(zipDl.suggestedFilename()), zipDl.suggestedFilename());
  const zipPath = path.join(os.tmpdir(), `cs-export-${name}.zip`);
  await zipDl.saveAs(zipPath);
  let py = {};
  try {
    py = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'check_zip.py'), zipPath], { encoding: 'utf8' }));
  } catch (e) {
    py = { error: String(e.stdout || e.message) };
  }
  check('csv: Python opens the zip (testzip OK, stored)', py.testzip === null && py.methods && py.methods.every((m) => m === 0), JSON.stringify(py));
  check('csv: one CSV per table', JSON.stringify(py.names) === JSON.stringify(['videos.csv', 'shorts.csv', 'ab_log.csv', 'weekly_notes.csv', 'stats.csv']), JSON.stringify(py.names));
  check('csv: row counts match', JSON.stringify(py.rows) === JSON.stringify({ 'videos.csv': 7, 'shorts.csv': 4, 'ab_log.csv': 2, 'weekly_notes.csv': 1, 'stats.csv': 2 }), JSON.stringify(py.rows));
  check('csv: content survives (quotes, emoji, UTF-8)', py.sample && py.sample.short_title === 'Your attic must breathe — here’s the 10-second check' && py.sample.stats_ctr === '5.2' && py.sample.note === 'Numbers in titles beat questions.', JSON.stringify(py.sample));
  await shot('v2-07-export');
  // Restore from the v2 backup after a reset: everything comes back.
  await page.click('#bk-reset');
  await page.goto(BASE + 'index.html#/shorts');
  await ready();
  check('reset clears Shorts', (await page.locator('.shortc').count()) === 0);
  await page.goto(BASE + 'index.html#/settings?s=backup');
  await ready();
  await page.setInputFiles('#bk-import', bk2Path);
  check('import v2 backup', await toastSays('Backup restored'));
  await page.goto(BASE + 'index.html#/shorts');
  await ready();
  check('import brings Shorts back', (await page.locator('.shortc').count()) === 4);
  // An old (v1) backup still imports.
  await page.goto(BASE + 'index.html#/settings?s=backup');
  await ready();
  await page.setInputFiles('#bk-import', bkPath);
  check('old v1 backup still imports', await toastSays('Backup restored'));
  await page.goto(BASE + 'index.html#/board');
  await ready();
  check('v1 import keeps the videos', (await page.locator('.card').count()) === 7);
  await page.goto(BASE + 'index.html#/settings?s=backup');
  await ready();
  await page.setInputFiles('#bk-import', bk2Path);
  await toastSays('Backup restored');

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
  await page.goto(BASE + 'index.html#/shorts');
  await page.waitForSelector('.shortc');
  check('offline: Shorts board works', (await page.locator('.shortc').count()) === 4);
  await page.goto(BASE + 'index.html#/week');
  await page.waitForSelector('.week-view');
  check('offline: weekly review works', (await page.inputValue('#wk-worked')) === 'Numbers in titles beat questions.');
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
  await page.goto(BASE + `index.html#/video/${vid}/lab`);
  await ready();
  await page.waitForSelector('.thumbmock');
  await shot('v2-08-title-lab-dark');
  await page.goto(BASE + 'index.html#/week');
  await ready();
  await page.waitForSelector('.week-view');
  await shot('v2-09-weekly-review-dark');
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

// Open the app on top of a database made by version 1 (two stores only) and
// check every old record survives the upgrade and the new screens work.
async function runUpgrade(browser) {
  console.log('\n=== upgrade from the v1 database ===');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + 'icons/icon.svg');
  await page.evaluate(async () => {
    const req = indexedDB.open('channel-studio', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('videos', { keyPath: 'id' });
      req.result.createObjectStore('kv', { keyPath: 'key' });
    };
    const db = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const tx = db.transaction(['videos', 'kv'], 'readwrite');
    const base = { titles: ['', '', ''], chosenTitle: 0, thumbTexts: ['BIG CRACK', ''], lengthMin: 10, wpm: null, publishTime: '', order: 0, prompt: { points: 'One\nTwo' }, description: { hook: 'Old hook.' }, checklist: { 'c-title': true }, notes: { text: 'old note', scriptDoc: '', headcast: '', thumbPath: '' }, pinned: null, community: null, createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-02T09:00:00.000Z' };
    tx.objectStore('videos').put({ ...base, id: 'v-old1', channel: 'walter', title: 'Basement Cracks Explained', titles: ['Basement Cracks Explained', '', ''], status: 'script', publishDate: '', product: 'w-manual' });
    tx.objectStore('videos').put({ ...base, id: 'v-old2', channel: 'sal', title: 'My Old Sal Video', titles: ['My Old Sal Video', '', ''], status: 'published', publishDate: '2026-09-15', product: 's-copycat' });
    tx.objectStore('kv').put({ key: 'seeded', value: true });
    tx.objectStore('kv').put({ key: 'theme', value: 'system' });
    tx.objectStore('kv').put({ key: 'checklist', value: [{ id: 'c-title', text: 'My own checklist item' }] });
    tx.objectStore('kv').put({ key: 'channels', value: { walter: { id: 'walter', signOff: 'Old custom sign-off', products: [{ id: 'w-manual', name: 'The Home Check Manual', line: 'Manual', url: 'https://payhip.com/b/ABaxT', price: 17, type: 'paid', emoji: '📖', inDescription: true, order: 1 }] } } });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  });
  await page.goto(BASE + 'index.html#/board');
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForSelector('.card');
  check('upgrade: old videos still on the board', (await page.locator('.card').count()) === 2 && (await page.textContent('#board')).includes('Basement Cracks Explained'));
  const info = await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('channel-studio');
      r.onsuccess = () => res(r.result);
    });
    const out = { version: db.version, stores: [...db.objectStoreNames].sort() };
    db.close();
    return out;
  });
  check('upgrade: database is version 2 with the new stores', info.version === 2 && JSON.stringify(info.stores) === JSON.stringify(['abtests', 'kv', 'shorts', 'stats', 'videos', 'weekly']), JSON.stringify(info));
  await page.goto(BASE + 'index.html#/video/v-old1/notes');
  await page.waitForSelector('[data-note="text"]');
  check('upgrade: old notes kept', (await page.inputValue('[data-note="text"]')) === 'old note');
  await page.goto(BASE + 'index.html#/video/v-old1/checklist');
  await page.waitForSelector('[data-ck]');
  check('upgrade: custom checklist kept', (await page.textContent('.checklist')).includes('My own checklist item') && (await page.isChecked('[data-ck="c-title"]')));
  await page.goto(BASE + 'index.html#/settings');
  await page.waitForSelector('[data-c="signOff"]');
  check('upgrade: custom channel settings kept', (await page.inputValue('[data-c="signOff"]')) === 'Old custom sign-off');
  await page.goto(BASE + 'index.html#/video/v-old1/lab');
  await page.waitForSelector('[data-score-row="0"]');
  check('upgrade: title lab works on old data (keywords added)', (await page.textContent('[data-score-row="0"]')).includes('Channel keyword: basement'));
  await page.goto(BASE + 'index.html#/video/v-old1/shorts');
  await page.click('#sh-add');
  await page.waitForSelector('.shortcard');
  await page.goto(BASE + 'index.html#/week');
  await page.waitForSelector('.week-view');
  check('upgrade: weekly review lists the old published video', (await page.locator('.statrow[data-vid="v-old2"]').count()) === 1);
  check('upgrade: no console errors', errors.length === 0, errors.join('\n      '));
  await ctx.close();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  try {
    await runSize(browser, 'desktop', { width: 1440, height: 900 }, false);
    await runSize(browser, 'phone', { width: 390, height: 844 }, true);
    await runUpgrade(browser);
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
