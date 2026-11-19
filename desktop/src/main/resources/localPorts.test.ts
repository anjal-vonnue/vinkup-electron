import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalServicePorts } from './localPorts';

function createPorts(options: {
  candidates?: number[];
  probe?: (port: number) => Promise<boolean>;
  pollMs?: number;
}) {
  const updates: Array<ReadonlySet<number>> = [];
  const ports = new LocalServicePorts({
    candidates: options.candidates ?? [3000, 5555],
    probe: options.probe ?? (() => Promise.resolve(false)),
    pollMs: options.pollMs ?? 10,
    onUpdate: (open) => updates.push(open),
  });
  return { ports, updates };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LocalServicePorts', () => {
  it('opens only the configured ports that answer a probe', async () => {
    const open = new Set([3000]);
    const { ports, updates } = createPorts({
      probe: (port) => Promise.resolve(open.has(port)),
    });

    ports.start();
    await vi.waitFor(() => expect(ports.snapshot()).toEqual(new Set([3000])));

    open.add(5555);
    await vi.waitFor(() => expect(ports.snapshot()).toEqual(new Set([3000, 5555])));

    // A service that stops listening is removed again.
    open.delete(3000);
    await vi.waitFor(() => expect(ports.snapshot()).toEqual(new Set([5555])));
    expect(updates.at(-1)).toEqual(new Set([5555]));

    ports.dispose();
  });

  it('does not emit when nothing changed', async () => {
    let answer = true;
    const { ports, updates } = createPorts({
      candidates: [3000],
      probe: () => Promise.resolve(answer),
    });

    ports.start();
    await vi.waitFor(() => expect(updates).toHaveLength(1));

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(updates).toHaveLength(1);

    answer = false;
    await vi.waitFor(() => expect(updates).toHaveLength(2));

    ports.dispose();
  });

  it('tracks dev servers reported by task workspaces', () => {
    const { ports, updates } = createPorts({ candidates: [] });

    ports.markOpen(8080);
    expect(ports.snapshot()).toEqual(new Set([8080]));
    // The same port announced twice is still one entry.
    ports.markOpen(8080);
    expect(updates).toHaveLength(1);

    ports.markOpen(9000);
    ports.markClosed(8080);
    expect(ports.snapshot()).toEqual(new Set([9000]));
    expect(updates).toHaveLength(3);

    // Ignoring a port that was never open should not notify anyone.
    ports.markClosed(8080);
    expect(updates).toHaveLength(3);
  });

  it('ignores ports outside the valid range', () => {
    const { ports, updates } = createPorts({ candidates: [] });

    ports.markOpen(0);
    ports.markOpen(65_536);
    ports.markOpen(12.5);

    expect(ports.snapshot()).toEqual(new Set());
    expect(updates).toHaveLength(0);
  });

  it('stops polling after dispose', async () => {
    let calls = 0;
    const { ports } = createPorts({
      candidates: [3000],
      probe: () => {
        calls += 1;
        return Promise.resolve(true);
      },
    });

    ports.start();
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0));
    ports.dispose();

    const settled = calls;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).toBe(settled);
  });
});
