/** The frame URL and origin checks used by every IPC handler and navigation guard. */

export type IpcSenderLike = {
  senderFrame?: { url?: string } | null;
};

export function isTrustedUrl(url: string, trustedOrigin: string | null): boolean {
  if (!trustedOrigin) return false;
  try {
    return new URL(url).origin === trustedOrigin;
  } catch {
    return false;
  }
}

export function assertTrustedSender(event: IpcSenderLike, trustedOrigin: string | null): void {
  const senderUrl = event.senderFrame?.url;
  if (!senderUrl || !isTrustedUrl(senderUrl, trustedOrigin)) {
    throw new Error('IPC request from an untrusted frame.');
  }
}

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
