// App state kept in memory and written through to IndexedDB.

import * as db from './db.js';
import { DEFAULT_TEMPLATES, DEFAULT_TITLE_WORDS } from './logic.js';
import { DEFAULT_BRAND } from './pins/render.js';
import { demoData } from './seed.js';

export const BACKUP_APP = 'faceless-creator-kit';
export const BACKUP_VERSION = 1;

const clone = (o) => JSON.parse(JSON.stringify(o));
const KEY = { weekly: 'week' };
const keyOf = (kind, r) => r[KEY[kind] || 'id'];

export const DEFAULT_SETTINGS = {
  theme: 'system',
  wpm: 150,
  titleWords: DEFAULT_TITLE_WORDS,
  onboarded: false,
  pinExport: {
    format: 'png',
    baseUrl: '',
    utm: { on: true, campaign: 'pins', content: true },
    schedule: { on: true, start: '', perDay: 3, times: '09:00, 14:00, 20:00', spread: true },
    keywords: '',
  },
};

export const state = {
  channels: [],
  videos: [],
  shorts: [],
  stats: [],
  weekly: [],
  topics: [],
  pins: [],
  templates: clone(DEFAULT_TEMPLATES),
  settings: clone(DEFAULT_SETTINGS),
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const emit = (what) => listeners.forEach((fn) => fn(what));

function mergeSettings(saved) {
  const s = { ...clone(DEFAULT_SETTINGS), ...(saved || {}) };
  s.pinExport = { ...clone(DEFAULT_SETTINGS.pinExport), ...((saved && saved.pinExport) || {}) };
  s.pinExport.utm = { ...DEFAULT_SETTINGS.pinExport.utm, ...(s.pinExport.utm || {}) };
  s.pinExport.schedule = { ...DEFAULT_SETTINGS.pinExport.schedule, ...(s.pinExport.schedule || {}) };
  s.titleWords = { ...clone(DEFAULT_TITLE_WORDS), ...(s.titleWords || {}) };
  return s;
}

export async function load() {
  const [lists, templates, settings, seeded] = await Promise.all([
    Promise.all(db.LISTS.map((n) => db.getAll(n))),
    db.getKV('templates'),
    db.getKV('settings'),
    db.getKV('seeded'),
  ]);
  if (!seeded) {
    await resetAll({ demo: true });
    return;
  }
  db.LISTS.forEach((n, i) => (state[n] = lists[i]));
  state.templates = Array.isArray(templates) && templates.length ? templates : clone(DEFAULT_TEMPLATES);
  state.settings = mergeSettings(settings);
  state.channels.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Start over: empty (or with the demo channel). Keeps nothing. */
export async function resetAll({ demo = true } = {}) {
  const d = demo ? demoData() : {};
  for (const n of db.LISTS) state[n] = d[n] || [];
  state.templates = clone(DEFAULT_TEMPLATES);
  const keepTheme = state.settings.theme;
  state.settings = clone(DEFAULT_SETTINGS);
  state.settings.theme = keepTheme;
  await db.replaceAll(state, { templates: state.templates, settings: state.settings, seeded: true });
  emit('all');
}

export function uid(prefix = 'x') {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const now = () => new Date().toISOString();

/** Save (insert or update) a record of a list. */
export async function save(kind, rec, { silent = false } = {}) {
  rec.updatedAt = now();
  if (!rec.createdAt) rec.createdAt = rec.updatedAt;
  const list = state[kind];
  const i = list.findIndex((r) => keyOf(kind, r) === keyOf(kind, rec));
  if (i >= 0) list[i] = rec;
  else list.push(rec);
  await db.put(kind, rec);
  if (!silent) emit(kind);
  return rec;
}

export async function saveMany(kind, recs) {
  for (const rec of recs) {
    rec.updatedAt = now();
    if (!rec.createdAt) rec.createdAt = rec.updatedAt;
    const i = state[kind].findIndex((r) => keyOf(kind, r) === keyOf(kind, rec));
    if (i >= 0) state[kind][i] = rec;
    else state[kind].push(rec);
  }
  await db.putMany(kind, recs);
  emit(kind);
}

export async function remove(kind, key, { silent = false } = {}) {
  state[kind] = state[kind].filter((r) => keyOf(kind, r) !== key);
  const pairs = [[kind, key]];
  if (kind === 'videos') {
    for (const k of ['shorts', 'stats']) {
      for (const r of state[k].filter((x) => x.videoId === key)) pairs.push([k, r.id]);
      state[k] = state[k].filter((x) => x.videoId !== key);
    }
  }
  await db.delMany(pairs);
  if (!silent) emit(kind);
}

/** Delete a channel and everything that belongs to it. */
export async function removeChannel(id) {
  const pairs = [['channels', id]];
  const vids = new Set(state.videos.filter((v) => v.channelId === id).map((v) => v.id));
  for (const k of ['videos', 'topics', 'pins']) {
    for (const r of state[k].filter((x) => x.channelId === id)) pairs.push([k, r.id]);
    state[k] = state[k].filter((x) => x.channelId !== id);
  }
  for (const k of ['shorts', 'stats']) {
    for (const r of state[k].filter((x) => vids.has(x.videoId))) pairs.push([k, r.id]);
    state[k] = state[k].filter((x) => !vids.has(x.videoId));
  }
  state.channels = state.channels.filter((c) => c.id !== id);
  await db.delMany(pairs);
  emit('all');
}

export const channel = (id) => state.channels.find((c) => c.id === id);
export const video = (id) => state.videos.find((v) => v.id === id);
export const pin = (id) => state.pins.find((p) => p.id === id);
export const template = (id) => state.templates.find((t) => t.id === id) || state.templates[0];

export async function saveTemplates() {
  await db.setKV('templates', state.templates);
  emit('templates');
}

export async function saveSettings(what = 'settings') {
  await db.setKV('settings', state.settings);
  emit(what);
}

/* ---------------- Factories ---------------- */

export function newChannel(fields = {}) {
  const colors = ['#6C5CE7', '#00A884', '#E8590C', '#1C7ED6', '#D6336C', '#2F9E44'];
  return {
    id: uid('ch'),
    name: 'My channel',
    color: colors[state.channels.length % colors.length],
    niche: '',
    audience: '',
    products: [],
    keywords: [],
    linkLine: '',
    disclaimer: '',
    hashtags: '',
    defaultLength: 10,
    order: state.channels.length,
    brand: { ...clone(DEFAULT_BRAND) },
    ...fields,
  };
}

export function newVideo(fields = {}) {
  const t = now();
  return {
    id: uid('v'),
    channelId: '',
    title: '',
    titles: ['', '', ''],
    chosenTitle: 0,
    thumbTexts: ['', '', ''],
    status: 'idea',
    statusSince: t,
    publishDate: '',
    publishTime: '',
    templateId: state.templates[0] ? state.templates[0].id : '',
    prompt: { audience: '', points: '', minutes: '', notes: '', product: '' },
    description: { hook: '', products: [], chapters: '', useDisclaimer: true, hashtags: '', useLinkLine: true },
    notes: '',
    order: -Date.now(),
    createdAt: t,
    ...fields,
  };
}

export function newPin(fields = {}) {
  return {
    id: uid('pin'),
    channelId: '',
    template: 'bold',
    title: '',
    headline: '',
    body: '',
    tag: '',
    link: '',
    board: '',
    description: '',
    keywords: '',
    batchId: '',
    ...fields,
  };
}

export function setStatus(v, status) {
  if (v.status !== status) v.statusSince = now();
  v.status = status;
}

/* ---------------- Backup ---------------- */

export function exportData() {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now(),
    ...Object.fromEntries(db.LISTS.map((n) => [n, state[n]])),
    templates: state.templates,
    settings: state.settings,
  };
}

export function checkBackup(data) {
  if (!data || typeof data !== 'object' || data.app !== BACKUP_APP) return 'This file is not a Faceless Creator Kit backup.';
  if (!Array.isArray(data.channels)) return 'The backup has no channel list.';
  for (const n of db.LISTS) {
    if (data[n] != null && !Array.isArray(data[n])) return `The backup's ${n} list is broken.`;
    if ((data[n] || []).some((r) => !r || typeof r !== 'object' || typeof (r[KEY[n] || 'id']) !== 'string')) return `Some ${n} in the backup are broken.`;
  }
  return '';
}

export async function importData(data) {
  const err = checkBackup(data);
  if (err) throw new Error(err);
  for (const n of db.LISTS) state[n] = data[n] || [];
  state.templates = Array.isArray(data.templates) && data.templates.length ? data.templates : clone(DEFAULT_TEMPLATES);
  state.settings = mergeSettings({ ...data.settings, onboarded: true });
  await db.replaceAll(state, { templates: state.templates, settings: state.settings, seeded: true });
  emit('all');
}
