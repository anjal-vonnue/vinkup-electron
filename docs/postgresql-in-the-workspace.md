# PostgreSQL in the workspace

The PostgreSQL course (6 days, 11 tasks) runs against **PostgreSQL installed on the trainee's
machine**, not a database inside the app. It uses the same environment as the Prisma course:
`psql` from the login-shell PATH, one database for the whole course, and `DATABASE_URL` in every
process the task starts.

Days 1–5 use the Node.js workspace as a **terminal**: no `package.json`, no install, and no Run
command. The trainee opens `psql`, creates the database with `createdb`, and runs SQL files with
`-f`. Day 6 is a normal Node project (`pg` + Express) against the same server.

## The database

|            |                                                                       |
| ---------- | --------------------------------------------------------------------- |
| Name       | `support_tickets` (test: `support_tickets_test` for day 6)            |
| Created by | **the trainee**, with `createdb support_tickets` on day 1             |
| Reused by  | days 1–4 and 6; day 5's assessment uses its own `assessment` database |
| Dropped by | nothing automatic; a reset script is day 2's stretch goal             |

The app only sets `DATABASE_URL`. Creating the database is part of the course, so the desktop
workspace deliberately does **not** create it for days 1–5. Day 6 runs `npm test`, which needs a
test database, so for that task the workspace creates both `support_tickets` and
`support_tickets_test` before the workspace opens (a no-op when day 1 already made the first one).

Databases live in the PostgreSQL server's data directory, not in the task folder. Leaving the
workspace (Home or Back to tasks), or quitting the app, never deletes them: day 2 continues from
the tables day 1 created.

## What the trainee gets

| Day | Runtime               | Starter files                                        | Command                                                          |
| --- | --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | `node`, terminal only | `README.md`, `model.md`, `schema.sql`                | `createdb support_tickets`, `psql "$DATABASE_URL" -f schema.sql` |
| 2   | `node`, terminal only | `README.md`, `schema.sql`, `seed.sql`, `queries.sql` | `psql "$DATABASE_URL" -f schema.sql`, then `-f seed.sql`         |
| 3   | `node`, terminal only | `README.md`, `queries.sql`, `sample-data.sql`        | `psql "$DATABASE_URL"` / `-f queries.sql`                        |
| 4   | `node`, terminal only | `README.md`, `queries.sql`, `sample-data.sql`        | `psql "$DATABASE_URL"`, `EXPLAIN ANALYZE`                        |
| 5   | `node`, terminal only | `README.md`, `schema.sql`, `queries.sql`             | `createdb assessment`, `psql assessment`                         |
| 6   | `node` (`npm test`)   | Node project (`pg`, Express, Vitest)                 | `npm test`, `npm start`                                          |

`sample-data.sql` (days 3–4) is the Support Ticket schema plus rows, including 5,000 generated
tickets on day 4. It is optional: the reports run against whatever schema the trainee built on
days 1–2. The old app-loaded setup SQL was removed on purpose, so a missing column shows up as a
real SQL error instead of being hidden by a preloaded database.

## How it works

```
task id → requiresPostgres(taskId, files)                  desktop/src/main/workspace/postgres.ts
        → databasePlanFor(taskId)  { support_tickets, support_tickets_test, create: day 6 }
        → psql (login-shell PATH) verifies the server
        → if create: CREATE DATABASE for both names
        → DATABASE_URL / VINKUP_TEST_DATABASE_URL in npm install, Run and every terminal
```

- The course is recognised by the task id (`postgresql-…`); Prisma tasks are recognised by
  `prisma/schema.prisma` (see [Prisma in the workspace](prisma-in-the-workspace.md)).
- The connection defaults to the Unix socket with peer authentication:

  ```
  postgresql://<your OS user>:vinkup@localhost/<database>?host=/var/run/postgresql
  ```

  The password is a placeholder; peer authentication matches the OS user, so nothing is stored.
  `VINKUP_DATABASE_URL` points the workspace at another server or a password-protected one. If it
  includes a database name, that name is used instead of `support_tickets` — create that database
  in day 1 instead.

- The terminal is a real PTY, so `psql` is interactive: `\dt`, `\d tickets`, `\timing`, `\i`, `\q`,
  history and cancellation all work. `createdb` and `dropdb` are on the same PATH.
- Failure messages are trainee-facing: PostgreSQL missing, server stopped, and "your user cannot
  create databases" (with the `ALTER ROLE … CREATEDB` fix) appear in the Result pane, before the
  workspace starts.

## Requirements

- PostgreSQL 16 or newer installed and running.
- `psql` and `createdb` on the login-shell PATH (a menu-launched app resolves the same PATH as a
  terminal).
- A role that can create databases:

  ```sql
  ALTER ROLE "<your user>" CREATEDB;
  ```

## Day 6: the Node project

The starter is a small Express API on `pg`:

```
src/db.ts          pg Pool from DATABASE_URL, checkConnection()
src/repository.ts  in-memory tickets to replace with SQL
src/app.ts         GET /health, GET /tickets, GET /tickets/:id, POST /tickets
src/server.ts      port 3000
db/setup.sql       the Support Ticket schema
scripts/test.mjs   rebuilds the test database, then runs Vitest against it
tests/health.test.ts
```

`npm test` resets `support_tickets_test` from `db/setup.sql` (drop and recreate the `public`
schema) and runs Vitest with `DATABASE_URL` pointing at the test database. Queries should use
`$1`, `$2` placeholders; the README says so too.

## If something fails

| Symptom                                                      | Likely cause                       | Try                                                            |
| ------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------- |
| `PostgreSQL was not found on this machine`                   | `psql` missing from the login PATH | Install PostgreSQL; check `psql -V` in a terminal              |
| `PostgreSQL is installed but its server is not running`      | Server stopped                     | `sudo systemctl start postgresql`                              |
| `Your PostgreSQL user cannot create databases`               | Role lacks `CREATEDB`              | `ALTER ROLE "<your user>" CREATEDB;`                           |
| `createdb: error: database "support_tickets" already exists` | Created earlier                    | Skip the command, or `psql "$DATABASE_URL"`                    |
| `database "support_tickets" does not exist`                  | Day 1 was skipped                  | `createdb support_tickets`, then load the schema               |
| `VINKUP_TEST_DATABASE_URL is not set` (day 6)                | Ran `npm test` outside the app     | Open the task in the desktop app                               |
| `psql: error: connection … No such file or directory`        | Socket path differs                | Set `VINKUP_DATABASE_URL` to a working URL and restart the app |

## Limits

- A plain browser build cannot run this course: it needs a real PostgreSQL server.
- All days except the assessment share one database, so a change made in day 2 is visible in day 3.
  That is the point; `dropdb`/`createdb` is the reset.
- The `sql` runtime (PGlite) is still in the codebase but no curriculum task uses it any more.

## History

Days 1–5 used to run in the `sql` runtime: PGlite in WebAssembly, one IndexedDB database per
trainee and task, with the ticket schema loaded automatically on days 3–4. That removed the need
to install anything, but it also hid the parts the course is about — creating a database,
connecting with `psql`, reading server output, and carrying data from one day to the next. The
course now runs in the same terminal workspace as Node and Prisma.
