import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  PostgresUnavailableError,
  baseUrlFor,
  databaseNameFor,
  requiresPostgres,
  resolvePostgresEnvironment,
  urlFor,
} from './postgres';

const TEST_TASK_ID = 'it-course-day-01-t-1';
const TEST_DATABASE = databaseNameFor(TEST_TASK_ID);
const TEST_DATABASE_TEST = `${TEST_DATABASE}_test`;

const packageJson = (deps: Record<string, string>) => JSON.stringify({ dependencies: deps });

function maintenanceUrl(): string {
  return urlFor('postgres', baseUrlFor());
}

function psql(sql: string): void {
  execFileSync('psql', [maintenanceUrl(), '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    stdio: 'pipe',
    timeout: 5_000,
  });
}

function postgresAvailable(): boolean {
  try {
    execFileSync('psql', [maintenanceUrl(), '-Atqc', 'select 1'], {
      stdio: 'pipe',
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function dropTestDatabases(): void {
  try {
    psql(`DROP DATABASE IF EXISTS "${TEST_DATABASE_TEST}"`);
    psql(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
  } catch {
    // Best effort: a leftover database does not fail the suite.
  }
}

describe('databaseNameFor', () => {
  it('uses one database for a whole course', () => {
    expect(databaseNameFor('prisma-day-01-t-1')).toBe('vinkup_prisma');
    expect(databaseNameFor('prisma-day-08-t-2')).toBe('vinkup_prisma');
  });

  it('sanitizes ids and fits PostgreSQL name limits', () => {
    expect(databaseNameFor('Some-Course-day-01-t-1')).toBe('vinkup_some_course');
    expect(databaseNameFor('a'.repeat(80)).length).toBeLessThanOrEqual(63);
  });
});

describe('requiresPostgres', () => {
  it('is true for the current Prisma starter', () => {
    expect(
      requiresPostgres({
        'prisma/schema.prisma': 'model Ticket {}',
        'package.json': packageJson({ '@prisma/adapter-pg': '7.10.0' }),
      })
    ).toBe(true);
  });

  it('does not steal tasks saved with the old PGlite helpers', () => {
    expect(
      requiresPostgres({
        'prisma/schema.prisma': 'model Ticket {}',
        'package.json': packageJson({ 'prisma-pglite': '^3.0.2' }),
      })
    ).toBe(false);
  });

  it('is false for tasks without a Prisma schema', () => {
    expect(requiresPostgres({ 'index.js': 'console.log(1)' })).toBe(false);
  });
});

describe('connection URLs', () => {
  it('defaults to the local Unix socket with peer authentication', () => {
    const url = baseUrlFor({});
    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe('localhost');
    expect(url.searchParams.get('host')).toBe('/var/run/postgresql');
    expect(url.password).not.toBe('');
  });

  it('uses VINKUP_DATABASE_URL when it is set', () => {
    const url = baseUrlFor({ VINKUP_DATABASE_URL: 'postgresql://admin:secret@db:5432/course' });
    expect(url.hostname).toBe('db');
    expect(url.port).toBe('5432');
    expect(urlFor('other', url)).toBe('postgresql://admin:secret@db:5432/other');
  });

  it('rejects a malformed override instead of guessing', () => {
    expect(() => baseUrlFor({ VINKUP_DATABASE_URL: 'not a url' })).toThrow(
      PostgresUnavailableError
    );
  });
});

describe('resolvePostgresEnvironment', () => {
  it('reports a missing psql with an actionable message', async () => {
    await expect(resolvePostgresEnvironment(TEST_TASK_ID, '/nonexistent')).rejects.toThrow(
      /PostgreSQL was not found/
    );
  });

  const describePostgres = postgresAvailable() ? describe : describe.skip;

  describePostgres('with a running server', () => {
    it('creates the course and test databases and returns their URLs', async () => {
      dropTestDatabases();
      const environment = await resolvePostgresEnvironment(TEST_TASK_ID, process.env.PATH ?? '');

      expect(environment.database).toBe(TEST_DATABASE);
      expect(environment.testDatabase).toBe(TEST_DATABASE_TEST);
      expect(environment.url).toContain(`/${TEST_DATABASE}?`);
      expect(environment.testUrl).toContain(`/${TEST_DATABASE_TEST}?`);
      expect(environment.serverVersion).toMatch(/^\d+/);

      const existing = execFileSync(
        'psql',
        [
          maintenanceUrl(),
          '-Atqc',
          `select datname from pg_database where datname like 'vinkup_it_course%'`,
        ],
        { encoding: 'utf8', timeout: 5_000 }
      );
      expect(existing).toContain(TEST_DATABASE);
      expect(existing).toContain(TEST_DATABASE_TEST);

      dropTestDatabases();
    });

    it('is safe to call again for an open task', async () => {
      dropTestDatabases();
      const first = await resolvePostgresEnvironment(TEST_TASK_ID, process.env.PATH ?? '');
      const second = await resolvePostgresEnvironment(TEST_TASK_ID, process.env.PATH ?? '');
      expect(second.url).toBe(first.url);
      dropTestDatabases();
    });
  });
});
