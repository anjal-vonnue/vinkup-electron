# Vinkup

Vinkup is Vonnue's in-house training platform for new engineering trainees. Trainees sign in with
their company Google account and work through an 8-course, 54-day curriculum one day at a time:
read the lesson, solve the day's tasks in a code editor that runs in the browser, submit them, and
submit the day to unlock the next one. The platform saves their work and records active time,
coding time and focus events. Mentors sign in to their own dashboard to follow every trainee, review
their code and journal, and add new trainees.

**Live:** [vinkup.netlify.app](https://vinkup.netlify.app) · **Version:** v0.2.0 (beta)

## Features

- **Guided curriculum:** HTML, CSS, JavaScript, TypeScript, Node.js, PostgreSQL, Prisma and React;
  54 days and 260 tasks. Days unlock in order.
- **In-browser workspace:** Monaco editor with three runtimes, so trainee code never runs on the server:
  - web pages run in a live preview (iframe + esbuild-wasm);
  - Node.js projects run in a WebContainer with a terminal;
  - SQL runs in PGlite (PostgreSQL in WebAssembly).
- **Autosave:** code saves a few seconds after typing stops and survives a dropped connection.
- **Day page:** lesson summary, learning objectives, task list, end-of-day checklist, optional
  journal, the day's integrity score, Submit Day and a button to the next day.
- **Focus tracking:** fullscreen only, paste blocked in the editor; leaving fullscreen or switching
  tabs is recorded for mentors and turned into an integrity score out of 100 (it never blocks the
  trainee).
- **Dashboard, profile and typing test:** progress, time spent, typing speed and daily activity.
- **Course certificates:** finishing every day of a course unlocks a printable certificate.
- **Journal, help and reference pages:** past journal entries with search, a help guide, and reading
  material for every day.
- **Mentor dashboard** (`/admin`): cohort summary; trainee list with search, sort, a "needs
  attention" filter and CSV export; add trainee; per-trainee detail with read-only code, journal,
  flags and a printable progress report.
- **Two roles:** trainees and mentors (admins) sign in the same way; each role only reaches its own
  pages and endpoints.

## Tech stack

| Part          | Technology                                                                           |
| ------------- | ------------------------------------------------------------------------------------ |
| Frontend      | React 19, TypeScript, Vite, React Router, Monaco, Axios                              |
| Code runtimes | iframe + esbuild-wasm, WebContainer API + xterm, PGlite                              |
| Backend       | Node.js 22, Express 5, TypeScript, Zod 4, Passport (Google OAuth), JWT in a cookie   |
| Database      | PostgreSQL (Neon), Prisma 7 with `@prisma/adapter-pg`                                |
| Shared types  | `@itp/types` in `packages/types`, used by both frontend and backend                  |
| Quality       | Vitest, Testing Library, Supertest, ESLint, Prettier, Husky, lint-staged, commitlint |
| Hosting       | Netlify (frontend, proxies `/api`), Render (API), Neon (database)                    |

## Quick start

You need Node.js 22 or later, npm, and access to a PostgreSQL database (a Neon branch works) and the
team's Google OAuth client. The [setup guide](docs/setup-guide.md) walks through every step; this is
the short version.

```bash
git clone https://github.com/Musthaq-Ahmad/Training-platform.git
cd Training-platform
npm install
```

Create `backend/.env` from `backend/.env.example` and fill in **every** value (an empty `PORT` or
`JWT_EXPIRES_IN` breaks startup or sign-in), then create the tables and load the curriculum:

```bash
cd backend
npx prisma migrate deploy --config prisma7.config.ts
docker compose up -d
npx prisma migrate dev --name init
cd ..
npm run db:seed -w backend
```

Add your company email to the trainee list in `backend/src/lib/seed.ts` before seeding, or you won't
be able to sign in.

Start the backend and the frontend in two terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

The API runs on http://localhost:3000 and the app on http://localhost:5173. Vite forwards `/api` to
the backend.

**Frontend only:** set `VITE_USE_MOCKS=true` in `frontend/.env.local` and run `npm run dev:frontend`.
The app then runs on sample data in the browser, with no backend or database.

## Scripts

Run from the repository root.

| Command                                | What it does                                                |
| -------------------------------------- | ----------------------------------------------------------- |
| `npm run dev:frontend`                 | Vite dev server on port 5173                                |
| `npm run dev:backend`                  | API with `tsx watch` on port 3000                           |
| `npm test`                             | Unit tests in every workspace                               |
| `npm run test:api -w backend`          | API contract tests (needs `TEST_DATABASE_URL`)              |
| `npm run lint`                         | ESLint on the whole repository                              |
| `npm run format`                       | Prettier on the whole repository                            |
| `npm run build -w frontend`            | Type-check and build the frontend to `frontend/dist`        |
| `npm run build -w backend`             | Compile the backend to `backend/dist`                       |
| `npm run db:seed -w backend`           | Load trainees and the curriculum (safe to run again)        |
| `npx tsx scripts/export-curriculum.ts` | Rebuild the seed's `curriculum.json` from the frontend data |

Every commit runs lint-staged, type checks and the unit tests, and checks the message with
commitlint.

## Repository layout

```
Training-platform/
├── frontend/          React app: pages, components, API client, runtimes, reference content
├── backend/           Express API: one folder per feature in src/module/, Prisma schema in prisma/
├── packages/types/    @itp/types: request and response types shared by both sides
├── scripts/           export-curriculum.ts (frontend curriculum data → seed file)
├── docs/              project documentation (see below)
└── netlify.toml       frontend build settings and per-environment variables
```

## Documentation

| Document                                               | What it covers                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| [Setup guide](docs/setup-guide.md)                     | Running the project locally, step by step                            |
| [Conventions](docs/conventions.md)                     | How we write code, commit and review; read before your first PR      |
| [Architecture overview](docs/architecture-overview.md) | How the system fits together: frontend flow, backend layers, hosting |
| [API reference](docs/api-specifications.md)            | Every endpoint, with requests, responses and errors                  |
| [Database](docs/database.md)                           | ER diagram and data dictionary                                       |
| [Release notes v0.2.0](docs/release-notes/v0.2.0.md)   | Mentor dashboard, certificates, integrity score and other changes    |
| [Release notes v0.1.0](docs/release-notes/v0.1.0.md)   | What's in the first beta, known limitations and future scope         |

## Contributing

1. Branch from the latest `main`: `feat/short-description`, `fix/short-description`.
2. Follow [the conventions](docs/conventions.md); commit with Conventional Commits, for example
   `feat(days): add day unlock logic`.
3. Open a pull request using the template. Every pull request needs one approval and is merged
   with **Squash and merge**.

Pull requests get a Netlify preview link that runs on sample data.

## Team

Built by Hawas Backer, Fathima Fadwah, Aswin Vijayan and Ameesha T, mentored by Musthaq Ahmad.
