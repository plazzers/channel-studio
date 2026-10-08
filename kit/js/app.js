// Entry point: access gate, data loading, routing, theme and the offline
// service worker.

import { ACCESS_HASHES } from '../config.js';
import { checkCode, testModeAllowed, normalizeCode, sha256Hex, TEST_CODE } from './gate.js';
import * as store from './store.js';
import { ui, setChannelFilter } from './ctx.js';
import { $, $$, esc, pref } from './util.js';
import * as board from './views/board.js';
import * as videoView from './views/video.js';
import * as calendar from './views/calendar.js';
import * as topics from './views/topics.js';
import * as week from './views/week.js';
import * as pins from './views/pins.js';
import * as batch from './views/batch.js';
import * as exportView from './views/export.js';
import * as brand from './views/brand.js';
import * as channels from './views/channels.js';
import * as templates from './views/templates.js';
import * as backup from './views/backup.js';
import * as welcome from './views/welcome.js';

const routes = { board, video: videoView, calendar, topics, week, pins, batch, export: exportView, brand, channels, templates, backup, welcome };
const NAV_OF = { video: 'board' };
const view = $('#view');
let current = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'board', parts: parts.slice(1), params: Object.fromEntries(new URLSearchParams(query)) };
}

export function route() {
  const r = parseHash();
  if (!store.state.settings.onboarded && r.name !== 'welcome') {
    location.replace('#/welcome');
    return;
  }
  const mod = routes[r.name] || board;
  if (current && current.cleanup) current.cleanup();
  current = mod;
  const nav = NAV_OF[r.name] || r.name;
  $$('.side a').forEach((a) => {
    const on = a.dataset.nav === nav;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.dataset.route = r.name;
  mod.render(view, r);
  view.scrollTop = 0;
  window.scrollTo(0, 0);
}

function applyTheme() {
  const t = store.state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  pref.set('theme', t);
}

export function paintChannelPicker() {
  const sel = $('#chpick');
  if (ui.channel !== 'all' && !store.channel(ui.channel)) setChannelFilter('all');
  sel.innerHTML =
    `<option value="all">All channels</option>` +
    store.state.channels.map((c) => `<option value="${esc(c.id)}" ${c.id === ui.channel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  sel.value = ui.channel;
  const c = store.channel(ui.channel);
  sel.style.setProperty('--dot', c ? c.color : 'var(--muted)');
}

/* ---------------- Access gate ---------------- */

const ACCESS_KEY = 'fck:access';

async function alreadyUnlocked() {
  let saved = '';
  try {
    saved = localStorage.getItem(ACCESS_KEY) || '';
  } catch {
    return false;
  }
  if (!saved) return false;
  if (ACCESS_HASHES.map((h) => h.toLowerCase()).includes(saved)) return true;
  // A test unlock only counts on this computer, in test mode.
  return testModeAllowed(location) && saved === (await sha256Hex(TEST_CODE));
}

function showGate() {
  return new Promise((resolve) => {
    const gate = $('#gate');
    gate.hidden = false;
    const form = $('#gate-form');
    const input = $('#gate-code');
    const msg = $('#gate-msg');
    input.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      const res = await checkCode(input.value, { hashes: ACCESS_HASHES, testMode: testModeAllowed(location) });
      if (!res.ok) {
        msg.textContent = normalizeCode(input.value)
          ? 'That code did not work. Check it against your PDF (letters and numbers, with the dashes) and try again.'
          : 'Type your access code first.';
        input.select();
        return;
      }
      try {
        localStorage.setItem(ACCESS_KEY, res.hash);
      } catch {
        /* private window: unlocked for this visit only */
      }
      gate.hidden = true;
      resolve();
    });
  });
}

async function start() {
  if (!(await alreadyUnlocked())) await showGate();
  $('#app').hidden = false;
  try {
    await store.load();
  } catch (err) {
    console.warn('Storage problem', err);
    view.innerHTML = `<div class="panel error-box"><h1>Storage is blocked</h1><p>This browser did not let the kit save data (a private window?). Open it in a normal window.</p></div>`;
    return;
  }
  applyTheme();
  paintChannelPicker();
  $('#chpick').addEventListener('change', (e) => {
    setChannelFilter(e.target.value);
    paintChannelPicker();
    route();
  });
  $('#themebtn').addEventListener('click', async () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    store.state.settings.theme = dark ? 'light' : 'dark';
    applyTheme();
    await store.saveSettings('theme');
  });
  store.onChange((what) => {
    if (what === 'theme') applyTheme();
    if (what === 'channels' || what === 'all') paintChannelPicker();
    if (what === 'all') {
      applyTheme();
      route();
    }
  });
  window.addEventListener('hashchange', route);
  route();
  document.documentElement.dataset.ready = '1';
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => console.warn('Offline mode not available', err));
  });
}

start();
