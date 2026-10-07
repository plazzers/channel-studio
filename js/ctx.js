// Shared UI context: the global channel filter and the "copy current output"
// action used by Cmd/Ctrl+Enter.

import { pref } from './util.js';

export const ui = {
  channel: pref.get('channel', 'both'), // 'both' | 'walter' | 'sal'
  copyCurrent: null, // set by the view that shows a copyable output
};

const channelListeners = new Set();
export const onChannelChange = (fn) => channelListeners.add(fn);

export function setChannelFilter(ch) {
  ui.channel = ch;
  pref.set('channel', ch);
  channelListeners.forEach((fn) => fn(ch));
}

export const matchesChannel = (v) => ui.channel === 'both' || v.channel === ui.channel;
