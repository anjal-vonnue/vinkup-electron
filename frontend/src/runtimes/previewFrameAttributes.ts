import type { IframeHTMLAttributes } from 'react';

/**
 * The app shell is served with COOP/COEP `credentialless` (the WebContainer fallback
 * needs cross-origin isolation). Under that policy Chromium blocks cross-origin iframe
 * navigation with ERR_BLOCKED_BY_RESPONSE unless the frame opts in with this attribute.
 * It only makes the frame's requests credentialless; it grants no sandbox permissions.
 * Browsers without support ignore it.
 */
export const CREDENTIALLESS_IFRAME = {
  credentialless: true,
} as unknown as IframeHTMLAttributes<HTMLIFrameElement>;
