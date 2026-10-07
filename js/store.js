// App state kept in memory and written through to IndexedDB.

import * as db from './db.js';
import { DEFAULT_CHANNELS, DEFAULT_CHECKLIST } from '../data/channels.js';
import { seedVideos } from '../data/seed.js';

export const BACKUP_APP = 'channel-studio';
export const BACKUP_VERSION = 1;

const clone = (o) => JSON.parse(JSON.stringify(o));

export const state = {
  videos: [],
  channels: clone(DEFAULT_CHANNELS),
  checklist: clone(DEFAULT_CHECKLIST),
  theme: 'system',
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
  return out;
}

export async function load() {
  const [videos, channels, checklist, theme, seeded] = await Promise.all([
    db.getAll('videos'),
    db.getKV('channels'),
    db.getKV('checklist'),
    db.getKV('theme'),
    db.getKV('seeded'),
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
}

export async function resetDemo() {
  state.videos = seedVideos();
  state.channels = clone(DEFAULT_CHANNELS);
  state.checklist = clone(DEFAULT_CHECKLIST);
  await db.replaceAll({
    videos: state.videos,
    kv: { channels: state.channels, checklist: state.checklist, theme: state.theme, seeded: true },
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

export function uid() {
  return 'v-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
  state.videos = state.videos.filter((v) => v.id !== id);
  await db.del('videos', id);
  emit('videos');
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
    settings: { channels: state.channels, checklist: state.checklist, theme: state.theme },
  };
}

/** Check a backup file. Returns an error message, or '' when it looks fine. */
export function checkBackup(data) {
  if (!data || typeof data !== 'object') return 'This file is not a Channel Studio backup.';
  if (data.app !== BACKUP_APP) return 'This file is not a Channel Studio backup.';
  if (!Array.isArray(data.videos)) return 'The backup has no videos list.';
  if (data.videos.some((v) => !v || typeof v.id !== 'string' || !v.channel)) return 'Some videos in the backup are broken.';
  if (!data.settings || typeof data.settings.channels !== 'object') return 'The backup has no channel settings.';
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
  await db.replaceAll({
    videos: state.videos,
    kv: { channels, checklist: state.checklist, theme: state.theme, seeded: true },
  });
  emit('all');
}
