// Pure functions with no DOM or storage access. Everything here is covered by
// tests/tests.html.

export const STATUSES = [
  { id: 'idea', label: 'Idea' },
  { id: 'prompt', label: 'Prompt ready' },
  { id: 'script', label: 'Script' },
  { id: 'voice', label: 'Voice/Avatar' },
  { id: 'edit', label: 'Edit' },
  { id: 'thumbnail', label: 'Thumbnail' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
];

export const statusIndex = (id) => STATUSES.findIndex((s) => s.id === id);
export const statusLabel = (id) => (STATUSES.find((s) => s.id === id) || {}).label || id;

/* ------------------------------------------------------------------ */
/* Crafter prompt                                                       */
/* ------------------------------------------------------------------ */

export const PROMPT_LAST_LINE = 'create me a prompt for the video';

export const PROMPT_SECTIONS = [
  'TITLE',
  'NARRATOR',
  'AUDIENCE',
  'LENGTH',
  'OUTPUT FORMAT',
  'STRUCTURE',
  'SAFETY/ACCURACY',
  'PRODUCT MENTIONS',
  'STYLE RULES',
];

/** Collapse any line breaks so each section stays on one line. */
export function oneLine(s) {
  return String(s ?? '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function spokenWords(minutes, wpm) {
  const m = Number(minutes) || 0;
  const w = Number(wpm) || 0;
  return Math.round(m * w);
}

/** Turn the user's typed points into clean items (numbering/bullets removed). */
export function parsePoints(text) {
  const lines = Array.isArray(text) ? text : String(text ?? '').split(/\r?\n/);
  return lines
    .map((l) =>
      String(l)
        .replace(/^\s*(?:\d+\s*[.)\-:]|[-*•–])\s*/, '')
        .trim(),
    )
    .filter(Boolean)
    .filter((l) => !/^SOURCES?\s*:?/i.test(l))
    .filter((l) => l.toLowerCase() !== PROMPT_LAST_LINE);
}

/**
 * Build the Project Crafter prompt. Section order is fixed, there is no
 * SOURCES section, and the last line is always exactly PROMPT_LAST_LINE.
 */
export function buildCrafterPrompt(f = {}) {
  const minutes = Number(f.minutes) || 0;
  const words = f.words != null && f.words !== '' ? Number(f.words) : spokenWords(minutes, f.wpm);
  const points = parsePoints(f.points);
  const lines = [
    `TITLE: ${oneLine(f.title)}`,
    `NARRATOR: ${oneLine(f.narrator)}`,
    `AUDIENCE: ${oneLine(f.audience)}`,
    `LENGTH: ${fmtNumber(minutes)} minutes (about ${fmtNumber(words)} spoken words)`,
    `OUTPUT FORMAT: ${oneLine(f.outputFormat)}`,
    `STRUCTURE: ${oneLine(f.structure)}`,
    ...points.map((p, i) => `${i + 1}. ${oneLine(p)}`),
    `SAFETY/ACCURACY: ${oneLine(f.safety)}`,
    `PRODUCT MENTIONS: ${oneLine(f.productMentions)}`,
    `STYLE RULES: ${oneLine(f.styleRules)}`,
  ];
  // Defensive: no line may start with SOURCES, whatever was typed.
  const safe = lines.map((l) => l.replace(/^(\d+\. )?SOURCES?\s*:/i, '$1Sources -'));
  return [...safe, PROMPT_LAST_LINE].join('\n');
}

function fmtNumber(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

/** Product-mentions line: names the products, then the channel's rule. */
export function productMentionsText(rule, mainProduct, freeProduct) {
  const parts = [];
  if (freeProduct && (!mainProduct || freeProduct.id !== mainProduct.id)) {
    parts.push(`Free PDF: ${freeProduct.name}.`);
  }
  if (mainProduct) parts.push(`Main product: ${mainProduct.name}.`);
  if (rule) parts.push(oneLine(rule));
  return parts.join(' ');
}

/* ------------------------------------------------------------------ */
/* Chapters                                                             */
/* ------------------------------------------------------------------ */

/** "1:05" -> 65, "1:02:03" -> 3723. Returns null when not a valid time. */
export function parseTime(str) {
  const s = String(str ?? '').trim();
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const sec = +m[2];
    if (sec > 59) return null;
    return +m[1] * 60 + sec;
  }
  m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) {
    const min = +m[2];
    const sec = +m[3];
    if (min > 59 || sec > 59) return null;
    return +m[1] * 3600 + min * 60 + sec;
  }
  return null;
}

export function formatTime(total) {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Parse pasted "0:00 Intro" lines into rows. Unreadable lines are reported. */
export function parseChapterText(text) {
  const chapters = [];
  const errors = [];
  String(text ?? '')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const m = line.match(/^[([]?(\d{1,2}(?::\d{2}){1,2})[)\]]?\s*(?:[-–—|:.]\s*)?(.*)$/);
      if (!m) {
        errors.push(`Line ${i + 1}: "${line}" does not start with a time like 0:00.`);
        return;
      }
      chapters.push({ time: m[1], title: m[2].trim() });
    });
  return { chapters, errors };
}

/**
 * YouTube chapter rules: first at 0:00, at least 3, ascending, each at least
 * 10 seconds after the previous one.
 */
export function validateChapters(chapters) {
  const list = (chapters || []).filter((c) => (c.time ?? '').trim() || (c.title ?? '').trim());
  const errors = [];
  const parsed = list.map((c, i) => {
    const seconds = parseTime(c.time);
    if (seconds == null) {
      errors.push(`Chapter ${i + 1}: "${c.time || '(empty)'}" is not a valid time. Use 0:00 or 1:02:03.`);
    }
    if (!String(c.title ?? '').trim()) errors.push(`Chapter ${i + 1} needs a title.`);
    return { time: c.time, title: String(c.title ?? '').trim(), seconds };
  });
  if (list.length < 3) {
    errors.push(`YouTube needs at least 3 chapters (you have ${list.length}).`);
  }
  if (parsed.length && parsed[0].seconds != null && parsed[0].seconds !== 0) {
    errors.push(`The first chapter must start at 0:00 (yours starts at ${parsed[0].time}).`);
  }
  for (let i = 1; i < parsed.length; i++) {
    const a = parsed[i - 1].seconds;
    const b = parsed[i].seconds;
    if (a == null || b == null) continue;
    if (b <= a) {
      errors.push(
        `Chapter ${i + 1} (${parsed[i].time}) must come after chapter ${i} (${parsed[i - 1].time}). Times must go up.`,
      );
    } else if (b - a < 10) {
      errors.push(
        `Chapter ${i + 1} (${parsed[i].time}) is only ${b - a} seconds after chapter ${i}. Chapters must be at least 10 seconds apart.`,
      );
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    chapters: parsed.map((c) => ({ ...c, time: c.seconds == null ? c.time : formatTime(c.seconds) })),
  };
}

/* ------------------------------------------------------------------ */
/* Description builder                                                  */
/* ------------------------------------------------------------------ */

export const DESCRIPTION_LIMIT = 5000;

export function formatProductLine(product, format) {
  const fmt = format || '{text} → {url}';
  return fmt
    .replace(/\{emoji\}/g, product.emoji || '')
    .replace(/\{text\}/g, product.line || product.name || '')
    .replace(/\{name\}/g, product.name || '')
    .replace(/\{url\}/g, product.url || '')
    .replace(/\{price\}/g, product.price ? `$${product.price}` : 'FREE')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Selected products, main product first, the rest in their saved order. */
export function orderProducts(products, selectedIds, mainId) {
  const sel = new Set(selectedIds || []);
  const list = [...(products || [])]
    .filter((p) => sel.has(p.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const i = list.findIndex((p) => p.id === mainId);
  if (i > 0) list.unshift(...list.splice(i, 1));
  return list;
}

export function normalizeHashtags(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/);
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const word = String(r).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${word}`);
  }
  return out;
}

export function buildDescription({ hook, productLines, chapters, signOff, hashtags } = {}) {
  const sections = [];
  const h = String(hook ?? '').trim();
  if (h) sections.push(h);
  const pl = (productLines || []).map((l) => String(l).trim()).filter(Boolean);
  if (pl.length) sections.push(pl.join('\n'));
  const ch = (chapters || []).filter((c) => String(c.time ?? '').trim() && String(c.title ?? '').trim());
  if (ch.length) {
    sections.push(
      ch
        .map((c) => {
          const s = parseTime(c.time);
          return `${s == null ? String(c.time).trim() : formatTime(s)} ${String(c.title).trim()}`;
        })
        .join('\n'),
    );
  }
  const so = String(signOff ?? '').trim();
  if (so) sections.push(so);
  const tags = normalizeHashtags(hashtags);
  if (tags.length) sections.push(tags.join(' '));
  return sections.join('\n\n');
}

/** Problems YouTube would reject or that are worth a look. */
export function descriptionWarnings(text, { hashtags } = {}) {
  const w = [];
  if (text.length > DESCRIPTION_LIMIT) {
    w.push(`Too long: ${text.length} characters. YouTube allows ${DESCRIPTION_LIMIT}.`);
  }
  if (/[<>]/.test(text)) w.push('YouTube does not allow the < or > characters in descriptions.');
  const tags = normalizeHashtags(hashtags);
  if (tags.length > 15) w.push('More than 15 hashtags: YouTube will ignore all of them.');
  return w;
}

/* ------------------------------------------------------------------ */
/* Insert a product line into an old description                        */
/* ------------------------------------------------------------------ */

const URL_RE = /https?:\/\/[^\s)>\]]+/i;

/**
 * Insert `line` right after the first line that holds a product link.
 * A "product link" is one of `productUrls` (or any payhip.com link); if no
 * such line exists, the first line with any link is used; if there are no
 * links at all, it goes after the first paragraph.
 */
export function insertProductLine(description, line, { productUrls = [], url } = {}) {
  const original = String(description ?? '').replace(/\r\n/g, '\n');
  const newLine = String(line ?? '').trim();
  const lines = original.split('\n');
  const checkUrl = url || (newLine.match(URL_RE) || [])[0];
  if (!newLine) return { text: original, inserted: false, reason: 'empty', index: -1 };
  if (checkUrl && original.includes(checkUrl)) {
    return { text: original, inserted: false, reason: 'exists', index: lines.findIndex((l) => l.includes(checkUrl)) };
  }
  const known = productUrls.filter(Boolean).map((u) => u.replace(/\/+$/, '').toLowerCase());
  const isProduct = (l) => {
    const low = l.toLowerCase();
    return known.some((u) => low.includes(u)) || /https?:\/\/(www\.)?payhip\.com\//i.test(l);
  };
  let at = lines.findIndex(isProduct);
  let reason = 'after-product-link';
  if (at === -1) {
    at = lines.findIndex((l) => URL_RE.test(l));
    reason = 'after-first-link';
  }
  if (at === -1) {
    // After the first paragraph (first blank line after some text).
    const firstText = lines.findIndex((l) => l.trim());
    if (firstText === -1) {
      return { text: newLine, inserted: true, reason: 'empty-description', index: 0 };
    }
    let end = firstText;
    while (end + 1 < lines.length && lines[end + 1].trim()) end++;
    const out = [...lines.slice(0, end + 1), '', newLine, ...lines.slice(end + 1)];
    return { text: out.join('\n'), inserted: true, reason: 'no-link', index: end + 2 };
  }
  const out = [...lines.slice(0, at + 1), newLine, ...lines.slice(at + 1)];
  return { text: out.join('\n'), inserted: true, reason, index: at + 1 };
}

/** Line diff (LCS). Returns [{type: 'same'|'add'|'del', text}]. */
export function diffLines(a, b) {
  const A = String(a ?? '').split('\n');
  const B = String(b ?? '').split('\n');
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ type: 'same', text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: A[i++] });
    } else {
      out.push({ type: 'add', text: B[j++] });
    }
  }
  while (i < n) out.push({ type: 'del', text: A[i++] });
  while (j < m) out.push({ type: 'add', text: B[j++] });
  return out;
}

/* ------------------------------------------------------------------ */
/* Words: similar topics and thumbnail-vs-title                         */
/* ------------------------------------------------------------------ */

export const STOP_WORDS = new Set(
  `a about above after again against all almost also am an and any are aren't as at be because been before
  being below between both but by can can't could did didn't do does doesn't doing don't down during each
  even ever every few for from further get gets got had has have having he her here hers him his how i if
  in into is isn't it it's its itself just let's like me more most much must my never no nor not now of off
  on once only or other our ours out over own really same she should so some such than that that's the
  their them then there these they this those through to too under until up us very was we were what
  when where which while who whom why will with without won't would you your yours yourself
  thing things way ways tip tips one ones make made use used need needs know see look`
    .split(/\s+/)
    .filter(Boolean),
);

export function stem(word) {
  let w = word.toLowerCase().replace(/[’']/g, "'");
  w = w.replace(/'s$/, '').replace(/'/g, '');
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Meaningful, normalized words (stop words and pure numbers removed). */
export function meaningfulWords(text) {
  const tokens = String(text ?? '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .match(/[\p{L}\p{N}']+/gu);
  if (!tokens) return [];
  const out = [];
  for (const t of tokens) {
    const clean = t.replace(/^'+|'+$/g, '');
    if (!clean || STOP_WORDS.has(clean)) continue;
    if (/^\d+$/.test(clean)) continue;
    if (clean.length < 3) continue;
    const s = stem(clean);
    if (STOP_WORDS.has(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

export function sharedWords(a, b) {
  const B = new Set(meaningfulWords(b));
  return meaningfulWords(a).filter((w) => B.has(w));
}

/**
 * items: [{id, texts: [string], ...}] — returns items sharing at least
 * `min` meaningful words with `title`, best match first.
 */
export function findSimilar(title, items, { min = 3, excludeId } = {}) {
  if (meaningfulWords(title).length < min) return [];
  const res = [];
  for (const item of items || []) {
    if (excludeId && item.id === excludeId) continue;
    let best = { shared: [], text: '' };
    for (const t of item.texts || []) {
      const shared = sharedWords(title, t);
      if (shared.length > best.shared.length) best = { shared, text: t };
    }
    if (best.shared.length >= min) res.push({ item, shared: best.shared, text: best.text });
  }
  return res.sort((x, y) => y.shared.length - x.shared.length);
}

export function countWords(text) {
  return (String(text ?? '').trim().match(/\S+/g) || []).length;
}

/** Thumbnail text check: 2–5 words, and no words repeated from the title(s). */
export function checkThumbText(text, titles) {
  const t = String(text ?? '').trim();
  if (!t) return { empty: true, words: 0, repeats: [], tooShort: false, tooLong: false };
  const words = countWords(t);
  const titleText = (Array.isArray(titles) ? titles : [titles]).join(' ');
  const repeats = sharedWords(t, titleText);
  return { empty: false, words, repeats, tooShort: words < 2, tooLong: words > 5 };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

export function fillTemplate(tpl, vars) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

export function videoTitle(v) {
  const chosen = v.titles && v.titles[v.chosenTitle];
  return (chosen && chosen.trim()) || v.title || 'Untitled';
}

/* ================================================================== */
/* v2: Shorts planner                                                   */
/* ================================================================== */

export const SHORT_STATUSES = [
  { id: 'planned', label: 'Planned' },
  { id: 'cut', label: 'Cut' },
  { id: 'posted', label: 'Posted' },
];
export const MAX_SHORTS = 5;
export const SHORT_MIN_SEC = 15;
export const SHORT_MAX_SEC = 60;
export const SHORT_HOOK_MAX_WORDS = 12;
export const SHORT_TEXT_MAX_WORDS = 6;
export const SHORT_TITLE_MAX = 100;
export const SHORT_FROM_CHAPTER_SEC = 45;

/** 65 -> "1:05" (minutes can go past 59: 3725 -> "62:05"). */
export function formatMMSS(total) {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** "mm:ss" (or h:mm:ss) -> seconds; also accepts minutes past 59 like "75:30". */
function parseClock(str) {
  const s = String(str ?? '').trim();
  const m = s.match(/^(\d{1,3}):(\d{2})$/);
  if (m) return +m[2] > 59 ? null : +m[1] * 60 + +m[2];
  return parseTime(s);
}

/**
 * Check a Short's source range like "1:05–1:50" (also "1:05-1:50",
 * "1:05 to 1:50"). Must be 15–60 seconds long.
 */
export function validateShortRange(range) {
  const raw = String(range ?? '').trim();
  if (!raw) return { ok: false, empty: true, start: null, end: null, duration: null, error: 'Add the source time range, like 1:05–1:50.' };
  const parts = raw.split(/\s*(?:–|—|-|to)\s*/i).filter((x) => x !== '');
  if (parts.length !== 2) {
    return { ok: false, start: null, end: null, duration: null, error: `"${raw}" is not a range. Use mm:ss–mm:ss, like 1:05–1:50.` };
  }
  const start = parseClock(parts[0]);
  const end = parseClock(parts[1]);
  if (start == null || end == null) {
    const bad = start == null ? parts[0] : parts[1];
    return { ok: false, start, end, duration: null, error: `"${bad}" is not a valid time. Use mm:ss, like 1:05.` };
  }
  const duration = end - start;
  let error = '';
  if (duration <= 0) error = `The end (${formatMMSS(end)}) must be after the start (${formatMMSS(start)}).`;
  else if (duration < SHORT_MIN_SEC) error = `Only ${duration} seconds. A Short should be ${SHORT_MIN_SEC}–${SHORT_MAX_SEC} seconds.`;
  else if (duration > SHORT_MAX_SEC) error = `${duration} seconds is too long. A Short should be ${SHORT_MIN_SEC}–${SHORT_MAX_SEC} seconds.`;
  return { ok: !error, start, end, duration, error };
}

export const formatRange = (start, end) => `${formatMMSS(start)}–${formatMMSS(end)}`;

/**
 * Turn a pasted chapter list into one proposed Short per chapter: the title is
 * the chapter name, the range runs from the chapter start to the next
 * chapter's start or +45 s, whichever comes first.
 */
export function shortsFromChapters(input, { maxLen = SHORT_FROM_CHAPTER_SEC } = {}) {
  const chapters = Array.isArray(input) ? input : parseChapterText(input).chapters;
  const timed = chapters
    .map((c) => ({ title: String(c.title ?? '').trim(), seconds: parseTime(c.time) }))
    .filter((c) => c.seconds != null);
  return timed.map((c, i) => {
    const next = timed[i + 1];
    const cap = c.seconds + maxLen;
    const end = next && next.seconds > c.seconds ? Math.min(next.seconds, cap) : cap;
    const range = formatRange(c.seconds, end);
    return { title: c.title, start: c.seconds, end, duration: end - c.seconds, range, valid: validateShortRange(range).ok };
  });
}

/** Problems and counters for one Short. */
export function checkShort(s = {}, longTitles = []) {
  const hookWords = countWords(s.hook);
  const textWords = countWords(s.onScreen);
  const title = String(s.title ?? '');
  const longText = (Array.isArray(longTitles) ? longTitles : [longTitles]).join(' ');
  const shared = title.trim() ? sharedWords(title, longText) : [];
  const range = validateShortRange(s.range);
  return {
    hookWords,
    hookOk: hookWords <= SHORT_HOOK_MAX_WORDS,
    textWords,
    textOk: textWords <= SHORT_TEXT_MAX_WORDS,
    titleLen: title.length,
    titleOk: title.length <= SHORT_TITLE_MAX,
    titleKeyword: !title.trim() || shared.length > 0,
    shared,
    range,
  };
}

/** Short description: the text, then the chosen product line. */
export function buildShortDescription(text, productLine) {
  return [String(text ?? '').trim(), String(productLine ?? '').trim()].filter(Boolean).join('\n\n');
}

/* ================================================================== */
/* v2: Title & thumbnail lab                                            */
/* ================================================================== */

export const DEFAULT_TITLE_WORDS = {
  power: [
    'never', 'stop', 'mistake', 'avoid', 'secret', 'wrong', 'worst', 'hidden', 'problem', 'expensive',
    'warning', 'truth', 'nobody', 'why', "don't", 'ruin', 'regret', 'skip', 'trick', 'damage', 'before',
    'fail', 'danger', 'cost', 'really',
  ],
  clickbait: ["you won't believe", 'shocking', 'insane', 'mind-blowing', 'mind blowing', 'gone wrong', 'unbelievable', 'jaw-dropping', 'must see'],
};

export const WEAK_STARTS = ['how i', 'in this video', "in today's video", 'this video'];

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word / whole-phrase match, case-insensitive, plural "s" allowed. */
export function hasPhrase(text, phrase) {
  const p = String(phrase ?? '').trim().toLowerCase().replace(/[’]/g, "'");
  if (!p) return false;
  const t = String(text ?? '').toLowerCase().replace(/[’]/g, "'");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}'])${reEscape(p).replace(/\s+/g, '\\s+')}(e?s)?(?=$|[^\\p{L}\\p{N}'])`, 'u');
  return re.test(t);
}

/** Words of 2+ letters written in capitals (numbers and "I" don't count). */
export function capsWords(text) {
  return (String(text ?? '').match(/[\p{L}']+/gu) || []).filter((w) => {
    const letters = w.replace(/'/g, '');
    return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  });
}

/** Turn "a, b\nc" into a clean list. */
export function wordList(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\n,]+/);
  const seen = new Set();
  return raw
    .map((x) => String(x).trim())
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
}

/**
 * Score a title out of 100 with transparent rules. Every rule reports a
 * reason the owner can read. level: 'good' | 'warn' | 'bad'.
 */
export function scoreTitle(title, { power = DEFAULT_TITLE_WORDS.power, clickbait = DEFAULT_TITLE_WORDS.clickbait, keywords = [] } = {}) {
  const t = String(title ?? '').trim();
  const reasons = [];
  const add = (id, points, max, level, text) => reasons.push({ id, points, max, level, text });
  const len = t.length;
  if (len >= 40 && len <= 65) add('length', 20, 20, 'good', `${len} characters — in the ideal 40–65 range.`);
  else if (len >= 30 && len <= 75) add('length', 10, 20, 'warn', `${len} characters — ${len < 40 ? 'a bit short' : 'a bit long'} (ideal 40–65).`);
  else add('length', 0, 20, 'bad', `${len} characters — ${len < 40 ? 'too short' : 'too long'} (ideal 40–65).`);

  const num = t.match(/\d+/);
  if (num) add('number', 15, 15, 'good', `Has a number (${num[0]}).`);
  else add('number', 0, 15, 'warn', 'No number. Numbers ("7 Things") usually help.');

  const pw = wordList(power).filter((w) => hasPhrase(t, w));
  if (pw.length) add('power', 15, 15, 'good', `Curiosity/pain word: ${pw.join(', ')}.`);
  else add('power', 0, 15, 'warn', 'No curiosity/pain word (like never, mistake, hidden).');

  const low = t.toLowerCase().replace(/[’]/g, "'");
  const weak = WEAK_STARTS.find((w) => low.startsWith(w));
  if (weak) add('start', 0, 15, 'bad', `Starts weak ("${t.slice(0, weak.length)}…"). Lead with the payoff.`);
  else add('start', 15, 15, 'good', 'Starts strong.');

  const caps = capsWords(t);
  if (caps.length > 2) add('caps', 0, 10, 'bad', `${caps.length} ALL CAPS words (${caps.join(', ')}). Use 2 at most.`);
  else add('caps', 10, 10, 'good', caps.length ? `${caps.length} ALL CAPS word${caps.length === 1 ? '' : 's'} — fine.` : 'No shouting in capitals.');

  const cb = wordList(clickbait).filter((w) => hasPhrase(t, w));
  if (cb.length) add('clickbait', 0, 10, 'bad', `Clickbait words: ${cb.join(', ')}.`);
  else add('clickbait', 10, 10, 'good', 'No clickbait words.');

  const kw = wordList(keywords).filter((w) => hasPhrase(t, w));
  if (kw.length) add('keyword', 15, 15, 'good', `Channel keyword: ${kw.join(', ')}.`);
  else add('keyword', 0, 15, 'warn', 'No channel keyword (see Settings → Title lab).');

  if (!t) return { score: 0, reasons: [{ id: 'empty', points: 0, max: 100, level: 'bad', text: 'No title yet.' }] };
  return { score: reasons.reduce((s, r) => s + r.points, 0), reasons };
}

/**
 * Thumbnail text vs title: share of the thumbnail's meaningful words that
 * also appear in the title. >= 50% is red ("bad"), any repeat is "warn".
 */
export function thumbOverlap(text, titles) {
  const words = meaningfulWords(text);
  const titleText = (Array.isArray(titles) ? titles : [titles]).join(' ');
  const T = new Set(meaningfulWords(titleText));
  const repeats = words.filter((w) => T.has(w));
  const ratio = words.length ? repeats.length / words.length : 0;
  return { words, repeats, ratio, level: !repeats.length ? 'good' : ratio >= 0.5 ? 'bad' : 'warn' };
}

/**
 * Split thumbnail text into at most 2 lines, as balanced as possible.
 * ok = fits in 2 lines of `max` characters.
 */
export function thumbLines(text, max = 20) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], ok: true, longest: 0 };
  let best = [words.join(' ')];
  let bestLen = best[0].length;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const l = Math.max(a.length, b.length);
    if (l <= bestLen) {
      best = [a, b];
      bestLen = l;
    }
  }
  return { lines: best, ok: bestLen <= max, longest: bestLen };
}

/** Full thumbnail check: words 2–5, overlap with title, 2 lines of 20. */
export function checkThumb(text, titles) {
  const t = String(text ?? '').trim();
  const words = countWords(t);
  const o = thumbOverlap(t, titles);
  const l = thumbLines(t);
  return { ...o, meaningful: o.words, empty: !t, words, wordsOk: words >= 2 && words <= 5, lines: l.lines, linesOk: l.ok, longest: l.longest };
}

/**
 * A/B log winner: the row marked by hand, otherwise the best CTR after 7
 * days, then CTR after 48 h, then views after 7 days. Returns the row id.
 */
export function abWinner(rows) {
  const list = (rows || []).filter(Boolean);
  const manual = list.find((r) => r.winner);
  if (manual) return { id: manual.id, manual: true, by: 'marked by you' };
  const num = (x) => (x === '' || x == null || isNaN(Number(x)) ? null : Number(x));
  for (const [key, label] of [['ctr7', 'best CTR after 7 days'], ['ctr48', 'best CTR after 48 h'], ['views7', 'most views after 7 days'], ['views48', 'most views after 48 h']]) {
    const withVal = list.filter((r) => num(r[key]) != null);
    if (withVal.length >= 2) {
      const top = withVal.reduce((a, b) => (num(b[key]) > num(a[key]) ? b : a));
      const tie = withVal.filter((r) => num(r[key]) === num(top[key])).length > 1;
      if (!tie) return { id: top.id, manual: false, by: label };
    }
  }
  return null;
}

/* ================================================================== */
/* v2: Dates and ISO weeks                                              */
/* ================================================================== */

const pad2 = (n) => String(n).padStart(2, '0');
const toUTC = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUTC = (dt) => `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;

export const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '')) && !isNaN(toUTC(s));

export function addDays(iso, n) {
  const dt = toUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

/** Whole days from a to b ("2026-10-01", "2026-10-08" -> 7). */
export function daysBetween(a, b) {
  return Math.round((toUTC(String(b).slice(0, 10)) - toUTC(String(a).slice(0, 10))) / 86400000);
}

/** ISO-8601 week: weeks start Monday; week 1 holds the year's first Thursday. */
export function isoWeek(iso) {
  const dt = toUTC(iso);
  const day = dt.getUTCDay() || 7; // Mon=1 … Sun=7
  dt.setUTCDate(dt.getUTCDate() + 4 - day); // Thursday of this week
  const year = dt.getUTCFullYear();
  const week = Math.ceil(((dt - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { year, week, key: `${year}-W${pad2(week)}` };
}

export function parseWeekKey(key) {
  const m = String(key ?? '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = +m[1];
  const week = +m[2];
  if (week < 1 || week > weeksInYear(year)) return null;
  return { year, week };
}

export function weeksInYear(year) {
  return isoWeek(`${year}-12-28`).week;
}

/** Monday of an ISO week key ("2026-W41" -> "2026-10-05"). */
export function weekStart(key) {
  const p = parseWeekKey(key);
  if (!p) return null;
  const jan4 = Date.UTC(p.year, 0, 4);
  const jan4Day = new Date(jan4).getUTCDay() || 7;
  const monday = new Date(jan4 - (jan4Day - 1) * 86400000);
  monday.setUTCDate(monday.getUTCDate() + (p.week - 1) * 7);
  return fromUTC(monday);
}

export const weekDays = (key) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(key), i));
export const shiftWeek = (key, n) => isoWeek(addDays(weekStart(key), n * 7)).key;
export const inRange = (iso, from, to) => !!iso && iso >= from && iso <= to;

/** The N week keys ending with `key` (oldest first). */
export function lastWeeks(key, n) {
  return Array.from({ length: n }, (_, i) => shiftWeek(key, i - n + 1));
}

/* ================================================================== */
/* v2: Weekly review                                                    */
/* ================================================================== */

/** When the video entered its current stage (older data: last edit). */
export const stageSince = (v) => String(v.statusSince || v.updatedAt || v.createdAt || '').slice(0, 10);

/**
 * Cards sitting in the same stage for more than `days` days. Published
 * videos and scheduled ones that already have a date are not "stuck".
 */
export function stuckVideos(videos, today, days = 7) {
  return (videos || [])
    .filter((v) => v.status !== 'published' && !(v.status === 'scheduled' && v.publishDate))
    .map((v) => ({ video: v, since: stageSince(v), days: stageSince(v) ? daysBetween(stageSince(v), today) : 0 }))
    .filter((x) => x.days > days)
    .sort((a, b) => b.days - a.days);
}

/** Per-week totals of one stats field, for the given week keys. */
export function weeklySeries(stats, weeks, field, { channel, videoChannel } = {}) {
  return weeks.map((w) => {
    const rows = (stats || []).filter((s) => s.week === w && (!channel || (videoChannel ? videoChannel(s) : s.channel) === channel));
    const vals = rows.filter((r) => r[field] !== '' && r[field] != null).map((r) => Number(r[field])).filter(Number.isFinite);
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return field === 'ctr' ? Math.round((sum / vals.length) * 10) / 10 : Math.round(sum * 10) / 10;
  });
}

/** SVG polyline points for a tiny sparkline; null values leave a gap. */
export function sparkPoints(values, w = 120, h = 28, pad = 2) {
  const nums = values.filter((x) => x != null);
  if (!nums.length) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const segs = [];
  let cur = [];
  values.forEach((val, i) => {
    if (val == null) {
      if (cur.length) segs.push(cur);
      cur = [];
      return;
    }
    const x = pad + i * step;
    const y = max === min ? h / 2 : h - pad - ((val - min) / span) * (h - pad * 2);
    cur.push(`${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`);
  });
  if (cur.length) segs.push(cur);
  return segs.map((s) => s.join(' '));
}

/* ================================================================== */
/* v2: CSV                                                              */
/* ================================================================== */

export function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV (CRLF line ends). columns: [[header, row => value], …] */
export function toCSV(rows, columns) {
  const head = columns.map(([h]) => csvCell(h)).join(',');
  const body = (rows || []).map((r) => columns.map(([, get]) => csvCell(get(r))).join(','));
  return [head, ...body].join('\r\n') + '\r\n';
}
