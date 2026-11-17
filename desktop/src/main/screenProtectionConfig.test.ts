import { afterEach, describe, expect, it, vi } from 'vitest';
import { getScreenProtectionDisabled } from './screenProtectionConfig';

describe('getScreenProtectionDisabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps screen protection enabled by default', () => {
    vi.stubEnv('VINKUP_DISABLE_SCREEN_PROTECTION', '');
    expect(getScreenProtectionDisabled()).toBe(false);
  });

  it('disables screen protection when explicitly set to true', () => {
    expect(getScreenProtectionDisabled('true')).toBe(true);
    expect(getScreenProtectionDisabled(' TRUE ')).toBe(true);
  });

  it('keeps screen protection enabled when explicitly set to false', () => {
    expect(getScreenProtectionDisabled('false')).toBe(false);
  });

  it('rejects values other than true or false', () => {
    expect(() => getScreenProtectionDisabled('yes')).toThrow(
      'VINKUP_DISABLE_SCREEN_PROTECTION must be "true" or "false"'
    );
  });
});
