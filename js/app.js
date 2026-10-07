// Entry point: loads data, routes between screens, theme, keyboard shortcuts,
// and the offline service worker.

import * as store from './store.js';
import { ui, setChannelFilter } from './ctx.js';
import { $, $$, toast, pref } from './util.js';
import * as board from './views/board.js';
import * as detail from './views/detail.js';
import * as calendar from './views/calendar.js';
import * as topics from './views/topics.js';
import * as settings from './views/settings.js';

const routes = { board, video: detail, calendar, topics, settings };
const view = $('#view');
let current = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(query));
  return { name: parts[0] || 'board', parts: parts.slice(1), params };
}

export function route() {
  const r = parseHash();
  const mod = routes[r.name] || board;
  if (current && current.cleanup) current.cleanup();
  ui.copyCurrent = null;
  current = mod;
  $$('.mainnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === (r.name === 'video' ? 'board' : r.name)));
  mod.render(view, r);
}

function applyTheme() {
  const t = store.state.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  pref.set('theme', t);
}

function paintSwitch() {
  $$('.chswitch button').forEach((b) => {
    const on = b.dataset.ch === ui.channel;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function typingInField(e) {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    if (ui.copyCurrent) ui.copyCurrent();
    else toast('Nothing to copy on this screen', 'info');
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || typingInField(e)) return;
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    board.focusNewIdea();
  } else if (e.key === '/') {
    e.preventDefault();
    const s = $('[data-search]');
    if (s) s.focus();
    else board.focusSearch();
  }
}

async function start() {
  try {
    await store.load();
  } catch (err) {
    console.warn('Storage problem', err);
    view.innerHTML = `<div class="panel error-box"><h1>Storage is blocked</h1><p>This browser did not allow Channel Studio to save data (private window?). Open it in a normal window.</p></div>`;
    return;
  }
  applyTheme();
  paintSwitch();
  $('.chswitch').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ch]');
    if (!b) return;
    setChannelFilter(b.dataset.ch);
    paintSwitch();
    route();
  });
  store.onChange((what) => {
    if (what === 'theme') applyTheme();
    if (what === 'all') {
      applyTheme();
      route();
    }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onKey);
  route();
  document.documentElement.dataset.ready = '1';
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline mode not available', err));
  });
}

start();
