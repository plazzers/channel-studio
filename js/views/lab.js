// Title & thumbnail lab (a tab on the video page): transparent title scores,
// thumbnail text checks with a real-size mock preview, and the A/B log.

import * as store from '../store.js';
import { scoreTitle, checkThumb, abWinner, videoTitle } from '../logic.js';
import { $, $$, esc, toast, todayISO } from '../util.js';

const ICON = { good: '✓', warn: '!', bad: '✕' };
let previewIdx = 0;

export function renderLab(panel, v, c, touch) {
  v.titles = v.titles || ['', '', ''];
  v.thumbTexts = v.thumbTexts && v.thumbTexts.length ? v.thumbTexts : [''];
  if (previewIdx >= v.thumbTexts.length) previewIdx = 0;

  panel.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <div class="panel-head"><h2>Title scores</h2><a class="btn small" href="#/settings?s=lab">Edit word lists</a></div>
        <p class="hint">Simple, open rules — every point is explained. Ideal length 40–65 characters.</p>
        <div id="lab-titles"></div>
      </div>
      <div class="panel">
        <h2>Thumbnail text</h2>
        <p class="hint">2–5 words, not the title's words (50%+ the same is red), at most 20 characters per line on 2 lines.</p>
        <div id="lab-thumbs"></div>
        <button type="button" class="btn small" id="lab-addthumb">+ Add thumbnail option</button>
        <h3 class="mt">Preview at YouTube size</h3>
        <div class="thumbmocks" id="lab-mocks"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>A/B log</h2><button type="button" class="btn small" id="ab-add">+ Add test row</button></div>
      <p class="hint">Type in what ran and the numbers from YouTube Studio (Test &amp; compare or Analytics). The winner is the row you mark, otherwise the best CTR after 7 days.</p>
      <div id="ab-table"></div>
    </div>`;

  const allTitles = () => [v.title, ...v.titles].filter((t) => t && t.trim());
  const opts = () => ({ power: store.state.titleWords.power, clickbait: store.state.titleWords.clickbait, keywords: c.keywords || [] });

  /* ---------- titles ---------- */
  const titleReasons = (i) => {
    const t = v.titles[i] || '';
    const r = scoreTitle(t, opts());
    const cls = !t.trim() ? '' : r.score >= 75 ? 'good' : r.score >= 50 ? 'warn' : 'bad';
    const list = t.trim()
      ? `<ul class="reasons">${r.reasons.map((x) => `<li class="${x.level}"><span class="ic" aria-hidden="true">${ICON[x.level]}</span><span>${esc(x.text)}</span><span class="pts">${x.points}/${x.max}</span></li>`).join('')}</ul>`
      : '';
    return { cls, score: t.trim() ? String(r.score) : '–', list };
  };
  const paintTitle = (i) => {
    const row = $(`[data-score-row="${i}"]`, panel);
    const r = titleReasons(i);
    row.className = `scorecard ${r.cls}`;
    $('[data-score]', row).textContent = r.score;
    $('.reasons-box', row).innerHTML = r.list;
  };
  const paintTitles = () => {
    $('#lab-titles', panel).innerHTML = ['A', 'B', 'C']
      .map(
        (L, i) => `<div class="scorecard" data-score-row="${i}">
          <div class="scorehead">
            <label class="radio"><input type="radio" name="lab-chosen" value="${i}" ${v.chosenTitle === i ? 'checked' : ''} /><span>${L}</span></label>
            <label class="grow"><span class="sr">Title ${L}</span><input data-labtitle="${i}" value="${esc(v.titles[i] || '')}" placeholder="Title ${L}" maxlength="100" /></label>
            <span class="score" data-score="${i}" title="Score out of 100"></span>
          </div>
          <div class="reasons-box"></div>
        </div>`,
      )
      .join('');
    [0, 1, 2].forEach(paintTitle);
  };

  /* ---------- thumbnails ---------- */
  const thumbChecks = (i) => {
    const t = v.thumbTexts[i] || '';
    const r = checkThumb(t, allTitles());
    const items = [];
    if (!r.empty) {
      items.push([r.wordsOk ? 'good' : 'warn', `${r.words} word${r.words === 1 ? '' : 's'}${r.wordsOk ? '' : ' — use 2–5'}`]);
      if (r.level === 'bad') items.push(['bad', `${Math.round(r.ratio * 100)}% of its words are in the title (${r.repeats.join(', ')}). Must differ.`]);
      else if (r.level === 'warn') items.push(['warn', `Shares "${r.repeats.join(', ')}" with the title (${Math.round(r.ratio * 100)}%).`]);
      else items.push(['good', 'Different from the title']);
      items.push([r.linesOk ? 'good' : 'bad', r.linesOk ? `Fits 2 lines (longest ${r.longest}/20)` : `Too long for 2 lines of 20 (longest line ${r.longest})`]);
    }
    const worst = items.some((x) => x[0] === 'bad') ? 'bad' : items.some((x) => x[0] === 'warn') ? 'warn' : r.empty ? '' : 'good';
    const list = items.length
      ? `<ul class="reasons inline-reasons">${items.map(([lv, txt]) => `<li class="${lv}"><span class="ic" aria-hidden="true">${ICON[lv]}</span><span>${esc(txt)}</span></li>`).join('')}</ul>`
      : '';
    return { worst, list };
  };
  const paintThumb = (i) => {
    const row = $(`[data-thumb-row="${i}"]`, panel);
    if (!row) return;
    const r = thumbChecks(i);
    row.className = `labthumb ${r.worst}`;
    $('.reasons-box', row).innerHTML = r.list;
  };
  const paintThumbs = () => {
    $('#lab-thumbs', panel).innerHTML = v.thumbTexts
      .map(
        (t, i) => `<div class="labthumb" data-thumb-row="${i}">
          <div class="scorehead">
            <label class="radio" title="Show in preview"><input type="radio" name="lab-preview" value="${i}" ${previewIdx === i ? 'checked' : ''} /><span class="sr">Preview option ${i + 1}</span></label>
            <label class="grow"><span class="sr">Thumbnail text ${i + 1}</span><input data-labthumb="${i}" value="${esc(t)}" placeholder="Thumbnail text ${i + 1}" maxlength="60" /></label>
            <button type="button" class="btn icon" data-labdel="${i}" aria-label="Remove thumbnail option ${i + 1}">✕</button>
          </div>
          <div class="reasons-box"></div>
        </div>`,
      )
      .join('');
    v.thumbTexts.forEach((_, i) => paintThumb(i));
    paintMocks();
  };

  const paintMocks = () => {
    const text = v.thumbTexts[previewIdx] || '';
    const r = checkThumb(text, allTitles());
    const lines = r.lines.length ? r.lines : ['THUMBNAIL', 'TEXT'];
    const mins = Math.floor(v.lengthMin || 10);
    const secs = Math.round(((v.lengthMin || 10) - mins) * 60);
    const dur = `${mins}:${String(secs).padStart(2, '0')}`;
    // Text shrinks to fit 64% of the width, like it would in a real design,
    // so long text visibly gets small and hard to read.
    const longest = Math.max(6, ...lines.map((l) => l.length));
    const fontPx = (w) => Math.round(Math.min(w / 7.5, (w * 0.64) / (longest * 0.6)));
    const mock = (w, h) => `
      <figure class="ytmock" style="--w:${w}px">
        <div class="thumbmock ${r.linesOk ? '' : 'over'} ${text.trim() ? '' : 'placeholder'}" data-ch="${esc(v.channel)}" style="width:${w}px;height:${h}px" data-size="${w}x${h}">
          <div class="tm-text" style="font-size:${fontPx(w)}px">${lines.map((l, i) => `<span class="${i === 1 ? 'hi' : ''}">${esc(l.toUpperCase())}</span>`).join('')}</div>
          <svg class="tm-host" viewBox="0 0 100 120" aria-hidden="true"><circle cx="50" cy="38" r="24"/><path d="M8 120c0-30 18-48 42-48s42 18 42 48z"/></svg>
          <span class="tm-hostlabel">Host photo</span>
          <span class="tm-dur">${esc(dur)}</span>
        </div>
        <figcaption>
          <span class="yt-title">${esc(videoTitle(v))}</span>
          <span class="yt-meta">${esc(c.name)} · ${w}×${h}</span>
        </figcaption>
      </figure>`;
    $('#lab-mocks', panel).innerHTML = mock(246, 138) + mock(360, 202);
  };

  /* ---------- A/B log ---------- */
  const NUM = [
    ['ctr48', 'CTR 48 h %', '0.1'],
    ['views48', 'Views 48 h', '1'],
    ['ctr7', 'CTR 7 days %', '0.1'],
    ['views7', 'Views 7 days', '1'],
  ];
  const paintAb = () => {
    const rows = store.abFor(v.id);
    const win = abWinner(rows);
    const titleOpts = [...new Set(allTitles())].map((t) => `<option value="${esc(t)}"></option>`).join('');
    const thumbOpts = [...new Set(v.thumbTexts.filter((t) => t.trim()))].map((t) => `<option value="${esc(t)}"></option>`).join('');
    $('#ab-table', panel).innerHTML = rows.length
      ? `<datalist id="ab-titles">${titleOpts}</datalist><datalist id="ab-thumbs">${thumbOpts}</datalist>
      <div class="tablewrap"><table class="abtable">
        <thead><tr><th>Started</th><th>Title that ran</th><th>Thumbnail that ran</th>${NUM.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th>Winner</th><th><span class="sr">Remove</span></th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr data-ab="${esc(r.id)}" class="${win && win.id === r.id ? 'win' : ''}">
            <td><input type="date" data-abf="startDate" value="${esc(r.startDate)}" aria-label="Start date" /></td>
            <td><input data-abf="title" list="ab-titles" value="${esc(r.title)}" aria-label="Title that ran" /></td>
            <td><input data-abf="thumb" list="ab-thumbs" value="${esc(r.thumb)}" aria-label="Thumbnail that ran" /></td>
            ${NUM.map(([k, l, step]) => `<td class="num"><input type="number" min="0" step="${step}" inputmode="decimal" data-abf="${k}" value="${esc(r[k])}" aria-label="${l}" /></td>`).join('')}
            <td class="wincell"><label class="check"><input type="checkbox" data-abwin ${r.winner ? 'checked' : ''} /><span>${win && win.id === r.id ? `★ <small>${esc(win.by)}</small>` : 'Mark'}</span></label></td>
            <td><button type="button" class="btn icon" data-abdel aria-label="Remove row">✕</button></td>
          </tr>`,
          )
          .join('')}</tbody></table></div>
        <p class="msgline" id="ab-msg">${win ? `Winner: <strong>${esc(rows.find((r) => r.id === win.id).title || '(no title)')}</strong> — ${esc(win.by)}.` : rows.length > 1 ? 'Type CTR numbers for at least two rows to see a winner.' : 'Add the other version as a second row to compare.'}</p>`
      : '<p class="muted">No tests logged yet. Press "+ Add test row" when a title or thumbnail goes live.</p>';
  };

  paintTitles();
  paintThumbs();
  paintAb();

  panel.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.labtitle != null) {
      v.titles[+t.dataset.labtitle] = t.value;
      touch();
      paintTitle(+t.dataset.labtitle);
      v.thumbTexts.forEach((_, i) => paintThumb(i));
      paintMocks();
    } else if (t.dataset.labthumb != null) {
      v.thumbTexts[+t.dataset.labthumb] = t.value;
      touch();
      paintThumb(+t.dataset.labthumb);
      if (+t.dataset.labthumb !== previewIdx) {
        previewIdx = +t.dataset.labthumb;
        $(`[name="lab-preview"][value="${previewIdx}"]`, panel).checked = true;
      }
      paintMocks();
    } else if (t.dataset.abf) {
      const r = store.state.abtests.find((x) => x.id === t.closest('[data-ab]').dataset.ab);
      r[t.dataset.abf] = t.value;
      store.saveAbTest(r);
      if (/^(ctr|views)/.test(t.dataset.abf)) refreshWinner();
    }
  });
  // Re-mark the winner without rebuilding the inputs being typed in.
  const refreshWinner = () => {
    const rows = store.abFor(v.id);
    const win = abWinner(rows);
    $$('[data-ab]', panel).forEach((tr) => {
      const on = !!win && win.id === tr.dataset.ab;
      tr.classList.toggle('win', on);
      $('.wincell span', tr).innerHTML = on ? `★ <small>${esc(win.by)}</small>` : 'Mark';
    });
    const msg = $('#ab-msg', panel);
    if (msg) {
      msg.innerHTML = win
        ? `Winner: <strong>${esc(rows.find((r) => r.id === win.id).title || '(no title)')}</strong> — ${esc(win.by)}.`
        : 'Type CTR numbers for at least two rows to see a winner.';
    }
  };
  panel.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.name === 'lab-chosen') {
      v.chosenTitle = +t.value;
      touch();
      paintMocks();
    } else if (t.name === 'lab-preview') {
      previewIdx = +t.value;
      paintMocks();
    } else if (t.dataset.abwin != null) {
      const id = t.closest('[data-ab]').dataset.ab;
      for (const r of store.abFor(v.id)) {
        const want = r.id === id ? t.checked : false;
        if (r.winner !== want) {
          r.winner = want;
          await store.saveAbTest(r);
        }
      }
      paintAb();
    }
  });
  panel.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-labdel]');
    if (del) {
      v.thumbTexts.splice(+del.dataset.labdel, 1);
      if (!v.thumbTexts.length) v.thumbTexts.push('');
      previewIdx = 0;
      touch();
      paintThumbs();
      return;
    }
    const abdel = e.target.closest('[data-abdel]');
    if (abdel) {
      const id = abdel.closest('[data-ab]').dataset.ab;
      if (!confirm('Remove this A/B log row?')) return;
      await store.deleteAbTest(id);
      paintAb();
    }
  });
  $('#lab-addthumb', panel).addEventListener('click', () => {
    if (v.thumbTexts.length >= 6) return toast('Six options is plenty', 'info');
    v.thumbTexts.push('');
    previewIdx = v.thumbTexts.length - 1;
    paintThumbs();
    $(`[data-labthumb="${previewIdx}"]`, panel).focus();
  });
  $('#ab-add', panel).addEventListener('click', async () => {
    const rows = store.abFor(v.id);
    const used = new Set(rows.map((r) => r.title));
    const nextTitle = allTitles().find((t) => !used.has(t)) || videoTitle(v);
    await store.addAbTest(v, {
      title: nextTitle,
      thumb: v.thumbTexts.find((t) => t.trim()) || '',
      startDate: v.publishDate && !rows.length ? v.publishDate : todayISO(),
    });
    paintAb();
    toast('Test row added');
  });
}
