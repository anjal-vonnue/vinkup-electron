import { describe, it, expect } from 'vitest';
import { assertTrustedSender, isAllowedExternalUrl, isSameOrigin, isTrustedUrl } from './security';

describe('isTrustedUrl', () => {
  it('accepts the exact renderer origin', () => {
    expect(isTrustedUrl('http://127.0.0.1:43110/tasks/1', 'http://127.0.0.1:43110')).toBe(true);
  });

  it('rejects a different port, host or protocol', () => {
    expect(isTrustedUrl('http://127.0.0.1:43111/', 'http://127.0.0.1:43110')).toBe(false);
    expect(isTrustedUrl('http://localhost:43110/', 'http://127.0.0.1:43110')).toBe(false);
    expect(isTrustedUrl('https://127.0.0.1:43110/', 'http://127.0.0.1:43110')).toBe(false);
  });

  it('rejects malformed URLs and a missing trusted origin', () => {
    expect(isTrustedUrl('not a url', 'http://127.0.0.1:43110')).toBe(false);
    expect(isTrustedUrl('http://127.0.0.1:43110/', null)).toBe(false);
  });
});

describe('assertTrustedSender', () => {
  it('allows a frame on the renderer origin', () => {
    expect(() =>
      assertTrustedSender(
        { senderFrame: { url: 'http://127.0.0.1:43110/' } },
        'http://127.0.0.1:43110'
      )
    ).not.toThrow();
  });

  it('rejects a frame on another origin', () => {
    expect(() =>
      assertTrustedSender(
        { senderFrame: { url: 'https://evil.example/' } },
        'http://127.0.0.1:43110'
      )
    ).toThrow(/untrusted frame/);
  });

  it('rejects a missing frame', () => {
    expect(() => assertTrustedSender({}, 'http://127.0.0.1:43110')).toThrow(/untrusted frame/);
  });
});

describe('external URL rules', () => {
  it('only allows http and https', () => {
    expect(isAllowedExternalUrl('https://vinkup.test')).toBe(true);
    expect(isAllowedExternalUrl('http://localhost:3000')).toBe(true);
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('vinkup://callback')).toBe(false);
  });

  it('compares origins, not full URLs', () => {
    expect(isSameOrigin('http://localhost:3000/api/auth', 'http://localhost:3000')).toBe(true);
    expect(isSameOrigin('http://localhost:3001/api/auth', 'http://localhost:3000')).toBe(false);
    expect(isSameOrigin('not a url', 'http://localhost:3000')).toBe(false);
  });
});
