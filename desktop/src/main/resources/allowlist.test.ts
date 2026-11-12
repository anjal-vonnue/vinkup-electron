import { describe, expect, it } from 'vitest';
import type { ResourcesAllowlist } from '@itp/types';
import {
  BUNDLED_ALLOWLIST,
  isHostAllowed,
  parseAllowlist,
  resolveNavigationInput,
} from './allowlist';

const allowlist: ResourcesAllowlist = {
  version: 2,
  updatedAt: '2026-01-01',
  searchUrlTemplate: 'https://duckduckgo.com/?q={query}',
  domains: ['developer.mozilla.org', 'github.com', 'duckduckgo.com'],
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

  it('turns plain text into a search', () => {
    expect(resolveNavigationInput('react hooks', allowlist)).toEqual({
      kind: 'navigate',
      url: 'https://duckduckgo.com/?q=react%20hooks',
    });
  });

  it('rejects an empty address', () => {
    expect(resolveNavigationInput('   ', allowlist).kind).toBe('invalid');
  });
});

describe('parseAllowlist', () => {
  it('accepts the bundled file and includes the search provider', () => {
    expect(parseAllowlist(BUNDLED_ALLOWLIST)).not.toBeNull();
    expect(BUNDLED_ALLOWLIST.domains).toContain('duckduckgo.com');
  });

  it('normalizes and de-duplicates domains', () => {
    const parsed = parseAllowlist({
      ...allowlist,
      domains: ['GitHub.com', 'github.com', 'docs.github.com.', 'duckduckgo.com'],
    });
    expect(parsed?.domains).toEqual(['github.com', 'docs.github.com', 'duckduckgo.com']);
  });

  it('rejects malformed or incomplete data', () => {
    expect(parseAllowlist(null)).toBeNull();
    expect(parseAllowlist({ ...allowlist, version: '2' })).toBeNull();
    expect(parseAllowlist({ ...allowlist, domains: ['bad domain'] })).toBeNull();
    expect(parseAllowlist({ ...allowlist, domains: [] })).toBeNull();
    expect(
      parseAllowlist({ ...allowlist, searchUrlTemplate: 'https://example.com/?q={query}' })
    ).toBeNull();
    expect(
      parseAllowlist({ ...allowlist, searchUrlTemplate: 'https://duckduckgo.com/?q=' })
    ).toBeNull();
  });
});
