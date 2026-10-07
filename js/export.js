// "Export to spreadsheet": one CSV file per table, packed in a .zip built in
// the browser (see zip.js).

import * as store from './store.js';
import { toCSV, videoTitle, statusLabel, validateShortRange } from './logic.js';
import { makeZip } from './zip.js';

const chName = (id) => store.channel(id)?.name || id || '';
const vTitle = (id) => {
  const v = store.getVideo(id);
  return v ? videoTitle(v) : '';
};
const productName = (ch, pid) => store.productById(ch, pid)?.name || '';
const BOM = '﻿'; // so Excel opens the files as UTF-8 (emoji, accents)

export function csvTables() {
  const { videos, shorts, abtests, weekly, stats, checklist } = store.state;
  const videoChannel = (r) => store.getVideo(r.videoId)?.channel || r.channel;
  return {
    'videos.csv': toCSV(videos, [
      ['id', (v) => v.id],
      ['channel', (v) => chName(v.channel)],
      ['title', (v) => videoTitle(v)],
      ['working_title', (v) => v.title],
      ['title_a', (v) => v.titles?.[0] || ''],
      ['title_b', (v) => v.titles?.[1] || ''],
      ['title_c', (v) => v.titles?.[2] || ''],
      ['chosen_title', (v) => 'ABC'[v.chosenTitle] || ''],
      ['thumbnail_texts', (v) => (v.thumbTexts || []).filter(Boolean).join(' | ')],
      ['stage', (v) => statusLabel(v.status)],
      ['stage_since', (v) => (v.statusSince || '').slice(0, 10)],
      ['publish_date', (v) => v.publishDate],
      ['publish_time_et', (v) => v.publishTime],
      ['main_product', (v) => productName(v.channel, v.product)],
      ['length_min', (v) => v.lengthMin],
      ['checklist_done', (v) => `${checklist.filter((it) => v.checklist?.[it.id]).length}/${checklist.length}`],
      ['shorts', (v) => shorts.filter((s) => s.videoId === v.id).length],
      ['notes', (v) => v.notes?.text || ''],
      ['created', (v) => (v.createdAt || '').slice(0, 10)],
      ['updated', (v) => (v.updatedAt || '').slice(0, 10)],
    ]),
    'shorts.csv': toCSV(shorts, [
      ['id', (s) => s.id],
      ['channel', (s) => chName(videoChannel(s))],
      ['video_id', (s) => s.videoId],
      ['video_title', (s) => vTitle(s.videoId)],
      ['number', (s) => s.n],
      ['status', (s) => s.status],
      ['post_date', (s) => s.postedDate],
      ['hook', (s) => s.hook],
      ['time_range', (s) => s.range],
      ['seconds', (s) => {
        const r = validateShortRange(s.range);
        return r.duration > 0 ? r.duration : '';
      }],
      ['on_screen_text', (s) => s.onScreen],
      ['title', (s) => s.title],
      ['description', (s) => s.description],
      ['link_product', (s) => productName(videoChannel(s), s.product)],
    ]),
    'ab_log.csv': toCSV(abtests, [
      ['id', (r) => r.id],
      ['channel', (r) => chName(videoChannel(r))],
      ['video_id', (r) => r.videoId],
      ['video_title', (r) => vTitle(r.videoId)],
      ['start_date', (r) => r.startDate],
      ['title_that_ran', (r) => r.title],
      ['thumbnail_that_ran', (r) => r.thumb],
      ['ctr_48h_pct', (r) => r.ctr48],
      ['views_48h', (r) => r.views48],
      ['ctr_7d_pct', (r) => r.ctr7],
      ['views_7d', (r) => r.views7],
      ['marked_winner', (r) => (r.winner ? 'yes' : '')],
    ]),
    'weekly_notes.csv': toCSV(Object.values(weekly).sort((a, b) => a.week.localeCompare(b.week)), [
      ['week', (w) => w.week],
      ['what_worked', (w) => w.worked],
      ['what_to_try', (w) => w.toTry],
      ['updated', (w) => (w.updatedAt || '').slice(0, 10)],
    ]),
    'stats.csv': toCSV([...stats].sort((a, b) => a.week.localeCompare(b.week) || String(a.videoId).localeCompare(String(b.videoId))), [
      ['week', (r) => r.week],
      ['channel', (r) => chName(videoChannel(r))],
      ['video_id', (r) => r.videoId],
      ['video_title', (r) => vTitle(r.videoId)],
      ['views', (r) => r.views],
      ['watch_hours', (r) => r.watchHours],
      ['subs_gained', (r) => r.subs],
      ['ctr_pct', (r) => r.ctr],
      ['sales', (r) => r.sales],
    ]),
  };
}

export function csvZip() {
  const files = Object.entries(csvTables()).map(([name, text]) => ({ name, data: BOM + text }));
  return makeZip(files);
}

export function downloadBytes(filename, bytes, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
