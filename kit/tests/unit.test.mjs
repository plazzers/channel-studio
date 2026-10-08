// Unit tests for the kit's pure modules. Run from the repo root:
//   node --test kit/tests/unit.test.mjs
// No browser needed: logic.js, pins/logic.js, zip.js and gate.js have no DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scoreTitle, checkThumb, buildPrompt, DEFAULT_TEMPLATES, buildGenericDescription, productLines, unknownPlaceholders, toCSV, csvCell, shortsFromChapters } from '../js/logic.js';
import {
  parseHighlights,
  plainText,
  fitText,
  fixWidows,
  wrapWords,
  parseDelimited,
  parseBatch,
  resolveTemplate,
  pinterestRows,
  pinterestCSV,
  PINTEREST_HEADER,
  normalizeBaseUrl,
  pinFileName,
  addUtm,
  buildSchedule,
  spreadOrder,
  parseTimes,
  defaultTimes,
  shorten,
  splitRows,
  compareParts,
  moneyParts,
  cardParts,
  textOn,
  TEMPLATES,
  TITLE_MAX,
  DESC_MAX,
} from '../js/pins/logic.js';
import { makeZip, readZip, crc32 } from '../js/zip.js';
import { sha256Hex, sha256Fallback, normalizeCode, checkCode, testModeAllowed, TEST_CODE } from '../js/gate.js';
import { ACCESS_HASHES } from '../config.js';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (s) => createHash('sha256').update(s).digest('hex');
// Fake text measure: every character is 0.6 × font size wide.
const measure = (t, size) => t.length * size * 0.6;

/* ---------------- Title scoring ---------------- */

test('title score: a strong title gets 100 with every rule explained', () => {
  const s = scoreTitle('7 Budget Mistakes You Should Never Make in Your 20s', { keywords: ['budget'] });
  assert.equal(s.score, 100);
  assert.equal(s.reasons.length, 7);
  assert.ok(s.reasons.every((r) => r.level === 'good' && r.text));
  assert.equal(s.reasons.reduce((n, r) => n + r.max, 0), 100);
});

test('title score: weak start, caps and clickbait lose points', () => {
  const s = scoreTitle('In this video I show you SHOCKING INSANE TRICKS');
  const by = Object.fromEntries(s.reasons.map((r) => [r.id, r]));
  assert.equal(by.start.points, 0);
  assert.equal(by.caps.points, 0);
  assert.equal(by.clickbait.points, 0);
  assert.equal(by.keyword.points, 0);
  assert.ok(s.score < 50);
  assert.equal(scoreTitle('').score, 0);
});

test('thumbnail check: word count, overlap and 2 lines', () => {
  const c = checkThumb('NO TELESCOPE', ['7 Things You Can See Without a Telescope']);
  assert.equal(c.words, 2);
  assert.equal(c.level, 'bad');
  assert.deepEqual(c.repeats, ['telescope']);
  const ok = checkThumb('LOOK UP', ['7 Things You Can See Without a Telescope']);
  assert.equal(ok.level, 'good');
  assert.ok(ok.linesOk);
});

/* ---------------- Prompt templates & description ---------------- */

test('prompt: placeholders filled, ending line always last, empty labelled lines dropped', () => {
  const t = { ...DEFAULT_TEMPLATES[0], body: DEFAULT_TEMPLATES[0].body + '\nWrite the full script now.' };
  const out = buildPrompt(t, { title: 'My Title', channel: 'Chan', niche: 'money', minutes: 8, wpm: 150, points: '1. one\n- two', audience: 'beginners' });
  const lines = out.split('\n');
  assert.equal(lines[lines.length - 1], 'Write the full script now.');
  assert.equal(out.match(/Write the full script now\./g).length, 1);
  assert.match(out, /1200 spoken words/);
  assert.match(out, /^1\. one$/m);
  assert.match(out, /^2\. two$/m);
  assert.doesNotMatch(out, /Notes:/);
  assert.doesNotMatch(out, /\{\w+\}/);
  assert.equal(DEFAULT_TEMPLATES.length, 3);
  assert.deepEqual(unknownPlaceholders('{title} {foo}'), ['foo']);
});

test('description: link line, products (no duplicates), chapters, disclaimer, hashtags', () => {
  const products = [
    { id: 'a', label: 'Free guide', url: 'https://x.com/free' },
    { id: 'b', label: 'Shop', url: 'https://x.com/shop' },
  ];
  const d = buildGenericDescription({
    hook: 'Hook line.',
    linkLine: 'FREE guide: https://x.com/free',
    products: productLines(products, ['a', 'b']),
    chapters: [{ time: '0:00', title: 'Intro' }, { time: '1:05', title: 'Part' }],
    disclaimer: 'Not advice.',
    hashtags: 'money, #tips tips',
  });
  assert.equal(d, 'Hook line.\n\nFREE guide: https://x.com/free\nShop: https://x.com/shop\n\n0:00 Intro\n1:05 Part\n\nNot advice.\n\n#money #tips');
});

test('shorts from chapters: one per chapter, capped at 45 s', () => {
  const s = shortsFromChapters('0:00 Intro\n0:30 A\n2:00 B');
  assert.deepEqual(s.map((x) => x.range), ['0:00–0:30', '0:30–1:15', '2:00–2:45']);
});

/* ---------------- Highlights & text fitting ---------------- */

test('highlights: *asterisks* mark words, unbalanced ones are ignored', () => {
  assert.deepEqual(parseHighlights('The *best way*, ok'), [
    { text: 'The', hl: false },
    { text: 'best', hl: true },
    { text: 'way,', hl: true },
    { text: 'ok', hl: false },
  ]);
  assert.ok(parseHighlights('a *b c').every((w) => !w.hl));
  assert.equal(plainText('The *best*  way'), 'The best way');
});

test('fit text: shrinks until it fits the box', () => {
  const r = fitText('This is a fairly long headline that needs to wrap', { width: 600, height: 400, maxSize: 150, minSize: 20, measure });
  assert.ok(!r.overflow);
  assert.ok(r.size < 150);
  assert.ok(r.height <= 400);
  for (const line of r.lines) assert.ok(line.map((w) => w.text).join(' ').length * r.size * 0.6 <= 600 + 1e-6);
});

test('fit text: avoids a one-word last line when possible', () => {
  const words = parseHighlights('one two three four five six');
  const lines = wrapWords(words, 10, 140, measure); // 23 chars fit at size 10 -> "one two three four five" + "six"
  assert.equal(lines[lines.length - 1].length, 1);
  const fixed = fixWidows(lines, 10, 140, measure);
  assert.ok(fixed[fixed.length - 1].length >= 2);
  assert.equal(fixed.flat().length, 6);
});

test('fit text: overflow is reported when even the smallest size is too big', () => {
  const r = fitText('word '.repeat(200), { width: 300, height: 100, maxSize: 60, minSize: 30, measure });
  assert.ok(r.overflow);
});

test('template body parsing: compare, money, card', () => {
  const c = compareParts("Don't: A\nDo: B\nDo: C");
  assert.equal(c.left.label, "DON'T");
  assert.deepEqual(c.right.items, ['B', 'C']);
  assert.equal(compareParts('Before: x | After: y').left.label, 'BEFORE');
  const m = moneyParts('Coffee shop: $1,460\nAt home: $180\nTakeaway');
  assert.equal(m.diff, '$1,280');
  assert.equal(m.text, 'Takeaway');
  const k = cardParts('Prep: 10 min\nServes: 4\nCost: $6\nGreat for Sundays.');
  assert.equal(k.stats.length, 3);
  assert.equal(k.text, 'Great for Sundays.');
  assert.equal(TEMPLATES.length, 8);
  assert.equal(textOn('#000000'), '#FFFFFF');
  assert.equal(textOn('#FFFFFF'), '#16141F');
});

/* ---------------- CSV parsing, batch, Pinterest CSV ---------------- */

test('CSV cell escaping', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(' lead'), '" lead"');
  assert.equal(csvCell(null), '');
  assert.equal(toCSV([{ a: 1 }], [['x', (r) => r.a]]), 'x\r\n1\r\n');
});

test('parse delimited: quotes, CRLF, tabs, BOM', () => {
  assert.deepEqual(parseDelimited('﻿a,b\r\n"x, y","he said ""hi"""\r\n'), [
    ['a', 'b'],
    ['x, y', 'he said "hi"'],
  ]);
  assert.deepEqual(parseDelimited('a\tb\n1,2\t3'), [
    ['a', 'b'],
    ['1,2', '3'],
  ]);
  assert.deepEqual(parseDelimited('a,b\n"multi\nline",2'), [
    ['a', 'b'],
    ['multi\nline', '2'],
  ]);
});

test('batch: header in any order, template names, numbers and errors', () => {
  const res = parseBatch('Template\tHeadline\tbody\tBoard\tExtra\nlist\tMy *list*\ta | b | c\tB1\tz\n3\tTip\t\t\t\n\t\t\t\t\nbogus\tHello\t\t\t');
  assert.equal(res.pins.length, 3);
  assert.equal(res.pins[0].template, 'list');
  assert.equal(res.pins[0].body, 'a\nb\nc');
  assert.equal(res.pins[0].title, 'My list');
  assert.equal(res.pins[1].template, 'tip');
  assert.equal(res.pins[2].template, 'bold');
  assert.ok(res.warnings.some((w) => /unknown template "bogus"/.test(w)));
  assert.ok(res.warnings.some((w) => /Ignored column: extra/.test(w)));
  assert.equal(parseBatch('foo,bar\n1,2').errors.length, 1);
  for (const [v, id] of [['Numbered List', 'list'], ["Do vs Don't", 'compare'], ['8', 'checklist'], ['quote', 'quote'], ['nope', null]]) assert.equal(resolveTemplate(v), id);
});

test('Pinterest CSV: exact header, media URL, escaping, round trip', () => {
  const pin = { title: 'A "quoted", title', headline: 'x', body: 'Line one\nLine two', board: 'My Board', link: 'https://x.com/a', keywords: 'a, b' };
  const { rows, problems } = pinterestRows([{ pin, fileName: '001-a.png', date: '2026-10-09', time: '9:00' }], { baseUrl: 'https://me.github.io/pins' });
  assert.deepEqual(problems, []);
  const csv = pinterestCSV(rows);
  assert.equal(csv.split('\r\n')[0], 'Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords');
  const back = parseDelimited(csv);
  assert.deepEqual(back[0], PINTEREST_HEADER);
  const row = Object.fromEntries(PINTEREST_HEADER.map((h, i) => [h, back[1][i]]));
  assert.equal(row.Title, 'A "quoted", title');
  assert.equal(row['Media URL'], 'https://me.github.io/pins/001-a.png');
  assert.equal(row['Publish date'], '2026-10-09T09:00:00');
  assert.equal(row.Keywords, 'a, b');
  assert.equal(row.Thumbnail, '');
  assert.equal(row.Description, 'x. Line one. Line two.');
});

test('Pinterest CSV validation: lengths, base URL, board, link', () => {
  const long = { title: 'T'.repeat(TITLE_MAX + 1), headline: 'h', description: 'D'.repeat(DESC_MAX + 1), board: '', link: 'x.com' };
  const { problems } = pinterestRows([{ pin: long, fileName: 'f.png' }], { baseUrl: 'ftp://nope' });
  assert.equal(problems.length, 5);
  assert.equal(normalizeBaseUrl('https://a.b/c'), 'https://a.b/c/');
  assert.equal(normalizeBaseUrl('a.b'), '');
  assert.equal(shorten('word '.repeat(40), 50).length <= 50, true);
  assert.ok(shorten('word '.repeat(40), 50).endsWith('…'));
  assert.equal(splitRows(Array(450).fill(0)).map((r) => r.length).join(), '200,200,50');
  assert.equal(pinFileName({ title: 'Café: *5* Tips!' }, 0, 'jpg'), '001-cafe-5-tips.jpg');
});

test('UTM builder keeps query and hash, replaces old utm values', () => {
  assert.equal(addUtm('https://x.com/p?id=3#top', { campaign: 'fall', content: 'pin-1' }), 'https://x.com/p?id=3&utm_source=pinterest&utm_medium=social&utm_campaign=fall&utm_content=pin-1#top');
  assert.equal(addUtm('https://x.com/?utm_source=old', {}), 'https://x.com/?utm_source=pinterest&utm_medium=social');
  assert.equal(addUtm('not a url', {}), 'not a url');
});

/* ---------------- Schedule ---------------- */

test('schedule: pins per day, times, dates roll over', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: i, link: `https://x.com/${i}` }));
  const s = buildSchedule(items, { start: '2026-12-31', perDay: 3, times: '20:00, 9:00 14:00', spread: false });
  assert.deepEqual(s.map((x) => `${x.date} ${x.time}`), ['2026-12-31 09:00', '2026-12-31 14:00', '2026-12-31 20:00', '2027-01-01 09:00', '2027-01-01 14:00', '2027-01-01 20:00', '2027-01-02 09:00']);
  assert.deepEqual(parseTimes('9:00, 25:00, 13:30 9:00'), ['09:00', '13:30']);
  assert.deepEqual(defaultTimes(3), ['08:00', '14:30', '21:00']);
  const auto = buildSchedule(items, { start: '2026-01-01', perDay: 4, times: '10:00' });
  assert.equal(auto[0].time, '08:00');
});

test('schedule: similar pins are spread apart', () => {
  const items = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, link: 'https://x.com/a?utm_source=x' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, link: 'https://x.com/b' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, link: 'https://x.com/c/' })),
  ];
  const order = spreadOrder(items);
  const keys = order.map((x) => x.id[0]);
  for (let i = 1; i < keys.length; i++) assert.notEqual(keys[i], keys[i - 1], `adjacent similar pins at ${i}: ${keys.join('')}`);
  const sched = buildSchedule(items, { start: '2026-01-01', perDay: 3, times: '9:00,12:00,18:00' });
  const byDay = {};
  for (const s of sched) (byDay[s.date] ||= []).push(s.item.id[0]);
  for (const d of Object.values(byDay)) assert.equal(new Set(d).size, d.length, 'no two similar pins on the same day');
  // Stable: each group keeps its own order.
  assert.deepEqual(order.filter((x) => x.id[0] === 'a').map((x) => x.id), ['a0', 'a1', 'a2', 'a3']);
});

/* ---------------- ZIP ---------------- */

test('ZIP writer: CRC, round trip, opens in Python zipfile', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const zip = makeZip([
    { name: 'pinterest-bulk.csv', data: 'Title,Media URL\r\nÄ,x\r\n' },
    { name: '001-pin.png', data: png },
  ]);
  const back = readZip(zip);
  assert.deepEqual(back.map((f) => f.name), ['pinterest-bulk.csv', '001-pin.png']);
  assert.ok(back.every((f) => f.crcOk));
  assert.deepEqual([...back[1].data], [...png]);
  const py = `import sys,zipfile,io\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nassert z.testzip() is None\nprint(z.read('pinterest-bulk.csv').decode('utf-8').split('\\r\\n')[1])`;
  const out = execFileSync('python3', ['-c', py], { input: Buffer.from(zip) }).toString().trim();
  assert.equal(out, 'Ä,x');
});

/* ---------------- Access codes ---------------- */

test('access codes: SHA-256 of the normalized code', async () => {
  assert.equal(normalizeCode('  kit-ab2c-9xyz \n'), 'KIT-AB2C-9XYZ');
  assert.equal(await sha256Hex('KIT-AB2C-9XYZ'), sha('KIT-AB2C-9XYZ'));
  for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'ünïcödé'.repeat(20)]) {
    assert.equal(sha256Fallback(new TextEncoder().encode(s)), sha(s));
  }
  const hashes = [sha('KIT-AB2C-9XYZ')];
  assert.equal((await checkCode(' kit-ab2c-9xyz', { hashes })).ok, true);
  assert.equal((await checkCode('KIT-AB2C-9XY0', { hashes })).ok, false);
  assert.equal((await checkCode('', { hashes })).ok, false);
  assert.equal((await checkCode(TEST_CODE, { hashes })).ok, false, 'test code needs test mode');
  assert.equal((await checkCode('kit-test-0000', { hashes, testMode: true })).ok, true);
  assert.equal(testModeAllowed({ hostname: 'localhost', search: '?testcode=1' }), true);
  assert.equal(testModeAllowed({ hostname: 'plazzers.github.io', search: '?testcode=1' }), false);
  assert.equal(testModeAllowed({ hostname: '127.0.0.1', search: '' }), false);
});

test('config.js ships with an empty hash list', () => {
  assert.deepEqual(ACCESS_HASHES, []);
  assert.match(readFileSync(join(KIT, 'config.js'), 'utf8'), /EMPTY on purpose/);
});

test('make_codes.py: codes match the JS hashing, refuses paths inside the repo', () => {
  const out = join(KIT, '..', '..', 'kit-test-codes-tmp.txt');
  const res = execFileSync('python3', [join(KIT, 'tools', 'make_codes.py'), '--count', '5', '--out', out, '--force']).toString();
  const codes = readFileSync(out, 'utf8').trim().split('\n');
  assert.equal(codes.length, 5);
  for (const c of codes) {
    assert.match(c, /^KIT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.ok(res.includes(`'${sha(c)}'`));
  }
  execFileSync('rm', [out]);
  assert.throws(() => execFileSync('python3', [join(KIT, 'tools', 'make_codes.py'), '--count', '1', '--out', join(KIT, 'codes.txt')], { stdio: 'pipe' }));
});

/* ---------------- Packaging ---------------- */

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('service worker lists every app file, and every listed file exists', () => {
  const sw = readFileSync(join(KIT, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const f of listed) assert.ok(existsSync(join(KIT, f)), `missing ${f}`);
  const need = [...walk(join(KIT, 'js')), ...walk(join(KIT, 'fonts')).filter((f) => f.endsWith('.woff2')), join(KIT, 'css', 'kit.css')].map((f) => f.slice(KIT.length + 1));
  for (const f of need) assert.ok(listed.includes(f), `sw.js does not cache ${f}`);
});

test('no content from the owner’s private channels in the kit app', () => {
  const files = [...walk(join(KIT, 'js')), join(KIT, 'index.html'), join(KIT, 'css', 'kit.css'), join(KIT, 'manifest.webmanifest'), ...walk(join(KIT, 'sales')).filter((f) => /\.(md|txt)$/.test(f))];
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /walter|chef sal|\bsal romano|payhip\.com\/b\/|#1C2B3A|#E07A1F|#BE3A24/i, f);
  }
});

test('make_access_pdf.py prints the buyer’s code in the guide', (t) => {
  try {
    execFileSync('python3', ['-c', 'import reportlab, PIL']);
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
  } catch {
    t.skip('reportlab or pdftotext not installed');
    return;
  }
  const out = join(KIT, '..', '..', 'kit-test-guide-tmp.pdf');
  execFileSync('python3', [join(KIT, 'tools', 'make_access_pdf.py'), '--code', 'kit-ab2c-9xyz', '--out', out], { stdio: 'pipe' });
  const text = execFileSync('pdftotext', [out, '-']).toString();
  execFileSync('rm', [out]);
  assert.match(text, /ACCESS CODE: KIT-AB2C-9XYZ/);
  assert.match(text, /GitHub Pages/);
  assert.throws(() => execFileSync('python3', [join(KIT, 'tools', 'make_access_pdf.py'), '--code', 'nope', '--out', out], { stdio: 'pipe' }));
});
