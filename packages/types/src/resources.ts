/**
 * The approved-site configuration for the desktop Resources browser.
 *
 * Sites are grouped into categories for the start page. A site may appear in
 * more than one category; `domains` is the flattened union used for
 * enforcement. A host is allowed when it matches an entry exactly or is a
 * subdomain of one.
 */
export interface ResourcesCategory {
  /** Stable slug used as the React key and for future deep links. */
  id: string;
  /** Human-readable heading shown on the Resources page. */
  label: string;
  /** Approved hosts in this category. Subdomains are allowed automatically. */
  domains: string[];
}

export interface ResourcesAllowlist {
  /** Monotonic version used to decide whether a remote copy is newer. */
  version: number;
  /** ISO date of the last change, shown in the UI and logs. */
  updatedAt: string;
  /** Flattened, unique hosts from every category. Navigation checks use this. */
  domains: string[];
  categories: ResourcesCategory[];
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
