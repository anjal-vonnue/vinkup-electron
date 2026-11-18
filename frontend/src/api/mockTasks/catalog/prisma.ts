// Generated from the Phase 1 and Phase 2 Trainee Guides (task text is the guides' wording).
// Task ids follow the day page: `${dayId}-t-${sequenceOrder}`.
import type { CatalogDay } from '../types';

export const prismaDays: CatalogDay[] = [
  {
    dayId: 'prisma-day-01',
    dayNumber: 1,
    courseTitle: 'Prisma',
    tasks: [
      {
        id: 'prisma-day-01-t-1',
        sequenceOrder: 1,
        title: 'Migrate the ticket API repository to Prisma',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**Prisma · Day 1: Prisma, migrations and seed data**\n\nManage schema changes repeatably.\n\n> Platform note: Prisma runs against PostgreSQL on your own machine, so the normal Prisma workflow works: `npm run db:migrate -- --name <name>` creates a migration with `prisma migrate dev`, plus `db:reset`, `db:seed`, `db:generate` and `db:validate` (see README.md). The desktop app creates the course database `vinkup_prisma` and sets `DATABASE_URL`; PostgreSQL 16 or newer must be installed and running. Every task in this course shares that database, so your rows and migrations carry over. `npm test` runs Vitest and Supertest on a separate test database that starts empty: Vitest has the same `describe`, `it` and `expect` as Jest, with `vi.fn()` instead of `jest.fn()`. For password hashing, prefer `bcryptjs` so no build tools are needed.\n\n## Today's goal\nIntroduce an ORM while understanding the SQL and migrations it generates.\n\n## What you should know by the end of today\n- Define Prisma models and relations.\n- Create and apply migrations.\n- Write a seed script.\n\n## Task\nMigrate the ticket API repository to Prisma.\n\n## Functional requirements\n- Schema, migration, seed command and repository methods.\n- Document all database commands.\n\n## Engineering expectations\n- Inspect generated migration SQL.\n- Do not edit the production schema manually.\n\n## Suggested implementation order\n1. Initialise Prisma.\n2. Model existing tables.\n3. Create migration.\n4. Seed data.\n5. Replace repository queries.\n6. Run tests.\n\n## Resources\n- Prisma getting started — Follow the PostgreSQL and TypeScript path.\n- Prisma CRUD — Review create, read, update and delete.\n",
      },
      {
        id: 'prisma-day-01-t-2',
        sequenceOrder: 2,
        title: 'Demonstrate how to correct a faulty migration in development',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**Prisma · Day 1: Prisma, migrations and seed data** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nDemonstrate how to correct a faulty migration in development.\n\n## Builds on\nMigrate the ticket API repository to Prisma.\n',
      },
    ],
  },
  {
    dayId: 'prisma-day-02',
    dayNumber: 2,
    courseTitle: 'Prisma',
    tasks: [
      {
        id: 'prisma-day-02-t-1',
        sequenceOrder: 1,
        title: 'Enhance GET /tickets',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**Prisma · Day 2: Validation, pagination and filtering**\n\nBuild list endpoints suitable for real applications.\n\n> Platform note: Prisma runs against PostgreSQL on your own machine, so the normal Prisma workflow works: `npm run db:migrate -- --name <name>` creates a migration with `prisma migrate dev`, plus `db:reset`, `db:seed`, `db:generate` and `db:validate` (see README.md). The desktop app creates the course database `vinkup_prisma` and sets `DATABASE_URL`; PostgreSQL 16 or newer must be installed and running. Every task in this course shares that database, so your rows and migrations carry over. `npm test` runs Vitest and Supertest on a separate test database that starts empty: Vitest has the same `describe`, `it` and `expect` as Jest, with `vi.fn()` instead of `jest.fn()`. For password hashing, prefer `bcryptjs` so no build tools are needed.\n\n## Today's goal\nAdd robust query validation and database-level pagination.\n\n## What you should know by the end of today\n- Validate query parameters.\n- Return pagination metadata.\n- Filter and sort safely.\n\n## Task\nEnhance GET /tickets.\n\n## Functional requirements\n- Page, pageSize, status, priority, assignee, search, sortField and sortDirection.\n- Maximum page size.\n- Total count and page metadata.\n\n## Engineering expectations\n- Never fetch all rows before slicing.\n- Whitelist sortable fields.\n\n## Suggested implementation order\n1. Define query schema.\n2. Build validated filter object.\n3. Implement count and data queries.\n4. Return metadata.\n5. Test edge cases.\n\n## Resources\n- Express routing — Review query and route parameters.\n- Prisma CRUD — Review filtering and pagination patterns.\n",
      },
      {
        id: 'prisma-day-02-t-2',
        sequenceOrder: 2,
        title: 'Support multiple status values',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**Prisma · Day 2: Validation, pagination and filtering** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nSupport multiple status values.\n\n## Builds on\nEnhance GET /tickets.\n',
      },
    ],
  },
  {
    dayId: 'prisma-day-03',
    dayNumber: 3,
    courseTitle: 'Prisma',
    tasks: [
      {
        id: 'prisma-day-03-t-1',
        sequenceOrder: 1,
        title: 'Add a complete backend test suite',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**Prisma · Day 3: Backend API testing**\n\nTest the application at service and HTTP boundaries.\n\n> Platform note: Prisma runs against PostgreSQL on your own machine, so the normal Prisma workflow works: `npm run db:migrate -- --name <name>` creates a migration with `prisma migrate dev`, plus `db:reset`, `db:seed`, `db:generate` and `db:validate` (see README.md). The desktop app creates the course database `vinkup_prisma` and sets `DATABASE_URL`; PostgreSQL 16 or newer must be installed and running. Every task in this course shares that database, so your rows and migrations carry over. `npm test` runs Vitest and Supertest on a separate test database that starts empty: Vitest has the same `describe`, `it` and `expect` as Jest, with `vi.fn()` instead of `jest.fn()`. For password hashing, prefer `bcryptjs` so no build tools are needed.\n\n## Today's goal\nBuild reliable, isolated tests using a dedicated test database.\n\n## What you should know by the end of today\n- Distinguish unit and integration tests.\n- Set up and tear down test data.\n- Test error paths.\n\n## Task\nAdd a complete backend test suite.\n\n## Functional requirements\n- At least ten endpoint tests and five service tests.\n- Cover validation, not found, pagination, filtering and database errors.\n\n## Engineering expectations\n- Tests must not depend on execution order.\n- Use clear arrange-act-assert structure.\n\n## Suggested implementation order\n1. Create test environment config.\n2. Reset data safely.\n3. Write happy-path tests.\n4. Add validation and failure tests.\n5. Check isolation.\n\n## Resources\n- Jest — Review setup, teardown and async tests.\n- Supertest — Review request testing examples.\n",
      },
      {
        id: 'prisma-day-03-t-2',
        sequenceOrder: 2,
        title: 'Add a small test-data factory',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**Prisma · Day 3: Backend API testing** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nAdd a small test-data factory.\n\n## Builds on\nAdd a complete backend test suite.\n',
      },
    ],
  },
  {
    dayId: 'prisma-day-04',
    dayNumber: 4,
    courseTitle: 'Prisma',
    tasks: [
      {
        id: 'prisma-day-04-t-1',
        sequenceOrder: 1,
        title: 'Implement ticket comments and status history in the supplied codebase',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**Prisma · Day 4: Backend feature sprint**\n\nModify an unfamiliar starter repository.\n\n> Platform note: Prisma runs against PostgreSQL on your own machine, so the normal Prisma workflow works: `npm run db:migrate -- --name <name>` creates a migration with `prisma migrate dev`, plus `db:reset`, `db:seed`, `db:generate` and `db:validate` (see README.md). The desktop app creates the course database `vinkup_prisma` and sets `DATABASE_URL`; PostgreSQL 16 or newer must be installed and running. Every task in this course shares that database, so your rows and migrations carry over. `npm test` runs Vitest and Supertest on a separate test database that starts empty: Vitest has the same `describe`, `it` and `expect` as Jest, with `vi.fn()` instead of `jest.fn()`. For password hashing, prefer `bcryptjs` so no build tools are needed.\n\n## Today's goal\nAdd comments and status history through database, service and API layers.\n\n## What you should know by the end of today\n- Trace an existing request flow.\n- Write an impact analysis.\n- Create a reviewable PR.\n\n## Task\nImplement ticket comments and status history in the supplied codebase.\n\n## Functional requirements\n- Database migration, endpoints, permissions and tests.\n- PR description with implementation and testing details.\n\n## Engineering expectations\n- Follow existing conventions rather than rebuilding architecture.\n- Keep the PR focused.\n\n## Suggested implementation order\n1. Run and map the project.\n2. Write impact analysis.\n3. Implement database changes.\n4. Implement backend flow.\n5. Test and prepare PR.\n\n## Resources\n- Existing repository README — Your mentor will provide the actual repository link.\n",
      },
      {
        id: 'prisma-day-04-t-2',
        sequenceOrder: 2,
        title: 'Add a history endpoint with pagination',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**Prisma · Day 4: Backend feature sprint** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nAdd a history endpoint with pagination.\n\n## Builds on\nImplement ticket comments and status history in the supplied codebase.\n',
      },
    ],
  },
  {
    dayId: 'prisma-day-05',
    dayNumber: 5,
    courseTitle: 'Prisma',
    tasks: [
      {
        id: 'prisma-day-05-t-1',
        sequenceOrder: 1,
        title: 'Add authentication to the ticket system',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**Prisma · Day 5: Authentication**\n\nIdentify users securely.\n\n> Platform note: Prisma runs against PostgreSQL on your own machine, so the normal Prisma workflow works: `npm run db:migrate -- --name <name>` creates a migration with `prisma migrate dev`, plus `db:reset`, `db:seed`, `db:generate` and `db:validate` (see README.md). The desktop app creates the course database `vinkup_prisma` and sets `DATABASE_URL`; PostgreSQL 16 or newer must be installed and running. Every task in this course shares that database, so your rows and migrations carry over. `npm test` runs Vitest and Supertest on a separate test database that starts empty: Vitest has the same `describe`, `it` and `expect` as Jest, with `vi.fn()` instead of `jest.fn()`. For password hashing, prefer `bcryptjs` so no build tools are needed.\n\n## Today's goal\nImplement registration, login and protected routes.\n\n## What you should know by the end of today\n- Hash passwords.\n- Issue and verify access tokens.\n- Avoid information leakage.\n\n## Task\nAdd authentication to the ticket system.\n\n## Functional requirements\n- Register, login, current-user endpoint and authentication middleware.\n- Secrets from environment variables.\n\n## Engineering expectations\n- Never store plain-text passwords.\n- Do not reveal whether a login email exists.\n\n## Suggested implementation order\n1. Add user credentials model.\n2. Implement password hashing.\n3. Implement login.\n4. Create middleware.\n5. Protect routes and test.\n\n## Resources\n- OWASP Authentication Cheat Sheet — Read the password and error-message guidance.\n- Express middleware — Review middleware flow.\n",
      },
      {
        id: 'prisma-day-05-t-2',
        sequenceOrder: 2,
        title: 'Add token expiry handling',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**Prisma · Day 5: Authentication** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nAdd token expiry handling.\n\n## Builds on\nAdd authentication to the ticket system.\n',
      },
    ],
  },
  {
    dayId: 'prisma-day-06',
    dayNumber: 6,
    courseTitle: 'Prisma',
    tasks: [
      {
        id: 'prisma-day-06-t-1',
        sequenceOrder: 1,
        title: 'Add role-based and ownership-based permissions',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**Prisma · Day 6: Authorisation and roles**\n\nControl what authenticated users may do.\n\n> Platform note: Prisma runs against PostgreSQL on your own machine, so the normal Prisma workflow works: `npm run db:migrate -- --name <name>` creates a migration with `prisma migrate dev`, plus `db:reset`, `db:seed`, `db:generate` and `db:validate` (see README.md). The desktop app creates the course database `vinkup_prisma` and sets `DATABASE_URL`; PostgreSQL 16 or newer must be installed and running. Every task in this course shares that database, so your rows and migrations carry over. `npm test` runs Vitest and Supertest on a separate test database that starts empty: Vitest has the same `describe`, `it` and `expect` as Jest, with `vi.fn()` instead of `jest.fn()`. For password hashing, prefer `bcryptjs` so no build tools are needed.\n\n## Today's goal\nImplement server-side permissions for administrator, agent and customer roles.\n\n## What you should know by the end of today\n- Create a permission matrix.\n- Enforce ownership and role rules.\n- Test forbidden access.\n\n## Task\nAdd role-based and ownership-based permissions.\n\n## Functional requirements\n- Customers see their own tickets, agents see assigned tickets, admins manage all.\n- Only admins manage users.\n\n## Engineering expectations\n- Backend is authoritative.\n- Return 403 without exposing restricted data.\n\n## Suggested implementation order\n1. Write permission matrix.\n2. Create reusable checks.\n3. Apply to routes/services.\n4. Test every role.\n5. Review for missing checks.\n\n## Resources\n- OWASP Access Control Cheat Sheet — Read deny-by-default and server-side checks.\n",
      },
      {
        id: 'prisma-day-06-t-2',
        sequenceOrder: 2,
        title: 'Add project membership permissions',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**Prisma · Day 6: Authorisation and roles** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nAdd project membership permissions.\n\n## Builds on\nAdd role-based and ownership-based permissions.\n',
      },
    ],
  },
  {
    dayId: 'prisma-day-07',
    dayNumber: 7,
    courseTitle: 'Prisma',
    tasks: [
      {
        id: 'prisma-day-07-t-1',
        sequenceOrder: 1,
        title: 'Perform a security review and implement fixes',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**Prisma · Day 7: Security and resilience**\n\nReduce common API risks.\n\n> Platform note: Prisma runs against PostgreSQL on your own machine, so the normal Prisma workflow works: `npm run db:migrate -- --name <name>` creates a migration with `prisma migrate dev`, plus `db:reset`, `db:seed`, `db:generate` and `db:validate` (see README.md). The desktop app creates the course database `vinkup_prisma` and sets `DATABASE_URL`; PostgreSQL 16 or newer must be installed and running. Every task in this course shares that database, so your rows and migrations carry over. `npm test` runs Vitest and Supertest on a separate test database that starts empty: Vitest has the same `describe`, `it` and `expect` as Jest, with `vi.fn()` instead of `jest.fn()`. For password hashing, prefer `bcryptjs` so no build tools are needed.\n\n## Today's goal\nReview and harden the API against common misuse and failures.\n\n## What you should know by the end of today\n- Recognise injection and validation risks.\n- Apply rate, body-size and header protections.\n- Document residual risks.\n\n## Task\nPerform a security review and implement fixes.\n\n## Functional requirements\n- Identify at least five risks.\n- Add appropriate validation, secure headers, rate limiting, CORS and size limits.\n\n## Engineering expectations\n- Do not add packages without understanding configuration.\n- Add tests for important protections.\n\n## Suggested implementation order\n1. Threat-model main endpoints.\n2. Record findings.\n3. Prioritise.\n4. Fix and test.\n5. Document remaining limitations.\n\n## Resources\n- OWASP Node.js Security Cheat Sheet — Use as the review checklist.\n",
      },
      {
        id: 'prisma-day-07-t-2',
        sequenceOrder: 2,
        title: 'Add an audit log for repeated rejected requests',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**Prisma · Day 7: Security and resilience** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nAdd an audit log for repeated rejected requests.\n\n## Builds on\nPerform a security review and implement fixes.\n',
      },
    ],
  },
  {
    dayId: 'prisma-day-08',
    dayNumber: 8,
    courseTitle: 'Prisma',
    tasks: [
      {
        id: 'prisma-day-08-t-1',
        sequenceOrder: 1,
        title: 'Add operational readiness features',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**Prisma · Day 8: Logging and API documentation**\n\nMake the service operable by another team.\n\n> Platform note: Prisma runs against PostgreSQL on your own machine, so the normal Prisma workflow works: `npm run db:migrate -- --name <name>` creates a migration with `prisma migrate dev`, plus `db:reset`, `db:seed`, `db:generate` and `db:validate` (see README.md). The desktop app creates the course database `vinkup_prisma` and sets `DATABASE_URL`; PostgreSQL 16 or newer must be installed and running. Every task in this course shares that database, so your rows and migrations carry over. `npm test` runs Vitest and Supertest on a separate test database that starts empty: Vitest has the same `describe`, `it` and `expect` as Jest, with `vi.fn()` instead of `jest.fn()`. For password hashing, prefer `bcryptjs` so no build tools are needed.\n\n## Today's goal\nAdd structured logs, health checks and usable documentation.\n\n## What you should know by the end of today\n- Create useful logs without leaking secrets.\n- Use request IDs.\n- Document setup and endpoints.\n\n## Task\nAdd operational readiness features.\n\n## Functional requirements\n- Structured request/error logs, correlation ID, health endpoint, API documentation and .env.example.\n\n## Engineering expectations\n- A new developer should run the project from README alone.\n- Never log passwords or tokens.\n\n## Suggested implementation order\n1. Add logger abstraction.\n2. Add request IDs.\n3. Create health checks.\n4. Document API.\n5. Clone into a clean directory and verify setup.\n\n## Resources\n- Express debugging — Review debugging support.\n- OpenAPI Specification — Use as API documentation reference.\n",
      },
      {
        id: 'prisma-day-08-t-2',
        sequenceOrder: 2,
        title: 'Add readiness and liveness health endpoints',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**Prisma · Day 8: Logging and API documentation** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nAdd readiness and liveness health endpoints.\n\n## Builds on\nAdd operational readiness features.\n',
      },
    ],
  },
];
