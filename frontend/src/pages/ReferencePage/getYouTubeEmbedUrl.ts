export function getYouTubeEmbedUrl(embedUrl: string, origin = window.location.origin): string {
  const url = new URL(embedUrl);
  if (
    url.protocol === 'https:' &&
    (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') &&
    url.pathname.startsWith('/embed/')
  ) {
    url.searchParams.set('origin', origin);
  }
  return url.toString();
}
