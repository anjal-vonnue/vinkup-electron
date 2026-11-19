import { vi } from 'vitest';
import type { RealtimeEvent } from '@itp/types';

/**
 * jsdom has no EventSource. Tests install this in its place and drive the stream
 * by hand (see `installFakeEventSource`).
 */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emitOpen(): void {
    this.onopen?.();
  }

  emit(event: RealtimeEvent | string): void {
    this.onmessage?.({ data: typeof event === 'string' ? event : JSON.stringify(event) });
  }
}

export type FakeEventSourceHandle = {
  /** The newest stream the provider opened, if any. */
  readonly source: FakeEventSource | null;
};

/** Replaces the global EventSource for the current test. */
export function installFakeEventSource(): FakeEventSourceHandle {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  return {
    get source() {
      return FakeEventSource.instances.at(-1) ?? null;
    },
  };
}
