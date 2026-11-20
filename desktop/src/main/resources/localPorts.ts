import { isPortListening } from '../workspace/process';

/** Matches the workspace port scanner, so both agree within a couple of seconds. */
const DEFAULT_POLL_MS = 2_000;

export type LocalPortProbe = (port: number) => Promise<boolean>;

/** One app-managed static preview server; the disposer unregisters exactly that server. */
export type StaticPreviewRegistration = {
  port: number;
  dispose(): void;
};

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
 * accept connections, dev servers the workspace manager reported as open
 * (`server-ready`), and explicitly registered app-managed static preview servers.
 * Static previews are registered with their real server lifecycle, not inferred
 * from URL-looking terminal output, so a stale port cannot authorize a later
 * process that happens to reuse it. Everything else local is refused.
 */
export class LocalServicePorts {
  /** Configured candidates that answered a probe on the last poll. */
  private listening = new Set<number>();
  /** Ports announced by a task workspace; the manager already verified them. */
  private workspace = new Set<number>();
  /** App-managed static previews, keyed by port so each server owns its registration. */
  private staticPreview = new Map<number, { token: number; isActive: () => boolean }>();
  private nextStaticPreviewToken = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private probing = false;

  constructor(private readonly options: LocalServicePortsOptions) {}

  /** The ports that are open right now. Callers only read, never mutate it. */
  snapshot(): ReadonlySet<number> {
    return new Set([...this.listening, ...this.workspace, ...this.activeStaticPorts()]);
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

  /**
   * Trusts the exact port of an application-created static preview server. The
   * returned disposer must be called when that server stops; `isActive` is an
   * additional guard so a server that dies without notification is dropped on
   * the next poll instead of authorizing whatever later binds the same port.
   */
  registerStaticPreview(
    port: number,
    isActive: () => boolean = () => true
  ): StaticPreviewRegistration {
    if (!isValidPort(port)) return { port, dispose: () => undefined };

    const existing = this.staticPreview.get(port);
    if (existing?.isActive()) return { port, dispose: () => undefined };

    const token = ++this.nextStaticPreviewToken;
    this.staticPreview.set(port, { token, isActive });
    this.emit();

    return {
      port,
      dispose: () => {
        // A stale disposer must not remove a newer registration for the same port.
        if (this.staticPreview.get(port)?.token !== token) return;
        this.staticPreview.delete(port);
        this.emit();
      },
    };
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
      const pruned = this.pruneInactivePreviews();
      if (samePorts(next, this.listening) && !pruned) return;
      this.listening = next;
      this.emit();
    } finally {
      this.probing = false;
    }
  }

  private activeStaticPorts(): number[] {
    const active: number[] = [];
    for (const [port, registration] of this.staticPreview) {
      if (registration.isActive()) active.push(port);
    }
    return active;
  }

  private pruneInactivePreviews(): boolean {
    let removed = false;
    for (const [port, registration] of this.staticPreview) {
      if (!registration.isActive()) {
        this.staticPreview.delete(port);
        removed = true;
      }
    }
    return removed;
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
