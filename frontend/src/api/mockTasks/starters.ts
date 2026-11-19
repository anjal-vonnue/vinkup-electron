import type { TaskFile } from '@itp/types';
import { POSTGRES_SAMPLE_DATA_BY_DAY, POSTGRES_TICKET_SCHEMA } from './sqlSetup';
import type { CatalogTask, DayWorkspace } from './types';

// Starter files and runtime per course/day. Mock data only: the real backend seeds these per task.

function file(path: string, content: string): TaskFile {
  return { path, content };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

function heading(task: CatalogTask): string {
  return `${task.title}${task.isStretchGoal ? ' (stretch goal)' : ''}`;
}

// --- Browser tasks (HTML, CSS, JavaScript) ---------------------------------

function htmlStarter(task: CatalogTask): TaskFile[] {
  return [
    file(
      'index.html',
      `<!-- ${heading(task)}\n     Write your HTML here. Create more .html files with "New file" when a task asks for them. -->\n`
    ),
  ];
}

function cssStarter(task: CatalogTask): TaskFile[] {
  return [
    file(
      'index.html',
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${task.title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <h1>${task.title}</h1>
  </body>
</html>
`
    ),
    file('styles.css', `/* ${heading(task)} */\n`),
  ];
}

function jsStarter(task: CatalogTask): TaskFile[] {
  return [
    file(
      'index.html',
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${task.title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main id="app">
      <h1>${task.title}</h1>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`
    ),
    file('styles.css', `/* ${heading(task)} */\n`),
    file('script.js', `// ${heading(task)}\n// Open the Console tab to see console.log output.\n`),
  ];
}

function jsModulesStarter(task: CatalogTask): TaskFile[] {
  return [
    file(
      'index.html',
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${task.title}</title>
    <link rel="stylesheet" href="css/styles.css" />
    <script type="module" src="js/main.js"></script>
  </head>
  <body>
    <main id="app"></main>
  </body>
</html>
`
    ),
    file('css/styles.css', `/* ${heading(task)} */\n`),
    file(
      'js/main.js',
      `// ${heading(task)}\nimport { render } from './app.js';\n\nrender(document.querySelector('#app'));\n`
    ),
    file(
      'js/app.js',
      `export function render(root) {\n  root.textContent = 'Replace me with your app.';\n}\n`
    ),
  ];
}

function jestStarter(task: CatalogTask): TaskFile[] {
  return [
    file(
      'package.json',
      json({
        name: 'jest-practice',
        private: true,
        scripts: { test: 'jest', 'test:coverage': 'jest --coverage' },
        devDependencies: { jest: '^29.7.0', 'jest-environment-jsdom': '^29.7.0' },
      })
    ),
    file(
      'src/math.js',
      `// ${heading(task)}\nfunction add(a, b) {\n  return a + b;\n}\n\nmodule.exports = { add };\n`
    ),
    file(
      'src/math.test.js',
      `const { add } = require('./math');\n\ntest('adds two numbers', () => {\n  expect(add(2, 3)).toBe(5);\n});\n`
    ),
  ];
}

// --- TypeScript and Node.js ----------------------------------------------

const TSCONFIG = json({
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true, // Node runs .ts files directly (type stripping); tsc only checks types
    allowImportingTsExtensions: true,
  },
  include: ['src'],
});

const TSCONFIG_DOM = json({
  compilerOptions: {
    target: 'ES2022',
    // CommonJS so a plain `tsc` write can be run with `node dist/index.js`, which is what the
    // TypeScript lessons do. `npm run check` still type-checks only, with `tsc --noEmit`.
    module: 'commonjs',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    // Emitted files land in dist/, which the workspace ignores (never shown, never saved).
    rootDir: './src',
    outDir: './dist',
  },
  include: ['src'],
});

const JEST_TS_CONFIG = `/** @type {import('jest').Config} */\nmodule.exports = {\n  preset: 'ts-jest',\n  testEnvironment: 'node',\n};\n`;

function typescriptStarter(task: CatalogTask, withJest: boolean): TaskFile[] {
  const devDependencies: Record<string, string> = { typescript: '^5.6.3' };
  const scripts: Record<string, string> = { check: 'tsc --noEmit' };
  if (withJest) {
    Object.assign(devDependencies, {
      jest: '^29.7.0',
      'ts-jest': '^29.2.5',
      '@types/jest': '^29.5.14',
    });
    scripts.test = 'jest';
  }
  const files = [
    file(
      'package.json',
      json({ name: 'typescript-practice', private: true, scripts, devDependencies })
    ),
    file('tsconfig.json', TSCONFIG_DOM),
    file(
      'src/index.ts',
      `// ${heading(task)}\n// Run "npm run check" (or press Run) to type-check with strict mode.\n\nexport {};\n`
    ),
  ];
  if (withJest) {
    files.push(file('jest.config.js', JEST_TS_CONFIG));
    files.push(
      file(
        'src/index.test.ts',
        `describe('${task.title.replace(/'/g, '')}', () => {\n  it.todo('write your first typed test');\n});\n`
      )
    );
  }
  return files;
}

type NodeFlavour = 'cli' | 'http' | 'express';

function nodeStarter(task: CatalogTask, flavour: NodeFlavour): TaskFile[] {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {
    typescript: '^5.6.3',
    jest: '^29.7.0',
    'ts-jest': '^29.2.5',
    '@types/jest': '^29.5.14',
    '@types/node': '^22.9.0',
  };
  if (flavour === 'express') {
    dependencies.express = '^4.21.1';
    devDependencies['@types/express'] = '^4.17.21';
    devDependencies.supertest = '^7.0.0';
    devDependencies['@types/supertest'] = '^6.0.2';
  }

  const entry: Record<NodeFlavour, TaskFile> = {
    cli: file(
      'src/index.ts',
      `// ${heading(task)}\nconst [, , command] = process.argv;\n\nconsole.log(command ? \`Unknown command: \${command}\` : 'Usage: node src/index.ts <command>');\n`
    ),
    http: file(
      'src/server.ts',
      `// ${heading(task)}\nimport { createServer } from 'node:http';\n\nconst server = createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ ok: true, path: req.url }));\n});\n\nserver.listen(3000, () => console.log('Listening on http://localhost:3000'));\n`
    ),
    express: file(
      'src/app.ts',
      `// ${heading(task)}\nimport express from 'express';\n\nexport const app = express();\napp.use(express.json());\n\napp.get('/health', (_req, res) => {\n  res.json({ ok: true });\n});\n`
    ),
  };

  const scripts: Record<string, string> = { test: 'jest', check: 'tsc --noEmit' };
  if (flavour === 'cli') scripts.start = 'node src/index.ts';
  if (flavour === 'http') scripts.start = 'node src/server.ts';
  if (flavour === 'express') {
    scripts.start = 'node src/server.ts';
  }

  const files = [
    file(
      'package.json',
      json({ name: 'backend-practice', private: true, scripts, dependencies, devDependencies })
    ),
    file('tsconfig.json', TSCONFIG),
    file('jest.config.js', JEST_TS_CONFIG),
    entry[flavour],
    file(
      'src/app.test.ts',
      `describe('${task.title.replace(/'/g, '')}', () => {\n  it.todo('add at least five tests');\n});\n`
    ),
  ];
  if (flavour === 'express') {
    files.push(
      file(
        'src/server.ts',
        `import { app } from './app.ts';\n\napp.listen(3000, () => console.log('API on http://localhost:3000'));\n`
      )
    );
  }
  return files;
}

// Prisma talks to PostgreSQL on the trainee's machine. The desktop workspace creates one database
// per course (vinkup_prisma for these tasks) and passes DATABASE_URL, plus
// VINKUP_TEST_DATABASE_URL for `npm test`, in the task's environment.
function prismaStarter(task: CatalogTask): TaskFile[] {
  return [
    file(
      'package.json',
      json({
        name: 'ticket-api',
        private: true,
        type: 'module',
        scripts: {
          dev: 'prisma generate && prisma migrate deploy && tsx prisma/seed.ts && tsx src/server.ts',
          test: 'prisma generate && node scripts/prepare-test-db.mjs && vitest run',
          check: 'tsc --noEmit',
          'db:migrate': 'prisma migrate dev',
          'db:reset': 'prisma migrate reset --force',
          'db:seed': 'tsx prisma/seed.ts',
          'db:generate': 'prisma generate',
          'db:validate': 'prisma validate',
          'db:studio': 'prisma studio',
        },
        dependencies: {
          '@prisma/adapter-pg': '7.10.0',
          '@prisma/client': '7.10.0',
          express: '^4.21.1',
          pg: '^8.23.0',
        },
        devDependencies: {
          prisma: '7.10.0',
          tsx: '^4.19.2',
          typescript: '^5.6.3',
          vitest: '^2.1.4',
          supertest: '^7.0.0',
          '@types/supertest': '^6.0.2',
          '@types/express': '^4.17.21',
          '@types/node': '^22.9.0',
        },
      })
    ),
    file(
      'README.md',
      `# Ticket API

Express and Prisma on PostgreSQL. The desktop app starts the database for you: it creates
\`vinkup_prisma\` and sets \`DATABASE_URL\`, so there are no credentials or .env files to manage.
PostgreSQL 16 or newer must be installed and running on this machine.

| Command | What it does |
| --- | --- |
| Run (npm run dev) | Generates the Prisma client, applies migrations, seeds and starts the API on port 3000 |
| npm test | Runs Vitest and Supertest against a separate, empty test database |
| npm run db:migrate -- --name add_priority | Creates and applies a migration from your schema changes |
| npm run db:reset | Drops the database contents and applies the migrations again |
| npm run db:seed | Runs prisma/seed.ts |
| npm run db:generate | Regenerates the Prisma client after editing schema.prisma |
| npm run db:validate | Checks prisma/schema.prisma |
| npm run db:studio | Opens Prisma Studio on vinkup_prisma (Preview tab shows the URL) |
| npm run check | Type-checks the project |

- The whole course uses \`vinkup_prisma\`, so the next task continues with the rows and migrations
  you created here.
- \`npm test\` uses \`vinkup_prisma_test\`, also created by the app, and every test starts from empty
  tables.
- Because PostgreSQL runs on this machine, the normal Prisma commands work. \`migrate dev\` needs a
  role with permission to create databases.
`
    ),
    file(
      'prisma.config.ts',
      `import { defineConfig } from 'prisma/config';

// Prisma Studio's data browser uses the postgres.js driver, which ignores the
// ?host=/var/run/postgresql socket parameter that psql, pg and the Prisma CLI understand.
// For Studio only, give it a host-less URL and point the driver at the socket through PGHOST,
// so \`npx prisma studio\` works against the local server without a TCP password.
const url = process.env.DATABASE_URL;
let datasourceUrl = url;

if (url && process.argv.slice(2).includes('studio')) {
  const parsed = new URL(url);
  const socket = parsed.searchParams.get('host');
  if (socket) {
    process.env.PGHOST ??= socket;
    process.env.PGUSER ??= decodeURIComponent(parsed.username);
    if (parsed.port) process.env.PGPORT ??= parsed.port;
    datasourceUrl = 'postgresql:///' + decodeURIComponent(parsed.pathname.slice(1));
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: datasourceUrl },
});
`
    ),
    file(
      'prisma/schema.prisma',
      `// ${heading(task)}
generator client {
  provider = "prisma-client"
  output   = "../generated"
}

datasource db {
  provider = "postgresql"
}

model Ticket {
  id        Int      @id @default(autoincrement())
  title     String
  status    String   @default("open")
  createdAt DateTime @default(now())
}
`
    ),
    file(
      'prisma/migrations/migration_lock.toml',
      `# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"
`
    ),
    file(
      'prisma/migrations/20250101000000_init/migration.sql',
      `-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);
`
    ),
    file(
      'prisma/seed.ts',
      `import { prisma } from '../src/db.js';

// Sample data. Runs on every Run, so it only adds rows to an empty database.
const ticketCount = await prisma.ticket.count();
if (ticketCount === 0) {
  await prisma.ticket.createMany({
    data: [
      { title: 'Printer is offline' },
      { title: 'Cannot log in to the VPN', status: 'in_progress' },
      { title: 'Laptop battery drains fast', status: 'closed' },
    ],
  });
  console.log('[seed] Added 3 tickets.');
}

await prisma.$disconnect();
`
    ),
    file(
      'src/db.ts',
      `import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client.js';

// The desktop workspace sets DATABASE_URL; npm test points it at the test database instead.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Open this task in the Vinkup desktop app.');
}

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
`
    ),
    file(
      'src/app.ts',
      `import express from 'express';
import { prisma } from './db.js';

export const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.redirect('/tickets');
});

app.get('/tickets', async (_req, res, next) => {
  try {
    res.json(await prisma.ticket.findMany({ orderBy: { id: 'asc' } }));
  } catch (error) {
    next(error); // Express 4 doesn't pass errors from async routes on by itself
  }
});
`
    ),
    file(
      'src/server.ts',
      `import { app } from './app.js';

app.listen(3000, () => console.log('API on http://localhost:3000 (open the Preview tab)'));
`
    ),
    file(
      'scripts/prepare-test-db.mjs',
      `// Puts the separate test database on the current schema before npm test runs.
// The desktop workspace sets VINKUP_TEST_DATABASE_URL when it opens the task.
import { spawnSync } from 'node:child_process';

const url = process.env.VINKUP_TEST_DATABASE_URL;
if (!url) {
  console.error('VINKUP_TEST_DATABASE_URL is not set. Open this task in the Vinkup desktop app.');
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status ?? 1);
`
    ),
    file(
      'tests/setup.ts',
      [
        "import { beforeEach } from 'vitest';",
        "import { prisma } from '../src/db.js';",
        '',
        '// Every test starts from empty tables, even when a previous run left rows behind.',
        'beforeEach(async () => {',
        '  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`',
        '    SELECT tablename FROM pg_tables',
        "    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
        '  `;',
        '  if (tables.length === 0) return;',
        '  const list = tables.map((table) => `"public"."${table.tablename}"`).join(\', \');',
        '  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);',
        '});',
        '',
      ].join('\n')
    ),
    file(
      'tests/tickets.test.ts',
      `import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /tickets', () => {
  it('returns the tickets in the database', async () => {
    await prisma.ticket.create({ data: { title: 'Printer is offline' } });

    const response = await request(app).get('/tickets');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ title: 'Printer is offline', status: 'open' });
  });
});
`
    ),
    file(
      'vitest.config.ts',
      `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // A separate database, prepared before the run by scripts/prepare-test-db.mjs.
    env: { DATABASE_URL: process.env.VINKUP_TEST_DATABASE_URL ?? '' },
    fileParallelism: false, // test files share that database, so they run one at a time
  },
});
`
    ),
    file(
      'tsconfig.json',
      json({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['src', 'prisma', 'tests', 'prisma.config.ts', 'vitest.config.ts'],
      })
    ),
  ];
}

// --- React (Vite) -----------------------------------------------------------

function reactStarter(
  task: CatalogTask,
  options: { apiProxy: boolean; tests: boolean }
): TaskFile[] {
  const devDependencies: Record<string, string> = {
    vite: '^5.4.10',
    '@vitejs/plugin-react': '^4.3.3',
    typescript: '^5.6.3',
    '@types/react': '^18.3.12',
    '@types/react-dom': '^18.3.1',
  };
  const scripts: Record<string, string> = { dev: 'vite', build: 'tsc --noEmit && vite build' };
  if (options.tests) {
    Object.assign(devDependencies, {
      vitest: '^2.1.4',
      jsdom: '^25.0.1',
      '@testing-library/react': '^16.0.1',
      '@testing-library/dom': '^10.4.0',
    });
    scripts.test = 'vitest run';
  }
  const viteConfig = options.apiProxy
    ? `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\n// Calls to /api go to your API on port 3000 (the preview can't call localhost directly).\nexport default defineConfig({\n  plugins: [react()],\n  server: { proxy: { '/api': 'http://localhost:3000' } },\n});\n`
    : `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],${options.tests ? "\n  test: { environment: 'jsdom' }," : ''}\n});\n`;
  const files = [
    file(
      'package.json',
      json({
        name: 'react-practice',
        private: true,
        type: 'module',
        scripts,
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies,
      })
    ),
    file(
      'index.html',
      `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>${task.title}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`
    ),
    file(options.tests ? 'vite.config.mts' : 'vite.config.ts', viteConfig),
    file(
      'tsconfig.json',
      json({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['src'],
      })
    ),
    file(
      'src/main.tsx',
      `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);\n`
    ),
    file(
      'src/App.tsx',
      `// ${heading(task)}\nexport default function App() {\n  return <h1>${task.title.replace(/[<>{}]/g, '')}</h1>;\n}\n`
    ),
  ];
  if (options.tests) {
    files.push(
      file(
        'src/App.test.tsx',
        `import { render, screen } from '@testing-library/react';\nimport { expect, it } from 'vitest';\nimport App from './App';\n\nit('renders the heading', () => {\n  render(<App />);\n  expect(screen.getByRole('heading')).toBeTruthy();\n});\n`
      )
    );
  }
  return files;
}

// --- PostgreSQL ------------------------------------------------------------

// The PostgreSQL course runs in the workspace terminal against the server installed on the
// machine. The app sets DATABASE_URL but does not create the database: day 1 does that with
// createdb. Days 3 and 4 ship the Support Ticket schema and rows as sample-data.sql instead of
// loading them automatically, so the reports run against whatever the trainee built.
const POSTGRES_DATABASE = 'support_tickets';

const POSTGRES_COMMON_README = `This course uses PostgreSQL installed on this machine. The desktop app sets \`DATABASE_URL\`,
but it does not create the database: that is part of the work. The whole course reuses one
database, \`${POSTGRES_DATABASE}\`, so tomorrow's task continues where you stopped.

\`\`\`bash
createdb ${POSTGRES_DATABASE}              # once, in day 1
psql "$DATABASE_URL"                        # open a session
psql "$DATABASE_URL" -f schema.sql          # run a file
\`\`\`

Inside \`psql\`: \`\\dt\` lists tables, \`\\d tickets\` describes one, \`\\timing\` reports statement
time, \`\\i seed.sql\` runs a file and \`\\q\` quits. PostgreSQL 16 or newer must be installed and
running.`;

function postgresReadme(task: CatalogTask, dayNumber: number): string {
  const intro = `# ${heading(task)}\n\n${POSTGRES_COMMON_README}\n`;

  if (dayNumber === 1) {
    return `${intro}
## Today

Design the model first (in \`model.md\`), then write the \`CREATE TABLE\` statements in
\`schema.sql\` and create the database:

\`\`\`bash
createdb ${POSTGRES_DATABASE}
psql "$DATABASE_URL" -f schema.sql
\`\`\`
`;
  }

  if (dayNumber === 2) {
    return `${intro}
## Today

Write the tables in \`schema.sql\` and the sample rows in \`seed.sql\`, then load both. The CRUD
queries go in \`queries.sql\`; run them one at a time in a \`psql\` session so you see each result.

For the stretch goal, make a reset script:

\`\`\`bash
dropdb ${POSTGRES_DATABASE}
createdb ${POSTGRES_DATABASE}
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f seed.sql
\`\`\`
`;
  }

  if (dayNumber === 5) {
    return `${intro}
## Today

The assessment uses a new domain, so create a separate database instead of reusing the ticket
one. \`DATABASE_URL\` still points at \`${POSTGRES_DATABASE}\`; here you connect by name:

\`\`\`bash
createdb assessment
psql assessment
\`\`\`
`;
  }

  const sampleNote =
    dayNumber === 4
      ? 'It also adds 5,000 generated tickets, so `EXPLAIN ANALYZE` shows a real difference before\nand after an index.'
      : 'It contains the Support Ticket schema and a few rows, and it is optional.';

  return `${intro}
## Today

The reports run against your own \`${POSTGRES_DATABASE}\` database. If it is empty, load the
provided sample data once:

\`\`\`bash
psql "$DATABASE_URL" -f sample-data.sql
\`\`\`

${sampleNote} Put each report in \`queries.sql\` and run the file with
\`psql "$DATABASE_URL" -f queries.sql\`, or use \`\\i queries.sql\` inside a session.
`;
}

function queriesFile(task: CatalogTask): TaskFile {
  return file(
    'queries.sql',
    `-- ${heading(task)}\n-- One query per business question, with a comment stating the question.\n-- Run the whole file with: psql "$DATABASE_URL" -f queries.sql\n`
  );
}

function postgresStarter(task: CatalogTask, dayNumber: number): TaskFile[] {
  const files: TaskFile[] = [file('README.md', postgresReadme(task, dayNumber))];

  if (dayNumber === 1) {
    files.push(
      file(
        'model.md',
        `# ${heading(task)}\n\nWrite the entities, relationships, keys and assumptions here, then create the tables in schema.sql.\n`
      )
    );
    files.push(
      file(
        'schema.sql',
        `-- ${heading(task)}\n-- Your CREATE TABLE statements. Run them with: psql "$DATABASE_URL" -f schema.sql\n`
      )
    );
    return files;
  }

  if (dayNumber === 5) {
    files.push(
      file(
        'schema.sql',
        `-- ${heading(task)}\n-- The assessment tables. Create your own database, then run: psql assessment -f schema.sql\n`
      )
    );
    files.push(queriesFile(task));
    return files;
  }

  if (dayNumber === 2) {
    files.push(
      file(
        'schema.sql',
        `-- ${heading(task)}\n-- Your CREATE TABLE statements. Run them with: psql "$DATABASE_URL" -f schema.sql\n`
      ),
      file(
        'seed.sql',
        `-- ${heading(task)}\n-- INSERT statements with meaningful sample data. Run them with: psql "$DATABASE_URL" -f seed.sql\n`
      )
    );
  }

  files.push(queriesFile(task));

  const sampleData = POSTGRES_SAMPLE_DATA_BY_DAY[`postgresql-day-0${dayNumber}`];
  if (sampleData) {
    files.push(
      file(
        'sample-data.sql',
        `-- ${heading(task)}\n-- Optional: the Support Ticket schema and sample data from the course.\n-- Load it once into an empty database: psql "$DATABASE_URL" -f sample-data.sql\n\n${sampleData}`
      )
    );
  }

  return files;
}

// Day 6 is a normal Node project on the same server. For this day the app creates the course and
// test databases before the workspace opens, so `npm test` and the API have somewhere to connect.
function postgresApiStarter(task: CatalogTask): TaskFile[] {
  return [
    file(
      'package.json',
      json({
        name: 'ticket-api',
        private: true,
        type: 'module',
        scripts: {
          start: 'node src/server.ts',
          test: 'node scripts/test.mjs',
          check: 'tsc --noEmit',
        },
        dependencies: {
          express: '^4.21.1',
          pg: '^8.23.0',
        },
        devDependencies: {
          '@types/express': '^4.17.21',
          '@types/node': '^22.9.0',
          '@types/pg': '^8.11.10',
          '@types/supertest': '^6.0.2',
          supertest: '^7.0.0',
          typescript: '^5.6.3',
          vitest: '^2.1.4',
        },
      })
    ),
    file(
      'README.md',
      `# Ticket API on PostgreSQL

This project talks to the PostgreSQL server on this machine. For this task the desktop app
creates \`${POSTGRES_DATABASE}\` and \`${POSTGRES_DATABASE}_test\` if they are missing, and sets
\`DATABASE_URL\` and \`VINKUP_TEST_DATABASE_URL\`. Creating the training database was day 1's job.

| Command | What it does |
| --- | --- |
| \`npm run check\` | Type-checks the project |
| \`npm test\` | Resets the test database from \`db/setup.sql\`, then runs Vitest against it |
| \`npm start\` | Runs the API on port 3000 |
| \`psql "$DATABASE_URL"\` | Opens the course database |

If \`${POSTGRES_DATABASE}\` is still empty, load the schema once:

\`\`\`bash
psql "$DATABASE_URL" -f db/setup.sql
\`\`\`

\`src/repository.ts\` uses an in-memory list today. Replace it with queries through the pool in
\`src/db.ts\`, and keep every value parameterised (\`$1\`, \`$2\`) instead of concatenated.
`
    ),
    file(
      'tsconfig.json',
      json({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          allowImportingTsExtensions: true,
        },
        include: ['src', 'tests', 'vitest.config.ts'],
      })
    ),
    file(
      'vitest.config.ts',
      `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({\n  test: {\n    include: ['tests/**/*.test.ts'],\n    fileParallelism: false, // the tests share the test database\n  },\n});\n`
    ),
    file(
      'db/setup.sql',
      `-- ${heading(task)}\n-- The Support Ticket tables. Load into the course database with:\n--   psql "$DATABASE_URL" -f db/setup.sql\n-- npm test rebuilds the test database from this file automatically.\n\n${POSTGRES_TICKET_SCHEMA}`
    ),
    file(
      'scripts/test.mjs',
      `// Rebuilds the separate test database, then runs Vitest against it.
// The desktop workspace sets VINKUP_TEST_DATABASE_URL when it opens the task.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

const url = process.env.VINKUP_TEST_DATABASE_URL;
if (!url) {
  console.error('VINKUP_TEST_DATABASE_URL is not set. Open this task in the Vinkup desktop app.');
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query('drop schema if exists public cascade');
  await client.query('create schema public');
  await client.query(readFileSync(new URL('../db/setup.sql', import.meta.url), 'utf8'));
} finally {
  await client.end();
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['vitest', 'run'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status ?? 1);
`
    ),
    file(
      'src/db.ts',
      `import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Open this task in the Vinkup desktop app.');
}

export const pool = new Pool({ connectionString });

/** GET /health proves the API can reach PostgreSQL. */
export async function checkConnection(): Promise<void> {
  await pool.query('select 1');
}
`
    ),
    file(
      'src/repository.ts',
      `// The API reads tickets from this in-memory list today. Replace it with queries through
// src/db.ts, using $1, $2, ... placeholders instead of string concatenation.
export type Ticket = { id: number; title: string; status: string; priority: string };

let nextId = 4;
const tickets: Ticket[] = [
  { id: 1, title: 'Printer is offline', status: 'open', priority: 'high' },
  { id: 2, title: 'Cannot log in to the VPN', status: 'in_progress', priority: 'urgent' },
  { id: 3, title: 'Laptop battery drains fast', status: 'closed', priority: 'low' },
];

export async function listTickets(): Promise<Ticket[]> {
  return tickets;
}

export async function getTicket(id: number): Promise<Ticket | undefined> {
  return tickets.find((ticket) => ticket.id === id);
}

export async function createTicket(input: {
  title: string;
  status?: string;
  priority?: string;
}): Promise<Ticket> {
  const ticket: Ticket = {
    id: nextId++,
    title: input.title,
    status: input.status ?? 'open',
    priority: input.priority ?? 'medium',
  };
  tickets.push(ticket);
  return ticket;
}
`
    ),
    file(
      'src/app.ts',
      `import express from 'express';
import { checkConnection } from './db.ts';
import { createTicket, getTicket, listTickets } from './repository.ts';

export const app = express();
app.use(express.json());

app.get('/health', async (_req, res, next) => {
  try {
    await checkConnection();
    res.json({ ok: true });
  } catch (error) {
    next(error); // Express 4 doesn't pass errors from async routes on by itself
  }
});

app.get('/tickets', async (_req, res, next) => {
  try {
    res.json(await listTickets());
  } catch (error) {
    next(error);
  }
});

app.get('/tickets/:id', async (req, res, next) => {
  try {
    const ticket = await getTicket(Number(req.params.id));
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json(ticket);
  } catch (error) {
    next(error);
  }
});

app.post('/tickets', async (req, res, next) => {
  try {
    const { title, status, priority } = req.body as Record<string, unknown>;
    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    res.status(201).json(
      await createTicket({
        title,
        status: typeof status === 'string' ? status : undefined,
        priority: typeof priority === 'string' ? priority : undefined,
      })
    );
  } catch (error) {
    next(error);
  }
});
`
    ),
    file(
      'src/server.ts',
      `import { app } from './app.ts';

app.listen(3000, () => console.log('API on http://localhost:3000 (open the Preview tab)'));
`
    ),
    file(
      'tests/health.test.ts',
      `import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';

afterAll(async () => {
  await pool.end();
});

describe('GET /health', () => {
  it('reports that the database is reachable', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
`
    ),
  ];
}

// --- Day → workspace --------------------------------------------------------

function browser(starterFiles: (task: CatalogTask) => TaskFile[]): DayWorkspace {
  return { runtime: 'browser', runCommand: null, setupSql: null, starterFiles };
}

function node(
  runCommand: string | null,
  starterFiles: (task: CatalogTask) => TaskFile[]
): DayWorkspace {
  return { runtime: 'node', runCommand, setupSql: null, starterFiles };
}

export function workspaceForDay(dayId: string): DayWorkspace {
  const [course] = dayId.split('-day-');
  const dayNumber = Number(dayId.split('-day-')[1]);

  switch (course) {
    case 'html':
      return browser(htmlStarter);
    case 'css':
      return browser(cssStarter);
    case 'js':
      if (dayNumber === 8) return node('npm test', jestStarter); // Jest day
      if (dayNumber === 5 || dayNumber === 10) return browser(jsModulesStarter); // project days
      return browser(jsStarter);
    case 'ts':
      return dayNumber === 4
        ? node('npm test', (task) => typescriptStarter(task, true)) // ts-jest day
        : node('npm run check', (task) => typescriptStarter(task, false));
    case 'node':
      if (dayNumber <= 2) return node('npm test', (task) => nodeStarter(task, 'cli'));
      if (dayNumber === 3) return node('npm test', (task) => nodeStarter(task, 'http'));
      return node('npm test', (task) => nodeStarter(task, 'express'));
    case 'postgresql': {
      // Day 6 is a Node project against the same server; for that day the workspace creates the
      // course and test databases. Days 1-5 are terminal-only: the trainee creates the database
      // with createdb and runs the SQL files themselves.
      if (dayNumber === 6) return node('npm test', postgresApiStarter);
      return {
        runtime: 'node',
        runCommand: null,
        setupSql: null,
        starterFiles: (task) => postgresStarter(task, dayNumber),
      };
    }
    case 'prisma':
      return node('npm run dev', prismaStarter); // Prisma on the local PostgreSQL, see prismaStarter
    case 'react':
      if (dayNumber === 10) {
        return node('npm test', (task) => reactStarter(task, { apiProxy: false, tests: true }));
      }
      return node('npm run dev', (task) =>
        reactStarter(task, { apiProxy: dayNumber >= 7, tests: false })
      );
    default:
      return browser(jsStarter);
  }
}
