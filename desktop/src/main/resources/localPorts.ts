import { isPortListening } from '../workspace/process';

/** Matches the workspace port scanner, so both agree within a couple of seconds. */
const DEFAULT_POLL_MS = 2_000;

export type LocalPortProbe = (port: number) => Promise<boolean>;

export type LocalServicePortsOptions = {
  /** Ports of the app's own fixed services (backend, React dev server, Prisma Studio). */
  candidates: readonly number[];
  /** Overridable for tests; defaults to a real TCP connection. */
  probe?: LocalPortProbe;
  pollMs?: number;
  /** Called whenever the set of open local ports changes. */
  onUpdate?: (ports: ReadonlySet<number>) => void;
};

/**
 * The loopback ports the Resources browser is allowed to open.
 *
 * Only ports the app itself uses count: the fixed dev-service ports while they
 * accept connections, plus dev servers the workspace manager reported as open
 * (`server-ready`). Everything else on the trainee's machine is refused, so the
 * allowlist does not become a way to reach arbitrary local services.
 */
export class LocalServicePorts {
  /** Configured candidates that answered a probe on the last poll. */
  private listening = new Set<number>();
  /** Ports announced by a task workspace; the manager already verified them. */
  private workspace = new Set<number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private probing = false;

  constructor(private readonly options: LocalServicePortsOptions) {}

  /** The ports that are open right now. Callers only read, never mutate it. */
  snapshot(): ReadonlySet<number> {
    return new Set([...this.listening, ...this.workspace]);
  }

  /** A dev server in a task workspace started accepting connections. */
  markOpen(port: number): void {
    if (!isValidPort(port) || this.workspace.has(port)) return;
    this.workspace.add(port);
    this.emit();
  }

  /** A workspace dev server stopped, so its port is no longer open. */
  markClosed(port: number): void {
    if (this.workspace.delete(port)) this.emit();
  }

  start(): void {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.options.pollMs ?? DEFAULT_POLL_MS);
    // The registry must never keep the app alive on its own.
    this.timer.unref?.();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.probing) return;
    this.probing = true;
    try {
      const probe = this.options.probe ?? isPortListening;
      const next = new Set<number>();
      for (const port of this.options.candidates) {
        if (await probe(port)) next.add(port);
      }
      if (samePorts(next, this.listening)) return;
      this.listening = next;
      this.emit();
    } finally {
      this.probing = false;
    }
  }

  private emit(): void {
    this.options.onUpdate?.(this.snapshot());
  }
}

function samePorts(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const port of a) {
    if (!b.has(port)) return false;
  }
  return true;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}
