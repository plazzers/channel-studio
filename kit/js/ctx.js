// Shared UI context: which channel is shown ("all" or a channel id).

import { pref } from './util.js';

export const ui = { channel: pref.get('channel', 'all') };

export function setChannelFilter(id) {
  ui.channel = id;
  pref.set('channel', id);
}

export const matchesChannel = (rec) => ui.channel === 'all' || rec.channelId === ui.channel;
