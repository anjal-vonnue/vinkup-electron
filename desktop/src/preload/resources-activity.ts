/// <reference lib="dom" />

import { ipcRenderer } from 'electron';

// One ping per second — a long scroll fires wheel/move dozens of times.
const ACTIVITY_THROTTLE_MS = 1_000;
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
  'pointerdown',
] as const;

let lastSentAt = 0;

function reportActivity(): void {
  const now = Date.now();
  if (now - lastSentAt < ACTIVITY_THROTTLE_MS) return;
  lastSentAt = now;
  ipcRenderer.send('resources:activity');
}

function attach(): void {
  // `capture: true` so pages that stop propagation on wheel/scroll can't swallow it.
  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, reportActivity, { passive: true, capture: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attach, { once: true });
} else {
  attach();
}
