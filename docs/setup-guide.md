# Vinkup — Local setup guide

How to get Vinkup running on your laptop, from a fresh clone to a signed-in trainee on the real API.
There are two ways to run it:

| Mode           | What runs                                          | Needs                                                    | Time        |
| -------------- | -------------------------------------------------- | -------------------------------------------------------- | ----------- |
| **Mock mode**  | Frontend only, with a fake API inside the browser  | Node.js                                                  | ~5 minutes  |
| **Full stack** | Frontend + backend + database, real Google sign-in | Node.js, a PostgreSQL database, Google OAuth credentials | ~30 minutes |

Mock mode is enough for most frontend work. Use full stack when you work on the backend, the database
or anything that has to behave exactly like production.

## 1. What's in the repo

```
training-platform/
├── frontend/          React + Vite app (pages, components, in-browser runtimes)
├── backend/           Express API, Prisma schema, migrations, seed
│   ├── prisma/        schema.prisma, migrations/, seed-data/curriculum.json
│   ├── prisma7.config.ts
│   └── src/           app.ts, server.ts, module/<feature>-module/, test/api/
├── packages/types/    Shared TypeScript types used by frontend and backend (@itp/types)
├── scripts/           export-curriculum.ts (builds the seed data from the trainee guides)
├── docs/              conventions.md — how we write code; read it once
└── netlify.toml       Frontend deploy settings per environment
```

It's an npm workspaces monorepo: one `npm install` at the root installs everything.

## 2. Prerequisites

| Tool           | Version                       | Check with                                                       |
| -------------- | ----------------------------- | ---------------------------------------------------------------- |
| Node.js        | 22 or later                   | `node -v`                                                        |
| npm            | comes with Node (10 or later) | `npm -v`                                                         |
| Git            | any recent                    | `git --version`                                                  |
| Chrome or Edge | recent                        | — (Node.js tasks need it; Safari and older Firefox may not work) |

For full stack you also need:

- **A PostgreSQL database for development.** A free [Neon](https://neon.tech) project is the easiest. A
  local PostgreSQL works too.
- **Google OAuth client ID and secret.** Ask the team member who manages the Google Cloud project; don't
  create your own unless asked.
- **Your company email in the trainee list** (see §5.4), or you can't sign in.

Recommended editor: VS Code with the **ESLint** and **Prettier** extensions. The repo's
`.vscode/settings.json` formats on save and fixes lint issues automatically.

## 3. Clone and install

```bash
git clone https://github.com/Musthaq-Ahmad/Training-platform.git
cd Training-platform
npm install
```

`npm install` at the root also:

- installs the frontend, backend and shared types workspaces;
- runs `prisma generate` for the backend (creates `backend/src/generated/prisma`; never commit it);
- sets up the Git hooks (Husky) that check every commit.

Always run `npm install` from the **repo root**, not inside `frontend/` or `backend/`.

## 4. Quick start: mock mode

1. Create `frontend/.env.local`:

   ```bash
   VITE_USE_MOCKS=true
   VITE_API_URL=""
   ```

2. Start the frontend:

   ```bash
   npm run dev:frontend
   ```

3. Open <http://localhost:5173> in Chrome or Edge and click **Enter fullscreen** when asked.

In mock mode you are signed in automatically as a sample trainee, and every API call is answered inside
the browser from fixtures. To see the mentor side instead, add `VITE_MOCK_ROLE=admin` to
`frontend/.env.local` and restart: you land on `/admin` as a sample mentor with sample trainees (no
fullscreen needed). Remove it, or set `VITE_MOCK_ROLE=trainee`, to go back. Saved code and progress live only in memory (journal entries persist in
`localStorage`), so a page reload resets them. Mock task scenarios such as `/tasks/t-node` and
`/tasks/t-sql` are listed in `frontend/src/api/mockTasks/scenarios.ts`.

**Mock mode must never be on in production.** It is controlled per environment in `netlify.toml`; don't
put `VITE_USE_MOCKS` in `package.json` scripts.

## 5. Full stack

### 5.1 Create a development database

On Neon: create a project (region Singapore is closest), open **Connect**, turn **Connection pooling
off** and copy the connection string. It looks like:

```
postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Use your own development database — never the production one.

### 5.2 Configure the backend

Copy the example and fill it in:

```bash
cp backend/.env.example backend/.env
```

| Variable                      | Local value                                                                                              | Notes                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`                                                                                            |                                                                                                      |
| `PORT`                        | `3000`                                                                                                   | **Set it.** The Vite proxy sends `/api` to port 3000; left empty, the server starts on a random port |
| `DATABASE_URL`                | your Neon string from §5.1                                                                               |                                                                                                      |
| `SESSION_SECRET`              | any random string, 32+ characters                                                                        | `openssl rand -hex 32`                                                                               |
| `JWT_SECRET`                  | any random string, 16+ characters                                                                        | `openssl rand -hex 32`                                                                               |
| `JWT_EXPIRES_IN`              | `7d`                                                                                                     | Matches the 7-day login cookie                                                                       |
| `GOOGLE_CLIENT_ID`            | from the team                                                                                            |                                                                                                      |
| `GOOGLE_CLIENT_SECRET`        | from the team                                                                                            | Never commit it                                                                                      |
| `GOOGLE_CALLBACK_URL`         | the localhost callback registered in Google Cloud, e.g. `http://localhost:3000/api/auth/google/callback` | Must match the registered URL exactly; ask which one is registered                                   |
| `GOOGLE_DESKTOP_CALLBACK_URL` | optional; defaults to `<GOOGLE_CALLBACK_URL host>/api/auth/desktop/callback`                             | Second redirect URI on the same Google **Web** client, used by the Electron app                      |
| `DESKTOP_ACCESS_TOKEN_TTL`    | `15m`                                                                                                    | Lifetime of the desktop access token; refresh sessions last 30 days                                  |
| `ALLOWED_EMAIL_DOMAIN`        | `vonnue.com`                                                                                             | No `@`                                                                                               |
| `FRONTEND_URL`                | `http://localhost:5173`                                                                                  | Where sign-in sends you back                                                                         |

The backend checks these at startup and refuses to start with a clear message if one is missing or too
short. `backend/.env` is git-ignored.

The Electron app uses a **second** redirect URI on the same Google Web client. Register
`<backend>/api/auth/desktop/callback` in Google Cloud (not a separate Desktop client) before trying
desktop sign-in. The full flow, Google Cloud steps and troubleshooting are in
[authentication.md](authentication.md).

### 5.3 Create the tables

The Prisma config file in this repo is named `prisma7.config.ts`, so pass it explicitly:

```bash
cd backend
npx prisma migrate deploy --config prisma7.config.ts
cd ..
```

`migrate deploy` applies the existing migrations in `backend/prisma/migrations`. When you change
`schema.prisma`, create a new migration instead:

```bash
cd backend
npx prisma migrate dev --name short_description --config prisma7.config.ts
```

If two PRs both add migrations, the second one to merge pulls `main` and runs `migrate dev` again.

### 5.4 Load the curriculum and trainees

```bash
npm run db:seed -w backend
```

This loads the 8 courses, 54 days and 260 tasks from `backend/prisma/seed-data/curriculum.json`, and
the `trainees` and `admins` (mentors) lists at the top of `backend/src/lib/seed.ts`. Only people in those
lists can sign in; if your email isn't there, add it (in a PR) and run the seed again. The seed is safe
to run any number of times.

**Mentor or trainee?** At sign-in an email with an **active** row in `admin` opens the mentor dashboard
(`/admin`), even if it is also in the trainee list. To try the trainee side with an email that is in
both, switch your admin row off in your development database, then sign out and in again:

```sql
UPDATE admin SET is_active = false WHERE email = 'you@vonnue.com';  -- true to switch back
```

Mentors can also add trainees from the dashboard (**Add trainee**), so a second test trainee doesn't need
a seed change.

To get a realistic account to test with (HTML and CSS days 1–2 done, CSS Day 3 open, some activity and
typing results):

```bash
SEED_DEMO=true DEMO_TRAINEE_EMAIL=you@vonnue.com npm run db:seed -w backend
```

`SEED_DEMO` is for development only; the seed refuses it when `NODE_ENV=production`.

### 5.5 Point the frontend at the real API

Edit `frontend/.env.local`:

```bash
VITE_USE_MOCKS=false
VITE_API_URL=""
```

Vite only reads env files at startup: restart `npm run dev:frontend` after changing them.

### 5.6 Run both

In two terminals from the repo root. The first starts the API on http://localhost:3000:

```bash
npm run dev:backend
```

The second starts the app on http://localhost:5173:

```bash
npm run dev:frontend
```

Check the API: <http://localhost:3000/api/health> shows `{"status":"ok"}`.

Open <http://localhost:5173>, sign in with your company Google account, enter fullscreen, and the
dashboard loads your real progress (or, for a mentor account, the mentor dashboard at `/admin`). In development, Vite forwards every `/api` request to the backend,
so the app and API behave like one site and the login cookie works without extra setup.

## 6. Tests and checks

| Command                                   | What it does                                                     |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `npm run test`                            | Unit tests for all workspaces (Vitest)                           |
| `npm run test -w frontend` / `-w backend` | Unit tests for one workspace                                     |
| `npm run test:api -w backend`             | API contract tests: real HTTP calls against a real test database |
| `npx tsc -b frontend backend`             | Type check                                                       |
| `npm run lint` / `npm run lint:fix`       | ESLint                                                           |
| `npm run format`                          | Prettier on the whole repo                                       |

**API contract tests** wipe their database, so they need a **separate** one:

1. Create a second database (a second Neon project or branch).
2. Put its connection string in `backend/.env.test`:

   ```bash
   TEST_DATABASE_URL=postgresql://...
   ```

3. Apply the migrations to it:

   ```bash
   cd backend
   DATABASE_URL="<the TEST_DATABASE_URL>" npx prisma migrate deploy --config prisma7.config.ts
   ```

4. Run `npm run test:api -w backend`. Add file names to run a subset, e.g.
   `npm run test:api -w backend -- tasks journal`.

The tests refuse to run if `TEST_DATABASE_URL` is the same as `DATABASE_URL`, so your development data is
safe.

## 7. Day-to-day workflow

1. Update `main` and branch from it: `feat/day-unlock`, `fix/paste-block`, `chore/eslint-setup`.
2. Commit with a conventional message, enforced by commitlint:

   ```
   feat(tasks): add submit endpoint
   fix: block paste in the terminal
   ```

   Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore` (plus `style`, `perf`, `build`, `ci`,
   `revert`). Header up to 100 characters.

3. Every commit runs the pre-commit hook: lint-staged (ESLint + Prettier on staged files), the type
   check for frontend and backend, and the unit tests. A failing hook means the commit didn't happen; fix
   the issue and commit again. Don't skip hooks.
4. Push and open a pull request; the template in `.github/pull_request_template.md` fills in. Every PR
   needs one approval. Netlify builds a preview link for each PR (it runs in mock mode).
5. Pull `main` into your branch at least once a day.

Coding rules — module layout, errors, validation, shared types, naming — are in
[`docs/conventions.md`](conventions.md). Read "The 10 rules" at the top before your first PR.

## 8. Useful commands

| Task                                | Command (from the repo root)                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| Start the frontend                  | `npm run dev:frontend`                                         |
| Start the backend (reloads on save) | `npm run dev:backend`                                          |
| Regenerate the Prisma client        | `cd backend && npx prisma generate --config prisma7.config.ts` |
| Browse the database                 | `cd backend && npx prisma studio --config prisma7.config.ts`   |
| Reseed                              | `npm run db:seed -w backend`                                   |
| Production build of the frontend    | `npm run build -w frontend`                                    |
| Preview the built frontend          | `npm run preview -w frontend`                                  |
