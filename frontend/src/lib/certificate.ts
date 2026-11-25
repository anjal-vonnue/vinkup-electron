// Calendar dates on the platform are Asia/Kolkata, same as the rest of the app.
const CERTIFICATE_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/** "6 October 2026" */
export function formatCertificateDate(iso: string): string {
  return CERTIFICATE_DATE.format(new Date(iso));
}

/** "15 days" / "1 day" */
export function formatDayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "1h 23m" / "4m 05s" / "12s" — seconds are only shown under a minute. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Browsers suggest the tab title as the "Save as PDF" file name. */
export function certificateDocumentTitle(courseTitle: string, traineeName: string): string {
  return `Vinkup certificate - ${courseTitle} - ${traineeName}`;
}

/**
 * Human-readable duration for the certificate sheet.
 *   - Under an hour → minutes  ("45 minutes", "1 minute")
 *   - An hour or more → rounded whole hours ("4 hours", "1 hour")
 *
 * Rounds to the nearest hour so the sheet shows one clean number, not
 * "4h 12m". Certificate-grade precision isn't needed here — the exact
 * seconds live in the admin panel.
 */
export function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(totalSeconds / 60));
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  const rounded = Math.round(hours);
  return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`;
}
