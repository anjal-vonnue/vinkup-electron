import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResourcesAllowlist } from '@itp/types';
import { parseAllowlist } from './allowlist';

const FETCH_TIMEOUT_MS = 4000;

export interface LoadAllowlistOptions {
  /** Fallback shipped inside the app. */
  bundled: ResourcesAllowlist;
  /** Centrally hosted JSON, or null to keep remote updates off. */
  remoteUrl: string | null;
  /** Last accepted remote copy, kept so an offline start still uses it. */
  cacheFile: string;
}

export interface LoadedAllowlist {
  allowlist: ResourcesAllowlist;
  /** Whether the returned copy came from the central URL or the cache. */
  source: 'bundled' | 'remote' | 'cache';
}

/**
 * Prefers the highest-versioned valid copy from the bundled file, the cache,
 * and the central URL. Any network or validation failure falls back silently so
 * the Resources browser always has an allowlist.
 */
export async function loadResourcesAllowlist(
  options: LoadAllowlistOptions
): Promise<LoadedAllowlist> {
  const cached = await readCachedAllowlist(options.cacheFile);

  let allowlist = options.bundled;
  let source: LoadedAllowlist['source'] = 'bundled';

  if (cached && cached.version > allowlist.version) {
    allowlist = cached;
    source = 'cache';
  }

  if (!options.remoteUrl) return { allowlist, source };

  const remote = await fetchAllowlist(options.remoteUrl);
  if (!remote || remote.version <= allowlist.version) return { allowlist, source };

  await writeCachedAllowlist(options.cacheFile, remote);
  return { allowlist: remote, source: 'remote' };
}

async function fetchAllowlist(url: string): Promise<ResourcesAllowlist | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseAllowlist(await response.json());
  } catch {
    return null;
  }
}

async function readCachedAllowlist(file: string): Promise<ResourcesAllowlist | null> {
  try {
    return parseAllowlist(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    return null;
  }
}

async function writeCachedAllowlist(file: string, allowlist: ResourcesAllowlist): Promise<void> {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(allowlist, null, 2)}\n`, 'utf8');
  } catch {
    // The cache is best effort; the bundled copy remains the fallback.
  }
}
