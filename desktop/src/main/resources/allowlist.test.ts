import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { ResourcesAllowlist } from '@itp/types';
import {
  BUNDLED_ALLOWLIST,
  isAllowedNavigationUrl,
  isHostAllowed,
  parseAllowlist,
  resolveNavigationInput,
} from './allowlist';
import { LocalServicePorts } from './localPorts';

const allowlist: ResourcesAllowlist = {
  version: 3,
  updatedAt: '2026-01-01',
  domains: ['developer.mozilla.org', 'github.com'],
  categories: [
    { id: 'html', label: 'HTML', domains: ['developer.mozilla.org'] },
    { id: 'git', label: 'Git & GitHub', domains: ['github.com'] },
  ],
  descriptions: {
    'developer.mozilla.org': 'MDN — the reference for HTML, CSS and JavaScript.',
    'github.com': 'Host repositories and review code.',
  },
};

describe('isHostAllowed', () => {
  it('accepts an exact host and its subdomains', () => {
    expect(isHostAllowed('github.com', allowlist.domains)).toBe(true);
    expect(isHostAllowed('docs.github.com', allowlist.domains)).toBe(true);
    expect(isHostAllowed('api.github.com', allowlist.domains)).toBe(true);
  });

  it('does not accept look-alike or parent domains', () => {
    expect(isHostAllowed('notgithub.com', allowlist.domains)).toBe(false);
    expect(isHostAllowed('github.com.evil.test', allowlist.domains)).toBe(false);
    expect(isHostAllowed('com', allowlist.domains)).toBe(false);
  });

  it('ignores case and a trailing dot', () => {
    expect(isHostAllowed('GitHub.COM.', allowlist.domains)).toBe(true);
  });
});

describe('resolveNavigationInput', () => {
  it('turns a bare host into an https URL', () => {
    expect(resolveNavigationInput('github.com', allowlist)).toEqual({
      kind: 'navigate',
      url: 'https://github.com/',
    });
  });

  it('keeps the path of an allowed address', () => {
    expect(resolveNavigationInput('developer.mozilla.org/en-US/docs/Web', allowlist)).toEqual({
      kind: 'navigate',
      url: 'https://developer.mozilla.org/en-US/docs/Web',
    });
  });

  it('accepts an allowed http URL', () => {
    expect(resolveNavigationInput('http://github.com/vinkup', allowlist)).toEqual({
      kind: 'navigate',
      url: 'http://github.com/vinkup',
    });
  });

  it('blocks a host outside the allowlist', () => {
    expect(resolveNavigationInput('https://example.com/lesson', allowlist)).toEqual({
      kind: 'blocked',
      url: 'https://example.com/lesson',
      host: 'example.com',
    });
  });

  it('blocks dangerous or non-web schemes', () => {
    expect(resolveNavigationInput('javascript:alert(1)', allowlist).kind).toBe('invalid');
    expect(resolveNavigationInput('file:///etc/passwd', allowlist).kind).toBe('invalid');
    expect(resolveNavigationInput('data:text/html,hi', allowlist).kind).toBe('invalid');
  });

  it('rejects URLs that carry credentials', () => {
    expect(resolveNavigationInput('https://user:pass@github.com', allowlist).kind).toBe('invalid');
  });

  it('rejects plain text instead of searching', () => {
    expect(resolveNavigationInput('react hooks', allowlist).kind).toBe('invalid');
    expect(resolveNavigationInput('how do I center a div', allowlist).kind).toBe('invalid');
  });

  it('rejects an empty address', () => {
    expect(resolveNavigationInput('   ', allowlist).kind).toBe('invalid');
  });
});

describe('local services', () => {
  const localPorts = new Set([3000, 5173, 5555]);

  it('opens a loopback address on a port the app serves', () => {
    expect(resolveNavigationInput('http://localhost:3000/api', allowlist, localPorts)).toEqual({
      kind: 'navigate',
      url: 'http://localhost:3000/api',
    });
    expect(resolveNavigationInput('localhost:5555', allowlist, localPorts)).toEqual({
      kind: 'navigate',
      url: 'http://localhost:5555/',
    });
    expect(resolveNavigationInput('127.0.0.1:5173/', allowlist, localPorts).kind).toBe('navigate');
    expect(resolveNavigationInput('http://[::1]:3000', allowlist, localPorts).kind).toBe(
      'navigate'
    );
  });

  it('blocks loopback addresses on any other port', () => {
    expect(resolveNavigationInput('http://localhost:8080', allowlist, localPorts)).toEqual({
      kind: 'blocked',
      url: 'http://localhost:8080/',
      host: 'localhost:8080',
    });
    // No scheme and no allowed port: still local, still refused.
    expect(resolveNavigationInput('localhost:9000', allowlist, localPorts).kind).toBe('blocked');
    // The protocol default is not one of the app's ports.
    expect(resolveNavigationInput('http://localhost', allowlist, localPorts).kind).toBe('blocked');
    // Without a running port list, every local address is blocked.
    expect(resolveNavigationInput('localhost:3000', allowlist).kind).toBe('blocked');
  });

  it('does not treat a look-alike host as loopback', () => {
    expect(
      resolveNavigationInput('http://localhost.evil.test:3000', allowlist, localPorts).kind
    ).toBe('blocked');
    expect(resolveNavigationInput('http://127.0.0.1.nip.io:3000', allowlist, localPorts).kind).toBe(
      'blocked'
    );
  });

  it('applies the same rule to links, redirects and popups', () => {
    expect(isAllowedNavigationUrl('http://localhost:3000/admin', allowlist, localPorts)).toBe(true);
    expect(isAllowedNavigationUrl('http://127.0.0.1:5555/', allowlist, localPorts)).toBe(true);
    expect(isAllowedNavigationUrl('http://localhost:9999/', allowlist, localPorts)).toBe(false);
    expect(isAllowedNavigationUrl('http://example.com:3000/', allowlist, localPorts)).toBe(false);
  });
});

async function listenOn(server: Server, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('Server did not bind');
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function navigationRegistry() {
  return new LocalServicePorts({
    candidates: [],
    probe: () => Promise.resolve(false),
    pollMs: 10,
  });
}

describe('trusted static preview navigation', () => {
  it('opens the registered HTML preview URL but not arbitrary loopback ports', () => {
    const ports = navigationRegistry();
    const registration = ports.registerStaticPreview(4100);

    expect(resolveNavigationInput('http://127.0.0.1:4100', allowlist, ports.snapshot())).toEqual({
      kind: 'navigate',
      url: 'http://127.0.0.1:4100/',
    });
    expect(resolveNavigationInput('localhost:4100/index.html', allowlist, ports.snapshot()).kind)
      .toBe('navigate');
    expect(resolveNavigationInput('http://localhost:8080', allowlist, ports.snapshot()).kind).toBe(
      'blocked'
    );

    registration.dispose();
    expect(resolveNavigationInput('http://127.0.0.1:4100', allowlist, ports.snapshot()).kind).toBe(
      'blocked'
    );
    ports.dispose();
  });

  it('blocks a user-started HTTP server on an unregistered port', async () => {
    const ports = navigationRegistry();
    const server = createServer((_request, response) => response.end('user server'));
    try {
      const port = await listenOn(server);
      // The service is really there; the browser policy still refuses to open it.
      expect((await fetch(`http://127.0.0.1:${port}`)).ok).toBe(true);
      expect(resolveNavigationInput(`localhost:${port}`, allowlist, ports.snapshot())).toEqual({
        kind: 'blocked',
        url: `http://localhost:${port}/`,
        host: `localhost:${port}`,
      });
    } finally {
      await closeServer(server);
      ports.dispose();
    }
  });

  it('keeps terminal-discovered React ports on their existing path', () => {
    const ports = navigationRegistry();
    const preview = ports.registerStaticPreview(4100);

    // React's dev server is still trusted only through markOpen/markClosed.
    ports.markOpen(5173);
    expect(resolveNavigationInput('localhost:5173', allowlist, ports.snapshot()).kind).toBe(
      'navigate'
    );
    ports.markClosed(5173);
    expect(resolveNavigationInput('localhost:5173', allowlist, ports.snapshot()).kind).toBe(
      'blocked'
    );
    // Revoking the static preview must not disturb the terminal port set.
    preview.dispose();
    ports.markOpen(5173);
    expect(resolveNavigationInput('localhost:5173', allowlist, ports.snapshot()).kind).toBe(
      'navigate'
    );
    ports.dispose();
  });

  it('does not authorize a different server that reuses a revoked port', async () => {
    const ports = navigationRegistry();
    const first = createServer((_request, response) => response.end('first'));
    const second = createServer((_request, response) => response.end('second'));
    try {
      const port = await listenOn(first);
      const registration = ports.registerStaticPreview(port, () => first.listening);
      expect(resolveNavigationInput(`localhost:${port}`, allowlist, ports.snapshot()).kind).toBe(
        'navigate'
      );

      registration.dispose();
      await closeServer(first);
      await listenOn(second, port);
      expect((await fetch(`http://127.0.0.1:${port}`)).ok).toBe(true);
      expect(resolveNavigationInput(`localhost:${port}`, allowlist, ports.snapshot()).kind).toBe(
        'blocked'
      );
    } finally {
      if (first.listening) await closeServer(first);
      if (second.listening) await closeServer(second);
      ports.dispose();
    }
  });
});

describe('parseAllowlist', () => {
  it('accepts the bundled file, has no search provider, and describes its sites', () => {
    const parsed = parseAllowlist(BUNDLED_ALLOWLIST);
    expect(parsed).not.toBeNull();
    expect(parsed?.domains).not.toContain('duckduckgo.com');
    expect(parsed?.categories.length).toBeGreaterThan(0);
    expect(parsed?.descriptions['developer.mozilla.org']).toMatch(/MDN/);
    // Every allowed host has a description so the cards never look empty.
    const descriptions = parsed?.descriptions ?? {};
    const domains = parsed?.domains ?? [];
    expect(Object.keys(descriptions).sort()).toEqual([...domains].sort());
  });

  it('builds a unique domain union from categories that repeat sites', () => {
    const parsed = parseAllowlist({
      version: 2,
      updatedAt: '2026-01-01',
      categories: [
        { id: 'html', label: 'HTML', domains: ['GitHub.com', 'github.com'] },
        { id: 'git', label: 'Git & GitHub', domains: ['github.com', 'docs.github.com.'] },
      ],
    });

    expect(parsed?.domains).toEqual(['github.com', 'docs.github.com']);
    expect(parsed?.categories[0]?.domains).toEqual(['github.com']);
    expect(parsed?.categories[1]?.domains).toEqual(['github.com', 'docs.github.com']);
  });

  it('rejects malformed or incomplete data', () => {
    expect(parseAllowlist(null)).toBeNull();
    expect(parseAllowlist({ ...allowlist, version: '2' })).toBeNull();
    expect(parseAllowlist({ ...allowlist, categories: [] })).toBeNull();
    expect(
      parseAllowlist({
        ...allowlist,
        categories: [{ id: 'html', label: 'HTML', domains: ['bad domain'] }],
      })
    ).toBeNull();
    expect(
      parseAllowlist({
        ...allowlist,
        categories: [{ id: 'html', label: '  ', domains: ['github.com'] }],
      })
    ).toBeNull();
    expect(
      parseAllowlist({
        ...allowlist,
        categories: [{ id: 'HTML', label: 'HTML', domains: ['github.com'] }],
      })
    ).toBeNull();
  });

  it('rejects duplicate category ids', () => {
    const parsed = parseAllowlist({
      version: 2,
      updatedAt: '2026-01-01',
      categories: [
        { id: 'html', label: 'HTML', domains: ['github.com'] },
        { id: 'html', label: 'HTML again', domains: ['react.dev'] },
      ],
    });

    expect(parsed).toBeNull();
  });

  it('keeps valid descriptions and defaults to none', () => {
    expect(parseAllowlist(allowlist)?.descriptions['github.com']).toBe(
      'Host repositories and review code.'
    );

    const withoutDescriptions = parseAllowlist({
      version: 2,
      updatedAt: '2026-01-01',
      categories: [{ id: 'html', label: 'HTML', domains: ['github.com'] }],
    });
    expect(withoutDescriptions?.descriptions).toEqual({});
  });

  it('rejects descriptions for unknown hosts or with empty text', () => {
    expect(
      parseAllowlist({ ...allowlist, descriptions: { 'example.com': 'Not approved.' } })
    ).toBeNull();
    expect(parseAllowlist({ ...allowlist, descriptions: { 'github.com': '   ' } })).toBeNull();
    expect(parseAllowlist({ ...allowlist, descriptions: ['nope'] })).toBeNull();
  });
});
