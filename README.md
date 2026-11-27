# Vinkup

Vinkup is Vonnue's in-house training platform for new engineering trainees. Trainees sign in with
their company Google account and work through an 8-course, 54-day curriculum one day at a time:
read the lesson, solve the day's tasks in a code editor that runs in the browser, submit them, and
submit the day to unlock the next one. The platform saves their work and records active time,
coding time and focus events. Mentors sign in to their own dashboard to follow every trainee, review
their code and journal, and add new trainees.

**Live:** [vinkup.netlify.app](https://vinkup.netlify.app) · **Version:** v0.2.0 (beta)

The same renderer also ships in an **Electron desktop app**. The main process signs the user in through
the system browser, keeps refresh tokens out of the renderer, and gives each task a real folder on the
trainee’s machine with a loopback preview, a terminal and local Node/PostgreSQL runtimes. Application
data still comes from the REST API. See the [desktop documentation](docs/desktop/README.md).

## Features

- **Guided curriculum:** HTML, CSS, JavaScript, TypeScript, Node.js, PostgreSQL, Prisma and React;
  54 days and 260 tasks. Days unlock in order.
- **Electron desktop app:** native window and display control, system-browser sign-in, local task workspaces,
  a PTY terminal, a resources browser with an allowlist, screen-focus protection and native PDF export.
  See [desktop docs](docs/desktop/README.md).
- **Workspace:** Monaco editor with three runtimes. In the desktop app, trainee code runs on the
  trainee's machine, never on the platform's servers:
  - web pages are served from a loopback preview server with native esbuild;
  - Node.js projects run in a real PTY with a terminal;
  - the PostgreSQL course uses `psql` in that terminal against the server on the machine;
  - Prisma tasks use the same local PostgreSQL server.
- **Autosave:** code saves a few seconds after typing stops and survives a dropped connection.
- **Day page:** lesson summary, learning objectives, task list, end-of-day checklist, optional
  journal, the day's integrity score, Submit Day and a button to the next day.
- **Focus tracking:** fullscreen only, paste blocked in the editor; leaving fullscreen or switching
  tabs is recorded for mentors and turned into an integrity score out of 100 (it never blocks the
  trainee).
- **Dashboard, profile and typing test:** progress, time spent, typing speed and daily activity.
- **Course certificates:** eligible trainees receive a persisted, signed certificate with a unique certificate ID. Certificates can be verified publicly and revoked by authorized staff. See [certificate security](docs/certificate-security.md).
- **Journal, help and reference pages:** past journal entries with search, a help guide, and reading
  material for every day.
- **Mentor dashboard** (`/admin`): only the trainees assigned to that mentor; cohort summary;
  trainee list with search, sort, a "needs attention" filter and CSV export; add trainee;
  per-trainee detail with read-only code, journal, flags and a printable progress report.
- **Manager console** (`/manager`): create, edit, activate and deactivate mentors, managers and
  trainees; assign, reassign and unassign trainees. Reassignment takes effect immediately.
- **Leave requests:** trainees submit a subject and reason and see only their own history; mentors
  review requests from assigned trainees and managers review all requests, including rejecting a
  Mentor-approved request or approving/re-rejecting a Mentor-rejected one. Every decision is kept in
  an append-only review history, so trainees see who approved or rejected and why. See the
  [leave workflow](docs/leave-request-workflow.md) and
  [roles and assignments](docs/roles-and-assignments.md#7-leave-request-workflow).
- **Three roles:** trainees, mentors and managers sign in the same way; each role only reaches its
  own pages and endpoints. See [roles and assignments](docs/roles-and-assignments.md).

## Tech stack

| Part          | Technology                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------- |
| Frontend      | React 19, TypeScript, Vite, React Router, Monaco, Axios                                       |
| Desktop       | Electron 45, TypeScript, `contextBridge` IPC, node-pty, esbuild, Lighthouse, electron-builder |
| Code runtimes | Loopback preview server + esbuild, PTY + xterm, local PostgreSQL (PostgreSQL, Prisma)         |
| Backend       | Node.js 22, Express 5, TypeScript, Zod 4, Passport (Google OAuth), JWT in a cookie            |
| Database      | PostgreSQL (Neon), Prisma 7 with `@prisma/adapter-pg`                                         |
| Shared types  | `@itp/types` in `packages/types`, used by frontend, backend and desktop                       |
| Quality       | Vitest, Testing Library, Supertest, ESLint, Prettier, Husky, lint-staged, commitlint          |
| Hosting       | Netlify (frontend, proxies `/api`), Render (API), Neon (database)                             |

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

Add your company email to the staff or trainee list in `backend/src/lib/seed.ts` before seeding, or
you won't be able to sign in. Staff land on `/admin` (mentor) or `/manager` (manager).

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

**Desktop:** with the backend running, use `npm run dev:desktop` to start the Vite frontend on port
5173 and open the Electron shell. The packaged app serves the renderer from a fixed loopback origin
and calls the production API (`https://vinkup-electron.onrender.com`) by default; `VINKUP_API_URL`
optionally overrides it (development default: `http://localhost:3000`). Full desktop run/build
details are in the [desktop docs](docs/desktop/README.md#desktop-commands); the
[setup guide](docs/setup-guide.md#52-configure-the-backend) covers the desktop OAuth callback and
token TTL settings.

## Scripts

Run from the repository root.

| Command                                | What it does                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev:frontend`                 | Vite dev server on port 5173                                                     |
| `npm run dev:backend`                  | API with `tsx watch` on port 3000                                                |
| `npm run dev:desktop`                  | Vite frontend on 5173 plus the Electron shell                                    |
| `npm run build:desktop`                | Build the desktop main and preload code                                          |
| `npm run start:desktop`                | Build and start the Electron app (production API unless `VINKUP_API_URL` is set) |
| `npm run dist:desktop`                 | Build the frontend and package the Linux desktop app                             |
| `npm test`                             | Unit tests in every workspace                                                    |
| `npm run test:api -w backend`          | API contract tests (needs `TEST_DATABASE_URL`)                                   |
| `npm run lint`                         | ESLint on the whole repository                                                   |
| `npm run format`                       | Prettier on the whole repository                                                 |
| `npm run build -w frontend`            | Type-check and build the frontend to `frontend/dist`                             |
| `npm run build -w backend`             | Compile the backend to `backend/dist`                                            |
| `npm run db:seed -w backend`           | Load staff, trainees and the curriculum (safe to run again)                      |
| `npx tsx scripts/export-curriculum.ts` | Rebuild the seed's `curriculum.json` from the frontend data                      |

Every commit runs lint-staged, type checks and the unit tests, and checks the message with
commitlint.

## Repository layout

```
Training-platform/
├── frontend/          React app: pages, components, API client, runtimes, reference content
├── desktop/           Electron shell: main process, preload bridge, local workspace and packaging
├── backend/           Express API: one folder per feature in src/module/, Prisma schema in prisma/
├── packages/types/    @itp/types: request and response types shared by all three workspaces
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
| [Desktop documentation](docs/desktop/README.md)        | Electron architecture, IPC, local runtimes and desktop-specific APIs |
| [API reference](docs/api-specifications.md)            | Every endpoint, with requests, responses and errors                  |
| [Database](docs/database.md)                           | ER diagram and data dictionary                                       |
| [Roles and assignments](docs/roles-and-assignments.md) | Role hierarchy, mentor assignment, authorization, migration strategy |
| [Leave workflow](docs/leave-request-workflow.md)       | Leave statuses, Mentor/Manager decisions, append-only review history |
| [Certificate security](docs/certificate-security.md)   | Certificate issuance, signatures, verification, revocation           |
| [Slack integration](docs/slack-integration.md)         | Mentor channel setup, shared bot, outbox and retry behavior          |
| [Release notes v0.2.0](docs/release-notes/v0.2.0.md)   | Mentor dashboard, certificates, integrity score and other changes    |
| [Release notes v0.1.0](docs/release-notes/v0.1.0.md)   | What's in the first beta, known limitations and future scope         |

### Desktop guides

- [Authentication](docs/desktop/auth.md) — desktop OAuth, PKCE, token storage and auth state
- [Window and display management](docs/desktop/window.md) — fullscreen, overlays, focus and PDFs
- [Local workspace, preview, terminals and runs](docs/desktop/workspace.md) — `workspace:*`, `terminal:*` and `run:*`
- [Users, roles and assignments](docs/desktop/users.md) — role guards and admin/manager APIs
- [Course workflow](docs/desktop/course_workflow.md) — days, tasks, submissions and reviews
- [Leave requests](docs/desktop/leave_request.md) — requests, decisions and history
- [Slack integration](docs/desktop/slack.md) — channel setup, outbox and notifications

## Contributing

1. Branch from the latest `main`: `feat/short-description`, `fix/short-description`.
2. Follow [the conventions](docs/conventions.md); commit with Conventional Commits, for example
   `feat(days): add day unlock logic`.
3. Open a pull request using the template. Every pull request needs one approval and is merged
   with **Squash and merge**.

Pull requests get a Netlify preview link that runs on sample data.

## Team

Built by Hawas Backer, Fathima Fadwah, Aswin Vijayan and Ameesha T, mentored by Musthaq Ahmad.

Restructured by Anjal K Biju, Akshay Antony, Christo Jose, Gauresh P A, Sona Kajal S D and Akshay Kumar P, guided by SHIJIL CG.
