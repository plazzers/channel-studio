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
  validateShortRange,
  shortsFromChapters,
  checkShort,
  buildShortDescription,
  formatMMSS,
  scoreTitle,
  hasPhrase,
  capsWords,
  wordList,
  thumbOverlap,
  thumbLines,
  checkThumb,
  abWinner,
  isoWeek,
  weekStart,
  weekDays,
  shiftWeek,
  parseWeekKey,
  weeksInYear,
  lastWeeks,
  addDays,
  daysBetween,
  stuckVideos,
  weeklySeries,
  sparkPoints,
  toCSV,
  csvCell,
  DEFAULT_TITLE_WORDS,
} from '../js/logic.js';
import { DEFAULT_CHANNELS } from '../data/channels.js';
import { crc32, makeZip, readZip } from '../js/zip.js';
import * as db from '../js/db.js';

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


/* ================================================================ */
/* v2                                                                */
/* ================================================================ */

describe('Shorts: timestamp validation', () => {
  it('accepts 15–60 second ranges and reports the duration', () => {
    const r = validateShortRange('1:05–1:50');
    assert(r.ok, r.error);
    eq([r.start, r.end, r.duration], [65, 110, 45]);
    assert(validateShortRange('0:00-0:15').ok, 'exactly 15 s');
    assert(validateShortRange('2:00 - 3:00').ok, 'exactly 60 s, plain hyphen with spaces');
    assert(validateShortRange('10:00 to 10:30').ok, '"to"');
    assert(validateShortRange('75:10–75:40').ok, 'minutes past 59');
  });
  it('rejects too short, too long and backwards', () => {
    const short = validateShortRange('1:00–1:14');
    assert(!short.ok && short.duration === 14 && short.error.includes('15–60'), short.error);
    const long = validateShortRange('1:00–2:01');
    assert(!long.ok && long.duration === 61 && long.error.includes('too long'), long.error);
    const back = validateShortRange('2:00–1:30');
    assert(!back.ok && back.error.includes('after the start'), back.error);
  });
  it('rejects bad formats and empty input', () => {
    assert(!validateShortRange('1:5–1:50').ok);
    assert(validateShortRange('1:75–2:00').error.includes('not a valid time'));
    assert(validateShortRange('1:05').error.includes('not a range'));
    const e = validateShortRange('  ');
    assert(!e.ok && e.empty);
  });
  it('formats mm:ss', () => {
    eq(formatMMSS(65), '1:05');
    eq(formatMMSS(3725), '62:05');
    eq(formatMMSS(0), '0:00');
  });
  it('checks hook, on-screen text, title length and keyword', () => {
    const long = 'Never Buy a House If You See These 7 Things';
    const ok = checkShort({ hook: 'Look up before you buy this house', onScreen: 'LOOK UP FIRST', title: 'The ceiling stain that kills a house sale', range: '0:10–0:40' }, long);
    assert(ok.hookOk && ok.textOk && ok.titleOk && ok.titleKeyword && ok.range.ok, JSON.stringify(ok));
    eq(ok.shared, ['house']);
    const bad = checkShort({ hook: 'one two three four five six seven eight nine ten eleven twelve thirteen', onScreen: 'a b c d e f g', title: 'x'.repeat(101), range: '' }, long);
    assert(!bad.hookOk && bad.hookWords === 13);
    assert(!bad.textOk && bad.textWords === 7);
    assert(!bad.titleOk && bad.titleLen === 101);
    const nokw = checkShort({ title: 'Kitchen knives ranked' }, long);
    assert(!nokw.titleKeyword, 'warns when no word from the long title');
  });
  it('builds the Short description with the link line', () => {
    eq(buildShortDescription('Full video on the channel.', 'FREE: X 👉 https://a'), 'Full video on the channel.\n\nFREE: X 👉 https://a');
    eq(buildShortDescription('', 'L'), 'L');
  });
});

describe('Shorts: chapters → Shorts plan', () => {
  it('one Short per chapter, start to min(next chapter, +45 s)', () => {
    const plan = shortsFromChapters('0:00 Intro\n0:30 Cracks over doors\n2:10 Soft floors\n2:40 Water stains');
    eq(plan.map((p) => p.title), ['Intro', 'Cracks over doors', 'Soft floors', 'Water stains']);
    eq(plan.map((p) => p.range), ['0:00–0:30', '0:30–1:15', '2:10–2:40', '2:40–3:25']);
    eq(plan.map((p) => p.duration), [30, 45, 30, 45]);
    assert(plan.every((p) => p.valid));
  });
  it('flags chapters shorter than 15 seconds', () => {
    const plan = shortsFromChapters('0:00 Intro\n0:10 Quick one\n1:00 Next');
    eq(plan[0].duration, 10);
    assert(!plan[0].valid);
    assert(plan[1].valid && plan[1].duration === 45);
  });
  it('accepts chapter rows and h:mm:ss', () => {
    const plan = shortsFromChapters([{ time: '0:00', title: 'A' }, { time: '1:02:03', title: 'B' }]);
    eq(plan[1].range, '62:03–62:48');
    eq(shortsFromChapters('nothing here'), []);
  });
});

describe('Title lab: title scoring', () => {
  const opts = { ...DEFAULT_TITLE_WORDS, keywords: DEFAULT_CHANNELS.walter.keywords };
  const reason = (r, id) => r.reasons.find((x) => x.id === id);
  it('scores a strong title 100 with a reason per rule', () => {
    const r = scoreTitle('7 Hidden House Problems That Get Expensive Fast', opts);
    eq(r.score, 100, JSON.stringify(r.reasons));
    eq(r.reasons.map((x) => x.id), ['length', 'number', 'power', 'start', 'caps', 'clickbait', 'keyword']);
    assert(r.reasons.every((x) => x.text.length > 0));
  });
  it('length: 40–65 ideal, near misses get half', () => {
    eq(reason(scoreTitle('x'.repeat(40), opts), 'length').points, 20);
    eq(reason(scoreTitle('x'.repeat(65), opts), 'length').points, 20);
    eq(reason(scoreTitle('x'.repeat(39), opts), 'length').points, 10);
    eq(reason(scoreTitle('x'.repeat(66), opts), 'length').points, 10);
    eq(reason(scoreTitle('x'.repeat(20), opts), 'length').points, 0);
    eq(reason(scoreTitle('x'.repeat(90), opts), 'length').level, 'bad');
  });
  it('number and curiosity/pain words', () => {
    assert(reason(scoreTitle('Seven things', opts), 'number').points === 0);
    assert(reason(scoreTitle('9 things', opts), 'number').points === 15);
    assert(reason(scoreTitle('Mistakes homeowners make', opts), 'power').points === 15, 'plural matches');
    assert(reason(scoreTitle('A calm walk', opts), 'power').points === 0);
    assert(reason(scoreTitle('A calm walk', { ...opts, power: ['calm'] }), 'power').points === 15, 'list is editable');
  });
  it('weak starts lose points', () => {
    for (const t of ['How I fixed my roof', 'In this video we check the attic', 'in today\'s video: roofs']) {
      eq(reason(scoreTitle(t, opts), 'start').points, 0, t);
    }
    eq(reason(scoreTitle('How to check your roof', opts), 'start').points, 15, '"How to" is fine');
  });
  it('more than 2 ALL CAPS words is flagged', () => {
    eq(capsWords('NEVER Buy THIS House I 7'), ['NEVER', 'THIS']);
    eq(reason(scoreTitle('NEVER Buy THIS House', opts), 'caps').points, 10);
    eq(reason(scoreTitle('NEVER BUY THIS House', opts), 'caps').level, 'bad');
  });
  it('clickbait words warn', () => {
    const r = scoreTitle("You Won't Believe This SHOCKING Basement", opts);
    eq(reason(r, 'clickbait').level, 'bad');
    assert(reason(r, 'clickbait').text.includes("you won't believe") && reason(r, 'clickbait').text.includes('shocking'));
    eq(reason(scoreTitle('You Won’t Believe it', opts), 'clickbait').points, 0, 'curly apostrophe');
  });
  it('channel keyword list (phrases, plurals, per channel)', () => {
    assert(reason(scoreTitle('Before Buying a House, Check This', opts), 'keyword').points === 15);
    assert(reason(scoreTitle('Old Houses Hide This', opts), 'keyword').points === 15);
    assert(reason(scoreTitle('Old Housewares', opts), 'keyword').points === 0, 'whole words only');
    const sal = { ...DEFAULT_TITLE_WORDS, keywords: DEFAULT_CHANNELS.sal.keywords };
    assert(reason(scoreTitle('3 Copycat Recipes', sal), 'keyword').text.includes('copycat'));
    eq(DEFAULT_CHANNELS.walter.keywords, ['home inspection', 'house', 'homeowner', 'buying a house', 'winter', 'basement', 'roof']);
    eq(DEFAULT_CHANNELS.sal.keywords, ['restaurant', 'chef', 'copycat', 'recipe', 'menu', 'Italian']);
  });
  it('helpers', () => {
    assert(hasPhrase('Buying a  House today', 'buying a house'));
    assert(!hasPhrase('roofer', 'roof'));
    eq(wordList('a, b\n\nA\n c '), ['a', 'b', 'c']);
    eq(scoreTitle('', opts).score, 0);
  });
});

describe('Title lab: thumbnail rules', () => {
  const title = ['Never Buy a House If You See These 7 Things'];
  it('>= 50% of thumbnail words in the title is red', () => {
    eq(thumbOverlap('BAD HOUSE', title).level, 'bad', '1 of 2 = 50%');
    eq(thumbOverlap("DON'T BUY THIS HOUSE", title).level, 'bad');
    const w = thumbOverlap('RUN FROM THIS CRACKED HOUSE', title);
    eq([w.level, w.repeats], ['warn', ['house']], '1 of 3 meaningful words');
    eq(thumbOverlap('RUN AWAY', title).level, 'good');
    eq(thumbOverlap('', title).level, 'good');
  });
  it('splits into 2 balanced lines of max 20 characters', () => {
    eq(thumbLines('CHECK THIS FIRST').lines, ['CHECK THIS', 'FIRST']);
    eq(thumbLines('RUN').lines, ['RUN']);
    assert(thumbLines('THE BASEMENT CRACK NOBODY NOTICES').ok, '18 + 14 chars');
    const r = thumbLines('UNBELIEVABLY EXPENSIVE FOUNDATION CATASTROPHE');
    assert(!r.ok && r.longest > 20, JSON.stringify(r));
    assert(!thumbLines('SUPERCALIFRAGILISTICEXPIALIDOCIOUS').ok);
  });
  it('full check: 2–5 words', () => {
    const r = checkThumb('LOOK UP', title);
    assert(r.wordsOk && r.linesOk && r.level === 'good');
    eq(checkThumb('CHECK THIS VENT FIRST', title).words, 4, 'word count is a number');
    assert(!checkThumb('ONE', title).wordsOk);
    assert(!checkThumb('a b c d e f', title).wordsOk);
  });
});

describe('Title lab: A/B winner', () => {
  it('uses the row marked by hand first', () => {
    eq(abWinner([{ id: 'a', ctr7: 9 }, { id: 'b', ctr7: 2, winner: true }]).id, 'b');
  });
  it('then best CTR after 7 days, then 48 h, then views', () => {
    eq(abWinner([{ id: 'a', ctr7: '5.1' }, { id: 'b', ctr7: '6.3' }]), { id: 'b', manual: false, by: 'best CTR after 7 days' });
    eq(abWinner([{ id: 'a', ctr48: 4, ctr7: '' }, { id: 'b', ctr48: 3 }]).id, 'a');
    eq(abWinner([{ id: 'a', views7: 100 }, { id: 'b', views7: 900 }]).id, 'b');
  });
  it('no winner with one row, no numbers, or a tie', () => {
    eq(abWinner([{ id: 'a', ctr7: 5 }]), null);
    eq(abWinner([{ id: 'a' }, { id: 'b' }]), null);
    eq(abWinner([{ id: 'a', ctr7: 5 }, { id: 'b', ctr7: 5 }]), null);
  });
});

describe('ISO week math', () => {
  it('finds the ISO week of a date', () => {
    eq(isoWeek('2026-10-07').key, '2026-W41');
    eq(isoWeek('2026-10-05').key, '2026-W41', 'Monday');
    eq(isoWeek('2026-10-11').key, '2026-W41', 'Sunday');
    eq(isoWeek('2026-01-01').key, '2026-W01');
    eq(isoWeek('2021-01-03').key, '2020-W53', 'early January can belong to last year');
    eq(isoWeek('2024-12-30').key, '2025-W01', 'late December can belong to next year');
    eq(isoWeek('2026-12-31').key, '2026-W53');
    eq(isoWeek('2027-01-03').key, '2026-W53');
  });
  it('week start, days, shifting', () => {
    eq(weekStart('2026-W41'), '2026-10-05');
    eq(weekStart('2020-W53'), '2020-12-28');
    eq(weekStart('2025-W01'), '2024-12-30');
    eq(weekDays('2026-W41'), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    eq(shiftWeek('2026-W53', 1), '2027-W01');
    eq(shiftWeek('2026-W01', -1), '2025-W52');
    eq(lastWeeks('2026-W02', 3), ['2025-W52', '2026-W01', '2026-W02']);
  });
  it('validates week keys and counts weeks per year', () => {
    eq(weeksInYear(2026), 53);
    eq(weeksInYear(2025), 52);
    eq(weeksInYear(2020), 53);
    eq(parseWeekKey('2026-W53'), { year: 2026, week: 53 });
    eq(parseWeekKey('2025-W53'), null);
    eq(parseWeekKey('2026-41'), null);
  });
  it('day math crosses months, years and DST', () => {
    eq(addDays('2026-10-30', 3), '2026-11-02');
    eq(addDays('2026-12-31', 1), '2027-01-01');
    eq(addDays('2026-03-07', 2), '2026-03-09');
    eq(daysBetween('2026-10-01', '2026-10-08'), 7);
    eq(daysBetween('2026-10-01T09:00:00.000Z', '2026-10-09'), 8);
  });
});

describe('Weekly review', () => {
  const today = '2026-10-20';
  const vids = [
    { id: 'a', status: 'script', statusSince: '2026-10-01T10:00:00Z' },
    { id: 'b', status: 'edit', statusSince: '2026-10-15T10:00:00Z' },
    { id: 'c', status: 'published', statusSince: '2026-09-01T10:00:00Z' },
    { id: 'd', status: 'scheduled', publishDate: '2026-11-01', statusSince: '2026-09-01T10:00:00Z' },
    { id: 'e', status: 'scheduled', publishDate: '', statusSince: '2026-09-01T10:00:00Z' },
    { id: 'f', status: 'idea', updatedAt: '2026-10-10T10:00:00Z', createdAt: '2026-09-01T10:00:00Z' },
    { id: 'g', status: 'idea', statusSince: '2026-10-13T10:00:00Z' },
  ];
  it('lists cards stuck more than 7 days (oldest first)', () => {
    const r = stuckVideos(vids, today);
    eq(r.map((x) => [x.video.id, x.days]), [['e', 49], ['a', 19], ['f', 10]]);
  });
  it('older cards without statusSince use the last edit', () => {
    eq(stuckVideos([{ id: 'x', status: 'idea', updatedAt: '2026-10-19T00:00:00Z' }], today), []);
  });
  it('weekly totals per channel (CTR averaged), gaps stay empty', () => {
    const stats = [
      { week: '2026-W40', channel: 'walter', views: '100', ctr: '4' },
      { week: '2026-W40', channel: 'walter', views: '50', ctr: '6' },
      { week: '2026-W40', channel: 'sal', views: '999' },
      { week: '2026-W42', channel: 'walter', views: '300', ctr: '' },
    ];
    const weeks = ['2026-W40', '2026-W41', '2026-W42'];
    eq(weeklySeries(stats, weeks, 'views', { channel: 'walter' }), [150, null, 300]);
    eq(weeklySeries(stats, weeks, 'ctr', { channel: 'walter' }), [5, null, null]);
    eq(weeklySeries(stats, weeks, 'views'), [1149, null, 300]);
  });
  it('sparkline points (inline SVG)', () => {
    eq(sparkPoints([0, 10], 100, 20, 0), ['0,20 100,0']);
    eq(sparkPoints([1, null, 3], 100, 20, 0), ['0,20', '100,0'], 'gap splits the line');
    eq(sparkPoints([null, null]), []);
    eq(sparkPoints([5, 5], 100, 20, 0), ['0,10 100,10'], 'flat line in the middle');
  });
});

describe('CSV and ZIP export', () => {
  it('CSV quoting (RFC 4180)', () => {
    eq(csvCell('plain'), 'plain');
    eq(csvCell('a,b'), '"a,b"');
    eq(csvCell('say "hi"'), '"say ""hi"""');
    eq(csvCell('two\nlines'), '"two\nlines"');
    eq(csvCell(null), '');
    eq(csvCell(0), '0');
    const t = toCSV([{ a: 1, b: 'x,y' }], [['A', (r) => r.a], ['B', (r) => r.b]]);
    eq(t, 'A,B\r\n1,"x,y"\r\n');
    eq(toCSV([], [['A', (r) => r.a]]), 'A\r\n');
  });
  it('CRC-32 matches the standard check value', () => {
    eq(crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
    eq(crc32(new Uint8Array(0)), 0);
  });
  it('writes a valid stored-only zip that reads back', () => {
    const files = [
      { name: 'videos.csv', data: 'id,title\r\n1,"Hello, world"\r\n' },
      { name: 'shorts.csv', data: '﻿id,emoji\r\n1,🍝\r\n' },
      { name: 'empty.csv', data: '' },
    ];
    const zip = makeZip(files, { date: new Date(2026, 9, 7, 12, 30, 10) });
    eq([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'starts with PK\\3\\4');
    const back = readZip(zip);
    eq(back.map((f) => f.name), ['videos.csv', 'shorts.csv', 'empty.csv']);
    assert(back.every((f) => f.crcOk && f.method === 0), 'CRC ok, stored');
    eq(new TextDecoder('utf-8', { ignoreBOM: true }).decode(back[1].data), files[1].data);
    const dv = new DataView(zip.buffer);
    eq(dv.getUint32(zip.length - 22, true), 0x06054b50, 'end record at the end');
    eq(dv.getUint16(zip.length - 12, true), 3, '3 entries');
    eq(dv.getUint16(10, true), (12 << 11) | (30 << 5) | 5, 'DOS time');
    eq(dv.getUint16(12, true), (46 << 9) | (10 << 5) | 7, 'DOS date');
  });
});

describe('Database upgrade (v1 → v2)', () => {
  const NAME = 'channel-studio-selftest-upgrade';
  const idb = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  it('keeps every video and setting, adds the new stores', async () => {
    await idb(indexedDB.deleteDatabase(NAME));
    // Build a database exactly like version 1 of the app made it.
    const open1 = indexedDB.open(NAME, 1);
    open1.onupgradeneeded = () => {
      open1.result.createObjectStore('videos', { keyPath: 'id' });
      open1.result.createObjectStore('kv', { keyPath: 'key' });
    };
    const v1 = await idb(open1);
    const oldVideo = { id: 'old-1', channel: 'walter', title: 'Old video', titles: ['Old video', '', ''], status: 'edit', checklist: { 'c-title': true }, notes: { text: 'keep me' }, updatedAt: '2026-09-01T00:00:00.000Z' };
    const oldChannels = { walter: { ...DEFAULT_CHANNELS.walter, signOff: 'My own sign-off', keywords: undefined } };
    delete oldChannels.walter.keywords;
    const tx = v1.transaction(['videos', 'kv'], 'readwrite');
    tx.objectStore('videos').put(oldVideo);
    tx.objectStore('kv').put({ key: 'channels', value: oldChannels });
    tx.objectStore('kv').put({ key: 'seeded', value: true });
    tx.objectStore('kv').put({ key: 'theme', value: 'dark' });
    await new Promise((r) => (tx.oncomplete = r));
    v1.close();

    db.useDatabase(NAME);
    eq(db.DB_VERSION, 2);
    const videos = await db.getAll('videos');
    eq(videos, [oldVideo], 'video unchanged');
    eq((await db.getKV('channels')).walter.signOff, 'My own sign-off');
    eq(await db.getKV('theme'), 'dark');
    for (const st of ['shorts', 'abtests', 'weekly', 'stats']) eq(await db.getAll(st), [], `${st} store exists and is empty`);
    await db.put('shorts', { id: 's1', videoId: 'old-1' });
    eq((await db.getAll('shorts')).length, 1);

    // The app's loader fills in new settings without touching old ones.
    const store = await import('../js/store.js');
    await store.load();
    eq(store.state.videos.map((v) => v.id), ['old-1']);
    eq(store.state.channels.walter.signOff, 'My own sign-off');
    eq(store.state.channels.walter.keywords, DEFAULT_CHANNELS.walter.keywords, 'new keyword list added');
    eq(store.state.titleWords.power, DEFAULT_TITLE_WORDS.power);
    eq(store.state.shorts.map((s) => s.id), ['s1']);
    // A v1 backup file (no Shorts etc.) is still accepted.
    eq(store.checkBackup({ app: 'channel-studio', version: 1, videos: [oldVideo], settings: { channels: oldChannels } }), '');
    eq(store.checkBackup({ app: 'channel-studio', version: 2, videos: [], shorts: 'x', settings: { channels: {} } }), "The backup's shorts list is broken.");

    db.useDatabase('channel-studio-selftest-closed');
    await new Promise((r) => setTimeout(r, 50));
    await idb(indexedDB.deleteDatabase(NAME));
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
