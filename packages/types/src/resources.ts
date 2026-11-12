/**
 * The approved-site configuration for the desktop Resources browser.
 *
 * `domains` is the single source of truth: a host is allowed when it matches an
 * entry exactly or is a subdomain of one. The list can be bundled with the app
 * and overridden by a centrally hosted copy (see `VINKUP_RESOURCES_ALLOWLIST_URL`).
 */
export interface ResourcesAllowlist {
  /** Monotonic version used to decide whether a remote copy is newer. */
  version: number;
  /** ISO date of the last change, shown in the UI and logs. */
  updatedAt: string;
  /** Approved hosts. Subdomains are allowed automatically. */
  domains: string[];
}

/** Rectangle (in window content coordinates) where the embedded browser draws. */
export interface ResourcesBrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything the Resources page needs to render its toolbar and panels. */
export interface ResourcesBrowserState {
  /** Current page URL, or an empty string before the first visit. */
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** True when the start page (approved sites) should be visible. */
  isHome: boolean;
  /** True when the last navigation was rejected by the allowlist. */
  isBlocked: boolean;
  blockedUrl: string | null;
  blockedHost: string | null;
  /** Human-readable load failure, if the last load did not finish. */
  error: string | null;
}
