# Team Conventions — Vinkup

How we write code on this project. Read it once, top to bottom, then use it as a reference.

- These conventions describe the codebase **as it is built**, and the examples come from real files.
  When you're unsure, copy the pattern of the task module (`backend/src/module/task-module/`) and
  the task page (`frontend/src/pages/TaskPage/`).
- A few older files don't follow every rule yet. They're listed in §14; don't copy them, and fix
  them when you're already changing that code.
- Requirements live in the TRD and PRD; this file is about _how_ we build.

---

## The 10 rules (read these if you read nothing else)

1. Every change goes through a **pull request** reviewed and approved by **one other person**. No
   direct pushes to `main`.
2. The **backend decides**, the frontend only displays. Day locks, task and day completion, and
   time tracking are always checked on the server.
3. A trainee's id always comes from the **signed-in session** (`req.user.id`, from the JWT cookie),
   never from the request body, query or URL.
4. Frontend: only files in `src/api/` talk to the backend, through the shared **Axios client**. No
   `fetch` or `axios` in components, pages or hooks.
5. Backend layers: **route → validate → controller → service → repository**. Each layer has one job
   (§5.2).
6. Controllers wrap their work in **`try/catch` and call `next(error)`**. Services **throw our error
   classes**. Only the error handler sends error responses.
7. Every route that takes params or a body has a **Zod schema**, checked by `validate()` before the
   controller runs.
8. Every request and response shape is a type in **`packages/types`**, used by both sides.
9. TypeScript **strict mode**, no `any`.
10. **Conventional Commits** (`feat(days): ...`, `fix(tasks): ...`), checked by commitlint.

---

## 1. Repository structure

```
/
├── frontend/              React + Vite + TypeScript (workspace "frontend")
├── backend/               Express + Prisma + TypeScript (workspace "backend")
├── packages/
│   └── types/             @itp/types: shared request/response types
├── scripts/
│   └── export-curriculum.ts
├── docs/                  this file and the other project docs
├── .github/               pull request template
├── .husky/                pre-commit and commit-msg hooks
├── eslint.config.js       one lint config for every workspace
├── .prettierrc            one format config for everything
├── commitlint.config.js
├── netlify.toml           frontend build settings per environment
├── package.json           root: npm workspaces and shared scripts
└── package-lock.json      ONE lockfile, at the root
```

**Installing packages:** always from the repository root, with `-w`:

```bash
npm install zod -w backend
npm install axios -w frontend
npm install -D prettier
```

The last line installs a dev tool for everyone, at the root. Never run `npm install` inside
`frontend/` or `backend/`: it creates a second lockfile.

**Running locally:** `npm run dev:backend` (API on port 3000) and `npm run dev:frontend` (app on
http://localhost:5173) in two terminals. Vite forwards `/api` to the backend (§10.2). The setup
guide has the full steps.

---

## 2. TypeScript

Strict mode is on in every workspace. The frontend also has `noUnusedLocals` and
`noUnusedParameters`.

| Rule                                  | Instead                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| No `any`                              | Use a real type, or `unknown` and narrow it                                                           |
| No `// @ts-ignore`                    | Fix the type error, or ask in the PR                                                                  |
| No TypeScript `enum`                  | A union of strings: `type DayStatus = 'LOCKED' \| 'UNLOCKED' \| 'COMPLETED'`                          |
| Dates in shared types are `string`    | They cross JSON as ISO strings: `"2026-09-25T06:50:00.000Z"`, or `"2026-09-25"` for IST calendar days |
| Prefix intentionally unused names `_` | `_req`, `_next` (ESLint allows `^_`)                                                                  |

---

## 3. Naming

| Thing                                   | Style                                                  | Example                                                                                           |
| --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| React component folder + file           | PascalCase                                             | `components/DayTaskList/DayTaskList.tsx`                                                          |
| Pages                                   | PascalCase + `Page`                                    | `pages/DayOverviewPage/DayOverviewPage.tsx`                                                       |
| Hooks                                   | `use` + camelCase, file named the same                 | `hooks/useIsFullscreen.ts`, `TaskPage/hooks/useAutosave.ts`                                       |
| Other frontend files                    | camelCase                                              | `api/days.ts`, `lib/saveRules.ts`                                                                 |
| CSS Modules                             | `<Component>.module.css`, camelCase classes            | `DayTaskList.module.css`, `.taskItem`                                                             |
| Backend module folders                  | `<resource>-module`                                    | `module/task-module/`, `module/day-module/`                                                       |
| Backend files                           | `<resource>.<layer>.ts`                                | `task.routes.ts`, `task.controller.ts`, `task.service.ts`, `task.repository.ts`, `task.schema.ts` |
| Classes                                 | PascalCase                                             | `TaskService`, `TaskRepository`                                                                   |
| Variables, functions                    | camelCase                                              | `getDayTasks`, `completedAt`                                                                      |
| Booleans                                | `is` / `has` / `can` / `should`                        | `isCompleted`, `hasIncompleteTasks`                                                               |
| Constants                               | UPPER_SNAKE_CASE                                       | `MAX_FILE_CHARS`, `AUTH_COOKIE_NAME`                                                              |
| Types                                   | PascalCase; requests `…Request`, responses `…Response` | `SaveCodeRequest`, `TaskCodeResponse`                                                             |
| Component props type                    | `<Component>Props`                                     | `DayTaskListProps`                                                                                |
| Error classes                           | PascalCase + `Error`                                   | `DayLockedError`                                                                                  |
| API URLs                                | lowercase, plural, kebab-case                          | `/api/typing-test/results`                                                                        |
| JSON fields                             | camelCase                                              | `sequenceOrder`, `isStretchGoal`                                                                  |
| Database tables, columns, Prisma models | snake_case, same name in Prisma and PostgreSQL         | `task_progress.code_updated_at`                                                                   |
| Curriculum ids                          | lowercase slugs                                        | course `css`, day `css-day-03`, task `css-day-03-t-2`                                             |
| Branches                                | `type/short-description`                               | `feat/day-task-list`, `fix/journal-limit`                                                         |

---

## 4. Shared types: `packages/types`

### 4.1 What it is

One package with the **shape of every request and response** between the frontend and the backend.
Both import it, so when a response changes, the other side gets a type error at once instead of
breaking at runtime. There's no build step: both apps read the `.ts` files directly.

```ts
import type { TaskCodeResponse } from '@itp/types';
```

### 4.2 Files

```
packages/types/src/
├── index.ts         re-exports everything
├── common.ts        ErrorCode, ApiErrorResponse, MeResponse
├── dashboard.ts     DashboardResponse, DaySummary, DayStatus, CourseDaysResponse
├── dayOverview.ts   DayContent, DayTask, DayCurrentStatus, DayJournal, CompleteDayResponse
├── tasks.ts         TaskResponse, TaskCodeResponse, SaveCodeRequest, SubmitTaskResponse, TaskFile
├── activity.ts      LogFlagEventRequest, ActivityTimeRequest, FlagEventType
├── typingTest.ts    SaveTypingResultRequest, TypingResultRecord
└── profile.ts       ProfileData
```

Add new types to the file of their API resource, or create one for a new resource and export it
from `index.ts`.

### 4.3 What goes in, what doesn't

| ✅ Put in `packages/types`                           | ❌ Keep out                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Request bodies (`SaveCodeRequest`)                   | Prisma models and database rows                                               |
| Responses (`TaskResponse`, `DashboardResponse`)      | Zod schemas (they live in the backend)                                        |
| Small shapes inside them (`TaskFile`, `DaySummary`)  | React props and UI state                                                      |
| Status unions (`DayStatus`, `TaskRuntime`)           | Functions and business logic                                                  |
| The error shape (`ApiErrorResponse`) and `ErrorCode` | Anything a trainee must never receive (review priority, other trainees' data) |

### 4.4 Rules

- If your PR changes what an endpoint sends or receives, update the type **in the same PR**, plus
  the Zod schema (§7) and the mock adapter (§10.4).
- Put a one-line comment above each request/response type naming its endpoint:
  `/** GET /api/tasks/:taskId/code */`.
- Never declare a type for an endpoint that doesn't exist.

---

## 5. Backend

### 5.1 Folder structure

Code is organised **by feature, not by layer**: everything about tasks lives in
`module/task-module/`.

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/              generated by Prisma, committed
│   └── seed-data/curriculum.json
├── prisma7.config.ts            Prisma CLI config (pass --config)
├── vitest.config.ts             unit tests
├── vitest.api.config.ts         API contract tests
└── src/
    ├── server.ts                starts the server (app.listen)
    ├── app.ts                   Express app: middleware, routers, error handler
    ├── config/env.ts            environment variables, checked with Zod at startup
    ├── module/
    │   ├── auth-module/         routes, controller, service, repository, passport.ts, constants
    │   ├── task-module/         task.routes / .controller / .service / .repository / .schema
    │   ├── day-module/          day content, status, tasks, journal, Submit Day
    │   ├── dashboard-module/    dashboard and course days
    │   ├── profile-module/
    │   ├── typing-test-module/
    │   ├── activity-module/     time tracking
    │   ├── flag-module/         focus events
    │   └── progress-module/     ProgressService: day statuses and unlock checks (no routes)
    ├── middleware/              authMiddleware (requireAuth/Trainee/Admin), validate, notFoundHandler, errorHandler
    ├── errors/AppError.ts       our error classes
    ├── lib/                     prisma.ts (the one client), seed.ts
    ├── types/                   auth.types.ts (AuthenticatedRequest), express.d.ts
    ├── utils/                   jwt.ts, istDate.ts
    └── test/api/                API contract tests and their helpers
```

Routers are mounted in `app.ts`. Protected routers get the guard for their role **at the mount**
(§8.2), so no route in them can forget it:

```ts
// backend/src/app.ts
app.use('/api/auth', authRoutes);
app.use('/api/tasks', requireTrainee, taskRoutes);
app.use('/api/days', requireTrainee, dayRouter);
app.use('/api/admin', requireAdmin, adminRoutes);
```

### 5.2 What each layer does

```
Request → route → validate (Zod) → controller → service → repository → Prisma → PostgreSQL
                                                   ↑
                         any thrown AppError → next(error) → errorHandler → { error: { … } }
```

| Layer          | Its job                                                                                                                              | It must NOT                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Route**      | Connect a method + path to `validate(...)` and a controller method                                                                   | Contain logic                              |
| **Controller** | `try` → read `req.user.id` and the validated input → call the service → `res.status(...).json(...)` → `catch` → `next(error)`        | Contain business rules or Prisma calls     |
| **Service**    | Business rules (is the day unlocked? are the required tasks done?), mapping rows to the shared response types. **Throws** our errors | Touch `req`/`res`, or call Prisma directly |
| **Repository** | Prisma queries. Returns rows, or `null` when nothing is found                                                                        | Throw our errors or make decisions         |

Where errors come from: the repository returns `null`, the service throws
`NotFoundError` / `DayLockedError`, the controller passes it to `next`, and `errorHandler` sends it.

Services and repositories are **classes**; controllers are a class exported as one instance. The
day lock rules live in `ProgressService`; use it instead of writing new lock checks.

### 5.3 A full example: the task module

**Route**

```ts
// backend/src/module/task-module/task.routes.ts
const taskRoutes = Router();

taskRoutes.get('/:taskId', validate({ params: taskIdParamsSchema }), taskController.getTask);
taskRoutes.put(
  '/:taskId/code',
  validate({ params: taskIdParamsSchema, body: saveCodeBodySchema }),
  taskController.saveCode
);

export default taskRoutes;
```

**Controller**

```ts
// backend/src/module/task-module/task.controller.ts
const taskService = new TaskService();

class TaskController {
  getTask = async (req: Request, res: Response<TaskResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { taskId } = req.params as TaskIdParams;
      const task = await taskService.getTask(traineeId, taskId);
      res.status(200).json(task);
    } catch (error) {
      next(error);
    }
  };

  saveCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { taskId } = req.params as TaskIdParams;
      const { files } = req.body as SaveCodeRequest;
      await taskService.saveCode(traineeId, taskId, files);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const taskController = new TaskController();
```

The casts are safe because the route guard (`requireTrainee`) and `validate()` have already run.

**Service**

```ts
// backend/src/module/task-module/task.service.ts
export class TaskService {
  async saveCode(traineeId: string, taskId: string, files: TaskFile[]): Promise<void> {
    await progressService.assertTaskUnlocked(traineeId, taskId); // 404 or 403 DAY_LOCKED
    await taskRepository.saveFiles(traineeId, taskId, files, new Date());
  }
}
```

**Repository**

```ts
// backend/src/module/task-module/task.repository.ts
export class TaskRepository {
  findStarterFiles = (taskId: string) => {
    return prisma.task.findUnique({ where: { id: taskId }, select: { starter_files: true } });
  };
}
```

Every query on a trainee's own data has **`trainee_id` in the `where`**. That is what keeps one
trainee from reading or changing another's data.

### 5.4 Response status codes

| Situation                                           | Status                             |
| --------------------------------------------------- | ---------------------------------- |
| Returned data                                       | `200` + the data                   |
| Created something (a typing result)                 | `201` + the created record         |
| Saved, nothing to return (code save, activity time) | `204` with `res.status(204).end()` |
| Any error                                           | sent by `errorHandler` only (§6)   |

Send the data directly (`res.json(task)`), never wrapped in `{ data: ... }`.

### 5.5 Environment variables

`backend/src/config/env.ts` parses `process.env` with Zod when the server starts, and stops with a
clear message if something is missing. Read configuration from `env`, never from `process.env` in
other files.

| Variable                                                          | Notes                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `PORT`                                                            | Default 3000. Leave it out rather than empty: an empty value becomes 0   |
| `DATABASE_URL`                                                    | PostgreSQL connection string                                             |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google OAuth client                                                      |
| `GOOGLE_DESKTOP_CALLBACK_URL`                                     | Optional second redirect URI for Electron (see `docs/authentication.md`) |
| `DESKTOP_ACCESS_TOKEN_TTL`                                        | Desktop access JWT lifetime, default `15m`                               |
| `ALLOWED_EMAIL_DOMAIN`                                            | Company domain without `@`                                               |
| `FRONTEND_URL`                                                    | CORS origin and redirect target after sign-in                            |
| `JWT_SECRET`, `JWT_EXPIRES_IN`                                    | Use `7d` to match the cookie's 7-day lifetime                            |
| `SESSION_SECRET`                                                  | Required by `env.ts` but unused (see §14)                                |
| `NODE_ENV`                                                        | `production` makes the cookie `Secure`                                   |

When you add a variable, add it to `env.ts`, `backend/.env.example` and the setup guide in the same
PR.

---

## 6. Errors

### 6.1 Error classes

Services throw one of these instead of `new Error(...)`. Each knows its status and code.

| Class                      | Status | Code                                       | Use when                                                                 |
| -------------------------- | ------ | ------------------------------------------ | ------------------------------------------------------------------------ |
| `ValidationError`          | 400    | `VALIDATION_FAILED`                        | Thrown by `validate()`; `details` lists Zod issues                       |
| `UnauthorizedError`        | 401    | `UNAUTHENTICATED`                          | No cookie, or invalid or expired JWT                                     |
| `ForbiddenError`           | 403    | `FORBIDDEN`                                | Wrong role (route guards), or not allowed yet (certificate)              |
| `NotFoundError`            | 404    | `NOT_FOUND`                                | Unknown day, task, course or record                                      |
| `DayLockedError`           | 403    | `DAY_LOCKED`                               | The day, or the task's day, is locked                                    |
| `ChecklistIncompleteError` | 403    | `CHECKLIST_INCOMPLETE`                     | Submit Day with required tasks not submitted; `details` has the counts   |
| `DomainNotPermittedError`  | 403    | `DOMAIN_NOT_PERMITTED`                     | Sign-in with an email outside the allowed domain                         |
| `NotProvisionedError`      | 403    | `NOT_PROVISIONED`                          | Sign-in with an email in neither the admin nor the trainee table         |
| `ConflictError`            | 409    | `TRAINEE_EXISTS`, `EMAIL_BELONGS_TO_ADMIN` | Adding a trainee whose email is already taken                            |
| `TraineeDomainError`       | 400    | `DOMAIN_NOT_PERMITTED`                     | Adding a trainee with an email outside the allowed domain (sent as JSON) |

The two sign-in errors are never sent as JSON: the OAuth callback turns them into a redirect to
`/login?error=<code>`.

**Adding an error:** add a class to `errors/AppError.ts` and its code to `ErrorCode` in
`packages/types/src/common.ts`. Only add a class when the frontend must react to it differently;
otherwise reuse `NotFoundError` or `ForbiddenError` with another message.

### 6.2 The error handler

`middleware/errorHandler.ts` is the **only** place that sends error responses:

- an `AppError` → its status and `{ "error": { "code", "message", "details" } }`;
- a body-parser failure (body over 5 MB, broken JSON) → 400 `VALIDATION_FAILED`;
- anything else → logged, and answered 500 `INTERNAL_ERROR` with a generic message. Internal
  details never reach the trainee.

`notFoundHandler` answers unknown paths with 404 `NOT_FOUND`.

### 6.3 Rules

| Where         | Do                                                                            |
| ------------- | ----------------------------------------------------------------------------- |
| Repository    | Don't catch errors. Return `null` when not found                              |
| Service       | `throw new SomeError()` when a rule fails; never `throw new Error('...')`     |
| Controller    | `try { ... } catch (error) { next(error); }` and nothing else in the `catch`  |
| Anywhere else | Never `res.status(4xx).json(...)` by hand: throw, and let the handler send it |

Messages must be safe to show to a trainee. The frontend branches on `code`, never on the message
text.

---

## 7. Validation with Zod

### 7.1 How it works

1. Write a Zod schema in the module's `*.schema.ts`.
2. Put `validate({ params, body })` in the route, before the controller.
3. Wrong input → `400 VALIDATION_FAILED` and the controller never runs.
4. Right input → `req.body` is replaced by the parsed data (unknown fields dropped), so the
   controller can trust it.

`validate()` (`middleware/validate.ts`) checks `params` and `body` only. For a query string, parse
it with a schema in the controller.

### 7.2 Writing schemas

```ts
// backend/src/module/task-module/task.schema.ts
/** Task ids are slugs built from the day id: "css-day-03-t-2". */
export const taskIdParamsSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;
```

### 7.3 Rules

- Every route with params or a body gets a schema.
- Curriculum ids (course, day, task) are **slugs**: `z.string().min(1).max(100).regex(/^[a-z0-9-]+$/)`.
  Ids of trainee records are UUIDs: `z.string().uuid()`.
- Every string and array gets a `.max(...)`, so nobody can send huge data. Text stored in `jsonb` or
  `text` also rejects NUL characters and broken emoji (see `isStorable` in `task.schema.ts`).
- Share limits with the frontend (for example `MAX_FILE_CHARS` and `lib/saveRules.ts`) and keep
  them equal, so the frontend never sends something the backend rejects.
- Zod checks **shape** only ("is this a slug?"). Rules that need the database ("is this day
  unlocked?") belong in the service.
- Never accept a `traineeId` from the client.

### 7.4 Zod schema vs shared type

|               | Shared type (`packages/types`) | Zod schema (`backend/src/module/...`) |
| ------------- | ------------------------------ | ------------------------------------- |
| What it is    | A TypeScript type              | A runtime check                       |
| When it works | While you write code           | On every request                      |
| Used by       | Frontend and backend           | Backend only                          |
| Example       | `SaveCodeRequest`              | `saveCodeBodySchema`                  |

Change both in the same PR so they describe the same shape.

---

## 8. Sign-in and authorization

### 8.1 Sign-in flow

1. **Continue with Google** goes to `/api/auth/google`; Passport redirects to Google.
2. Google returns to `/api/auth/google/callback`. `AuthService` checks the email's domain against
   `ALLOWED_EMAIL_DOMAIN`, then looks for an active row in the `admin` table (role `admin`), then
   for the email in the `trainee` table (role `trainee`). There is no self-registration.
3. On success the backend signs a JWT (`id`, `name`, `email`, `role`), sets it as the httpOnly
   `auth_token` cookie for 7 days and redirects mentors to `/admin` and trainees to the dashboard.
   On failure it redirects to `/login?error=DOMAIN_NOT_PERMITTED` or `NOT_PROVISIONED`.
4. The frontend calls `GET /api/auth/me` on every page load. `POST /api/auth/logout` clears the
   cookie.

There are no server sessions for the web flow: the JWT is the session.

**Electron** has its own path under `/api/auth/desktop` (system browser + PKCE
handoff to a loopback listener). It shares the Google Web client and the same
Google Cloud redirect setup, and uses a short-lived access JWT plus a hashed,
rotating refresh session (`desktop_session`). The renderer never receives a
token. The full flow is in `docs/authentication.md`; the web endpoints above
must stay unchanged.

### 8.2 Route guards

`middleware/authMiddleware.ts` has three guards. All of them read the `auth_token` cookie, verify the
JWT and set `req.user` to `{ id, name, email, role }`; a missing or invalid token is
`401 UNAUTHENTICATED`.

| Guard            | Use it for                                                      | Extra check                                                                  |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `requireAuth`    | Routes any signed-in user may call (`/auth/me`, `/auth/logout`) | None                                                                         |
| `requireTrainee` | Every trainee route                                             | `role === 'trainee'`, else `403 FORBIDDEN`                                   |
| `requireAdmin`   | Every `/api/admin` route                                        | `role === 'admin'` and the `admin` row is still active, else `403 FORBIDDEN` |

Mount a new router behind the guard for its role in `app.ts` (`app.use('/api/x', requireTrainee, xRoutes)`);
don't add a router behind plain `requireAuth`. In controllers, read the user through
`AuthenticatedRequest`:

```ts
const traineeId = (req as AuthenticatedRequest).user.id;
```

### 8.3 Authorization rules

- The trainee id **only** comes from `req.user.id`.
- Every repository function on trainee data takes the trainee id and uses it in the `where`.
- Locked days, and tasks on locked days, are refused in the **service** (`ProgressService`), not
  just hidden in the UI.
- Frontend route guards (`ProtectedRoute`, `RoleRoute`) are for user experience only; the backend is
  what protects the data.
- Flag events are write-only for trainees: no trainee endpoint returns them, only their day's
  integrity score. Mentors read them through `/api/admin`.
- Mentor endpoints take the trainee from the URL (`:traineeId`, validated as a UUID), check that the
  trainee exists (404), and are **read-only**: the only write is `POST /api/admin/trainees`. Never
  reuse a trainee service that writes (saving code, logging a flag) from a mentor endpoint.

---

## 9. Database (Prisma)

### 9.1 Setup

We're on Prisma 7 with the `@prisma/adapter-pg` driver adapter.

- Schema: `backend/prisma/schema.prisma`. The client is generated into `backend/src/generated/prisma`
  (git-ignored) by `npm install` (postinstall).
- CLI config: `backend/prisma7.config.ts`. Because of the file name, every Prisma command needs
  `--config prisma7.config.ts`, run inside `backend/`.
- One client for the whole app, in `src/lib/prisma.ts`. Only **repositories** (and the seed) import
  it.

### 9.2 Writing models

- Model and column names are **snake_case** and identical in Prisma and PostgreSQL (`model
task_progress`, `code_updated_at`), so no `@map` is needed.
- Curriculum tables (`course`, `curriculum_day`, `task`, …) use readable string ids
  (`css-day-03`). Trainee data tables use `@id @default(uuid()) @db.Uuid`.
- Timestamps are `@db.Timestamptz`. A calendar day in India time is `@db.Date` (see
  `activity_log.date` and `utils/istDate.ts`).
- "One per trainee per X" rules get a `@@unique` (`@@unique([trainee_id, task_id])`). Handle the
  race with an `upsert`, or by treating Prisma's `P2002` error as "already exists".
- Trainee data cascades when a trainee is deleted (`onDelete: Cascade`).
- Enums in the database are fine (`task_status`); in TypeScript code use string unions (§2).

### 9.3 Migrations

```bash
cd backend
npx prisma migrate dev --config prisma7.config.ts --name add_checklist_items
```

- Commit the generated `prisma/migrations/` folder in the same PR as the schema change.
- Name migrations in snake_case after the change: `add_checklist_items`.
- **Never edit a migration that's already merged**; add a new one.
- If two PRs both add migrations, the second to merge pulls `main` and re-runs `migrate dev`.
- Develop against your **own Neon branch**, so one person's migration can't break anyone else's
  database. Production runs `npx prisma migrate deploy --config prisma7.config.ts`.

### 9.4 Seed data and the curriculum

- `npm run db:seed -w backend` runs `src/lib/seed.ts`: it upserts the trainee list and the whole
  curriculum, and never deletes trainee data, so it's safe to run again. `SEED_DEMO=true` adds demo
  progress (local only).
- The curriculum is **edited in the frontend** (`frontend/src/api/dayOverview/` for day content,
  `frontend/src/api/mockTasks/` for tasks and starter files). After changing it, run
  `npx tsx scripts/export-curriculum.ts` from the root to rebuild
  `backend/prisma/seed-data/curriculum.json`, commit both, and reseed.
- Trainees are enrolled by adding them to the list in `seed.ts` and reseeding.

---

## 10. Frontend

### 10.1 Folder structure

```
frontend/src/
├── main.tsx             entry: installs the mock adapter in mock mode, renders <App />
├── App.tsx              AuthProvider → FullscreenGate → ActivityProvider → routes
├── index.css            design tokens (colours, fonts) for light and dark mode
├── api/                 the ONLY code that calls the backend
│   ├── client.ts        the shared Axios instance
│   ├── errors.ts        ApiError and toApiError
│   ├── days.ts, tasks.ts, dashboard.ts, ...   one file per resource
│   ├── mockAdapter.ts   answers every endpoint in mock mode
│   ├── dayOverview/     day content (source of the curriculum)
│   └── mockTasks/       task catalog and starter files (source of the curriculum)
├── pages/               one folder per route; page-only hooks and state live inside
├── components/          reusable components, one folder each
├── routes/              ProtectedRoute, PublicOnlyRoute, RoleRoute
├── context/             AuthProvider + useAuth, ActivityProvider + useActivity
├── hooks/               shared hooks (flag tracking, fullscreen, typing test, ...)
├── runtimes/            browser, node and sql runtimes + RuntimeHost
├── lib/                 small pure helpers (saveRules, formatTime, ...), each with tests
├── content/             reference pages for every day
├── constants/           course list, typing test words
└── test/                setup.ts and fixtures used by tests and the mock adapter
```

### 10.2 Talking to the backend

All calls use **relative** `/api` paths through the shared client:

```ts
// frontend/src/api/client.ts
export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // send the auth cookie
  timeout: 15000,
});
```

- Locally, Vite proxies `/api` to `http://localhost:3000`; in production, Netlify's `_redirects`
  proxies it to the Render API. Never hard-code a backend URL. The only exception is the Google
  sign-in link, which uses `VITE_API_URL`.
- Every failure becomes an `ApiError` with `status`, `code` and a message that's safe to show. A
  401 signs the trainee out, unless the call sets `skipUnauthorizedHandler: true` (used by
  `GET /auth/me`).

### 10.3 API files: one per resource

One typed function per endpoint, returning the data with its shared type:

```ts
// frontend/src/api/tasks.ts
export async function getTaskCode(taskId: string): Promise<TaskCodeResponse> {
  const res = await apiClient.get<TaskCodeResponse>(`/tasks/${taskId}/code`);
  return res.data;
}

export async function saveTaskCode(taskId: string, body: SaveCodeRequest): Promise<void> {
  await apiClient.put(`/tasks/${taskId}/code`, body);
}
```

Components, pages and hooks import these functions; they never import `axios` or call `fetch`.
The one exception is `postActivityTimeOnExit`, which needs `fetch` with `keepalive`. It still
lives in `api/activity.ts`.

### 10.4 Mock mode

With `VITE_USE_MOCKS=true`, `mockAdapter.ts` answers every request from data in the browser.
Pull request previews and the frontend tests run this way.

- **A new or changed endpoint must be added to the mock adapter in the same PR**, with the same
  rules as the real API (locks, limits, status codes), so previews and tests keep working.
- Mock data lives in `src/test/fixtures/`. Keep the fixtures consistent with each other: the same
  trainee name in `/auth/me` and `/profile`, and the same progress on every page.
- `VITE_MOCK_ROLE=admin` makes the mock `/auth/me` answer as a mentor; mock mentor endpoints refuse a
  trainee with 403, like the real API.
- Mock mode must never be on in production; `netlify.toml` sets it to `false` for the production
  context.

### 10.5 Loading data in a page

Pages load data; components only display what they're given. Every page that loads data shows
three states (loading, error, data) using the shared `Loader`, `ErrorState` and `StateMessage`
components. Branch on `error.code`, not the message, and ignore responses that arrive after the
user has left:

```tsx
useEffect(() => {
  if (!dayId) return;
  let isCancelled = false;

  Promise.all([getDayContent(dayId), getDayTasks(dayId), getDayStatus(dayId)])
    .then(([day, tasks, status]) => {
      if (!isCancelled) setResult({ dayId, day, tasks, status });
    })
    .catch((error: ApiError) => {
      if (!isCancelled) setResult({ dayId, error });
    });

  return () => {
    isCancelled = true;
  };
}, [dayId]);
```

**Buttons that save:** call the API function in the handler, and disable the button while it's
saving so it can't be clicked twice.

### 10.6 Signed-in user

`AuthProvider` (`context/AuthProvider.tsx`) loads `GET /auth/me` once and exposes `useAuth()`:
`status` (`loading` / `authenticated` / `unauthenticated`, plus `pending` for a desktop sign-in
waiting on the browser), `user`, `error`, `login()` and `logout()`.
`ProtectedRoute` waits for `loading` to finish, so a refresh doesn't flash the login page. In
Electron it gets state from `window.desktop.auth` and never calls the API for tokens; see
`docs/authentication.md`.

### 10.7 Components and styling

Every component gets its own folder:

```
components/DayTaskList/
├── DayTaskList.tsx
├── DayTaskList.module.css
├── DayTaskList.test.tsx
└── index.ts            export { default } from './DayTaskList';
```

- Import from the folder: `import DayTaskList from '../../components/DayTaskList';`
- One default-exported component per file. Put helper functions in `lib/`, not next to the
  component (React Refresh warns about mixed exports).
- A component used by one page only can live in that page's folder. Move it to `components/` when
  a second page needs it.
- **Styles:** CSS Modules only. Use the colour and font **tokens** from `index.css`
  (`var(--color-text-primary)`, `var(--font-mono)`), never hard-coded colours, so light and dark
  mode both work. Check new UI in both modes.
- Prefer real elements for actions (`<button>`, `<a>`), give icon-only buttons an `aria-label`, and
  use headings in order.
- Split a component that grows past about 200 lines.

### 10.8 Workspace behaviour

These live in hooks so every part of the workspace behaves the same:

| Hook / provider            | What it does                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `useAutosave` (TaskPage)   | Saves 2 s after typing stops, at least every 8 s while typing; retries; waits when offline |
| `usePasteBlock` (TaskPage) | Blocks paste and drop in the editor; `blockPasteEvents` does the same for the terminal     |
| `useFlagTracking`          | Records fullscreen exit, tab switch and window blur with their duration; shows the warning |
| `ActivityProvider`         | Counts active and coding seconds and sends them every 60 s and when the page is hidden     |
| `FullscreenGate`           | Blocks the app until the browser is in fullscreen                                          |

Focus events never penalise a trainee; they're recorded for mentors.

---

## 11. Git and pull requests

### 11.1 Branches

- `main` must always work and is deployed automatically.
- Nobody pushes directly to `main`; every change, even one line, goes through a pull request.
- Branch from the latest `main` for each piece of work: `type/short-description`, for example
  `feat/day-task-list`, `fix/journal-limit`, `docs/readme`.
- Keep branches short-lived (a day or two) and pull `main` into yours at least once a day.

### 11.2 Commit messages

We use **Conventional Commits**, enforced by commitlint (`@commitlint/config-conventional`). A
rejected message means the commit wasn't saved; fix the message and commit again.

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **type** (required, lowercase): `feat` (new behaviour a trainee can see), `fix` (something was
  broken), `refactor` (same behaviour, cleaner code), `test`, `docs`, `style` (formatting only),
  `chore` (tooling), `build` (dependencies, build setup), `perf`, `ci`, `revert`.
- **scope** (optional, lowercase): the area. We use `auth`, `dashboard`, `days`, `tasks`, `editor`,
  `sql`, `typing`, `journal`, `activity`, `profile`, `references`, `types`, `db`, `api`. Leave it out
  when a change touches many areas.
- **subject** (required): imperative, lowercase first letter, no full stop:
  `fix(tasks): save code before page closes`, not `Fixed bug.`
- The first line is **100 characters or fewer** (aim for 50–70). Body lines are 100 or fewer.
- Use a body when the subject doesn't explain the change: say what changed and why, after one blank
  line.
- Footer: `Closes #42`, or `BREAKING CHANGE: ...` (or `feat(types)!: ...`) when you change something
  others depend on, such as an API field.

Check a message without committing: `echo "feat(days): add unlock logic" | npx commitlint`.

### 11.3 What runs on every commit

The Husky hooks run before a commit is accepted:

- **pre-commit:** `lint-staged` (ESLint `--fix` and Prettier on staged files), type checks for the
  frontend and backend (`tsc -b`), then all unit tests.
- **commit-msg:** commitlint.

There is no CI pipeline yet, so the hooks are the only automatic gate. Don't skip them with
`--no-verify`.

### 11.4 Pull requests

- **Every PR is approved by at least one other person** before merging. Never merge your own PR
  without an approval.
- Keep PRs small: one feature or fix each.
- Review each other's PRs the same day; a waiting PR blocks the team.
- Merge with **Squash and merge**, then delete the branch. The PR title becomes the commit
  message, so write it in commit format.
- Fill in the template (`.github/pull_request_template.md`): **What changed**, **Why**, **Testing**
  (what you actually ran), **Related issue** and **Screenshots** for any UI change (before and
  after, light and dark when colours change).

**Before you open a PR:**

- [ ] Shared types updated if a request or response changed
- [ ] Zod schema added or updated for new input
- [ ] Mock adapter updated for new or changed endpoints
- [ ] Trainee queries filter by the trainee id
- [ ] Tests added for important logic
- [ ] `npm run lint` and `npm test` pass, and you tried it in the app
- [ ] Docs updated if behaviour, setup or the API changed (API reference, setup guide, README)

**Reviewers check:**

1. Can one trainee see or change another trainee's data?
2. Does the backend trust something from the frontend that it should check itself?
3. Is the business logic in a service, not a controller or component?
4. Do the shared types match what the backend actually sends?
5. Does mock mode still work?

---

## 12. Testing

Tool: **Vitest** everywhere. The frontend adds **Testing Library** (jsdom); the backend API tests
add **Supertest**.

### 12.1 Three kinds of tests

| Kind                      | Where                                    | Runs with                     | What                                                           |
| ------------------------- | ---------------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| Frontend unit / component | next to the file: `DayTaskList.test.tsx` | `npm test` (and every commit) | Components, hooks, `lib/` helpers, API functions, mock adapter |
| Backend unit              | next to the file: `task.service.test.ts` | `npm test` (and every commit) | Services and helpers, with the repository mocked               |
| API contract              | `backend/src/test/api/*.api.test.ts`     | `npm run test:api -w backend` | Real HTTP calls through `app` against a real test database     |

- Frontend tests run in mock mode (`VITE_USE_MOCKS=true`); `src/test/setup.ts` replaces Monaco with
  a plain `<textarea>`.
- API tests need `TEST_DATABASE_URL` in `backend/.env.test`, pointing to a database you can wipe.
  Use the helpers: `createTrainee()` returns a trainee with a signed cookie, `api.get(url, cookie)`
  calls the app, and `expectError(res, 403, 'DAY_LOCKED')` checks the error shape.

### 12.2 What must have tests

- Day locking and completion: a locked day gives 403; Submit Day is refused with required tasks
  open; completing unlocks the next day; stretch tasks never block.
- Sign-in checks: wrong domain and unknown email are rejected.
- Trainee isolation: trainee A can't read or change trainee B's data.
- Saving: limits and storable-text rules for code and journal.
- Flag and activity logging: events and seconds are stored for the right trainee and date.

In error tests, check the **status** and **`error.code`**, not the message text. In component
tests, find elements by role and accessible name (`getByRole('button', { name: /submit day/i })`).

---

## 13. Checklist: adding a feature

Example: **save a journal entry** (`PUT /api/days/:dayId/journal`).

1. **Requirements:** check the endpoint in the TRD; if it's wrong there, fix the TRD.
2. **Shared types:** `SaveJournalRequest` / `DayJournal` in `packages/types/src/dayOverview.ts`.
3. **Database:** change `schema.prisma` if needed and run `prisma migrate dev` (§9.3).
4. **Zod schema:** `day-module/journal.schema.ts`.
5. **Repository:** the Prisma query, with the trainee id in the `where`.
6. **Service:** the rules (unknown day → 404, locked day → 403). Throw our errors.
7. **Controller:** `try` → call the service → `res.status(200).json(...)` → `catch` → `next(error)`.
8. **Route:** `dayRouter.put('/:dayId/journal', validate({ params, body }), journalController.saveJournal)`;
   new routers are mounted in `app.ts` behind `requireTrainee` (or `requireAdmin` for mentor routes).
9. **Tests:** a unit test for the service rules and an API test for the endpoint.
10. **Frontend API function:** `saveJournal(dayId, responseText)` in `src/api/days.ts`.
11. **Mock adapter:** the same endpoint and rules in `mockAdapter.ts`.
12. **Page:** call it, and show saving, saved and error states.
13. **Docs:** add the endpoint to `docs/api-specifications.md`.
14. **PR:** `feat(journal): save daily journal entry`, reviewed, squash and merge.

---
