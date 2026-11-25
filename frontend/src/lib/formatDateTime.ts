const IST_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', // the platform's calendar day, same as todayKey()
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const IST_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "17:42" in the platform's timezone (Asia/Kolkata). "—" for a bad value. */
export function formatIstTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : IST_TIME.format(date);
}

/** "22 Oct 2026, 17:42" in the platform's timezone (Asia/Kolkata). "—" for a bad value. */
export function formatIstDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : IST_DATE_TIME.format(date);
}
