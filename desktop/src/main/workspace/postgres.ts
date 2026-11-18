import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PSQL_TIMEOUT_MS = 5_000;
const MAX_DATABASE_NAME = 63;
const DATABASE_PREFIX = 'vinkup';
/** psql connects to this database to run CREATE DATABASE and to check the server. */
const MAINTENANCE_DATABASE = 'postgres';

export type PostgresEnvironment = {
  /** The course's database, shared by every task in it. */
  database: string;
  /** A separate database for `npm test`, so tests never touch course data. */
  testDatabase: string;
  url: string;
  testUrl: string;
  /** e.g. "16.15". */
  serverVersion: string;
};

/** A setup problem the trainee has to fix. The message is shown in the Result pane. */
export class PostgresUnavailableError extends Error {}

/** The PostgreSQL course always uses the local server, from the workspace terminal. */
const POSTGRES_COURSE = 'postgresql';
/** One database for the whole PostgreSQL course; day 1 creates it with `createdb`. */
const POSTGRES_COURSE_DATABASE = 'support_tickets';
/** Day 6 runs `npm test`, so its databases must exist before the task opens. */
const POSTGRES_COURSE_SETUP_DAY = 'postgresql-day-06';

export type PostgresPlan = {
  database: string;
  testDatabase: string;
  /** Create the databases when missing, before the task starts. */
  create: boolean;
};

/**
 * True when the task needs the machine's PostgreSQL: every PostgreSQL course task, and
 * Prisma tasks. Tasks saved before the Prisma switch still use prisma-pglite and keep
 * their PGlite database.
 */
export function requiresPostgres(taskId: string, files: Record<string, string>): boolean {
  if (courseOf(taskId) === POSTGRES_COURSE) return true;
  if (!('prisma/schema.prisma' in files)) return false;
  return !dependencyNames(files['package.json']).includes('prisma-pglite');
}

/** `prisma-day-03-t-1` -> `vinkup_prisma`, shared by the whole course. */
export function databaseNameFor(taskId: string): string {
  const sanitized = courseOf(taskId)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  return `${DATABASE_PREFIX}_${sanitized}`.slice(0, MAX_DATABASE_NAME);
}

export function databasePlanFor(taskId: string): PostgresPlan {
  if (courseOf(taskId) === POSTGRES_COURSE) {
    return {
      database: POSTGRES_COURSE_DATABASE,
      testDatabase: `${POSTGRES_COURSE_DATABASE}_test`,
      // Days 1-5 teach createdb: the workspace only sets DATABASE_URL for them.
      create: taskId.startsWith(POSTGRES_COURSE_SETUP_DAY),
    };
  }

  const database = databaseNameFor(taskId);
  return {
    database,
    testDatabase: `${database}_test`.slice(0, MAX_DATABASE_NAME),
    create: true,
  };
}

/** `prisma-day-03-t-1` -> `prisma`; `postgresql-day-01-t-1` -> `postgresql`. */
function courseOf(taskId: string): string {
  return taskId.split('-day-')[0] || taskId;
}

/**
 * The connection URL the task's processes get. Without VINKUP_DATABASE_URL it uses
 * the local server over its Unix socket, where PostgreSQL's peer authentication
 * needs no password; the password in the URL is a placeholder.
 */
export function baseUrlFor(environment: NodeJS.ProcessEnv = process.env): URL {
  const configured = environment.VINKUP_DATABASE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      throw new PostgresUnavailableError(
        'VINKUP_DATABASE_URL is not a valid PostgreSQL connection URL.'
      );
    }
  }

  const user = encodeURIComponent(os.userInfo().username || 'postgres');
  // TCP on Windows: PostgreSQL does not use peer authentication there.
  const socket = process.platform === 'win32' ? '' : '?host=/var/run/postgresql';
  return new URL(`postgresql://${user}:vinkup@localhost/${MAINTENANCE_DATABASE}${socket}`);
}

export function urlFor(database: string, base: URL): string {
  const url = new URL(base.toString());
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Resolves the course database, creates it when missing and returns the
 * environment the task's processes need. Throws PostgresUnavailableError with an
 * actionable message when the machine is not ready.
 */
export async function resolvePostgresEnvironment(
  taskId: string,
  pathValue: string
): Promise<PostgresEnvironment> {
  const base = baseUrlFor();
  const configuredName = base.pathname.replace(/^\//, '');
  const useConfiguredName =
    configuredName !== '' &&
    configuredName !== MAINTENANCE_DATABASE &&
    /^[A-Za-z0-9_]+$/.test(configuredName);
  const plan = databasePlanFor(taskId);
  const database = useConfiguredName ? configuredName : plan.database;
  const testDatabase = useConfiguredName
    ? `${database}_test`.slice(0, MAX_DATABASE_NAME)
    : plan.testDatabase;
  const maintenance = urlFor(MAINTENANCE_DATABASE, base);
  const serverVersion = await verifyServer(maintenance, pathValue);
  if (plan.create) {
    await ensureDatabase(maintenance, database, pathValue);
    await ensureDatabase(maintenance, testDatabase, pathValue);
  }

  return {
    database,
    testDatabase,
    url: urlFor(database, base),
    testUrl: urlFor(testDatabase, base),
    serverVersion,
  };
}

async function verifyServer(maintenanceUrl: string, pathValue: string): Promise<string> {
  const { stdout } = await runPsql(
    maintenanceUrl,
    ['-Atqc', "select current_setting('server_version')"],
    pathValue
  );
  const version = stdout.trim();
  if (!version) throw new PostgresUnavailableError('Could not read the PostgreSQL version.');
  return version;
}

async function ensureDatabase(
  maintenanceUrl: string,
  database: string,
  pathValue: string
): Promise<void> {
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Invalid database name "${database}".`);

  const { stdout } = await runPsql(
    maintenanceUrl,
    ['-Atqc', `select 1 from pg_database where datname = '${database}'`],
    pathValue
  );
  if (stdout.trim() === '1') return;

  try {
    await runPsql(
      maintenanceUrl,
      ['-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${database}"`],
      pathValue
    );
  } catch (error) {
    // Two tasks opened at once can both try to create it.
    if (!/already exists/i.test(messageOf(error))) throw error;
  }
}

async function runPsql(
  url: string,
  args: string[],
  pathValue: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('psql', [url, ...args], {
      timeout: PSQL_TIMEOUT_MS,
      maxBuffer: 256 * 1024,
      env: { ...process.env, PATH: pathValue },
    });
    return { stdout, stderr };
  } catch (error) {
    throw describeFailure(error);
  }
}

/** Turns psql's output into a message a trainee can act on. */
function describeFailure(error: unknown): PostgresUnavailableError {
  const record = error as { code?: string; stderr?: string; message?: string };
  if (record.code === 'ENOENT') {
    return new PostgresUnavailableError(
      'PostgreSQL was not found on this machine. Install PostgreSQL 16 or newer, start it, then reopen the task.'
    );
  }

  const text = `${record.stderr ?? ''} ${record.message ?? ''}`;
  if (
    /could not connect|connection refused|no such file or directory|is the server running/i.test(
      text
    )
  ) {
    return new PostgresUnavailableError(
      'PostgreSQL is installed but its server is not running. Start PostgreSQL, then reopen the task.'
    );
  }
  if (/permission denied to create database|must be superuser/i.test(text)) {
    return new PostgresUnavailableError(
      'Your PostgreSQL user cannot create databases. Run this once in psql, then reopen the task: ' +
        'ALTER ROLE "<your user>" CREATEDB;'
    );
  }
  if (/password authentication failed|no password supplied|authentication failed/i.test(text)) {
    return new PostgresUnavailableError(
      'PostgreSQL rejected the connection. Set VINKUP_DATABASE_URL to a working PostgreSQL URL, then restart the app.'
    );
  }

  const detail = text.replace(/\s+/g, ' ').trim();
  return new PostgresUnavailableError(
    `PostgreSQL could not be used${detail ? `: ${detail.slice(0, 240)}` : '.'}`
  );
}

function messageOf(error: unknown): string {
  const record = error as { stderr?: string; message?: string };
  return `${record.stderr ?? ''} ${record.message ?? ''}`;
}

function dependencyNames(packageJson: string | undefined): string[] {
  if (!packageJson) return [];
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}
