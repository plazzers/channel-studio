// Pin Factory pure logic: templates list, *highlight* parsing, text fitting,
// batch table parsing, Pinterest bulk CSV, UTM links and the schedule
// builder. No DOM — runs in Node for the unit tests.

import { csvCell } from '../logic.js';

export const PIN_W = 1000;
export const PIN_H = 1500;
export const SAFE = 80; // safe margin on every side
export const TITLE_MAX = 100;
export const DESC_MAX = 500;
export const CSV_MAX_ROWS = 200; // Pinterest accepts up to 200 pins per file
export const PINTEREST_HEADER = ['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords'];

export const TEMPLATES = [
  {
    id: 'bold',
    name: 'Bold Headline',
    aliases: ['bold', 'headline', 'bold headline'],
    bodyHint: 'One short supporting line (optional).',
    sample: { headline: 'The *5-minute* habit that saves your week', body: 'Simple, repeatable, no apps needed', tag: 'NEW' },
  },
  {
    id: 'list',
    name: 'Numbered List',
    aliases: ['list', 'numbered', 'numbered list', 'listicle'],
    bodyHint: '3–7 items, one per line (or separated by | in a table).',
    sample: { headline: '*7 things* to check before you post', body: 'Hook in the first 3 seconds\nOne clear promise\nReadable captions\nThumbnail text under 5 words\nA pinned comment\nEnd screen to the next video\nPost at the same time each week', tag: '' },
  },
  {
    id: 'tip',
    name: 'Quick Tip + Tag',
    aliases: ['tip', 'quick tip', 'quicktip'],
    bodyHint: 'Two or three sentences explaining the tip.',
    sample: { headline: 'Write the *title first*, then the script', body: 'When the promise is clear before you write, every line has a job: deliver what the title says.', tag: 'QUICK TIP' },
  },
  {
    id: 'card',
    name: 'Recipe / Product Card',
    aliases: ['card', 'recipe', 'product', 'product card', 'recipe card'],
    bodyHint: 'Up to 3 stats as "Label: value" lines, then an optional description line.',
    sample: { headline: 'Overnight *Oat Jars*', body: 'Prep: 10 min\nServes: 4\nCost: $6\nMake them Sunday, grab them all week.', tag: 'EASY' },
  },
  {
    id: 'quote',
    name: 'Quote / Expert Says',
    aliases: ['quote', 'expert', 'expert says', 'quote card'],
    bodyHint: 'Who said it, e.g. "— Jane Doe, Nutritionist".',
    sample: { headline: 'Consistency beats *intensity* every single time.', body: '— A coach with 20 years of experience', tag: 'EXPERT SAYS' },
  },
  {
    id: 'compare',
    name: 'Before → After / Do vs Don’t',
    aliases: ['compare', 'before after', 'before → after', 'do dont', "do vs don't", 'do vs dont', 'beforeafter'],
    bodyHint: 'Lines starting "Before:" / "After:" or "Don’t:" / "Do:".',
    sample: { headline: 'Thumbnail text: *do* vs *don’t*', body: "Don't: Repeat the whole title\nDon't: Use 9 tiny words\nDo: 3 bold words that add curiosity\nDo: High contrast colors", tag: '' },
  },
  {
    id: 'money',
    name: 'Money Compare',
    aliases: ['money', 'money compare', 'price', 'cost', 'vs'],
    bodyHint: 'Two lines "Label: $amount", then an optional takeaway line.',
    sample: { headline: 'Coffee out vs *at home* (per year)', body: 'Coffee shop: $1,460\nAt home: $180\nSame habit, very different total.', tag: '' },
  },
  {
    id: 'checklist',
    name: 'Checklist',
    aliases: ['checklist', 'check', 'check list', 'todo'],
    bodyHint: '3–8 items, one per line.',
    sample: { headline: 'Weekly *upload* checklist', body: 'Script reviewed out loud\nVoice-over checked for errors\nCaptions added\nThumbnail tested on phone size\nDescription links working\nScheduled at your usual time', tag: 'SAVE THIS' },
  },
];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

/** Match a template written in a table: id, name, alias or number 1–8. */
export function resolveTemplate(value) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');
  if (!v) return null;
  if (/^[1-8]$/.test(v)) return TEMPLATES[+v - 1].id;
  const flat = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, '');
  const hit = TEMPLATES.find((t) => t.id === v || t.name.toLowerCase() === v || t.aliases.some((a) => a === v || flat(a) === flat(v)));
  return hit ? hit.id : null;
}

/* ------------------------------------------------------------------ */
/* *Highlights* and text fitting                                        */
/* ------------------------------------------------------------------ */

/** "The *best* way" -> [{text:'The',hl:false},{text:'best',hl:true},{text:'way',hl:false}] */
export function parseHighlights(text) {
  const words = [];
  const parts = String(text ?? '').split('*');
  // An odd number of parts means the asterisks are balanced.
  const balanced = parts.length % 2 === 1;
  parts.forEach((part, i) => {
    const hl = balanced && i % 2 === 1;
    for (const w of part.split(/\s+/).filter(Boolean)) words.push({ text: w, hl });
  });
  // Glue punctuation that ended up alone ("*word*," -> "word" + ",").
  const out = [];
  for (const w of words) {
    if (out.length && /^[,.;:!?)”’"]+$/.test(w.text)) out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + w.text };
    else out.push(w);
  }
  return out;
}

/** Text without the *highlight* marks. */
export const plainText = (text) => String(text ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/**
 * Greedy word wrap. measure(str, size) -> width in px.
 * Returns lines (arrays of words) or null if a single word is too wide.
 */
export function wrapWords(words, size, width, measure) {
  const space = measure(' ', size);
  const lines = [];
  let line = [];
  let w = 0;
  for (const word of words) {
    const ww = measure(word.text, size);
    if (ww > width) return null;
    if (!line.length) {
      line = [word];
      w = ww;
    } else if (w + space + ww <= width) {
      line.push(word);
      w += space + ww;
    } else {
      lines.push(line);
      line = [word];
      w = ww;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

const lineWidth = (line, size, measure) => line.reduce((s, w, i) => s + measure(w.text, size) + (i ? measure(' ', size) : 0), 0);

/**
 * Avoid a widow (a last line with one lonely word): pull words down from
 * the line above while it still fits and the line above keeps 2+ words.
 */
export function fixWidows(lines, size, width, measure) {
  const out = lines.map((l) => [...l]);
  if (out.length < 2) return out;
  for (let guard = 0; guard < 3; guard++) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last.length >= 2 || prev.length < 3) break;
    const moved = [prev[prev.length - 1], ...last];
    if (lineWidth(moved, size, measure) > width) break;
    prev.pop();
    out[out.length - 1] = moved;
  }
  return out;
}

/**
 * Fit one or more paragraphs into a box: tries font sizes from maxSize down
 * to minSize and returns the largest that fits.
 * Returns {size, paras: [[line words…]…], height, lineHeight, overflow}.
 */
export function fitParagraphs(texts, { width, height, maxSize, minSize = 18, lineHeight = 1.15, gap = 0, maxLines = Infinity, measure, step = 2 }) {
  const words = texts.map((t) => (Array.isArray(t) ? t : parseHighlights(t)));
  let last = null;
  for (let size = maxSize; size >= minSize; size -= step) {
    const paras = [];
    let ok = true;
    for (const w of words) {
      const lines = wrapWords(w, size, width, measure);
      if (!lines) {
        ok = false;
        break;
      }
      paras.push(fixWidows(lines, size, width, measure));
    }
    if (!ok) continue;
    const nLines = paras.reduce((n, p) => n + p.length, 0);
    const h = nLines * size * lineHeight + gap * Math.max(0, paras.length - 1);
    last = { size, paras, height: h, lineHeight, overflow: false };
    if (h <= height && paras.every((p) => p.length <= maxLines)) return last;
  }
  if (last) return { ...last, overflow: true };
  // Even the smallest size has a word that is too wide: hard-wrap at min size.
  const paras = words.map((w) => w.map((x) => [x]));
  const n = paras.reduce((s, p) => s + p.length, 0);
  return { size: minSize, paras, height: n * minSize * lineHeight, lineHeight, overflow: true };
}

export const fitText = (text, opts) => {
  const r = fitParagraphs([text], opts);
  return { ...r, lines: r.paras[0] };
};

/* ------------------------------------------------------------------ */
/* Body parsing for the templates                                       */
/* ------------------------------------------------------------------ */

/** Body lines: real line breaks, or " | " in a one-line table cell. */
export function bodyLines(body) {
  return String(body ?? '')
    .split(/\r?\n|\s*\|\s*/)
    .map((l) => l.replace(/^\s*(?:\d+\s*[.)]|[-*•–✓✔☐□])\s+/, '').trim())
    .filter(Boolean);
}

/** "Prep: 10 min" -> {label:'Prep', value:'10 min'}; no colon -> {label:'', value: line} */
export function keyValue(line) {
  const m = String(line ?? '').match(/^([^:]{1,30}):\s*(.+)$/);
  return m ? { label: m[1].trim(), value: m[2].trim() } : { label: '', value: String(line ?? '').trim() };
}

/** Card template: up to 3 stats + the rest as a description. */
export function cardParts(body) {
  const stats = [];
  const rest = [];
  for (const l of bodyLines(body)) {
    const kv = keyValue(l);
    if (kv.label && stats.length < 3 && kv.value.length <= 18) stats.push(kv);
    else rest.push(l);
  }
  return { stats, text: rest.join(' ') };
}

/** Icon for a stat label (drawn as simple shapes by the renderer). */
export function statIcon(label) {
  const l = String(label ?? '').toLowerCase();
  if (/time|prep|cook|min|hour|duration|bake|read/.test(l)) return 'clock';
  if (/cal|kcal|energy|heat|spice|hot/.test(l)) return 'flame';
  if (/serve|people|portion|person|feeds|users/.test(l)) return 'people';
  if (/cost|price|budget|\$|save|saving/.test(l)) return 'coin';
  if (/rating|star|score|level|difficulty|skill/.test(l)) return 'star';
  return 'dot';
}

/** Compare template: split lines into the "bad" side and the "good" side. */
export function compareParts(body) {
  const lines = bodyLines(body);
  const BAD = /^(before|don['’]?t|dont|avoid|wrong|myth|instead of|no)\b\s*[:\-–]?\s*/i;
  const GOOD = /^(after|do|try|right|fact|yes|better)\b\s*[:\-–]?\s*/i;
  const left = { label: '', items: [] };
  const right = { label: '', items: [] };
  const unknown = [];
  for (const l of lines) {
    let m = l.match(BAD);
    if (m) {
      left.label = left.label || m[1];
      left.items.push(l.slice(m[0].length).trim());
      continue;
    }
    m = l.match(GOOD);
    if (m) {
      right.label = right.label || m[1];
      right.items.push(l.slice(m[0].length).trim());
      continue;
    }
    unknown.push(l);
  }
  // No prefixes: first half is "before", second half "after".
  if (!left.items.length && !right.items.length && unknown.length) {
    const half = Math.ceil(unknown.length / 2);
    left.items = unknown.slice(0, half);
    right.items = unknown.slice(half);
  }
  const doDont = /do|don/i.test(left.label + right.label);
  left.label = doDont ? "DON'T" : 'BEFORE';
  right.label = doDont ? 'DO' : 'AFTER';
  left.items = left.items.filter(Boolean);
  right.items = right.items.filter(Boolean);
  return { left, right };
}

/** "$1,460" -> 1460 ; "1.2k" -> 1200 ; returns null when not a number. */
export function parseMoney(s) {
  const m = String(s ?? '').replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2]) n *= /k/i.test(m[2]) ? 1000 : 1000000;
  return n;
}

/** Money template: two amounts + takeaway + the difference when both parse. */
export function moneyParts(body) {
  const lines = bodyLines(body);
  const amounts = [];
  const rest = [];
  for (const l of lines) {
    const kv = keyValue(l);
    if (amounts.length < 2 && kv.label && parseMoney(kv.value) != null) amounts.push(kv);
    else rest.push(l);
  }
  while (amounts.length < 2) amounts.push({ label: amounts.length ? 'Option B' : 'Option A', value: '?' });
  const a = parseMoney(amounts[0].value);
  const b = parseMoney(amounts[1].value);
  let diff = '';
  if (a != null && b != null && a !== b) {
    const cur = (String(amounts[0].value).match(/[$€£¥]/) || [''])[0];
    const d = Math.abs(a - b);
    diff = `${cur}${d.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return { a: amounts[0], b: amounts[1], text: rest.join(' '), diff };
}

/* ------------------------------------------------------------------ */
/* Colors                                                               */
/* ------------------------------------------------------------------ */

export function hexToRgb(hex) {
  let h = String(hex ?? '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Dark or light text, whichever reads better on `bg`. */
export const textOn = (bg, dark = '#16141F', light = '#FFFFFF') => (contrast(bg, dark) >= contrast(bg, light) ? dark : light);

/** Mix two hex colors (t = 0 -> a, 1 -> b). */
export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(A.r, B.r)}${c(A.g, B.g)}${c(A.b, B.b)}`;
}

/* ------------------------------------------------------------------ */
/* Table / CSV parsing for batch mode                                   */
/* ------------------------------------------------------------------ */

/** RFC 4180 parser; delimiter is auto-detected (tab beats comma beats semicolon). */
export function parseDelimited(text, delimiter) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const d = delimiter || (firstLine.includes('\t') ? '\t' : firstLine.includes(',') ? ',' : firstLine.includes(';') ? ';' : ',');
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

export const BATCH_COLUMNS = ['title', 'headline', 'body', 'tag', 'template', 'link', 'board'];

/**
 * Turn a pasted table into pin drafts. The first row must be the header
 * (any order, any case). Returns {pins, errors, warnings}.
 */
export function parseBatch(text, { defaultTemplate = 'bold' } = {}) {
  const rows = parseDelimited(text);
  const errors = [];
  const warnings = [];
  if (!rows.length) return { pins: [], errors: ['The table is empty. Paste a header row and at least one pin.'], warnings };
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const idx = Object.fromEntries(BATCH_COLUMNS.map((c) => [c, header.indexOf(c)]));
  if (idx.headline < 0 && idx.title < 0) {
    return { pins: [], errors: [`The first row must be the header: ${BATCH_COLUMNS.join(', ')}. "headline" (or "title") is required.`], warnings };
  }
  const unknown = header.filter((h) => h && !BATCH_COLUMNS.includes(h));
  if (unknown.length) warnings.push(`Ignored column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`);
  const get = (r, c) => (idx[c] >= 0 ? String(r[idx[c]] ?? '').trim() : '');
  const pins = [];
  rows.slice(1).forEach((r, i) => {
    const n = i + 2;
    const headline = get(r, 'headline') || get(r, 'title');
    if (!headline) {
      errors.push(`Row ${n}: no headline — skipped.`);
      return;
    }
    const tplRaw = get(r, 'template');
    let template = resolveTemplate(tplRaw);
    if (!template) {
      if (tplRaw) warnings.push(`Row ${n}: unknown template "${tplRaw}" — used ${templateById(defaultTemplate).name}.`);
      template = defaultTemplate;
    }
    pins.push({
      title: get(r, 'title') || plainText(headline),
      headline,
      body: bodyLines(get(r, 'body')).join('\n'),
      tag: get(r, 'tag'),
      template,
      link: get(r, 'link'),
      board: get(r, 'board'),
      row: n,
    });
  });
  if (rows.length > 1 && !pins.length && !errors.length) errors.push('No pins found under the header row.');
  return { pins, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Pinterest bulk CSV                                                   */
/* ------------------------------------------------------------------ */

/** "https://me.github.io/pins" -> "https://me.github.io/pins/"; '' when not http(s). */
export function normalizeBaseUrl(url) {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(u)) return '';
  return u.endsWith('/') ? u : u + '/';
}

/** File name for a pin image: 001-short-slug.png */
export function pinFileName(pin, index, ext = 'png') {
  const slug =
    plainText(pin.title || pin.headline)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/, '') || 'pin';
  return `${String(index + 1).padStart(3, '0')}-${slug}.${ext}`;
}

/** Default description: headline + body (+ CTA), plain text. */
export function pinDescription(pin, { cta = '' } = {}) {
  if (String(pin.description ?? '').trim()) return String(pin.description).trim();
  const body = bodyLines(pin.body).join('. ').replace(/\.\.+/g, '.');
  return [plainText(pin.headline), body, String(cta || '').trim()]
    .filter(Boolean)
    .map((s) => (/[.!?…]$/.test(s) ? s : s + '.'))
    .join(' ');
}

/** Cut text to `max` characters at a word boundary, adding "…". */
export function shorten(text, max) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

/** Keywords cell: "a, b, c" from a list or a comma string. */
export function keywordCell(kw) {
  const list = Array.isArray(kw) ? kw : String(kw ?? '').split(/[,\n]+/);
  return [...new Set(list.map((k) => k.trim()).filter(Boolean))].join(', ');
}

/** "2026-10-09" + "09:30" -> "2026-10-09T09:30:00" */
export function publishStamp(date, time) {
  if (!date) return '';
  const t = /^\d{1,2}:\d{2}$/.test(String(time ?? '').trim()) ? String(time).trim().padStart(5, '0') : '';
  return t ? `${date}T${t}:00` : '';
}

/**
 * Rows for the Pinterest CSV. Each item: {pin, fileName, date?, time?}.
 * Returns {rows, problems} — problems lists what must be fixed.
 */
export function pinterestRows(items, { baseUrl, keywords = '' } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const problems = [];
  if (!base) problems.push('Add the public base URL where you will host the images (it must start with https://).');
  const rows = items.map(({ pin, fileName, date, time }, i) => {
    const title = plainText(pin.title || pin.headline);
    const description = pinDescription(pin);
    const label = `Pin ${i + 1} ("${shorten(title, 40)}")`;
    if (!title) problems.push(`${label}: the title is empty.`);
    if (title.length > TITLE_MAX) problems.push(`${label}: title is ${title.length} characters (max ${TITLE_MAX}).`);
    if (description.length > DESC_MAX) problems.push(`${label}: description is ${description.length} characters (max ${DESC_MAX}).`);
    if (!String(pin.board ?? '').trim()) problems.push(`${label}: no Pinterest board.`);
    if (pin.link && !/^https?:\/\//i.test(String(pin.link).trim())) problems.push(`${label}: the link must start with https://`);
    return {
      Title: title,
      'Media URL': base ? base + encodeURIComponent(fileName).replace(/%2F/g, '/') : '',
      'Pinterest board': String(pin.board ?? '').trim(),
      Thumbnail: '',
      Description: description,
      Link: String(pin.link ?? '').trim(),
      'Publish date': publishStamp(date, time),
      Keywords: keywordCell(pin.keywords && String(pin.keywords).trim() ? pin.keywords : keywords),
    };
  });
  return { rows, problems };
}

/** The CSV text, exact Pinterest header, CRLF line ends, no BOM. */
export function pinterestCSV(rows) {
  const lines = [PINTEREST_HEADER.join(',')];
  for (const r of rows) lines.push(PINTEREST_HEADER.map((h) => csvCell(r[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Split rows into files of at most CSV_MAX_ROWS. */
export function splitRows(rows, max = CSV_MAX_ROWS) {
  const out = [];
  for (let i = 0; i < rows.length; i += max) out.push(rows.slice(i, i + max));
  return out.length ? out : [[]];
}

/* ------------------------------------------------------------------ */
/* UTM links                                                            */
/* ------------------------------------------------------------------ */

/** Add utm_* parameters to a link (existing utm_* values are replaced). */
export function addUtm(link, { source = 'pinterest', medium = 'social', campaign = '', content = '' } = {}) {
  const raw = String(link ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return raw;
  const [beforeHash, ...hashParts] = raw.split('#');
  const hash = hashParts.length ? '#' + hashParts.join('#') : '';
  const [path, query = ''] = beforeHash.split('?');
  const params = new URLSearchParams(query);
  const set = (k, v) => {
    const val = String(v ?? '').trim();
    if (val) params.set(k, val);
  };
  set('utm_source', source);
  set('utm_medium', medium);
  set('utm_campaign', campaign);
  set('utm_content', content);
  const qs = params.toString();
  return path + (qs ? '?' + qs : '') + hash;
}

export const utmSlug = (s) =>
  plainText(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/* ------------------------------------------------------------------ */
/* Schedule builder                                                     */
/* ------------------------------------------------------------------ */

/** "9:00, 13:30 19:00" -> ["09:00","13:30","19:00"] (sorted, valid only). */
export function parseTimes(input) {
  const list = String(input ?? '')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .map((t) => t.padStart(5, '0'))
    .filter((t) => +t.slice(0, 2) < 24 && +t.slice(3) < 60);
  return [...new Set(list)].sort();
}

/** Evenly spaced times between 08:00 and 21:00 for n pins a day. */
export function defaultTimes(n) {
  const k = Math.max(1, Math.min(24, Math.floor(n) || 1));
  if (k === 1) return ['12:00'];
  const start = 8 * 60;
  const end = 21 * 60;
  return Array.from({ length: k }, (_, i) => {
    const m = Math.round((start + ((end - start) * i) / (k - 1)) / 5) * 5;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  });
}

/** What makes two pins "similar": same link (without utm), else same board + template. */
export function similarKey(pin) {
  const link = String(pin.link ?? '')
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return link || `${String(pin.board ?? '').toLowerCase()}|${pin.template || ''}`;
}

/**
 * Reorder so similar pins are as far apart as possible: round-robin over
 * the groups, biggest group first. Stable inside each group.
 */
export function spreadOrder(items, keyFn = similarKey) {
  const groups = new Map();
  items.forEach((it) => {
    const k = keyFn(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  });
  const lists = [...groups.values()];
  const out = [];
  let lastKey = null;
  while (out.length < items.length) {
    // Pick the group with the most left that is not the one we just used.
    lists.sort((a, b) => b.length - a.length);
    let pick = lists.find((l) => l.length && keyFn(l[0]) !== lastKey);
    if (!pick) pick = lists.find((l) => l.length);
    const it = pick.shift();
    lastKey = keyFn(it);
    out.push(it);
  }
  return out;
}

/**
 * Give each item a date and time: perDay pins a day starting at `start`
 * (YYYY-MM-DD), at the given times. With spread, similar pins are spaced
 * out first. Returns [{item, date, time}].
 */
export function buildSchedule(items, { start, perDay = 3, times, spread = true, keyFn = similarKey } = {}) {
  const n = Math.max(1, Math.floor(Number(perDay)) || 1);
  let slots = parseTimes(Array.isArray(times) ? times.join(',') : times);
  if (slots.length < n) slots = defaultTimes(n);
  slots = slots.slice(0, n);
  const ordered = spread ? spreadOrder(items, keyFn) : [...items];
  return ordered.map((item, i) => ({
    item,
    date: start ? addDaysISO(start, Math.floor(i / n)) : '',
    time: start ? slots[i % n] : '',
  }));
}

function addDaysISO(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
