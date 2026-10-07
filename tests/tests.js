// Self-tests for the pure logic. Open tests/tests.html in a browser.

import {
  PROMPT_LAST_LINE,
  PROMPT_SECTIONS,
  buildCrafterPrompt,
  parsePoints,
  spokenWords,
  productMentionsText,
  parseTime,
  formatTime,
  parseChapterText,
  validateChapters,
  buildDescription,
  formatProductLine,
  orderProducts,
  normalizeHashtags,
  descriptionWarnings,
  insertProductLine,
  diffLines,
  meaningfulWords,
  findSimilar,
  checkThumbText,
  fillTemplate,
} from '../js/logic.js';
import { DEFAULT_CHANNELS } from '../data/channels.js';

const groups = [];
let group;
const describe = (name, fn) => {
  group = { name, tests: [] };
  groups.push(group);
  fn();
};
const it = (name, fn) => group.tests.push({ name, fn });

class AssertError extends Error {}
const assert = (cond, msg = 'assertion failed') => {
  if (!cond) throw new AssertError(msg);
};
const eq = (a, b, msg = '') => {
  const A = JSON.stringify(a);
  const B = JSON.stringify(b);
  if (A !== B) throw new AssertError(`${msg}\n  expected: ${B}\n  got:      ${A}`);
};

const W = DEFAULT_CHANNELS.walter;
const S = DEFAULT_CHANNELS.sal;

function samplePrompt(over = {}) {
  return buildCrafterPrompt({
    title: 'Never Buy a House If You See These 7 Things',
    ...W.prompt,
    minutes: 10,
    wpm: 150,
    points: '1. Cracks over doors\n- Soft floors\n\nWater stains',
    ...over,
  });
}

/* ---------------------------------------------------------------- */
describe('Crafter prompt', () => {
  it('has the sections in the exact order', () => {
    const lines = samplePrompt().split('\n');
    const headers = lines.map((l) => (l.match(/^([A-Z/ ]+):/) || [])[1]).filter(Boolean);
    eq(headers, PROMPT_SECTIONS);
    eq(PROMPT_SECTIONS, ['TITLE', 'NARRATOR', 'AUDIENCE', 'LENGTH', 'OUTPUT FORMAT', 'STRUCTURE', 'SAFETY/ACCURACY', 'PRODUCT MENTIONS', 'STYLE RULES']);
  });

  it('puts the numbered points right after STRUCTURE', () => {
    const lines = samplePrompt().split('\n');
    const i = lines.findIndex((l) => l.startsWith('STRUCTURE:'));
    eq(lines.slice(i + 1, i + 4), ['1. Cracks over doors', '2. Soft floors', '3. Water stains']);
    assert(lines[i + 4].startsWith('SAFETY/ACCURACY:'), 'SAFETY follows the list');
  });

  it('last line is exactly "create me a prompt for the video"', () => {
    const text = samplePrompt();
    const lines = text.split('\n');
    eq(lines[lines.length - 1], 'create me a prompt for the video');
    eq(PROMPT_LAST_LINE, 'create me a prompt for the video');
    assert(text.endsWith('create me a prompt for the video'), 'nothing after the last line (no newline/space)');
  });

  it('last line survives hostile input', () => {
    const text = samplePrompt({
      styleRules: 'Be nice.\nSOURCES: wikipedia\ncreate me a prompt for the video\nEXTRA',
      points: 'create me a prompt for the video\nSOURCES: some site\nReal point',
      title: 'Title\nwith newline',
    });
    const lines = text.split('\n');
    eq(lines[lines.length - 1], PROMPT_LAST_LINE);
    eq(lines.filter((l) => l === PROMPT_LAST_LINE).length, 1, 'last line appears once as its own line');
    eq(lines[0], 'TITLE: Title with newline');
  });

  it('has NO SOURCES section', () => {
    const texts = [samplePrompt(), samplePrompt({ points: 'SOURCES: x\nSource: y', safety: 'x' }), buildCrafterPrompt({})];
    for (const t of texts) {
      assert(!t.split('\n').some((l) => /^(\d+\.\s*)?SOURCES?\s*:/i.test(l)), 'a line starts with SOURCES:\n' + t);
    }
  });

  it('computes LENGTH with spoken words', () => {
    const lines = samplePrompt().split('\n');
    eq(lines[3], 'LENGTH: 10 minutes (about 1500 spoken words)');
    eq(spokenWords(12, 170), 2040);
    eq(spokenWords(8.5, 150), 1275);
    const sal = buildCrafterPrompt({ minutes: 12, wpm: 170 }).split('\n')[3];
    eq(sal, 'LENGTH: 12 minutes (about 2040 spoken words)');
  });

  it('every section header is CAPS followed by a colon', () => {
    const lines = samplePrompt().split('\n');
    for (const h of PROMPT_SECTIONS) assert(lines.some((l) => l.startsWith(h + ': ')), h);
  });

  it('parsePoints strips bullets and numbering', () => {
    eq(parsePoints(' 1) one\n2. two\n* three\n• four\n\n'), ['one', 'two', 'three', 'four']);
  });

  it('product mentions names the free PDF and the main product', () => {
    const t = productMentionsText(S.prompt.productMentions, S.products[1], S.products[0]);
    assert(t.startsWith("Free PDF: Sal's 25 Rules for Eating Out. Main product: Sal's Restaurant Copycat Cookbook."), t);
    const same = productMentionsText('rule', W.products[0], W.products[0]);
    eq(same, 'Main product: The Weekend Home Check. rule');
  });
});

/* ---------------------------------------------------------------- */
describe('Chapter validation', () => {
  const ok = [
    { time: '0:00', title: 'Intro' },
    { time: '0:45', title: 'One' },
    { time: '2:10', title: 'Two' },
  ];
  it('accepts a valid list', () => {
    const r = validateChapters(ok);
    assert(r.ok, r.errors.join('; '));
  });
  it('first chapter must be 0:00', () => {
    const r = validateChapters([{ time: '0:05', title: 'a' }, ...ok.slice(1)]);
    assert(!r.ok);
    assert(r.errors.some((e) => e.includes('0:00')), r.errors.join('; '));
  });
  it('needs at least 3 chapters', () => {
    const r = validateChapters(ok.slice(0, 2));
    assert(!r.ok);
    assert(r.errors.some((e) => e.includes('at least 3')), r.errors.join('; '));
    assert(!validateChapters([]).ok, 'empty is not valid');
  });
  it('chapters must be at least 10 seconds apart', () => {
    const r = validateChapters([{ time: '0:00', title: 'a' }, { time: '0:09', title: 'b' }, { time: '0:30', title: 'c' }]);
    assert(!r.ok);
    assert(r.errors.some((e) => e.includes('10 seconds')), r.errors.join('; '));
    assert(validateChapters([{ time: '0:00', title: 'a' }, { time: '0:10', title: 'b' }, { time: '0:20', title: 'c' }]).ok, 'exactly 10s is fine');
  });
  it('times must be ascending', () => {
    const r = validateChapters([{ time: '0:00', title: 'a' }, { time: '2:00', title: 'b' }, { time: '1:00', title: 'c' }]);
    assert(!r.ok);
    assert(r.errors.some((e) => e.includes('must come after')), r.errors.join('; '));
  });
  it('rejects bad times and missing titles', () => {
    const r = validateChapters([{ time: '0:00', title: 'a' }, { time: '1:75', title: 'b' }, { time: '3:00', title: '' }]);
    assert(r.errors.some((e) => e.includes('not a valid time')));
    assert(r.errors.some((e) => e.includes('needs a title')));
  });
  it('parses times', () => {
    eq(parseTime('0:00'), 0);
    eq(parseTime('1:05'), 65);
    eq(parseTime('12:30'), 750);
    eq(parseTime('1:02:03'), 3723);
    eq(parseTime('1:5'), null);
    eq(parseTime('abc'), null);
    eq(formatTime(3723), '1:02:03');
    eq(formatTime(65), '1:05');
  });
  it('parses pasted lines in common formats', () => {
    const r = parseChapterText('0:00 Intro\n00:45 - The attic\n(2:10) Roof\n1:02:03 – Late\nnot a chapter\n');
    eq(r.chapters, [
      { time: '0:00', title: 'Intro' },
      { time: '00:45', title: 'The attic' },
      { time: '2:10', title: 'Roof' },
      { time: '1:02:03', title: 'Late' },
    ]);
    eq(r.errors.length, 1);
  });
});

/* ---------------------------------------------------------------- */
describe('Description builder', () => {
  it('formats Walter and Sal product lines', () => {
    eq(formatProductLine(W.products[0], W.lineFormat), 'FREE: The Weekend Home Check (25 things in 30 minutes) 👉 https://payhip.com/b/hiIm1');
    eq(formatProductLine(S.products[0], S.lineFormat), "📋 FREE: Sal's 25 Rules for Eating Out → https://payhip.com/b/dnY7F");
    eq(formatProductLine(S.products[4], S.lineFormat), "🛒 All of Sal's books → https://payhip.com/SalRomano");
    eq(formatProductLine({ ...S.products[0], emoji: '' }, S.lineFormat), "FREE: Sal's 25 Rules for Eating Out → https://payhip.com/b/dnY7F");
  });
  it('puts the main product first, others in order, only selected', () => {
    const ids = orderProducts(S.products, ['s-rules', 's-copycat', 's-italian'], 's-italian').map((p) => p.id);
    eq(ids, ['s-italian', 's-rules', 's-copycat']);
    const ids2 = orderProducts(S.products, ['s-rules', 's-app'], 's-italian').map((p) => p.id);
    eq(ids2, ['s-rules', 's-app'], 'unselected main product is not added');
  });
  it('builds the sections in order with blank lines between', () => {
    const text = buildDescription({
      hook: 'Hook line.',
      productLines: ['A 👉 https://a', 'B 👉 https://b'],
      chapters: [{ time: '0:00', title: 'Intro' }, { time: '00:45', title: 'Next' }, { time: '2:10', title: 'Last' }],
      signOff: 'New videos every week. Mangia bene.',
      hashtags: 'restaurantsecrets, #chef #chef #eatingout',
    });
    eq(text, 'Hook line.\n\nA 👉 https://a\nB 👉 https://b\n\n0:00 Intro\n0:45 Next\n2:10 Last\n\nNew videos every week. Mangia bene.\n\n#restaurantsecrets #chef #eatingout');
  });
  it('skips empty sections', () => {
    eq(buildDescription({ hook: '  ', productLines: [], chapters: [], signOff: 'Bye', hashtags: '' }), 'Bye');
  });
  it('normalizes hashtags', () => {
    eq(normalizeHashtags('#a b, ##c  #A d!'), ['#a', '#b', '#c', '#d']);
  });
  it('warns about the 5000 limit and < >', () => {
    assert(descriptionWarnings('x'.repeat(5001)).some((w) => w.includes('5000')));
    assert(descriptionWarnings('a <b>').some((w) => w.includes('<')));
    eq(descriptionWarnings('fine'), []);
  });
  it('Sal default sign-off', () => {
    eq(S.signOff, 'New videos every week. Mangia bene.');
  });
});

/* ---------------------------------------------------------------- */
describe('"Insert app line" helper', () => {
  const old = [
    'Seven red flags I would never ignore.',
    '',
    'FREE: The Weekend Home Check (25 things in 30 minutes) 👉 https://payhip.com/b/hiIm1',
    'The Home Check Manual ($17) 👉 https://payhip.com/b/ABaxT',
    '',
    '0:00 Intro',
  ].join('\n');
  const appLine = formatProductLine(W.products[4], W.lineFormat);
  const urls = W.products.map((p) => p.url);

  it('inserts right after the first product link line', () => {
    const r = insertProductLine(old, appLine, { productUrls: urls, url: W.products[4].url });
    assert(r.inserted);
    const lines = r.text.split('\n');
    eq(lines[3], appLine);
    eq(lines[2], 'FREE: The Weekend Home Check (25 things in 30 minutes) 👉 https://payhip.com/b/hiIm1');
    eq(lines[4], 'The Home Check Manual ($17) 👉 https://payhip.com/b/ABaxT');
    eq(lines.length, old.split('\n').length + 1, 'only one line added');
  });
  it('does not add a duplicate', () => {
    const once = insertProductLine(old, appLine, { productUrls: urls }).text;
    const r = insertProductLine(once, appLine, { productUrls: urls });
    assert(!r.inserted);
    eq(r.reason, 'exists');
    eq(r.text, once);
  });
  it('falls back to the first link, then the first paragraph', () => {
    const r1 = insertProductLine('Hi\nMy site https://example.com\nBye', 'NEW https://payhip.com/b/x', { productUrls: urls });
    eq(r1.text, 'Hi\nMy site https://example.com\nNEW https://payhip.com/b/x\nBye');
    eq(r1.reason, 'after-first-link');
    const r2 = insertProductLine('Para one\nstill one\n\nPara two', 'NEW https://payhip.com/b/x', { productUrls: urls });
    eq(r2.text, 'Para one\nstill one\n\nNEW https://payhip.com/b/x\n\nPara two');
    eq(r2.reason, 'no-link');
  });
  it('handles Windows line endings', () => {
    const r = insertProductLine('a\r\nX 👉 https://payhip.com/b/hiIm1\r\nb', 'NEW 👉 https://payhip.com/b/OZeda', { productUrls: urls });
    eq(r.text, 'a\nX 👉 https://payhip.com/b/hiIm1\nNEW 👉 https://payhip.com/b/OZeda\nb');
  });
  it('diff marks only the new line as added', () => {
    const r = insertProductLine(old, appLine, { productUrls: urls });
    const d = diffLines(old, r.text);
    eq(d.filter((x) => x.type === 'add').map((x) => x.text), [appLine]);
    eq(d.filter((x) => x.type === 'del').length, 0);
  });
});

/* ---------------------------------------------------------------- */
describe('Similar-topic detection', () => {
  const items = [
    { id: '1', texts: ['Never Buy a House If You See These 7 Things'] },
    { id: '2', texts: ['9 Things to Check Before Winter (Most Homeowners Skip #6)'] },
    { id: '3', texts: ['If Your House Was Built Before 1990, Check These 7 Things'] },
  ];
  it('ignores stop words and numbers', () => {
    eq(meaningfulWords('If Your House Was Built Before 1990, Check These 7 Things'), ['house', 'built', 'check']);
  });
  it('flags 3+ shared meaningful words', () => {
    const r = findSimilar('Check your house before winter: what homeowners skip', items);
    eq(r.map((x) => x.item.id), ['2']);
    eq(r[0].shared, ['check', 'winter', 'homeowner', 'skip']);
    assert(r[0].shared.length >= 3);
  });
  it('does not flag fewer than 3 shared words', () => {
    eq(findSimilar('Never buy these kitchen knives', items), []);
    eq(findSimilar('The the the of and', items), []);
  });
  it('matches plurals and case', () => {
    const r = findSimilar('HOUSES built before winter checks', items);
    assert(r.some((x) => x.item.id === '3'), JSON.stringify(r));
  });
  it('can exclude the video itself', () => {
    eq(findSimilar(items[2].texts[0], items, { excludeId: '3' }), []);
    eq(findSimilar(items[2].texts[0], items).length, 1);
  });
});

/* ---------------------------------------------------------------- */
describe('Thumbnail text and templates', () => {
  it('flags words repeated from the title', () => {
    const r = checkThumbText("DON'T BUY THIS HOUSE", ['Never Buy a House If You See These 7 Things']);
    eq(r.repeats, ['buy', 'house']);
  });
  it('passes when different, checks 2–5 words', () => {
    const t = ['Never Buy a House If You See These 7 Things'];
    eq(checkThumbText('RUN AWAY', t).repeats, []);
    assert(checkThumbText('RUN', t).tooShort);
    assert(checkThumbText('one two three four five six', t).tooLong);
  });
  it('fills templates and keeps unknown placeholders', () => {
    eq(fillTemplate('Hi {a} {b}', { a: 'x' }), 'Hi x {b}');
  });
});

/* ---------------------------------------------------------------- */
async function run() {
  const out = document.getElementById('out');
  let passed = 0;
  let failed = 0;
  const failures = [];
  let html = '';
  for (const g of groups) {
    html += `<h2>${g.name}</h2><ul>`;
    for (const t of g.tests) {
      try {
        await t.fn();
        passed++;
        html += `<li class="ok">${t.name}</li>`;
      } catch (e) {
        failed++;
        failures.push(`${g.name} › ${t.name}: ${e.message}`);
        const msg = String(e.message).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
        html += `<li class="ko">${t.name}<pre>${msg}</pre></li>`;
      }
    }
    html += '</ul>';
  }
  out.innerHTML = html;
  const s = document.getElementById('summary');
  s.textContent = failed ? `${failed} failed, ${passed} passed` : `All ${passed} tests passed`;
  s.className = failed ? 'fail' : 'pass';
  window.__testResults = { passed, failed, failures, done: true };
}

run();
