// Bits of UI shared by several screens.

import * as store from '../store.js';
import { ui } from '../ctx.js';
import { esc } from '../util.js';

/** <option>s for every channel; `sel` is the selected id. */
export function channelOptions(sel) {
  return store.state.channels.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

/** The channel new things go into: the picked one, else the first. */
export function defaultChannelId() {
  if (ui.channel !== 'all' && store.channel(ui.channel)) return ui.channel;
  const nonDemo = store.state.channels.find((c) => !c.demo);
  return (nonDemo || store.state.channels[0] || {}).id || '';
}

export function chDot(id) {
  const c = store.channel(id);
  return c ? `<span class="chdot" style="--c:${esc(c.color)}" title="${esc(c.name)}"></span>` : '';
}

export function chTag(id) {
  const c = store.channel(id);
  return c ? `<span class="chtag" style="--c:${esc(c.color)}">${esc(c.name)}</span>` : '';
}

/** Shown when a screen needs at least one channel. */
export function noChannelHtml(what = 'this') {
  return `<div class="panel empty"><h2>No channel yet</h2><p>Create a channel first to use ${esc(what)}.</p>
    <a class="btn primary" href="#/channels/new">Create a channel</a></div>`;
}

export const lvlIcon = (level) => (level === 'good' ? '✓' : level === 'warn' ? '!' : '✕');
