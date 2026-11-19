# Prisma in the workspace

The Prisma course (8 days, 16 tasks) runs in the desktop app's Node workspace like every other
Node.js task, and Prisma Client talks to **PostgreSQL installed on the trainee's machine**. There is
no WebAssembly database: the normal Prisma workflow (`prisma migrate dev`, `prisma migrate deploy`,
`prisma migrate reset`) works here. The PostgreSQL course uses the same server, with its own
`support_tickets` database ([PostgreSQL in the workspace](postgresql-in-the-workspace.md)).

## What the trainee gets

Every Prisma task starts from the same small project (`prismaStarter` in
`frontend/src/api/mockTasks/starters.ts`):

```
README.md          package.json       prisma.config.ts      tsconfig.json   vitest.config.ts
prisma/schema.prisma   prisma/seed.ts
prisma/migrations/20250101000000_init/migration.sql
src/app.ts   src/db.ts   src/server.ts
scripts/prepare-test-db.mjs
tests/setup.ts   tests/tickets.test.ts
```

It has one `Ticket` model, an initial migration, a seed with three tickets, `GET /tickets`, and one
Vitest + Supertest test. The trainee builds the rest, day by day.

| Command                               | What it does                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Run** (`npm run dev`)               | `prisma generate`, `prisma migrate deploy`, the seed, then the API on port 3000 (opens Preview) |
| `npm test`                            | Prepares the test database, then Vitest + Supertest on it (empty tables for every test)         |
| `npm run db:migrate -- --name <name>` | `prisma migrate dev`: writes `prisma/migrations/<time>_<name>/migration.sql` and applies it     |
| `npm run db:reset`                    | `prisma migrate reset --force`: drops the contents and applies the migrations again             |
| `npm run db:seed`                     | Runs `prisma/seed.ts`                                                                           |
| `npm run db:generate`                 | `prisma generate`                                                                               |
| `npm run db:validate`                 | `prisma validate`                                                                               |
| `npm run db:studio`                   | `prisma studio` on the course database                                                          |
| `npm run check`                       | `tsc --noEmit`                                                                                  |

The "Platform note" at the top of each day's first task says the same in short.

## How it works

```
src/server.ts → src/app.ts → Prisma Client (generated/client)
                                 └── new PrismaPg({ connectionString: DATABASE_URL })   @prisma/adapter-pg
                                       └── PostgreSQL on this machine
                                             ├── vinkup_prisma        (the course database)
                                             └── vinkup_prisma_test   (npm test)
```

### The database the desktop app creates

When a task contains `prisma/schema.prisma` (and its `package.json` does not depend on
`prisma-pglite`), the workspace manager resolves PostgreSQL **before** the workspace starts
(`desktop/src/main/workspace/postgres.ts`):

1. It runs `psql` from the login-shell PATH, so a menu-launched app finds PostgreSQL the same way a
   terminal does.
2. By default it connects over the Unix socket with peer authentication:

   ```
   postgresql://<your OS user>:vinkup@localhost/<database>?host=/var/run/postgresql
   ```

   The password is a placeholder: peer authentication matches the OS user. Set
   `VINKUP_DATABASE_URL` (for example `postgresql://postgres:secret@localhost:5432/vinkup_prisma`)
   to use a different server or a password, then restart the app.

3. It creates `vinkup_prisma` and `vinkup_prisma_test` when they do not exist. The name comes from
   the course part of the task id (`prisma-day-03-t-1` → `prisma`), so **all Prisma tasks share one
   database** and rows created in one task are still there in the next.
4. It passes `DATABASE_URL` and `VINKUP_TEST_DATABASE_URL` in the environment of `npm install`,
   Run, and every terminal, so `npx prisma ...` typed in the terminal uses the same database.

If PostgreSQL is missing, not running, or the role cannot create databases, opening the task fails
with an actionable message in the Result pane instead of starting a broken workspace.

### Prisma Studio and the Unix socket

`npx prisma studio` works too. Studio 7's data browser uses the `postgres` (postgres.js) driver,
which does not understand the `?host=/var/run/postgresql` query parameter that `psql`, `pg` and the
Prisma CLI use for the socket. The starter's `prisma.config.ts` notices the `studio` command and,
for that command only, gives Studio a host-less URL plus `PGHOST` (and `PGUSER` / `PGPORT`) so it
connects through the same socket with peer authentication. Every other Prisma command keeps the
normal `DATABASE_URL`. When `VINKUP_DATABASE_URL` points at a TCP server with a password, nothing is
rewritten and Studio connects over TCP as usual.

Saved tasks created before this change still have the old `prisma.config.ts`, so Studio reports
"Could not load schema metadata" there until `prisma.config.ts` is replaced with the current
starter's copy (or the trainee starts the task with no saved code).

### Databases are never deleted automatically

Closing a task removes `<userData>/workspaces/<taskId>`, but the PostgreSQL databases live in the
server's data directory, not in the workspace, so they are untouched. That is deliberate: several
tasks continue from the database the previous one created. Use `npm run db:reset` when a trainee
wants to start over.

`vinkup_prisma_test` is also kept, but `npm test` runs `scripts/prepare-test-db.mjs` first
(`prisma migrate deploy` against the test URL) and `tests/setup.ts` truncates every table before each
test, so tests always start from empty tables.

### Requirements on the machine

- PostgreSQL 16 or newer installed and running.
- `psql` on the login-shell PATH.
- A role that can create databases: `prisma migrate dev` needs a shadow database. If the message
  says the role cannot create databases, run once:

  ```sql
  ALTER ROLE "<your user>" CREATEDB;
  ```

## Rolling it out

The diff includes the regenerated `backend/prisma/seed-data/curriculum.json`. After it is merged
and deployed:

1. Re-run the seed against the backend's database, as after any curriculum change:

   ```bash
   npm run db:seed -w backend
   ```

   It updates the 16 Prisma tasks' instructions and starter files. It does not touch trainees'
   progress.

2. **Existing saved work keeps its PGlite database.** Tasks saved before this change still have
   `prisma-pglite` in `package.json`; the workspace keeps writing the old `.vinkup/prisma/*` helpers
   for them (`frontend/src/runtimes/node/support/prismaPglite.ts`), so nothing breaks. Clear a
   trainee's saved code for a task to move it onto the new PostgreSQL starter.

## Checking it

Open any Prisma task (for example `/tasks/prisma-day-01-t-1`) in the desktop app:

1. Wait for **Node ready** (mostly `npm install`; Prisma is a large download).
2. **Run.** Expect the generated client, `1 migration found`, `[seed] Added 3 tickets.`, then
   `API on http://localhost:3000 (open the Preview tab)`. The Preview shows three tickets as JSON.
3. Open a terminal: `echo $DATABASE_URL` prints the course URL, and
   `npx prisma migrate status` reports the migration as applied.
4. `npm run db:studio` (or `npx prisma studio`) opens Prisma Studio in the Preview tab with the
   `Ticket` table and its seeded rows. It uses the socket through the config shim described above.
5. Add `priority String @default("normal")` to `Ticket`, then
   `npm run db:migrate -- --name add_priority`. A new migration appears in Files and the column is
   added without losing rows.
6. **Close the task and open it again**, then Run: the rows are still there (the database is
   shared, not recreated).
7. `npm test`: the test passes and the prompt comes back.
8. `psql "$DATABASE_URL" -c 'select * from "Ticket"'` in the terminal shows the same rows.
9. `npm run db:reset`, then Run: three seeded tickets again.

## If something fails

| Symptom                                                 | Likely cause                                         | Try                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `PostgreSQL was not found on this machine`              | `psql` missing from the login PATH                   | Install PostgreSQL, make sure `psql -V` works in a terminal                      |
| `PostgreSQL is installed but its server is not running` | Server stopped                                       | `sudo systemctl start postgresql` (or your platform's service)                   |
| `Your PostgreSQL user cannot create databases`          | Role lacks `CREATEDB`                                | `ALTER ROLE "<your user>" CREATEDB;`                                             |
| `PostgreSQL rejected the connection`                    | TCP/password auth, not peer                          | Set `VINKUP_DATABASE_URL` and restart the app                                    |
| `P1000 Authentication failed` in the terminal           | URL has no usable credentials                        | Same as above; the terminal inherits `DATABASE_URL` from the app                 |
| `P3005 The database schema is not empty`                | A task's migrations do not match the shared database | `npm run db:reset` (destroys the course data) or add the missing migration       |
| `npm test` connects to the course database              | `VINKUP_TEST_DATABASE_URL` not set                   | Open the task in the desktop app; a plain `npm test` outside it cannot work      |
| Preview shows `[]`                                      | The seed did not run                                 | Check the Run output for the seed's error, then `npm run db:seed`                |
| Studio: `Could not load schema metadata`                | Old `prisma.config.ts` without the Studio shim       | Replace it with the current starter's copy, or start the task with no saved code |

## Limits

- PostgreSQL is a real install: **no database works in a plain browser build** and a trainee without
  PostgreSQL cannot open a Prisma task.
- `prisma migrate dev` needs permission to create the shadow database.
- All Prisma tasks share one database, so a task that changes the schema also changes what the next
  task sees. `db:reset` is the escape hatch.
- Stay on Prisma 7.10. Prisma 8 changes the API.
- `prisma studio` depends on the socket shim in `prisma.config.ts`; re-test Studio after upgrading
  Prisma, in case its driver learns to read `?host=` itself.
- The old PGlite path is kept only for already-saved work; new starters never use it.

## History

The course originally ran on PGlite (PostgreSQL compiled to WebAssembly) through the community
package `prisma-pglite`, first in the browser and later in the Electron host process. It needed hidden
`.vinkup/prisma/*` helpers, recreated the database whenever `schema.prisma` changed, and could not run
`prisma migrate dev`, `prisma studio` or `prisma migrate deploy`. Now that tasks run on the host
machine, the local PostgreSQL server replaces all of that with the standard Prisma workflow.
