import { PRISMA_PGLITE_SUPPORT_FILES } from './support/prismaPglite';

/**
 * Hidden helper files a Node task needs, written into the workspace next to the trainee's files.
 * They go in .vinkup/, which the workspace ignores, so they are never shown or saved.
 * Only for tasks saved before Prisma moved to the machine's PostgreSQL: they still
 * depend on prisma-pglite. New Prisma tasks need no hidden files.
 */
export function supportFilesFor(files: Record<string, string>): Record<string, string> {
  return dependsOn(files['package.json'], 'prisma-pglite') ? PRISMA_PGLITE_SUPPORT_FILES : {};
}

function dependsOn(packageJson: string | undefined, name: string): boolean {
  if (!packageJson) return false;
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return name in (parsed.dependencies ?? {}) || name in (parsed.devDependencies ?? {});
  } catch {
    return false; // a broken package.json: npm will say so
  }
}
