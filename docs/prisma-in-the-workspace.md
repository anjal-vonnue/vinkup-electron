# Prisma in the workspace

The Prisma course (8 days, 16 tasks) runs in the desktop app's Node workspace like every other
Node.js task. Prisma Client talks to **PGlite**, PostgreSQL compiled to WebAssembly, through the
community package `prisma-pglite`. There is no database server, no `DATABASE_URL` and nothing to
install.

## What the trainee gets

Every Prisma task starts from the same small project (`prismaStarter` in
`frontend/src/api/mockTasks/starters.ts`):

```
README.md          package.json       prisma.config.ts   tsconfig.json   vitest.config.ts
prisma/schema.prisma   prisma/seed.ts
src/app.ts   src/db.ts   src/server.ts
tests/tickets.test.ts
```

It has one `Ticket` model, a seed with three tickets, `GET /tickets`, and one Vitest + Supertest
test. The trainee builds the rest, day by day.

| Command                               | What it does                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Run** (`npm run dev`)               | Generates the Prisma client, runs the seed, starts the API on port 3000 (opens the Preview)                   |
| `npm test`                            | Vitest + Supertest on a separate test database that starts empty on every run                                 |
| `npm run db:migrate -- --name <name>` | Writes `prisma/migrations/<time>_<name>/migration.sql` from `schema.prisma` (instead of `prisma migrate dev`) |
| `npm run db:reset`                    | Deletes the database; the next Run seeds a fresh one                                                          |
| `npm run db:seed`                     | Runs `prisma/seed.ts`                                                                                         |
| `npm run db:generate`                 | `prisma generate`                                                                                             |
| `npm run db:validate`                 | `prisma validate`                                                                                             |
| `npm run check`                       | `tsc --noEmit`                                                                                                |

The "Platform note" at the top of each day's first task says the same in short, and that native
packages such as `bcrypt` don't work (use `bcryptjs`).

## How it works

```
src/server.ts → src/app.ts → Prisma Client (generated/)
                                └── createAdapter()          .vinkup/prisma/adapter.mjs (hidden)
                                      └── createPgliteAdapter()   prisma-pglite
                                            └── PGlite files in .vinkup/db/dev   (tests: .vinkup/db/test)
                                                  ⇅ copied to and from IndexedDB by the page
```

### Hidden helper files

When a Node.js task's `package.json` depends on `prisma-pglite`, `useNodeSession` writes these
right after mounting the task's files (`runtimes/node/supportFiles.ts`,
`runtimes/node/support/prismaPglite.ts`):

| File                           | Job                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.vinkup/prisma/engine.mjs`    | Points `PRISMA_SCHEMA_ENGINE_BINARY` at an empty placeholder, so the Prisma CLI doesn't download its native schema engine (it can't run in the browser)      |
| `.vinkup/prisma/adapter.mjs`   | `createAdapter()` for `src/db.ts`: picks the `dev` or `test` database, recreates it when `schema.prisma` changes, and starts fresh if a saved one won't open |
| `.vinkup/prisma/adapter.d.mts` | Its types, so `npm run check` passes                                                                                                                         |
| `.vinkup/prisma/cli.mjs`       | Behind the `db:*` scripts: runs the Prisma CLI with its OpenSSL warnings filtered out, and calls `createPgliteMigration()` for migrations                    |

`.vinkup/` is an ignored folder (`lib/workspaceIgnore.ts`): never shown in Files, never saved,
never sent to the server. The files are written again on every open, so a trainee can't break
them for good, and fixing them only needs a frontend deploy.

### Why each workaround is there

- **prisma-pglite's own CLI isn't used.** `cli.mjs` calls its functions directly, and reset deletes
  the folder.
- **The database is recreated when the schema changes.** The adapter creates tables only on a new
  database; it can't add a column to an existing one (`P2022 ColumnNotFound`). `adapter.mjs`
  stores a hash of `schema.prisma` next to the database and starts a fresh one when it changes,
  printing `[database] schema.prisma changed, so the database was recreated`. The seed (part of
  Run) fills it again. The SQL runtime does the same when a task's setup changes.
- **Tests get their own database.** `vitest.config.ts` sets `VINKUP_DATABASE=test`; that database
  is emptied at the start of each test file, and test files run one at a time.
- **PGlite is never closed, and doesn't need to be.** prisma-pglite's adapter `dispose()` does
  nothing, so the database stays open until the process ends. That is safe: Postgres writes each
  committed change to its write-ahead log (`pg_wal`) straight away and replays it the next time
  the database opens. Tested with Prisma 7.10, prisma-pglite 3.0.2 and PGlite 0.4.3: rows survived
  `process.exit`, Ctrl+C and even `kill -9` right after the commit. (An earlier version of
  `adapter.mjs` ran a `CHECKPOINT` after each burst of queries and
  closed PGlite on `prisma.$disconnect()`. It was removed: it didn't change what survives, and
  after a `$disconnect()` every query failed with `PGlite is closed` instead of reconnecting.)
- **The seed reads the count into a variable before the `if`.** This was needed by the earlier
  in-browser runtime, which evaluated `if (await count() === 0)` at a file's top level as
  `await (count() === 0)`. On the host Node process the pattern is unnecessary, but existing
  saved starters still use it and it works either way:
  `const ticketCount = await prisma.ticket.count(); if (ticketCount === 0) { ... }`.
- **The seed ends with `process.exit(0)`.** Without it, the script waits about 12 seconds after
  `prisma.$disconnect()` before it ends, so the server would start late.

### Keeping the database between visits

The desktop workspace is reset to the editor's files every time a task opens, but `.vinkup/db` is
preserved: the workspace manager moves it aside, empties the folder, and moves it back
(`desktop/src/main/workspace/files.ts`). The dev database and its schema marker
(`dev.schema-hash`) therefore survive closing and reopening the task.

- **Where:** `.vinkup/db/dev` inside `<userData>/workspaces/<taskId>`. `.vinkup` is ignored
  (`lib/workspaceIgnore.ts`), so it never appears in Files and is never sent to the server.
- **Not kept:** the test database, which starts empty on every run, and Postgres's
  `postmaster.pid` / `postmaster.opts` lock files.
- **Resetting:** `npm run db:reset` deletes `.vinkup/db`; the next Run seeds a fresh database.
- **If a saved database is broken** (for example the app closed in the middle of Postgres writing),
  `adapter.mjs` catches the open error, prints
  `[database] The saved database couldn't be opened, so a fresh one was created.` and the seed
  runs as usual.

## Rolling it out

The diff already includes the regenerated `backend/prisma/seed-data/curriculum.json` (only the 8
Prisma days changed). After it is merged and deployed:

1. Re-run the seed against the production database, as after any curriculum change:

   ```bash
   npm run db:seed -w backend
   ```

   It updates the 16 Prisma tasks' run command, instructions and starter files. It doesn't touch
   trainees' progress.

2. A trainee who already opened and saved a Prisma task keeps their own old files, which don't
   have the `db:*` scripts or `prisma-pglite`. If anyone is in that state, they can copy the new
   files from the starter or have their saved code for that task cleared.

## Checking it

Open any Prisma task (for example `/tasks/prisma-day-01-t-1`) in the desktop app:

1. Wait for **Node ready** (1 to 3 minutes, mostly `npm install`). Files shows no `.vinkup`,
   `generated` or `node_modules`.
2. **Run.** Expect `Generated Prisma Client (7.10.0) to ./generated` (no OpenSSL warnings),
   `[seed] Added 3 tickets.`, `API on http://localhost:3000 (open the Preview tab)`. The Preview
   shows the three tickets as JSON.
3. Add rows: in `prisma/seed.ts` change `if (ticketCount === 0)` to `if (true)`,
   press Run (six tickets), then change it back.
4. **Close the task and open it again.** Run still shows the six tickets. (Without the preserved
   database it would show three.)
5. `npm test`: 1 test passes and the prompt comes back.
6. Add `priority String @default("normal")` to `Ticket`, then
   `npm run db:migrate -- --name add_priority`: a new `migration.sql` appears in Files (a
   `CREATE TABLE` with `priority`, because the starter has no earlier migration). Run: the `schema.prisma changed` line, three seeded tickets with `"priority": "normal"`.
7. `npm run db:reset`, then close and reopen the task: Run seeds three tickets.
8. Quit and relaunch the app: the dev database is still there, because it lives under the app's
   user-data folder.
9. No database errors in the terminal at any point.

## If something fails

| Symptom                                                                                              | Likely cause                                                                | Try                                                                              |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Preview shows `[]`, and Run printed no `[seed] Added 3 tickets.` line                                | The seed didn't run, or it failed                                           | Check the terminal for the seed's error, then `npm run db:reset` and Run         |
| `Cannot find module '.../.vinkup/prisma/adapter.mjs'`                                                | Helper files not written                                                    | The task's `package.json` must list `prisma-pglite`                              |
| Tables in `.not-committed/pglite` instead of `.vinkup/db/dev`; nothing kept after reopening the task | `createPgliteAdapter` ignores `dbParentDirPath`/`dbDirName` in this version | Pin the version that honours them, or change `adapter.mjs` to the folder it uses |
| `P2022 ColumnNotFound` after a migration                                                             | Database not recreated                                                      | `npm run db:reset`, then Run                                                     |
| Rows are missing after reopening the task                                                            | The database was deleted, or the task was reset                             | Check that `.vinkup/db/dev` exists on disk; avoid `npm run db:reset`             |
| `npm test` doesn't return to the prompt after passing                                                | PGlite keeping a Vitest worker alive                                        | Ctrl+C (the results stand); add `teardownTimeout: 1000` to `vitest.config.ts`    |
| `TypeError [ERR_INVALID_ARG_TYPE] ... relevant-args.js`                                              | Something ran `npx prisma-pglite`                                           | Use the npm scripts                                                              |
| `Downloading Prisma engines ...` then `socket hang up`                                               | `npx prisma ...` run directly, without the placeholder                      | Use the npm scripts                                                              |
| `prisma:warn Prisma failed to detect the libssl/openssl version`                                     | Prisma CLI run directly                                                     | Harmless                                                                         |

## Limits

- `prisma-pglite` is a community package, not official Prisma; the engine placeholder is a
  workaround.
- A schema change drops the trainee's rows (the seed adds its rows back). Migrations are written
  as files but aren't applied one by one like `prisma migrate dev`, so "fix a faulty migration"
  (Day 1 stretch task) is about editing and re-creating migration files.
- `prisma studio`, `prisma migrate deploy` and `prisma db push` don't run here.
- The database is stored with the workspace on this machine, under the app's user-data folder.
- Stay on Prisma 7.10. Prisma 8 changes the API.

## History

These runs predate the desktop host runtime, when tasks used the in-browser WebContainer. They are
kept as the record of why the workarounds above exist.

The setup came out of a pilot test task (`t-prisma`, mock mode only), October 2026:

| Run | Result                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `npm install` to Node ready 1 min 17 s; `generate`, client queries and `createPgliteMigration` worked. `resetPgliteDatabase()` threw; scratch databases in `.not-committed/pglite` printed "won't be saved" lines (now ignored)                                                                                 |
| 2   | Preview blank: Express 4 dropped the error from an async route                                                                                                                                                                                                                                                  |
| 3   | `P2022` after a migration: the old database didn't have the new column (now recreated on schema change)                                                                                                                                                                                                         |
| 4   | Worked end to end. Data was lost on page reload, which led to saving it in IndexedDB                                                                                                                                                                                                                            |
| 5   | Course starter: Preview showed `[]`. A checkpoint-and-close wrapper was added to `adapter.mjs`, then removed: committed rows survive without it, and it broke queries after `$disconnect()`                                                                                                                     |
| 6   | Playwright run of "Checking it" reproduced the `[]`: the seed printed nothing and added no rows. Cause: WebContainer skips `if (await x === y)` at the top level (see "The seed reads the count into a variable"). With the seed changed, the run passed: 3 tickets, restored after a reload, `npm test` passed |
