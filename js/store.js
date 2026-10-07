// App state kept in memory and written through to IndexedDB.

import * as db from './db.js';
import { DEFAULT_CHANNELS, DEFAULT_CHECKLIST } from '../data/channels.js';
import { seedVideos } from '../data/seed.js';
import { DEFAULT_TITLE_WORDS, MAX_SHORTS } from './logic.js';

export const BACKUP_APP = 'channel-studio';
export const BACKUP_VERSION = 2;

const clone = (o) => JSON.parse(JSON.stringify(o));

export const state = {
  videos: [],
  channels: clone(DEFAULT_CHANNELS),
  checklist: clone(DEFAULT_CHECKLIST),
  theme: 'system',
  titleWords: clone(DEFAULT_TITLE_WORDS),
  shorts: [],
  abtests: [],
  weekly: {}, // "2026-W41" -> {week, worked, toTry, updatedAt}
  stats: [],
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = (what) => listeners.forEach((fn) => fn(what));

/** Fill in any keys added in newer versions without touching user edits. */
function mergeChannel(saved, def) {
  const out = { ...clone(def), ...saved };
  out.colors = { ...def.colors, ...(saved.colors || {}) };
  out.prompt = { ...def.prompt, ...(saved.prompt || {}) };
  out.templates = { ...def.templates, ...(saved.templates || {}) };
  out.products = Array.isArray(saved.products) ? saved.products : clone(def.products);
  out.keywords = Array.isArray(saved.keywords) ? saved.keywords : clone(def.keywords || []);
  return out;
}

function mergeTitleWords(saved) {
  const out = clone(DEFAULT_TITLE_WORDS);
  if (saved && Array.isArray(saved.power)) out.power = saved.power;
  if (saved && Array.isArray(saved.clickbait)) out.clickbait = saved.clickbait;
  return out;
}

const weeklyMap = (rows) => Object.fromEntries((rows || []).filter((r) => r && r.week).map((r) => [r.week, r]));

export async function load() {
  const [videos, channels, checklist, theme, seeded, titleWords, shorts, abtests, weekly, stats] = await Promise.all([
    db.getAll('videos'),
    db.getKV('channels'),
    db.getKV('checklist'),
    db.getKV('theme'),
    db.getKV('seeded'),
    db.getKV('titleWords'),
    db.getAll('shorts'),
    db.getAll('abtests'),
    db.getAll('weekly'),
    db.getAll('stats'),
  ]);
  if (!seeded && videos.length === 0) {
    await resetDemo();
    return;
  }
  state.videos = videos;
  state.channels = {};
  for (const id of Object.keys(DEFAULT_CHANNELS)) {
    state.channels[id] = channels && channels[id] ? mergeChannel(channels[id], DEFAULT_CHANNELS[id]) : clone(DEFAULT_CHANNELS[id]);
  }
  state.checklist = Array.isArray(checklist) ? checklist : clone(DEFAULT_CHECKLIST);
  state.theme = theme || 'system';
  state.titleWords = mergeTitleWords(titleWords);
  state.shorts = shorts;
  state.abtests = abtests;
  state.weekly = weeklyMap(weekly);
  state.stats = stats;
}

export async function resetDemo() {
  state.videos = seedVideos();
  state.channels = clone(DEFAULT_CHANNELS);
  state.checklist = clone(DEFAULT_CHECKLIST);
  state.titleWords = clone(DEFAULT_TITLE_WORDS);
  state.shorts = [];
  state.abtests = [];
  state.weekly = {};
  state.stats = [];
  await db.replaceAll({
    videos: state.videos,
    kv: { channels: state.channels, checklist: state.checklist, theme: state.theme, titleWords: state.titleWords, seeded: true },
  });
  emit('all');
}

export const getVideo = (id) => state.videos.find((v) => v.id === id);
export const channel = (id) => state.channels[id];
export const productById = (ch, pid) => (channel(ch)?.products || []).find((p) => p.id === pid);
export const freeProduct = (ch) => {
  const ps = [...(channel(ch)?.products || [])].sort((a, b) => a.order - b.order);
  return ps.find((p) => p.type === 'free' && p.inDescription) || ps.find((p) => p.type === 'free');
};

export function uid(prefix = 'v') {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Change a video's stage and remember when it entered it. */
export function setStatus(v, status) {
  if (v.status !== status) v.statusSince = new Date().toISOString();
  v.status = status;
}

export async function createVideo({ title, channel: ch }) {
  const c = channel(ch);
  const now = new Date().toISOString();
  const main = [...c.products].sort((a, b) => a.order - b.order).find((p) => p.type !== 'free') || c.products[0];
  const minOrder = Math.min(0, ...state.videos.filter((v) => v.status === 'idea').map((v) => v.order ?? 0));
  const v = {
    id: uid(),
    channel: ch,
    title: title.trim(),
    titles: [title.trim(), '', ''],
    chosenTitle: 0,
    thumbTexts: ['', '', ''],
    product: main ? main.id : '',
    lengthMin: c.defaultLength || 10,
    wpm: null,
    publishDate: '',
    publishTime: '',
    status: 'idea',
    statusSince: now,
    order: minOrder - 1,
    prompt: {},
    description: {},
    checklist: {},
    notes: { text: '', scriptDoc: '', headcast: '', thumbPath: '' },
    pinned: null,
    community: null,
    createdAt: now,
    updatedAt: now,
  };
  state.videos.push(v);
  await db.put('videos', v);
  emit('videos');
  return v;
}

/** Save a video after changing it in place. */
export async function saveVideo(v, { silent = false } = {}) {
  v.updatedAt = new Date().toISOString();
  await db.put('videos', v);
  if (!silent) emit('videos');
}

export async function deleteVideo(id) {
  const gone = [
    ...state.shorts.filter((s) => s.videoId === id).map((s) => ['shorts', s.id]),
    ...state.abtests.filter((r) => r.videoId === id).map((r) => ['abtests', r.id]),
    ...state.stats.filter((r) => r.videoId === id).map((r) => ['stats', r.id]),
  ];
  state.videos = state.videos.filter((v) => v.id !== id);
  state.shorts = state.shorts.filter((s) => s.videoId !== id);
  state.abtests = state.abtests.filter((r) => r.videoId !== id);
  state.stats = state.stats.filter((r) => r.videoId !== id);
  await db.del('videos', id);
  await db.delMany(gone);
  emit('videos');
}

/** Keep the channel copy on related rows in step when a video moves channel. */
export async function videoChannelChanged(v) {
  for (const list of [state.shorts, state.abtests, state.stats]) {
    for (const r of list) {
      if (r.videoId === v.id && r.channel !== v.channel) r.channel = v.channel;
    }
  }
  await Promise.all([
    ...state.shorts.filter((r) => r.videoId === v.id).map((r) => db.put('shorts', r)),
    ...state.abtests.filter((r) => r.videoId === v.id).map((r) => db.put('abtests', r)),
    ...state.stats.filter((r) => r.videoId === v.id).map((r) => db.put('stats', r)),
  ]);
}

/* ---------------- Shorts ---------------- */

export const shortsFor = (videoId) =>
  state.shorts.filter((s) => s.videoId === videoId).sort((a, b) => (a.n ?? 0) - (b.n ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));

export async function createShort(video, fields = {}) {
  if (shortsFor(video.id).length >= MAX_SHORTS) return null;
  const now = new Date().toISOString();
  const free = freeProduct(video.channel);
  const s = {
    id: uid('sh'),
    videoId: video.id,
    channel: video.channel,
    n: Math.max(0, ...shortsFor(video.id).map((x) => x.n ?? 0)) + 1,
    hook: '',
    range: '',
    onScreen: '',
    title: '',
    description: '',
    product: free ? free.id : '',
    status: 'planned',
    postedDate: '',
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
  state.shorts.push(s);
  await db.put('shorts', s);
  emit('shorts');
  return s;
}

export async function saveShort(s, { silent = true } = {}) {
  s.updatedAt = new Date().toISOString();
  await db.put('shorts', s);
  if (!silent) emit('shorts');
}

export async function deleteShort(id) {
  state.shorts = state.shorts.filter((s) => s.id !== id);
  await db.del('shorts', id);
  emit('shorts');
}

/* ---------------- A/B log ---------------- */

export const abFor = (videoId) =>
  state.abtests.filter((r) => r.videoId === videoId).sort((a, b) => String(a.startDate || a.createdAt).localeCompare(String(b.startDate || b.createdAt)));

export async function addAbTest(video, fields = {}) {
  const now = new Date().toISOString();
  const r = {
    id: uid('ab'),
    videoId: video.id,
    channel: video.channel,
    title: '',
    thumb: '',
    startDate: '',
    ctr48: '',
    views48: '',
    ctr7: '',
    views7: '',
    winner: false,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
  state.abtests.push(r);
  await db.put('abtests', r);
  return r;
}

export async function saveAbTest(r) {
  r.updatedAt = new Date().toISOString();
  await db.put('abtests', r);
}

export async function deleteAbTest(id) {
  state.abtests = state.abtests.filter((r) => r.id !== id);
  await db.del('abtests', id);
}

/* ---------------- Weekly review ---------------- */

export const weeklyNote = (week) => state.weekly[week] || { week, worked: '', toTry: '' };

export async function saveWeeklyNote(week, fields) {
  const row = { ...weeklyNote(week), ...fields, week, updatedAt: new Date().toISOString() };
  state.weekly[week] = row;
  await db.put('weekly', row);
}

export const statId = (videoId, week) => `${videoId}@${week}`;
export const getStat = (videoId, week) => state.stats.find((r) => r.id === statId(videoId, week));

/** Save typed-in numbers for a video in a week. Empty rows are removed. */
export async function saveStat(video, week, fields) {
  const id = statId(video.id, week);
  let row = state.stats.find((r) => r.id === id);
  if (!row) {
    row = { id, videoId: video.id, channel: video.channel, week, views: '', watchHours: '', subs: '', ctr: '', sales: '' };
    state.stats.push(row);
  }
  Object.assign(row, fields, { updatedAt: new Date().toISOString() });
  const empty = ['views', 'watchHours', 'subs', 'ctr', 'sales'].every((k) => row[k] === '' || row[k] == null);
  if (empty) {
    state.stats = state.stats.filter((r) => r.id !== id);
    await db.del('stats', id);
  } else await db.put('stats', row);
}

export async function saveTitleWords() {
  await db.setKV('titleWords', state.titleWords);
  emit('titleWords');
}

export async function saveChannels() {
  await db.setKV('channels', state.channels);
  emit('channels');
}

export async function saveChecklist() {
  await db.setKV('checklist', state.checklist);
  emit('checklist');
}

export async function setTheme(t) {
  state.theme = t;
  await db.setKV('theme', t);
  emit('theme');
}

export function exportData() {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    videos: state.videos,
    shorts: state.shorts,
    abtests: state.abtests,
    weekly: Object.values(state.weekly),
    stats: state.stats,
    settings: { channels: state.channels, checklist: state.checklist, theme: state.theme, titleWords: state.titleWords },
  };
}

/** Check a backup file. Returns an error message, or '' when it looks fine. */
export function checkBackup(data) {
  if (!data || typeof data !== 'object') return 'This file is not a Channel Studio backup.';
  if (data.app !== BACKUP_APP) return 'This file is not a Channel Studio backup.';
  if (!Array.isArray(data.videos)) return 'The backup has no videos list.';
  if (data.videos.some((v) => !v || typeof v.id !== 'string' || !v.channel)) return 'Some videos in the backup are broken.';
  if (!data.settings || typeof data.settings.channels !== 'object') return 'The backup has no channel settings.';
  // Added in backup version 2; older backups simply don't have them.
  for (const k of ['shorts', 'abtests', 'weekly', 'stats']) {
    if (data[k] != null && !Array.isArray(data[k])) return `The backup's ${k} list is broken.`;
  }
  if ((data.shorts || []).some((s) => !s || typeof s.id !== 'string' || !s.videoId)) return 'Some Shorts in the backup are broken.';
  if ((data.weekly || []).some((w) => !w || typeof w.week !== 'string')) return 'Some weekly notes in the backup are broken.';
  if ((data.stats || []).some((r) => !r || typeof r.id !== 'string')) return 'Some stats in the backup are broken.';
  if ((data.abtests || []).some((r) => !r || typeof r.id !== 'string')) return 'Some A/B log rows in the backup are broken.';
  return '';
}

export async function importData(data) {
  const err = checkBackup(data);
  if (err) throw new Error(err);
  const channels = {};
  for (const id of Object.keys(DEFAULT_CHANNELS)) {
    const saved = data.settings.channels[id];
    channels[id] = saved ? mergeChannel(saved, DEFAULT_CHANNELS[id]) : clone(DEFAULT_CHANNELS[id]);
  }
  state.videos = data.videos;
  state.channels = channels;
  state.checklist = Array.isArray(data.settings.checklist) ? data.settings.checklist : clone(DEFAULT_CHECKLIST);
  state.theme = data.settings.theme || state.theme;
  state.titleWords = mergeTitleWords(data.settings.titleWords);
  state.shorts = data.shorts || [];
  state.abtests = data.abtests || [];
  state.weekly = weeklyMap(data.weekly);
  state.stats = data.stats || [];
  await db.replaceAll({
    videos: state.videos,
    shorts: state.shorts,
    abtests: state.abtests,
    weekly: Object.values(state.weekly),
    stats: state.stats,
    kv: { channels, checklist: state.checklist, theme: state.theme, titleWords: state.titleWords, seeded: true },
  });
  emit('all');
}
