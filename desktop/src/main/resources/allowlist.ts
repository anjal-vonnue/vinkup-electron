import type { ResourcesAllowlist, ResourcesCategory } from '@itp/types';
import bundledAllowlist from '../../../resources/resources-allowlist.json';

const MAX_INPUT_LENGTH = 2048;
const CATEGORY_ID = /^[a-z0-9-]+$/;

/**
 * Validates a bundled or remotely hosted allowlist. Anything malformed is
 * rejected as a whole rather than partially applied.
 *
 * Categories may repeat a domain; the returned `domains` list is the unique
 * union used for navigation checks.
 */
export function parseAllowlist(value: unknown): ResourcesAllowlist | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const version = record.version;
  const updatedAt = record.updatedAt;
  const rawCategories = record.categories;
  const rawDescriptions = record.descriptions;

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  if (typeof updatedAt !== 'string' || updatedAt.trim() === '') return null;
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) return null;

  const categories: ResourcesCategory[] = [];
  const domains: string[] = [];
  const categoryIds = new Set<string>();

  for (const rawCategory of rawCategories) {
    if (typeof rawCategory !== 'object' || rawCategory === null || Array.isArray(rawCategory)) {
      return null;
    }

    const category = rawCategory as Record<string, unknown>;
    const id = category.id;
    const label = category.label;
    const rawDomains = category.domains;

    if (typeof id !== 'string' || !CATEGORY_ID.test(id) || categoryIds.has(id)) return null;
    if (typeof label !== 'string' || label.trim() === '') return null;
    if (!Array.isArray(rawDomains) || rawDomains.length === 0) return null;

    const categoryDomains: string[] = [];
    for (const rawDomain of rawDomains) {
      if (typeof rawDomain !== 'string') return null;
      const domain = normalizeHost(rawDomain);
      if (!domain) return null;
      if (!categoryDomains.includes(domain)) categoryDomains.push(domain);
      if (!domains.includes(domain)) domains.push(domain);
    }
    if (categoryDomains.length === 0) return null;

    categoryIds.add(id);
    categories.push({ id, label: label.trim(), domains: categoryDomains });
  }

  if (domains.length === 0) return null;

  const descriptions = parseDescriptions(rawDescriptions, domains);
  if (!descriptions) return null;

  return { version, updatedAt, domains, categories, descriptions };
}

/**
 * Descriptions are optional so an older centrally hosted list keeps working,
 * but any entry that is present must describe a host that is actually allowed.
 */
function parseDescriptions(
  value: unknown,
  domains: readonly string[]
): Record<string, string> | null {
  if (value === undefined) return {};

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const descriptions: Record<string, string> = {};
  for (const [rawHost, rawDescription] of Object.entries(value as Record<string, unknown>)) {
    const host = normalizeHost(rawHost);
    if (!host || !domains.includes(host)) return null;
    if (typeof rawDescription !== 'string') return null;
    const description = rawDescription.trim();
    if (description === '' || description.length > 160) return null;
    descriptions[host] = description;
  }

  return descriptions;
}

/** Lowercases and trims a configured host; returns null for anything malformed. */
export function normalizeHost(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  if (host === '' || host.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (host.startsWith('.') || host.includes('..')) return null;
  return host;
}

/** A host is allowed when it matches an entry exactly or is one of its subdomains. */
export function isHostAllowed(host: string, domains: readonly string[]): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');
  if (normalized === '') return false;
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function isAllowedNavigationUrl(rawUrl: string, allowlist: ResourcesAllowlist): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    return isHostAllowed(url.hostname, allowlist.domains);
  } catch {
    return false;
  }
}

export function hostFromUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Turns the web address the student typed into a navigation target (or a rejection).
 * The renderer must treat both outcomes as authoritative; it never builds URLs
 * for the browser itself.
 */
export type ResourcesNavigationTarget =
  | { kind: 'navigate'; url: string }
  | { kind: 'blocked'; url: string; host: string }
  | { kind: 'invalid'; message: string };

export function resolveNavigationInput(
  input: string,
  allowlist: ResourcesAllowlist
): ResourcesNavigationTarget {
  const trimmed = input.trim().slice(0, MAX_INPUT_LENGTH);
  if (trimmed === '') return invalid('Enter a web address.');

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return invalid('That address is not valid.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return invalid('Only http and https addresses can be opened.');
    }
    if (url.username !== '' || url.password !== '') {
      return invalid('Addresses with a username or password are not allowed.');
    }
    return checkUrl(url, allowlist);
  }

  if (looksLikeHost(trimmed)) {
    let url: URL;
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return invalid('That address is not valid.');
    }
    return checkUrl(url, allowlist);
  }

  return invalid('Enter a web address. Searching is not available here.');
}

export function formatBlockedMessage(host: string): string {
  return `${host} is not on the approved resources list. Ask your mentor if it should be added.`;
}

function checkUrl(url: URL, allowlist: ResourcesAllowlist): ResourcesNavigationTarget {
  if (!isHostAllowed(url.hostname, allowlist.domains)) {
    return { kind: 'blocked', url: url.toString(), host: url.hostname };
  }
  return { kind: 'navigate', url: url.toString() };
}

function looksLikeHost(value: string): boolean {
  if (/\s/.test(value)) return false;
  // Something like `react.dev`, `developer.mozilla.org/en-US`, or `192.168.0.1`.
  return /^[^\s/?#]+(\.[^\s/?#.]+)+/.test(value);
}

function invalid(message: string): ResourcesNavigationTarget {
  return { kind: 'invalid', message };
}

const parsedBundledAllowlist = parseAllowlist(bundledAllowlist);

if (!parsedBundledAllowlist) {
  throw new Error('The bundled resources allowlist is invalid.');
}

export const BUNDLED_ALLOWLIST: ResourcesAllowlist = parsedBundledAllowlist;
