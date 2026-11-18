// Helper files the workspace writes into a Prisma task's folder.
// They live in .vinkup/, which the workspace ignores: never shown in Files, never saved.
// Trainees use the npm scripts in the task's package.json; these files do the work behind them.
//
// Why they exist (see docs/prisma-in-the-workspace.md):
// - The Prisma CLI tries to download its native schema engine, which prisma-pglite doesn't use.
//   PRISMA_SCHEMA_ENGINE_BINARY pointing at an empty placeholder file stops that.
// - prisma-pglite is driven through its functions rather than its own bin.js.
// - Its adapter only creates tables on a NEW database, so the database is recreated when
//   schema.prisma changes, like the SQL runtime does when a task's setup changes.
// The dev database (.vinkup/db/dev) is kept on disk and preserved across task reopens.

const engine = `// Points PRISMA_SCHEMA_ENGINE_BINARY at an empty placeholder file, so the Prisma CLI doesn't try
// to download its native schema engine (it can't run in the browser).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function useEnginePlaceholder() {
  mkdirSync('.vinkup', { recursive: true });
  const placeholder = resolve('.vinkup/schema-engine-placeholder');
  if (!existsSync(placeholder)) writeFileSync(placeholder, '');
  process.env.PRISMA_SCHEMA_ENGINE_BINARY = placeholder;
  return placeholder;
}
`;

const adapter = `// The database for Prisma tasks: PostgreSQL (PGlite) running inside the task's Node process.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { useEnginePlaceholder } from './engine.mjs';

const DATABASES = '.vinkup/db';

/**
 * Returns a Prisma driver adapter for a PGlite database in .vinkup/db/<name>.
 * The database is "dev", or "test" when VINKUP_DATABASE=test (tests start empty every run).
 * PGlite can't add columns to an existing database here, so it is recreated when schema.prisma changes.
 */
export async function createAdapter() {
  const name = process.env.VINKUP_DATABASE === 'test' ? 'test' : 'dev';
  const dir = join(DATABASES, name);
  const marker = dir + '.schema-hash';
  const hash = createHash('sha256').update(readFileSync('prisma/schema.prisma')).digest('hex');
  const schemaChanged = !existsSync(marker) || readFileSync(marker, 'utf8') !== hash;

  if ((name === 'test' || schemaChanged) && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    if (name !== 'test') {
      console.log('[database] schema.prisma changed, so the database was recreated (earlier rows removed).');
    }
  }
  mkdirSync(DATABASES, { recursive: true });
  writeFileSync(marker, hash);

  useEnginePlaceholder();
  const { createPgliteAdapter } = await import('prisma-pglite');
  const open = async () => createPgliteAdapter({ dbParentDirPath: DATABASES, dbDirName: name });
  try {
    return await open();
  } catch (error) {
    // A saved database can in rare cases be cut off mid-write.
    if (name === 'test' || !existsSync(dir)) throw error;
    console.log("[database] The saved database couldn't be opened, so a fresh one was created.");
    rmSync(dir, { recursive: true, force: true });
    return await open();
  }
}
`;

const cli = `// Backs the db:* npm scripts of Prisma tasks. Run from the task folder.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { useEnginePlaceholder } from './engine.mjs';

const [command, ...args] = process.argv.slice(2);
const placeholder = useEnginePlaceholder();

// Warnings the Prisma CLI prints in the browser that don't matter here.
const NOISE = [/libssl\\/openssl/, /Defaulting to "openssl/, /Please manually install OpenSSL/];

function forward(stream, out) {
  let pending = '';
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split('\\n');
    pending = lines.pop();
    for (const line of lines) {
      if (!NOISE.some((pattern) => pattern.test(line))) out.write(line + '\\n');
    }
  });
  stream.on('end', () => {
    if (pending && !NOISE.some((pattern) => pattern.test(pending))) out.write(pending);
  });
}

function prisma(prismaArgs) {
  return new Promise((done) => {
    const child = spawn('npx', ['prisma', ...prismaArgs], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, PRISMA_SCHEMA_ENGINE_BINARY: placeholder, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    });
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on('error', (error) => {
      console.error('Could not start the Prisma CLI: ' + error.message);
      done(1);
    });
    child.on('exit', (code) => done(code ?? 1));
  });
}

function migrationName() {
  const flag = args.indexOf('--name');
  return flag === -1 ? args[0] : args[flag + 1];
}

function latestMigration() {
  if (!existsSync('prisma/migrations')) return null;
  const folders = readdirSync('prisma/migrations').filter((name) => /^\\d+_/.test(name)).sort();
  return folders.length ? 'prisma/migrations/' + folders[folders.length - 1] + '/migration.sql' : null;
}

async function main() {
  switch (command) {
    case 'generate':
      return prisma(['generate', '--no-hints']);
    case 'validate':
    case 'format':
      return prisma([command]);
    case 'migrate': {
      const name = migrationName();
      if (!name) {
        console.error('Give the migration a name, for example: npm run db:migrate -- --name add_priority');
        return 1;
      }
      const { createPgliteMigration } = await import('prisma-pglite');
      await createPgliteMigration({ migrationName: name });
      console.log('Created ' + (latestMigration() ?? 'a migration in prisma/migrations') + '.');
      const code = await prisma(['generate', '--no-hints']);
      if (code === 0) console.log('Press Run: the database is recreated with the new schema.');
      return code;
    }
    case 'reset':
      rmSync('.vinkup/db', { recursive: true, force: true });
      for (const name of readdirSync('.')) {
        if (name.startsWith('.not-commit')) rmSync(name, { recursive: true, force: true });
      }
      console.log('Database deleted. Press Run (or npm run db:seed) to start on a fresh one.');
      return 0;
    default:
      console.log('Database commands:');
      console.log('  npm run db:migrate -- --name <name>   create a migration from schema.prisma');
      console.log('  npm run db:reset                      delete the database');
      console.log('  npm run db:seed                       add the sample data');
      console.log('  npm run db:generate                   regenerate the Prisma client');
      console.log('  npm run db:validate                   check schema.prisma');
      return command ? 1 : 0;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : JSON.stringify(error));
    process.exit(1);
  }
);
`;

// Types for src/db.ts, so npm run check passes without allowJs.
const adapterTypes = `// The value is passed to new PrismaClient({ adapter }).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdapter(): Promise<any>;
`;

export const PRISMA_PGLITE_SUPPORT_FILES: Record<string, string> = {
  '.vinkup/prisma/engine.mjs': engine,
  '.vinkup/prisma/adapter.mjs': adapter,
  '.vinkup/prisma/adapter.d.mts': adapterTypes,
  '.vinkup/prisma/cli.mjs': cli,
};
