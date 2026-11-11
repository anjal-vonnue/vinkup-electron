import type { DesktopApi } from '@itp/types';

declare global {
  interface Window {
    /** Present only when the frontend runs inside the Electron shell. */
    desktop?: DesktopApi;
  }
}

export {};
