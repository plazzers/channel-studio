// Make the Payhip images from real screenshots of the kit:
//   node kit/tools/make_sales_images.cjs      (from the repo root)
// Writes kit/sales/cover-1280x720.png, cover-square-1400.png and
// feature-1…6-*.png. Uses the preinstalled Chromium via Playwright.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')));
}

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(REPO, 'kit', 'sales');
const PORT = 4176;
const ORIGIN = `http://localhost:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(REPO, p);
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

const dataUrl = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const fontCss = ['space-grotesk-latin-700-normal', 'inter-latin-400-normal', 'inter-latin-600-normal']
  .map((f) => {
    const [fam, , w] = f.split(/-(?=latin)|-(?=\d)/);
    const b64 = fs.readFileSync(path.join(REPO, 'kit', 'fonts', f + '.woff2')).toString('base64');
    const family = f.startsWith('space') ? 'Space Grotesk' : 'Inter';
    const weight = f.match(/-(\d{3})-/)[1];
    void fam;
    void w;
    return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
  })
  .join('');

const BASE_CSS = `${fontCss}
*{box-sizing:border-box}body{margin:0;font-family:Inter,sans-serif;color:#fff;background:#1C1A27;overflow:hidden}
.bg{position:absolute;inset:0;background:radial-gradient(900px 600px at 105% -10%,rgba(255,107,74,.55),transparent 60%),radial-gradient(800px 600px at -10% 120%,rgba(108,92,231,.45),transparent 60%),#1C1A27}
h1{font-family:'Space Grotesk';font-weight:700;letter-spacing:-.02em;margin:0;line-height:1.02}
.eyebrow{font:700 15px 'Space Grotesk';letter-spacing:.18em;color:#FF6B4A;text-transform:uppercase}
.win{border-radius:14px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.08);background:#f6f4ef}
.win .bar{height:30px;background:#e9e5dc;display:flex;gap:7px;align-items:center;padding:0 12px}
.win .bar i{width:11px;height:11px;border-radius:50%;background:#d6d0c4;display:block}
.win img{display:block;width:100%}
.pin{border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.45);display:block}
.chips{display:flex;gap:10px;flex-wrap:wrap}.chips span{padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.1);font-weight:600;font-size:16px}`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/kit/?testcode=1`);
    await page.fill('#gate-code', 'KIT-TEST-0000');
    await page.click('#gate-form button');
    await page.waitForSelector('#wz-skip');
    await page.click('#wz-skip');
    await page.waitForTimeout(400);
    const go = async (h, wait = 400) => {
      await page.evaluate((x) => (location.hash = x), h);
      await page.waitForTimeout(wait);
    };
    const snap = async (h, wait) => {
      await go(h, wait);
      return page.screenshot();
    };

    // Demo pins as full-size images.
    const pins = await page.evaluate(async () => {
      const { renderPin } = await import('./js/pins/render.js');
      const db = await new Promise((r) => {
        const q = indexedDB.open('faceless-creator-kit');
        q.onsuccess = () => r(q.result);
      });
      const all = await new Promise((r) => {
        const q = db.transaction('pins').objectStore('pins').getAll();
        q.onsuccess = () => r(q.result);
      });
      const ch = await new Promise((r) => {
        const q = db.transaction('channels').objectStore('channels').get('demo');
        q.onsuccess = () => r(q.result);
      });
      const out = {};
      for (const p of all.filter((x) => x.demo)) {
        const { canvas } = await renderPin(p, ch.brand);
        out[p.template] = canvas.toDataURL('image/png');
      }
      return out;
    });

    // Real screenshots of the features.
    const shots = {};
    shots.board = await snap('#/board');
    shots.lab = await snap('#/video/demo-v1/lab');
    shots.prompt = await snap('#/video/demo-v1/prompt');
    shots.pins = await snap('#/pins', 2500);
    await go('#/pins');
    await page.evaluate(() => window.scrollTo(0, 430));
    await page.waitForTimeout(400);
    shots.pinsGrid = await page.screenshot();
    shots.editor = await snap('#/pins/demo-p2', 900);
    await go('#/batch');
    await page.click('#bt-example');
    await page.click('#bt-go');
    await page.waitForSelector('#bt-grid [data-pin]', { timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelector('#bt-result').scrollIntoView());
    await page.waitForTimeout(300);
    shots.batch = await page.screenshot();
    await go('#/export', 500);
    await page.fill('#ex-base', 'https://yourname.github.io/pins/');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.scrollTo(0, 560));
    await page.waitForTimeout(300);
    shots.export = await page.screenshot();
    await ctx.close();

    const comp = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
    const render = async (file, w, h, html) => {
      await comp.setViewportSize({ width: w, height: h });
      await comp.setContent(`<!doctype html><html><head><style>${BASE_CSS}</style></head><body style="width:${w}px;height:${h}px;position:relative">${html}</body></html>`);
      await comp.waitForTimeout(300);
      await comp.screenshot({ path: path.join(OUT, file) });
      console.log('wrote', file);
    };
    const win = (buf, style) => `<div class="win" style="${style}"><div class="bar"><i></i><i></i><i></i></div><img src="${dataUrl(buf)}"></div>`;

    await render(
      'cover-1280x720.png',
      1280,
      720,
      `<div class="bg"></div>
      <div style="position:absolute;left:64px;top:70px;width:520px">
        <div class="eyebrow">For faceless &amp; AI-avatar YouTubers</div>
        <h1 style="font-size:78px;margin-top:18px">Faceless<br>Creator Kit</h1>
        <p style="font-size:22px;line-height:1.45;color:#D2CFDD;margin:22px 0 28px">Plan every video and make Pinterest pins in bulk — right in your browser.</p>
        <div class="chips"><span>Channel Planner</span><span>Pin Factory</span><span>8 pin templates</span><span>Works offline</span></div>
      </div>
      ${win(shots.lab, 'position:absolute;left:620px;top:84px;width:640px;transform:rotate(-1.5deg)')}
      <img class="pin" src="${pins.list}" style="position:absolute;left:560px;top:380px;width:190px">
      <img class="pin" src="${pins.money}" style="position:absolute;left:1040px;top:330px;width:200px;transform:rotate(3deg)">`,
    );

    await render(
      'cover-square-1400.png',
      1400,
      1400,
      `<div class="bg"></div>
      <div style="position:absolute;left:90px;top:90px;right:90px">
        <div class="eyebrow" style="font-size:20px">For faceless &amp; AI-avatar YouTubers</div>
        <h1 style="font-size:116px;margin-top:22px">Faceless Creator Kit</h1>
        <p style="font-size:30px;line-height:1.4;color:#D2CFDD;margin:26px 0 0;max-width:1000px">Plan every video. Make Pinterest pins in bulk. In your browser, offline, with your data on your device.</p>
      </div>
      ${win(shots.board, 'position:absolute;left:90px;top:560px;width:860px;transform:rotate(-1.2deg)')}
      <img class="pin" src="${pins.checklist}" style="position:absolute;left:880px;top:520px;width:250px;transform:rotate(2deg)">
      <img class="pin" src="${pins.bold}" style="position:absolute;left:1080px;top:760px;width:250px;transform:rotate(-2deg)">
      <img class="pin" src="${pins.compare}" style="position:absolute;left:760px;top:900px;width:230px;transform:rotate(-4deg)">`,
    );

    const features = [
      ['feature-1-planner-board.png', 'Plan every video on one board', 'Idea → Script → Voice/Avatar → Edit → Thumbnail → Scheduled → Published, for as many channels as you run.', shots.board],
      ['feature-2-title-lab.png', 'Title & thumbnail lab', 'Test three titles and thumbnail texts. Every point of the score is explained.', shots.lab],
      ['feature-3-prompt-builder.png', 'Script prompts in one click', 'Three ready templates (listicle, story, how-to) — or write your own with a fixed ending line.', shots.prompt],
      ['feature-4-pin-templates.png', '8 Pinterest pin templates', 'Your colors, fonts, logo and footer. Highlight key words with *asterisks*.', shots.pinsGrid],
      ['feature-5-batch-mode.png', 'Batch mode: paste a sheet, get 10+ pins', 'Paste rows from Google Sheets or Excel, render them all, fix any pin in a click.', shots.batch],
      ['feature-6-export.png', 'ZIP + Pinterest bulk-upload CSV', 'PNG or JPG, public image links, UTM tags, a posting schedule and length checks.', shots.export],
    ];
    for (const [file, title, sub, buf] of features) {
      await render(
        file,
        1600,
        1000,
        `<div class="bg"></div>
        <div style="position:absolute;left:80px;top:56px;right:80px">
          <div class="eyebrow">Faceless Creator Kit</div>
          <h1 style="font-size:52px;margin-top:10px">${title}</h1>
          <p style="font-size:22px;color:#D2CFDD;margin:12px 0 0">${sub.replace(/\*/g, '&#42;')}</p>
        </div>
        ${win(buf, 'position:absolute;left:150px;top:270px;width:1300px')}`,
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
