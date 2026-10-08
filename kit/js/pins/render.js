// Draws a pin (1000x1500) on a <canvas>. One function per template.
// Brand: {colors: [main, accent, light], headingFont, bodyFont, logo, ring,
// footer, cta}.

import {
  PIN_W,
  PIN_H,
  SAFE,
  fitParagraphs,
  fitText,
  parseHighlights,
  bodyLines,
  cardParts,
  compareParts,
  moneyParts,
  statIcon,
  textOn,
  mix,
  plainText,
} from './logic.js';

export const FONTS = {
  montserrat: { family: 'Montserrat', label: 'Montserrat', heading: 800, body: 500 },
  anton: { family: 'Anton', label: 'Anton (condensed)', heading: 400, body: 400 },
  grotesk: { family: 'Space Grotesk', label: 'Space Grotesk', heading: 700, body: 500 },
  playfair: { family: 'Playfair Display', label: 'Playfair Display (serif)', heading: 800, body: 400 },
  inter: { family: 'Inter', label: 'Inter', heading: 800, body: 400 },
  lora: { family: 'Lora', label: 'Lora (serif)', heading: 700, body: 400 },
};

export const DEFAULT_BRAND = {
  colors: ['#1E1B2E', '#FF6B4A', '#F7F3EC'],
  headingFont: 'montserrat',
  bodyFont: 'inter',
  logo: '',
  ring: true,
  footer: 'yourwebsite.com',
  cta: 'SAVE FOR LATER',
};

export function brandOf(channel) {
  const b = { ...DEFAULT_BRAND, ...((channel && channel.brand) || {}) };
  const c = Array.isArray(b.colors) ? b.colors.filter(Boolean) : [];
  b.colors = [c[0] || DEFAULT_BRAND.colors[0], c[1] || DEFAULT_BRAND.colors[1], c[2] || DEFAULT_BRAND.colors[2]];
  if (!FONTS[b.headingFont]) b.headingFont = DEFAULT_BRAND.headingFont;
  if (!FONTS[b.bodyFont]) b.bodyFont = DEFAULT_BRAND.bodyFont;
  return b;
}

const fontCss = (key, kind, size) => {
  const f = FONTS[key] || FONTS.inter;
  return `${kind === 'heading' ? f.heading : f.body} ${Math.round(size)}px "${f.family}"`;
};

/** Make sure the brand's fonts are loaded before drawing. */
export async function loadFonts(brand) {
  if (!document.fonts) return;
  const wanted = [fontCss(brand.headingFont, 'heading', 40), fontCss(brand.bodyFont, 'body', 40), fontCss(brand.bodyFont, 'heading', 40)];
  await Promise.all(wanted.map((f) => document.fonts.load(f).catch(() => null)));
}

const logoCache = new Map();
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (logoCache.has(src)) return logoCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  logoCache.set(src, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Drawing helpers                                                      */
/* ------------------------------------------------------------------ */

function measurer(ctx, fontKey, kind) {
  const cache = new Map();
  return (text, size) => {
    const k = text + '|' + size;
    if (!cache.has(k)) {
      ctx.font = fontCss(fontKey, kind, size);
      cache.set(k, ctx.measureText(text).width);
    }
    return cache.get(k);
  };
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw fitted lines. style.hl: 'color' (accent text) or 'marker'
 * (accent block behind the word). align: 'left' | 'center'.
 */
function drawLines(ctx, lines, { x, y, width, size, lineHeight, fontKey, kind = 'heading', color, hlColor, hlStyle = 'color', align = 'left' }) {
  const measure = measurer(ctx, fontKey, kind);
  const space = measure(' ', size);
  ctx.font = fontCss(fontKey, kind, size);
  ctx.textBaseline = 'alphabetic';
  const lh = size * lineHeight;
  lines.forEach((line, i) => {
    const total = line.reduce((s, w, j) => s + measure(w.text, size) + (j ? space : 0), 0);
    let cx = align === 'center' ? x + (width - total) / 2 : x;
    const base = y + i * lh + size * 0.86 + (lh - size) / 2;
    line.forEach((w, j) => {
      if (j) cx += space;
      const ww = measure(w.text, size);
      if (w.hl && hlStyle === 'marker') {
        ctx.fillStyle = hlColor;
        roundRect(ctx, cx - size * 0.12, base - size * 0.84, ww + size * 0.24, size * 1.04, size * 0.12);
        ctx.fill();
        ctx.fillStyle = textOn(hlColor);
      } else if (w.hl && hlStyle === 'underline') {
        ctx.fillStyle = hlColor;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(cx - 2, base - size * 0.28, ww + 4, size * 0.3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
      } else ctx.fillStyle = w.hl ? hlColor : color;
      ctx.font = fontCss(fontKey, kind, size);
      ctx.fillText(w.text, cx, base);
      cx += ww;
    });
  });
  return y + lines.length * lh;
}

/** Fit `text` into a box and draw it. Returns {bottom, size, overflow}. */
function textBox(ctx, text, box, o) {
  const measure = measurer(ctx, o.fontKey, o.kind || 'heading');
  const r = fitText(text, { width: box.w, height: box.h, maxSize: o.maxSize, minSize: o.minSize || 22, lineHeight: o.lineHeight || 1.12, measure, maxLines: o.maxLines });
  let y = box.y;
  if (o.valign === 'middle') y = box.y + Math.max(0, (box.h - r.height) / 2);
  if (o.valign === 'bottom') y = box.y + Math.max(0, box.h - r.height);
  const bottom = drawLines(ctx, r.lines, { ...o, x: box.x, y, width: box.w, size: r.size, lineHeight: r.lineHeight });
  return { bottom, size: r.size, overflow: r.overflow, top: y, height: r.height };
}

function pill(ctx, text, { x, y, bg, fg, size = 30, fontKey, align = 'left', maxW = PIN_W - SAFE * 2 }) {
  const label = String(text ?? '').trim().toUpperCase();
  if (!label) return { w: 0, h: 0 };
  let s = size;
  ctx.font = fontCss(fontKey, 'heading', s);
  while (ctx.measureText(label).width + s * 1.6 > maxW && s > 16) {
    s -= 2;
    ctx.font = fontCss(fontKey, 'heading', s);
  }
  const tw = ctx.measureText(label).width;
  const w = tw + s * 1.6;
  const h = s * 1.9;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.fillStyle = bg;
  roundRect(ctx, left, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + s * 0.8, y + h / 2 + s * 0.04);
  ctx.textBaseline = 'alphabetic';
  return { w, h, left };
}

function drawLogo(ctx, img, { cx, cy, r, ring, ringColor }) {
  if (!img) return false;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
  if (ring) {
    ctx.lineWidth = Math.max(6, r * 0.12);
    ctx.strokeStyle = ringColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r + ctx.lineWidth / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  return true;
}

/** Bottom strip: logo (if any) + footer text + CTA pill. Returns its top y. */
function footer(ctx, b, img, { bg, fg, accent, height = 150 }) {
  const top = PIN_H - height;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, top, PIN_W, height);
  }
  const mid = top + height / 2;
  let x = SAFE;
  if (drawLogo(ctx, img, { cx: SAFE + 42, cy: mid, r: 42, ring: b.ring, ringColor: accent })) x = SAFE + 42 * 2 + 28;
  const cta = String(b.cta ?? '').trim();
  let ctaW = 0;
  if (cta) {
    ctx.font = fontCss(b.headingFont, 'heading', 26);
    ctaW = ctx.measureText(cta.toUpperCase()).width + 26 * 1.6;
    pill(ctx, cta, { x: PIN_W - SAFE, y: mid - 26 * 0.95, bg: accent, fg: textOn(accent), size: 26, fontKey: b.headingFont, align: 'right' });
  }
  const text = String(b.footer ?? '').trim();
  if (text) {
    const maxW = PIN_W - SAFE - x - (ctaW ? ctaW + 24 : 0);
    let s = 32;
    ctx.font = fontCss(b.bodyFont, 'heading', s);
    while (ctx.measureText(text).width > maxW && s > 16) {
      s -= 2;
      ctx.font = fontCss(b.bodyFont, 'heading', s);
    }
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, mid + 2);
    ctx.textBaseline = 'alphabetic';
  }
  return top;
}

/* Simple vector icons for the card template. */
function icon(ctx, kind, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'clock') {
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.42);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * 0.32, cy + r * 0.12);
    ctx.stroke();
  } else if (kind === 'flame') {
    ctx.moveTo(cx, cy - r * 0.8);
    ctx.bezierCurveTo(cx + r * 0.75, cy - r * 0.2, cx + r * 0.6, cy + r * 0.75, cx, cy + r * 0.75);
    ctx.bezierCurveTo(cx - r * 0.6, cy + r * 0.75, cx - r * 0.7, cy - r * 0.05, cx - r * 0.25, cy - r * 0.3);
    ctx.bezierCurveTo(cx - r * 0.2, cy, cx - r * 0.05, cy - r * 0.2, cx, cy - r * 0.8);
    ctx.fill();
  } else if (kind === 'people') {
    ctx.arc(cx, cy - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.75, r * 0.6, Math.PI, 0);
    ctx.fill();
  } else if (kind === 'coin') {
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `800 ${Math.round(r * 0.9)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', cx, cy + r * 0.04);
  } else if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.32 : r * 0.78;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'check') {
    ctx.moveTo(cx - r * 0.45, cy);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.35);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.35);
    ctx.stroke();
  } else if (kind === 'cross') {
    ctx.moveTo(cx - r * 0.35, cy - r * 0.35);
    ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
    ctx.moveTo(cx + r * 0.35, cy - r * 0.35);
    ctx.lineTo(cx - r * 0.35, cy + r * 0.35);
    ctx.stroke();
  } else {
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Templates                                                            */
/* ------------------------------------------------------------------ */

const W = PIN_W - SAFE * 2;

function tplBold(ctx, pin, b, img) {
  const [main, accent, light] = b.colors;
  const fg = textOn(main, '#16141F', light);
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  // Accent shapes.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  ctx.arc(PIN_W - 60, 170, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillRect(SAFE, 330, 120, 14);
  let top = SAFE + 30;
  if (pin.tag) pill(ctx, pin.tag, { x: SAFE, y: top, bg: accent, fg: textOn(accent), size: 30, fontKey: b.headingFont });
  const footTop = PIN_H - 170;
  const body = String(pin.body || '').trim();
  const bodyH = body ? 220 : 0;
  const head = textBox(ctx, pin.headline, { x: SAFE, y: 390, w: W, h: footTop - 390 - bodyH - 40 }, { fontKey: b.headingFont, maxSize: 150, minSize: 48, color: fg, hlColor: accent, hlStyle: 'color', valign: 'middle', lineHeight: 1.05 });
  if (body) {
    textBox(ctx, bodyLines(body).join(' '), { x: SAFE, y: head.bottom + 40, w: W, h: bodyH }, { fontKey: b.bodyFont, kind: 'body', maxSize: 48, minSize: 26, color: mix(fg, main, 0.2), hlColor: accent, lineHeight: 1.3 });
  }
  footer(ctx, b, img, { fg: mix(fg, main, 0.15), accent, height: 170 });
  return head;
}

function tplList(ctx, pin, b, img) {
  const [main, accent, light] = b.colors;
  const items = bodyLines(pin.body).slice(0, 7);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  const bandH = 460;
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, PIN_W, bandH);
  const onMain = textOn(main);
  let y0 = SAFE - 10;
  if (pin.tag) {
    pill(ctx, pin.tag, { x: SAFE, y: y0, bg: accent, fg: textOn(accent), size: 26, fontKey: b.headingFont });
    y0 += 76;
  }
  const head = textBox(ctx, pin.headline, { x: SAFE, y: y0, w: W, h: bandH - y0 - 40 }, { fontKey: b.headingFont, maxSize: 110, minSize: 40, color: onMain, hlColor: accent, hlStyle: 'color', valign: 'middle', lineHeight: 1.05 });
  const onLight = textOn(light);
  const top = bandH + 50;
  const bottom = PIN_H - 170;
  const n = Math.max(items.length, 1);
  const numR = 34;
  const tx = SAFE + numR * 2 + 30;
  const tw = PIN_W - SAFE - tx;
  const measure = measurer(ctx, b.bodyFont, 'heading');
  const gap = 34;
  const fit = fitParagraphs(items.length ? items : ['Add 3–7 items, one per line'], { width: tw, height: bottom - top - gap * (n - 1), maxSize: 54, minSize: 24, lineHeight: 1.2, measure });
  const blockH = fit.height + gap * (n - 1);
  let y = top + Math.max(0, (bottom - top - blockH) / 2);
  fit.paras.forEach((lines, i) => {
    const h = lines.length * fit.size * fit.lineHeight;
    const cy = y + Math.min(h / 2, fit.size * fit.lineHeight * 0.5);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(SAFE + numR, cy, numR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = textOn(accent);
    ctx.font = fontCss(b.headingFont, 'heading', 34);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), SAFE + numR, cy + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    drawLines(ctx, lines, { x: tx, y, width: tw, size: fit.size, lineHeight: fit.lineHeight, fontKey: b.bodyFont, kind: 'heading', color: onLight, hlColor: accent, hlStyle: 'underline' });
    y += h + gap;
  });
  footer(ctx, b, img, { bg: main, fg: onMain, accent, height: 150 });
  return { ...head, overflow: head.overflow || fit.overflow };
}

function tplTip(ctx, pin, b, img) {
  const [main, accent, light] = b.colors;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  const onLight = textOn(light);
  // Big soft corner shape.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  ctx.arc(0, 0, 420, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const tag = pin.tag || 'QUICK TIP';
  pill(ctx, tag, { x: SAFE, y: SAFE + 40, bg: main, fg: textOn(main), size: 40, fontKey: b.headingFont });
  // Light bulb-ish accent dot.
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(PIN_W - SAFE - 40, SAFE + 78, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = textOn(accent);
  ctx.font = fontCss(b.headingFont, 'heading', 52);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', PIN_W - SAFE - 40, SAFE + 80);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const body = bodyLines(pin.body).join(' ');
  const footTop = PIN_H - 160;
  const head = textBox(ctx, pin.headline, { x: SAFE, y: 300, w: W, h: body ? 560 : footTop - 360 }, { fontKey: b.headingFont, maxSize: 130, minSize: 44, color: onLight, hlColor: accent, hlStyle: 'marker', valign: body ? 'bottom' : 'middle', lineHeight: 1.12 });
  if (body) {
    ctx.fillStyle = accent;
    ctx.fillRect(SAFE, head.bottom + 50, 10, footTop - head.bottom - 120);
    textBox(ctx, body, { x: SAFE + 44, y: head.bottom + 50, w: W - 44, h: footTop - head.bottom - 120 }, { fontKey: b.bodyFont, kind: 'body', maxSize: 54, minSize: 26, color: mix(onLight, light, 0.15), hlColor: accent, lineHeight: 1.35 });
  }
  footer(ctx, b, img, { bg: main, fg: textOn(main), accent, height: 160 });
  return head;
}

function tplCard(ctx, pin, b, img) {
  const [main, accent, light] = b.colors;
  const { stats, text } = cardParts(pin.body);
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  // Top "hero": brand photo in a big circle, or a pattern.
  const heroH = 560;
  const g = ctx.createLinearGradient(0, 0, PIN_W, heroH);
  g.addColorStop(0, accent);
  g.addColorStop(1, mix(accent, main, 0.45));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PIN_W, heroH);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = light;
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 5; j++) {
      ctx.beginPath();
      ctx.arc(60 + i * 115, 60 + j * 115, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (img) drawLogo(ctx, img, { cx: PIN_W / 2, cy: heroH / 2 + 10, r: 190, ring: b.ring, ringColor: light });
  if (pin.tag) pill(ctx, pin.tag, { x: SAFE, y: SAFE - 20, bg: main, fg: textOn(main), size: 30, fontKey: b.headingFont });
  // White card overlapping the hero.
  const cardX = SAFE - 20;
  const cardY = heroH - 90;
  const cardW = PIN_W - cardX * 2;
  const cardH = PIN_H - 170 - cardY - 30;
  ctx.fillStyle = light;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const onLight = textOn(light);
  const inner = { x: cardX + 60, w: cardW - 120 };
  const statH = stats.length ? 230 : 0;
  const textH = text ? 220 : 0;
  const head = textBox(ctx, pin.headline, { x: inner.x, y: cardY + 60, w: inner.w, h: cardH - 120 - statH - textH }, { fontKey: b.headingFont, maxSize: 120, minSize: 44, color: onLight, hlColor: accent, hlStyle: 'color', valign: 'middle', align: 'center', lineHeight: 1.05 });
  let y = head.bottom + 40;
  if (stats.length) {
    const colW = inner.w / stats.length;
    ctx.strokeStyle = mix(light, onLight, 0.15);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(inner.x, y);
    ctx.lineTo(inner.x + inner.w, y);
    ctx.stroke();
    stats.forEach((s, i) => {
      const cx = inner.x + colW * i + colW / 2;
      ctx.fillStyle = mix(accent, light, 0.82);
      ctx.beginPath();
      ctx.arc(cx, y + 70, 44, 0, Math.PI * 2);
      ctx.fill();
      icon(ctx, statIcon(s.label), cx, y + 70, 38, accent);
      ctx.textAlign = 'center';
      ctx.fillStyle = onLight;
      let size = 40;
      ctx.font = fontCss(b.headingFont, 'heading', size);
      while (ctx.measureText(s.value).width > colW - 20 && size > 20) ctx.font = fontCss(b.headingFont, 'heading', (size -= 2));
      ctx.fillText(s.value, cx, y + 160);
      ctx.fillStyle = mix(onLight, light, 0.4);
      ctx.font = fontCss(b.bodyFont, 'body', 26);
      ctx.fillText(s.label.toUpperCase(), cx, y + 198);
      ctx.textAlign = 'left';
    });
    y += statH;
  }
  if (text) textBox(ctx, text, { x: inner.x, y: y + 10, w: inner.w, h: cardY + cardH - y - 50 }, { fontKey: b.bodyFont, kind: 'body', maxSize: 40, minSize: 22, color: mix(onLight, light, 0.2), hlColor: accent, align: 'center', lineHeight: 1.3, valign: 'middle' });
  footer(ctx, b, null, { fg: textOn(main), accent, height: 170 }); // the photo is already the hero
  return head;
}

function tplQuote(ctx, pin, b, img) {
  const [main, accent] = b.colors;
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  const fg = textOn(main);
  const tag = pin.tag || 'EXPERT SAYS';
  pill(ctx, tag, { x: SAFE, y: SAFE, bg: accent, fg: textOn(accent), size: 30, fontKey: b.headingFont });
  // Giant quote mark.
  ctx.fillStyle = accent;
  ctx.font = `800 420px "Playfair Display", Georgia, serif`;
  ctx.fillText('“', SAFE - 20, 520);
  const who = bodyLines(pin.body).join(' ');
  const footTop = PIN_H - 170;
  const head = textBox(ctx, pin.headline, { x: SAFE, y: 470, w: W, h: footTop - 470 - (who ? 200 : 60) }, { fontKey: b.headingFont, maxSize: 104, minSize: 40, color: fg, hlColor: accent, hlStyle: 'color', valign: 'middle', lineHeight: 1.18 });
  if (who) {
    ctx.fillStyle = accent;
    ctx.fillRect(SAFE, head.bottom + 50, 90, 8);
    textBox(ctx, who, { x: SAFE, y: head.bottom + 84, w: W, h: 120 }, { fontKey: b.bodyFont, kind: 'body', maxSize: 42, minSize: 24, color: mix(fg, main, 0.25), hlColor: accent, lineHeight: 1.25 });
  }
  footer(ctx, b, img, { fg: mix(fg, main, 0.2), accent, height: 170 });
  return head;
}

function tplCompare(ctx, pin, b, img) {
  const [main, accent, light] = b.colors;
  const { left, right } = compareParts(pin.body);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  const onLight = textOn(light);
  let y0 = SAFE - 10;
  if (pin.tag) {
    pill(ctx, pin.tag, { x: PIN_W / 2, y: y0, bg: accent, fg: textOn(accent), size: 26, fontKey: b.headingFont, align: 'center' });
    y0 += 70;
  }
  const head = textBox(ctx, pin.headline, { x: SAFE, y: y0, w: W, h: 300 }, { fontKey: b.headingFont, maxSize: 96, minSize: 40, color: onLight, hlColor: accent, hlStyle: 'marker', valign: 'middle', align: 'center', lineHeight: 1.1 });
  const top = Math.max(head.bottom + 50, 380);
  const bottom = PIN_H - 170 - 30;
  const panelGap = 70;
  const panelH = (bottom - top - panelGap) / 2;
  const badBg = mix(main, light, 0.88);
  const goodBg = mix(accent, light, 0.82);
  const panels = [
    { side: left, y: top, bg: badBg, iconBg: main, kind: 'cross' },
    { side: right, y: top + panelH + panelGap, bg: goodBg, iconBg: accent, kind: 'check' },
  ];
  let overflow = head.overflow;
  for (const p of panels) {
    ctx.fillStyle = p.bg;
    roundRect(ctx, SAFE - 20, p.y, W + 40, panelH, 30);
    ctx.fill();
    ctx.fillStyle = p.iconBg;
    ctx.beginPath();
    ctx.arc(SAFE + 40, p.y + 66, 38, 0, Math.PI * 2);
    ctx.fill();
    icon(ctx, p.kind, SAFE + 40, p.y + 66, 40, textOn(p.iconBg));
    ctx.fillStyle = onLight;
    ctx.font = fontCss(b.headingFont, 'heading', 44);
    ctx.fillText(p.side.label, SAFE + 100, p.y + 82);
    const items = p.side.items.length ? p.side.items : ['…'];
    const measure = measurer(ctx, b.bodyFont, 'body');
    const fit = fitParagraphs(items.map((t) => '• ' + t), { width: W - 40, height: panelH - 150, maxSize: 56, minSize: 22, lineHeight: 1.22, gap: 12, measure });
    overflow = overflow || fit.overflow;
    let y = p.y + 128;
    fit.paras.forEach((lines) => {
      y = drawLines(ctx, lines, { x: SAFE + 10, y, width: W - 40, size: fit.size, lineHeight: fit.lineHeight, fontKey: b.bodyFont, kind: 'body', color: onLight, hlColor: accent }) + 12;
    });
  }
  // Arrow between the panels.
  const ay = top + panelH + panelGap / 2;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(PIN_W / 2, ay, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = textOn(accent);
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(PIN_W / 2, ay - 22);
  ctx.lineTo(PIN_W / 2, ay + 20);
  ctx.moveTo(PIN_W / 2 - 16, ay + 4);
  ctx.lineTo(PIN_W / 2, ay + 20);
  ctx.lineTo(PIN_W / 2 + 16, ay + 4);
  ctx.stroke();
  footer(ctx, b, img, { bg: main, fg: textOn(main), accent, height: 170 });
  return { ...head, overflow };
}

function tplMoney(ctx, pin, b, img) {
  const [main, accent, light] = b.colors;
  const { a, b: bb, text, diff } = moneyParts(pin.body);
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  const fg = textOn(main);
  let y0 = SAFE;
  if (pin.tag) {
    pill(ctx, pin.tag, { x: SAFE, y: y0, bg: accent, fg: textOn(accent), size: 28, fontKey: b.headingFont });
    y0 += 80;
  }
  const head = textBox(ctx, pin.headline, { x: SAFE, y: y0, w: W, h: 340 }, { fontKey: b.headingFont, maxSize: 100, minSize: 40, color: fg, hlColor: accent, hlStyle: 'color', valign: 'middle', lineHeight: 1.08 });
  const top = Math.max(head.bottom + 60, 470);
  const colW = (W - 40) / 2;
  const boxH = 520;
  const cols = [
    { kv: a, x: SAFE, bg: mix(main, light, 0.12), num: fg },
    { kv: bb, x: SAFE + colW + 40, bg: accent, num: textOn(accent) },
  ];
  for (const c of cols) {
    ctx.fillStyle = c.bg;
    roundRect(ctx, c.x, top, colW, boxH, 34);
    ctx.fill();
    // Big number, shrunk to fit.
    let size = 150;
    ctx.font = fontCss(b.headingFont, 'heading', size);
    while (ctx.measureText(c.kv.value).width > colW - 120 && size > 40) ctx.font = fontCss(b.headingFont, 'heading', (size -= 4));
    ctx.fillStyle = c.num;
    ctx.textAlign = 'center';
    ctx.fillText(c.kv.value, c.x + colW / 2, top + boxH / 2 + size * 0.3);
    ctx.textAlign = 'left';
    const lbl = textBox(ctx, c.kv.label.toUpperCase(), { x: c.x + 30, y: top + boxH - 150, w: colW - 60, h: 120 }, { fontKey: b.bodyFont, kind: 'heading', maxSize: 38, minSize: 20, color: c.num, hlColor: c.num, align: 'center', valign: 'middle', lineHeight: 1.15 });
    void lbl;
  }
  // VS badge.
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(PIN_W / 2, top + boxH / 2, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = textOn(light);
  ctx.font = fontCss(b.headingFont, 'heading', 44);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', PIN_W / 2, top + boxH / 2 + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = top + boxH + 50;
  if (diff) {
    const p = pill(ctx, `Difference: ${diff}`, { x: PIN_W / 2, y, bg: light, fg: textOn(light), size: 40, fontKey: b.headingFont, align: 'center' });
    y += p.h + 30;
  }
  const footTop = PIN_H - 170;
  if (text) textBox(ctx, text, { x: SAFE, y, w: W, h: footTop - y - 20 }, { fontKey: b.bodyFont, kind: 'body', maxSize: 46, minSize: 24, color: mix(fg, main, 0.2), hlColor: accent, align: 'center', valign: 'middle', lineHeight: 1.3 });
  footer(ctx, b, img, { fg: mix(fg, main, 0.15), accent, height: 170 });
  return head;
}

function tplChecklist(ctx, pin, b, img) {
  const [main, accent, light] = b.colors;
  const items = bodyLines(pin.body).slice(0, 8);
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  // Paper sheet.
  const px = SAFE - 30;
  const py = SAFE - 20;
  const pw = PIN_W - px * 2;
  const ph = PIN_H - 170 - py - 20;
  ctx.fillStyle = light;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 16;
  roundRect(ctx, px, py, pw, ph, 28);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = accent;
  roundRect(ctx, px, py, pw, 22, 11);
  ctx.fill();
  const onLight = textOn(light);
  const ix = px + 60;
  const iw = pw - 120;
  let y0 = py + 70;
  if (pin.tag) {
    pill(ctx, pin.tag, { x: ix, y: y0, bg: main, fg: textOn(main), size: 26, fontKey: b.headingFont });
    y0 += 76;
  }
  const head = textBox(ctx, pin.headline, { x: ix, y: y0, w: iw, h: 300 }, { fontKey: b.headingFont, maxSize: 100, minSize: 40, color: onLight, hlColor: accent, hlStyle: 'underline', valign: 'middle', lineHeight: 1.08 });
  const top = head.bottom + 50;
  const bottom = py + ph - 60;
  const box = 52;
  const tx = ix + box + 30;
  const tw = ix + iw - tx;
  const n = Math.max(items.length, 1);
  const gap = 30;
  const measure = measurer(ctx, b.bodyFont, 'body');
  const fit = fitParagraphs(items.length ? items : ['Add your checklist items, one per line'], { width: tw, height: bottom - top - gap * (n - 1), maxSize: 58, minSize: 22, lineHeight: 1.22, measure });
  let y = top + Math.max(0, (bottom - top - fit.height - gap * (n - 1)) / 2);
  fit.paras.forEach((lines, i) => {
    const lh = fit.size * fit.lineHeight;
    const cy = y + lh / 2;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    roundRect(ctx, ix, cy - box / 2, box, box, 10);
    ctx.stroke();
    if (i < Math.ceil(n / 2)) icon(ctx, 'check', ix + box / 2, cy, box * 0.7, accent);
    y = drawLines(ctx, lines, { x: tx, y, width: tw, size: fit.size, lineHeight: fit.lineHeight, fontKey: b.bodyFont, kind: 'body', color: onLight, hlColor: accent }) + gap;
    ctx.strokeStyle = mix(light, onLight, 0.1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, y - gap / 2);
    ctx.lineTo(ix + iw, y - gap / 2);
    ctx.stroke();
  });
  footer(ctx, b, img, { fg: textOn(main), accent, height: 170 });
  return { ...head, overflow: head.overflow || fit.overflow };
}

const DRAW = { bold: tplBold, list: tplList, tip: tplTip, card: tplCard, quote: tplQuote, compare: tplCompare, money: tplMoney, checklist: tplChecklist };

/**
 * Render a pin onto `canvas` (created if missing). Returns
 * {canvas, overflow, warnings}.
 */
export async function renderPin(pin, brandIn, canvas) {
  const b = brandOf({ brand: brandIn });
  await loadFonts(b);
  const img = await loadImage(b.logo);
  const c = canvas || document.createElement('canvas');
  c.width = PIN_W;
  c.height = PIN_H;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, PIN_W, PIN_H);
  const fn = DRAW[pin.template] || tplBold;
  const res = fn(ctx, { ...pin, headline: pin.headline || 'Your *headline* here' }, b, img) || {};
  ctx.restore();
  const warnings = [];
  if (res.overflow) warnings.push('Text is too long to fit nicely — shorten it.');
  if (pin.template === 'list' && bodyLines(pin.body).length && (bodyLines(pin.body).length < 3 || bodyLines(pin.body).length > 7)) warnings.push('Numbered List works best with 3–7 items.');
  if (pin.template === 'checklist' && bodyLines(pin.body).length > 8) warnings.push('Checklist shows the first 8 items only.');
  if (plainText(pin.headline).length > 90) warnings.push('Headline is long; pins read best under ~60 characters.');
  return { canvas: c, overflow: !!res.overflow, warnings };
}

export function canvasBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** JPG under maxBytes: lower the quality step by step. */
export async function jpgUnder(canvas, maxBytes = 350 * 1024) {
  let blob = null;
  for (const q of [0.9, 0.85, 0.8, 0.74, 0.68, 0.6, 0.52, 0.45, 0.38]) {
    blob = await canvasBlob(canvas, 'image/jpeg', q);
    if (blob && blob.size < maxBytes) return { blob, quality: q };
  }
  // Last resort: scale down.
  const small = document.createElement('canvas');
  small.width = 800;
  small.height = 1200;
  small.getContext('2d').drawImage(canvas, 0, 0, 800, 1200);
  blob = await canvasBlob(small, 'image/jpeg', 0.7);
  return { blob, quality: 0.7, scaled: true };
}

export { parseHighlights };
