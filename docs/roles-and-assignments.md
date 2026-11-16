# Roles, mentor assignment and authorization

Vinkup has three roles: **Trainee**, **Mentor** and **Manager**. A manager manages accounts and
decides which mentor sees each trainee. A mentor only sees the trainees assigned to them. A trainee
only sees their own workspace.

This document covers the role hierarchy, the assignment lifecycle, the authorization changes, the
database migration strategy and the deployment steps. For the review lifecycle itself see
[task-review-workflow.md](./task-review-workflow.md); for every endpoint see
[api-specifications.md](./api-specifications.md).

## 1. Role hierarchy

| Role    | JWT `role` | Account table | Can sign in | Can reach                       |
| ------- | ---------- | ------------- | ----------- | ------------------------------- |
| Trainee | `trainee`  | `trainee`     | Yes         | Their own workspace and records |
| Mentor  | `mentor`   | `admin`       | Yes         | Only their assigned trainees    |
| Manager | `manager`  | `admin`       | Yes         | All accounts and assignments    |

```
Manager
  ├── creates, edits, activates and deactivates mentors and managers
  ├── creates, edits, activates and deactivates trainees
  └── assigns, reassigns and unassigns trainees
Mentor
  ├── sees only assigned trainees in lists, detail, analytics, reviews and exports
  └── creates trainees; a created trainee is assigned to that mentor immediately
Trainee
  └── sees only their own dashboard, tasks, journal, profile and certificates
```

Key rules:

- A **manager** cannot use mentor routes (`/api/admin`) and a **mentor** cannot use manager routes
  (`/api/manager`). Both get `403 FORBIDDEN`.
- A mentor is authorized for a trainee **per request** by `trainee.mentor_id`. There is no cached
  list. Reassigning a trainee takes effect on the next request, including direct URLs.
- An **inactive** account cannot sign in and loses access immediately: the guards re-check
  `is_active` on every request.
- The legacy JWT role `admin` is normalized to `mentor` when a token is verified, so existing
  cookies keep working without a re-login.

### Database roles

Prisma keeps the table name `admin` for compatibility with `task_review.admin_id`. The table holds
both mentors and managers and gets a `staff_role` enum:

```prisma
enum staff_role {
  MENTOR
  MANAGER
}

model admin {
  id         String     @id @default(uuid()) @db.Uuid
  email      String     @unique
  name       String
  role       staff_role @default(MENTOR)
  is_active  Boolean    @default(true)
  // ...
  assigned_trainees trainee[] @relation("MentorTrainees")
}
```

A trainee stores its **current** mentor as a nullable foreign key:

```prisma
model trainee {
  mentor_id String? @db.Uuid
  is_active Boolean @default(true)
  mentor    admin?  @relation("MentorTrainees", fields: [mentor_id], references: [id], onDelete: SetNull)

  @@index([mentor_id])
}
```

- Multiple trainees may point at one mentor (one-to-many).
- `NULL` means unassigned.
- `ON DELETE SET NULL` means deleting a staff row never deletes trainees.
- `trainee_mentor_id_idx` keeps assignment lookups and mentor lists fast.

There is no assignment-history table yet; the current link is the source of truth. See
[Limitations](#8-limitations).

## 2. Assignment workflow

A manager works from the manager console at `/manager`:

1. **Staff table** — lists mentors and managers with role, active state, assigned-trainee count and
   last sign-in. Create, edit, promote/demote, activate and deactivate accounts here.
2. **Trainee table** — lists every trainee with their current mentor. Each row has a mentor select,
   plus Edit, Activate and Deactivate actions.
3. **Assign/reassign/unassign** — choosing a mentor in the select calls
   `PATCH /api/manager/trainees/:traineeId/mentor` immediately. Choosing "Unassigned" sends
   `{ "mentorId": null }`.

A mentor can also create a trainee from `/admin`; that trainee is assigned to the creating mentor
right away. Trainees created by a manager are unassigned unless a mentor is chosen in the dialog.

### Assignment validation

The API accepts only an existing, **active `MENTOR`** as a target. Managers are not valid assignment
targets even though they share the `admin` table.

| Situation                                       | Result                     |
| ----------------------------------------------- | -------------------------- |
| Trainee does not exist                          | `404 NOT_FOUND`            |
| Mentor id does not exist                        | `404 NOT_FOUND`            |
| Target is a manager or inactive mentor          | `400 INVALID_MENTOR`       |
| Trainee already has that mentor                 | `409 ALREADY_ASSIGNED`     |
| Same unassign (`mentorId: null`) repeated       | `200`, idempotent no-op    |
| Reassign to a different active mentor           | `200`, replaces the link   |
| Unknown trainee/mentor during an invalid change | Existing data is untouched |

The write runs in one interactive transaction: validate the trainee, validate the target, then
update `mentor_id`. That prevents racing a deactivation or role change.

### Account safety rules

- A mentor with assigned trainees cannot be deactivated or promoted to manager:
  `409 STAFF_HAS_TRAINEES`. Reassign their trainees first.
- A manager cannot deactivate their own account or change their own role: `403 FORBIDDEN`.
- Deactivating a trainee keeps every record and the mentor link; the trainee simply cannot sign in.
- Emails must be company addresses (`ALLOWED_EMAIL_DOMAIN`) and cannot exist in both `trainee` and
  `admin`. Database unique keys back up the pre-checks for concurrent requests.

## 3. Authorization model

All guards live in `backend/src/middleware/authMiddleware.ts` and build on `requireAuth`.

| Guard                    | Allows                                           | Re-checks database               |
| ------------------------ | ------------------------------------------------ | -------------------------------- |
| `requireAuth`            | Any valid JWT                                    | No                               |
| `requireTrainee`         | `role === 'trainee'`                             | `trainee.is_active = true`       |
| `requireMentor`          | `role === 'mentor'`                              | `admin` row active, role MENTOR  |
| `requireManager`         | `role === 'manager'`                             | `admin` row active, role MANAGER |
| `requireAssignedTrainee` | `:traineeId` is assigned to the signed-in mentor | `trainee.mentor_id = user.id`    |

`requireAdmin` remains as an alias for `requireMentor` so older route mounts keep working.

Because the guards run at the router mount:

- An unauthenticated request to an unknown path under a guarded prefix returns `401`, not `404`.
- The wrong role returns `403`.
- A deactivated account with a still-valid cookie gets `403` on its next request.

### Endpoint map

| Prefix                                        | Guard                                                             | Notes                           |
| --------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- |
| `/api/profile`, `/api/dashboard`, `/api/days` | `requireTrainee`                                                  | Trainee identity from the token |
| `/api/tasks`, `/api/journal`, `/api/activity` | `requireTrainee`                                                  | Same                            |
| `/api/typing-test`, `/api/courses`            | `requireTrainee`                                                  | Same                            |
| `/api/admin/*`                                | `requireMentor` + `requireAssignedTrainee` on `:traineeId` routes | Mentor-only                     |
| `/api/manager/*`                              | `requireManager`                                                  | Manager-only                    |

The assignment guard covers **every** mentor route that names a trainee: detail, flags, task code,
submit review (approve/rework), review history and the feedback feed. Unassignment therefore closes
all of them immediately, including direct URLs.

Manager endpoints:

| Method | Path                                      | Purpose                                    |
| ------ | ----------------------------------------- | ------------------------------------------ |
| GET    | `/api/manager/staff`                      | List mentors and managers                  |
| POST   | `/api/manager/staff`                      | Create a mentor or manager account         |
| PATCH  | `/api/manager/staff/:staffId`             | Update name, email or role                 |
| PATCH  | `/api/manager/staff/:staffId/status`      | Activate or deactivate a staff account     |
| GET    | `/api/manager/trainees`                   | List trainees with current mentor          |
| POST   | `/api/manager/trainees`                   | Create a trainee, optionally with a mentor |
| PATCH  | `/api/manager/trainees/:traineeId`        | Update name or email                       |
| PATCH  | `/api/manager/trainees/:traineeId/status` | Activate or deactivate a trainee           |
| PATCH  | `/api/manager/trainees/:traineeId/mentor` | Assign, reassign or unassign a mentor      |

New error codes: `STAFF_EXISTS`, `STAFF_HAS_TRAINEES`, plus the existing `INVALID_MENTOR`,
`ALREADY_ASSIGNED`, `TRAINEE_EXISTS` and `EMAIL_BELONGS_TO_ADMIN`.

## 4. Frontend routing and UI

| Role    | Home       | Routes                                                       |
| ------- | ---------- | ------------------------------------------------------------ |
| Trainee | `/`        | Dashboard, days, tasks, journal, profile, certificates, help |
| Mentor  | `/admin`   | Assigned trainee list and detail                             |
| Manager | `/manager` | Users & assignments console                                  |

`RoleRoute` sends a signed-in user who opens another role's route to their own home. The staff
header (`AdminHeader`) is shared: the mentor view shows "My trainees", the manager view shows
"Users & assignments".

The manager console has explicit loading, error-with-retry, empty, busy and confirmation states:

- initial load shows a loading overlay; a failed load shows an error state with **Try again**;
- both tables have an empty state;
- activation changes open a `ConfirmDialog` and show an inline error on failure;
- assignment changes disable the select while saving and report success or failure with a toast;
- deactivated rows are visibly dimmed and labelled **Inactive**.

## 5. Migration strategy

Two forward-only migrations implement the change. They are safe to run on an existing database:
they add columns and an enum, never drop or rewrite user data.

### `20261116120000_add_manager_role_and_assignments`

```sql
CREATE TYPE "staff_role" AS ENUM ('MENTOR', 'MANAGER');
ALTER TABLE "admin" ADD COLUMN "role" "staff_role" NOT NULL DEFAULT 'MENTOR';
UPDATE "admin" SET "role" = 'MENTOR' WHERE "role" IS NULL OR "role" = 'MENTOR';
ALTER TABLE "trainee" ADD COLUMN "mentor_id" UUID;
CREATE INDEX "trainee_mentor_id_idx" ON "trainee"("mentor_id");
ALTER TABLE "trainee" ADD CONSTRAINT "trainee_mentor_id_fkey"
  FOREIGN KEY ("mentor_id") REFERENCES "admin"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

What happens to existing data:

- Every existing `admin` row becomes a **mentor** via the column default and backfill. No account is
  promoted to manager automatically.
- Existing trainees get `mentor_id = NULL`. They are **not** auto-assigned to anyone.
- Every existing review keeps its `admin_id`; the table name and foreign key are unchanged.
- No trainee, progress, journal, flag, typing or review row is deleted or modified.

### `20261116140000_add_trainee_active_status`

```sql
ALTER TABLE "trainee" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
```

Existing trainees remain active.

### Deploying

Apply migrations before starting the new API build, then regenerate the Prisma client:

```bash
cd backend
DATABASE_URL="<production database>" npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate
npm run build
```

Locally, `npx prisma migrate dev` applies the same files and regenerates the client. The seed script
is safe to re-run: it upserts staff and trainees and never deletes records. It seeds a manager plus
two mentors, assigns six trainees across those mentors, and leaves staff-only trainee rows
unassigned. Set `SEED_MANAGER_EMAIL` / `SEED_MANAGER_NAME` to use your own company account for the
manager; `SEED_DEMO=true` adds progress, journals, activity, typing results and review history for
every assigned trainee.

### Rollback

The migrations are intentionally reversible without data loss:

```sql
-- 20261116140000
ALTER TABLE "trainee" DROP COLUMN "is_active";

-- 20261116120000
ALTER TABLE "trainee" DROP CONSTRAINT "trainee_mentor_id_fkey";
DROP INDEX "trainee_mentor_id_idx";
ALTER TABLE "trainee" DROP COLUMN "mentor_id";
ALTER TABLE "admin" DROP COLUMN "role";
DROP TYPE "staff_role";
```

Rolling back requires redeploying the previous API and frontend build, because they no longer read
these columns. Take a backup before rolling back in production.

## 6. Tests

Unit tests cover the manager service and repository rules, schema validation, the active-trainee
lookup, and the middleware guards. API contract tests cover:

- role guards for manager, mentor, trainee, deactivated accounts and missing cookies;
- staff and trainee CRUD, duplicate and domain errors;
- activation and deactivation, including self-deactivation;
- assignment, duplicate assignment, reassignment, unassignment and invalid targets;
- reassignment taking effect on the very next request;
- direct detail, flags, task-code, review-history, feedback and approve endpoints closing after
  unassignment;
- deactivation preserving records and the assignment.

Run them with:

```bash
npm test                      # unit tests in every workspace
npm run test:api -w backend   # API tests; needs TEST_DATABASE_URL
```

API tests need a migrated, disposable database. Set `TEST_DATABASE_URL` in `backend/.env.test` and
apply the migrations first:

```bash
DATABASE_URL="<TEST_DATABASE_URL>" npx prisma migrate deploy --config prisma7.config.ts
```

## 7. Manual verification checklist

1. Sign in as a manager. Confirm you land on `/manager` and `/admin` redirects back to `/manager`.
2. Create a mentor and a trainee. Leave the trainee unassigned and confirm the row says Unassigned.
3. Assign the trainee to the mentor and confirm the mentor's count increases.
4. Sign in as that mentor. Confirm the trainee appears in `/admin` and their detail, flags, task code
   and reviews open.
5. Reassign the trainee to another mentor. Refresh the first mentor's tab: the trainee disappears
   from the list and direct detail URLs return 403. The second mentor now sees them.
6. Unassign the trainee. Confirm both mentors lose access and the manager sees Unassigned.
7. Try to deactivate a mentor with trainees: expect a `STAFF_HAS_TRAINEES` message and no change.
8. Deactivate a trainee and confirm they cannot sign in, while the manager still sees their records.
9. Sign in as a trainee and confirm `/manager` and `/admin` are inaccessible.

## 8. Limitations

- **No assignment history.** Only the current mentor is stored. If an audit trail is needed later,
  add an append-only `trainee_mentor_assignment` table written in the same transaction as the
  update.
- **Managers cannot act as mentors.** Managers cannot open `/api/admin` or review tasks; they manage
  accounts only. A manager who also mentors needs a separate mentor account.
- **Existing trainees stay unassigned** until a manager assigns them, by design.
- **No bulk assignment.** The console assigns one trainee at a time.
- **Mock mode covers trainees and mentors only.** The frontend mock adapter (`VITE_USE_MOCKS=true`)
  has no `/manager` endpoints, so the manager console needs the real API. Previews without a backend
  still show the trainee and mentor views.
- **Promotion is blocked while trainees are assigned.** This avoids silently orphaning access;
  reassign first.
- **Account creation does not send invitations.** Staff and trainees still sign in with the
  provisioned company Google account.
