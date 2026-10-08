// Backup & export: JSON backup/restore, CSV tables in a ZIP, start over,
// and the about/licenses box.

import * as store from '../store.js';
import { toCSV, videoTitle, statusLabel } from '../logic.js';
import { plainText, pinDescription } from '../pins/logic.js';
import { makeZip } from '../zip.js';
import { $, toast, downloadText, downloadBlob, todayISO, readText, confirmBox } from '../util.js';

export function render(el) {
  const s = store.state;
  el.innerHTML = `
    <section class="backup-view">
      <div class="pagehead"><h1>Backup &amp; export</h1></div>
      <div class="grid2">
        <div class="panel">
          <h2>Backup (JSON)</h2>
          <p class="muted">Everything lives in this browser only. Download a backup now and then, and to move to another device: <strong>Download backup</strong> here, then <strong>Restore</strong> on the other device.</p>
          <p class="small">${s.channels.length} channels · ${s.videos.length} videos · ${s.shorts.length} Shorts · ${s.topics.length} topics · ${s.pins.length} pins</p>
          <div class="row wrap"><button class="btn primary" id="bk-dl" type="button">Download backup</button>
          <label class="btn filebtn">Restore from a backup…<input type="file" id="bk-up" accept=".json,application/json" /></label></div>
          <p class="muted small">Restoring replaces everything in the kit on this device with the backup.</p>
        </div>
        <div class="panel">
          <h2>Spreadsheets (CSV in a ZIP)</h2>
          <p class="muted">Videos, Shorts, weekly numbers, notes, topics and pins as CSV files you can open in Excel, Numbers or Google Sheets.</p>
          <button class="btn" id="bk-csv" type="button">Download CSV ZIP</button>
        </div>
      </div>
      <div class="grid2">
        <div class="panel danger-zone">
          <h2>Start over</h2>
          <p class="muted">Deletes everything on this device. Download a backup first.</p>
          <div class="row wrap"><button class="btn danger ghost" id="bk-reset-demo" type="button">Reset to the demo</button><button class="btn danger" id="bk-reset-empty" type="button">Erase everything</button></div>
        </div>
        <div class="panel">
          <h2>About</h2>
          <p><strong>Faceless Creator Kit</strong> — a planner for faceless YouTube channels and a Pinterest pin factory. It runs fully in your browser and works offline. No accounts, no tracking; nothing you type is sent anywhere.</p>
          <p class="small muted">Fonts: Anton, Inter, Lora, Montserrat, Playfair Display and Space Grotesk, all under the SIL Open Font License 1.1 (license files are in the <code>fonts</code> folder).</p>
        </div>
      </div>
    </section>`;
  $('#bk-dl', el).addEventListener('click', () => {
    downloadText(`creator-kit-backup-${todayISO()}.json`, JSON.stringify(store.exportData(), null, 1), 'application/json');
    toast('Backup downloaded');
  });
  $('#bk-up', el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let data;
    try {
      data = JSON.parse(await readText(f));
    } catch {
      toast('That file is not a valid backup (not JSON)', 'error');
      return;
    }
    const err = store.checkBackup(data);
    if (err) return toast(err, 'error');
    if (!(await confirmBox(`Replace everything with “${f.name}”?`, { ok: 'Restore', danger: true }))) return;
    await store.importData(data);
    toast('Backup restored');
  });
  $('#bk-csv', el).addEventListener('click', () => {
    downloadBlob(`creator-kit-tables-${todayISO()}.zip`, new Blob([makeZip(csvTables())], { type: 'application/zip' }));
    toast('CSV ZIP downloaded');
  });
  $('#bk-reset-demo', el).addEventListener('click', async () => {
    if (!(await confirmBox('Delete everything and load the demo channel again?', { ok: 'Reset', danger: true }))) return;
    await store.resetAll({ demo: true });
    location.hash = '#/welcome';
  });
  $('#bk-reset-empty', el).addEventListener('click', async () => {
    if (!(await confirmBox('Erase every channel, video and pin on this device?', { ok: 'Erase everything', danger: true }))) return;
    await store.resetAll({ demo: false });
    location.hash = '#/welcome';
  });
}

const chName = (id) => (store.channel(id) || {}).name || '';

export function csvTables() {
  const s = store.state;
  const vt = (id) => {
    const v = store.video(id);
    return v ? videoTitle(v) : '';
  };
  const BOM = '﻿';
  return [
    {
      name: 'videos.csv',
      data: BOM + toCSV(s.videos, [
        ['channel', (v) => chName(v.channelId)],
        ['title', (v) => videoTitle(v)],
        ['stage', (v) => statusLabel(v.status)],
        ['publish_date', (v) => v.publishDate],
        ['publish_time', (v) => v.publishTime],
        ['title_a', (v) => v.titles[0]],
        ['title_b', (v) => v.titles[1]],
        ['title_c', (v) => v.titles[2]],
        ['thumb_a', (v) => v.thumbTexts[0]],
        ['thumb_b', (v) => v.thumbTexts[1]],
        ['thumb_c', (v) => v.thumbTexts[2]],
        ['notes', (v) => v.notes],
        ['id', (v) => v.id],
      ]),
    },
    {
      name: 'shorts.csv',
      data: BOM + toCSV(s.shorts, [
        ['video', (r) => vt(r.videoId)],
        ['n', (r) => r.n],
        ['range', (r) => r.range],
        ['hook', (r) => r.hook],
        ['on_screen', (r) => r.onScreen],
        ['title', (r) => r.title],
        ['status', (r) => r.status],
      ]),
    },
    {
      name: 'stats.csv',
      data: BOM + toCSV(s.stats, [
        ['week', (r) => r.week],
        ['video', (r) => vt(r.videoId)],
        ['views', (r) => r.views],
        ['watch_hours', (r) => r.watchHours],
        ['subs', (r) => r.subs],
        ['ctr_pct', (r) => r.ctr],
      ]),
    },
    {
      name: 'weekly_notes.csv',
      data: BOM + toCSV(s.weekly, [
        ['week', (r) => r.week],
        ['what_worked', (r) => r.worked],
        ['to_try', (r) => r.toTry],
      ]),
    },
    {
      name: 'topics.csv',
      data: BOM + toCSV(s.topics, [
        ['channel', (r) => chName(r.channelId)],
        ['topic', (r) => r.text],
        ['note', (r) => r.note],
      ]),
    },
    {
      name: 'pins.csv',
      data: BOM + toCSV(s.pins, [
        ['channel', (r) => chName(r.channelId)],
        ['template', (r) => r.template],
        ['title', (r) => plainText(r.title || r.headline)],
        ['headline', (r) => r.headline],
        ['body', (r) => r.body],
        ['tag', (r) => r.tag],
        ['description', (r) => pinDescription(r)],
        ['link', (r) => r.link],
        ['board', (r) => r.board],
        ['keywords', (r) => r.keywords],
      ]),
    },
  ];
}

export function cleanup() {}
