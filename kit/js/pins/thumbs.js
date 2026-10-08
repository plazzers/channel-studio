// Small preview images of pins, rendered one at a time and cached.

import { renderPin } from './render.js';
import * as store from '../store.js';

const cache = new Map(); // key -> object URL
let queue = Promise.resolve();

export const brandFor = (pin) => (store.channel(pin.channelId) || {}).brand || {};

function keyOf(pin) {
  const c = store.channel(pin.channelId) || {};
  return `${pin.id}|${pin.updatedAt || ''}|${c.updatedAt || ''}`;
}

/** Object URL of a 300x450 JPEG preview. */
export function thumbFor(pin) {
  const key = keyOf(pin);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const job = queue.then(async () => {
    if (cache.has(key)) return cache.get(key);
    const { canvas } = await renderPin(pin, brandFor(pin));
    const small = document.createElement('canvas');
    small.width = 300;
    small.height = 450;
    const ctx = small.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, 300, 450);
    const blob = await new Promise((r) => small.toBlob(r, 'image/jpeg', 0.85));
    const url = URL.createObjectURL(blob);
    cache.set(key, url);
    return url;
  });
  queue = job.catch(() => null);
  return job;
}

/** Fill every <img data-thumb="pinId"> inside root. */
export function fillThumbs(root) {
  for (const img of root.querySelectorAll('img[data-thumb]')) {
    const pin = store.pin(img.dataset.thumb);
    if (!pin) continue;
    thumbFor(pin).then((url) => {
      if (url && img.isConnected) img.src = url;
    });
  }
}
