export function getScreenProtectionDisabled(
  value: string | undefined = process.env.VINKUP_DISABLE_SCREEN_PROTECTION
): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  throw new Error(`VINKUP_DISABLE_SCREEN_PROTECTION must be "true" or "false", got "${value}"`);
}
