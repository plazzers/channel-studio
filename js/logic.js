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
