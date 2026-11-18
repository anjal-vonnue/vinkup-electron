// Generated from the Phase 1 and Phase 2 Trainee Guides (task text is the guides' wording).
// Task ids follow the day page: `${dayId}-t-${sequenceOrder}`.
import type { CatalogDay } from '../types';

export const postgresqlDays: CatalogDay[] = [
  {
    dayId: 'postgresql-day-01',
    dayNumber: 1,
    courseTitle: 'PostgreSQL',
    tasks: [
      {
        id: 'postgresql-day-01-t-1',
        sequenceOrder: 1,
        title: 'Design the Support Ticket database',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 1: Relational database modelling**\n\nTurn business requirements into a relational model.\n\n> Platform note: This course uses PostgreSQL installed on this machine, not a database inside the app. The desktop app sets `DATABASE_URL` but does not create the database: in the terminal run `createdb support_tickets`, then `psql "$DATABASE_URL"`. Every task reuses that database, so tomorrow continues where you stopped. `psql` is the client you will use at work: `\\dt`, `\\d tickets`, `\\timing` and `\\q` work as usual. PostgreSQL 16 or newer must be installed and running (see README.md).\n\n## Today\'s goal\nDesign a database that protects data quality through relationships and constraints.\n\n## What you should know by the end of today\n- Identify entities and relationships.\n- Choose primary and foreign keys.\n- Explain one-to-many and many-to-many models.\n\n## Task\nDesign the Support Ticket database.\n\n## Functional requirements\n- Model users, customers, tickets, comments, categories, assignments and status history.\n- Create an ER diagram and initial CREATE TABLE statements.\n\n## Engineering expectations\n- Use consistent naming.\n- Record assumptions.\n- Avoid storing repeated derived data without justification.\n\n## Suggested implementation order\n1. Extract nouns and business rules.\n2. Identify relationships.\n3. Draw the model.\n4. Review with a peer.\n5. Create tables in PostgreSQL.\n\n## Resources\n- PostgreSQL tutorial — Read concepts and getting started.\n',
      },
      {
        id: 'postgresql-day-01-t-2',
        sequenceOrder: 2,
        title: 'Add a labels/tags model without storing comma-separated values',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 1: Relational database modelling** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nAdd a labels/tags model without storing comma-separated values.\n\n## Builds on\nDesign the Support Ticket database.\n',
      },
    ],
  },
  {
    dayId: 'postgresql-day-02',
    dayNumber: 2,
    courseTitle: 'PostgreSQL',
    tasks: [
      {
        id: 'postgresql-day-02-t-1',
        sequenceOrder: 1,
        title:
          'Implement and seed the ticket-system schema, then solve the provided CRUD query set',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 2: SQL CRUD and constraints**\n\nCreate and manipulate reliable relational data.\n\n> Platform note: Keep using the same database from day 1. Run `psql "$DATABASE_URL" -f schema.sql`, then `psql "$DATABASE_URL" -f seed.sql`. Try invalid inserts in the same session and read the constraint errors. For the stretch goal, write a reset script with `dropdb support_tickets`, `createdb support_tickets`, then both files again.\n\n## Today\'s goal\nPractise SQL statements and enforce business rules at database level.\n\n## What you should know by the end of today\n- Write INSERT, SELECT, UPDATE and DELETE queries.\n- Use WHERE, ORDER BY and LIMIT.\n- Apply NOT NULL, UNIQUE, CHECK and foreign keys.\n\n## Task\nImplement and seed the ticket-system schema, then solve the provided CRUD query set.\n\n## Functional requirements\n- Queries for open tickets, high-priority tickets, status updates and safe deletion.\n- Constraints preventing invalid priorities, duplicate users and orphan records.\n\n## Engineering expectations\n- Store queries in version-controlled SQL files.\n- Use meaningful sample data.\n\n## Suggested implementation order\n1. Create schema.\n2. Insert seed data.\n3. Run each query manually.\n4. Test invalid inserts.\n5. Document expected results.\n\n## Resources\n- PostgreSQL SQL tutorial — Read tables, rows and querying sections.\n',
      },
      {
        id: 'postgresql-day-02-t-2',
        sequenceOrder: 2,
        title: 'Create a reusable reset script for the training database',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 2: SQL CRUD and constraints** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nCreate a reusable reset script for the training database.\n\n## Builds on\nImplement and seed the ticket-system schema, then solve the provided CRUD query set.\n',
      },
    ],
  },
  {
    dayId: 'postgresql-day-03',
    dayNumber: 3,
    courseTitle: 'PostgreSQL',
    tasks: [
      {
        id: 'postgresql-day-03-t-1',
        sequenceOrder: 1,
        title: 'Create a reporting SQL pack for the Support Ticket system',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 3: Joins, grouping and reports**\n\nAnswer business questions using SQL.\n\n> Platform note: The reports run against your own `support_tickets` database. If it is empty, load the provided sample schema and rows once with `psql "$DATABASE_URL" -f sample-data.sql`. Run a whole file with `psql "$DATABASE_URL" -f queries.sql`, or open a session and use `\\i queries.sql`.\n\n## Today\'s goal\nUse joins and aggregation to produce useful reports.\n\n## What you should know by the end of today\n- Choose inner versus outer joins.\n- Use GROUP BY, HAVING and aggregate functions.\n- Build readable multi-table queries.\n\n## Task\nCreate a reporting SQL pack for the Support Ticket system.\n\n## Functional requirements\n- Ticket count by status and assignee.\n- Customers with more than five open tickets.\n- Users with no assigned tickets.\n- Oldest unresolved ticket.\n- Counts by category and priority.\n\n## Engineering expectations\n- Every report includes a comment stating the business question.\n- Format complex SQL for readability.\n\n## Suggested implementation order\n1. Confirm required output columns.\n2. Build base joins.\n3. Add grouping and filters.\n4. Verify using known seed data.\n5. Explain one complex query.\n\n## Resources\n- PostgreSQL SQL tutorial — Focus on joins and aggregate functions.\n',
      },
      {
        id: 'postgresql-day-03-t-2',
        sequenceOrder: 2,
        title: 'Create a weekly workload report using a common table expression',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 3: Joins, grouping and reports** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nCreate a weekly workload report using a common table expression.\n\n## Builds on\nCreate a reporting SQL pack for the Support Ticket system.\n',
      },
    ],
  },
  {
    dayId: 'postgresql-day-04',
    dayNumber: 4,
    courseTitle: 'PostgreSQL',
    tasks: [
      {
        id: 'postgresql-day-04-t-1',
        sequenceOrder: 1,
        title:
          'Implement transactional ticket reassignment and compare a search query before and after indexing',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**PostgreSQL · Day 4: Transactions and indexes**\n\nProtect multi-step operations and improve query performance.\n\n> Platform note: `sample-data.sql` also adds 5,000 generated tickets, so `EXPLAIN ANALYZE` shows a real difference before and after an index. Load it once into `support_tickets` if you need the volume. Time statements with `\\timing`, and wrap changes in `BEGIN` and `COMMIT`; also try `ROLLBACK`.\n\n## Today's goal\nUse transactions for atomic changes and indexes for justified performance needs.\n\n## What you should know by the end of today\n- Explain commit and rollback.\n- Implement a multi-step transaction.\n- Read a basic EXPLAIN plan.\n\n## Task\nImplement transactional ticket reassignment and compare a search query before and after indexing.\n\n## Functional requirements\n- Update assignee, insert history and add a system comment as one transaction.\n- Rollback when any operation fails.\n- Capture EXPLAIN output before and after an index.\n\n## Engineering expectations\n- Do not add indexes without a query-based reason.\n- Demonstrate rollback with a deliberate failure.\n\n## Suggested implementation order\n1. Write the non-transactional sequence.\n2. Wrap it in a transaction.\n3. Force a failure and verify rollback.\n4. Measure a query plan.\n5. Create and justify an index.\n\n## Resources\n- PostgreSQL advanced tutorial — Read transactions.\n- PostgreSQL documentation — Read the introduction to indexes.\n",
      },
      {
        id: 'postgresql-day-04-t-2',
        sequenceOrder: 2,
        title: 'Investigate a composite index for status and assignee',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 4: Transactions and indexes** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nInvestigate a composite index for status and assignee.\n\n## Builds on\nImplement transactional ticket reassignment and compare a search query before and after indexing.\n',
      },
    ],
  },
  {
    dayId: 'postgresql-day-05',
    dayNumber: 5,
    courseTitle: 'PostgreSQL',
    tasks: [
      {
        id: 'postgresql-day-05-t-1',
        sequenceOrder: 1,
        title: 'Design and implement the Equipment Booking System database',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**PostgreSQL · Day 5: Database assessment**\n\nDemonstrate independent database design and SQL skills.\n\n> Platform note: This assessment uses a new domain, so create a separate database instead of reusing the ticket one: `createdb assessment`, then `psql assessment`. Your `DATABASE_URL` still points at `support_tickets`; here you connect by name.\n\n## Today's goal\nDesign the database for an Equipment Booking System.\n\n## What you should know by the end of today\n- Model a new domain.\n- Create constraints, reports, a transaction and indexes.\n- Explain design choices.\n\n## Task\nDesign and implement the Equipment Booking System database.\n\n## Functional requirements\n- Employees, equipment, categories, bookings, approvals and maintenance records.\n- Seed data, ten required queries, one transaction and two justified indexes.\n\n## Engineering expectations\n- Submit an ER diagram and runnable SQL scripts.\n- A clean database reset must reproduce the result.\n\n## Suggested implementation order\n1. Analyse requirements.\n2. Create ER diagram.\n3. Implement schema.\n4. Seed data.\n5. Complete queries, transaction and indexes.\n6. Validate from a clean database.\n\n## Resources\n- PostgreSQL tutorial — Use as reference only.\n",
      },
    ],
  },
  {
    dayId: 'postgresql-day-06',
    dayNumber: 6,
    courseTitle: 'PostgreSQL',
    tasks: [
      {
        id: 'postgresql-day-06-t-1',
        sequenceOrder: 1,
        title: 'Replace the file repository with PostgreSQL',
        isStretchGoal: false,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 6: Node.js with PostgreSQL**\n\nReplace file storage with a real database.\n\n> Platform note: This project connects to the same local PostgreSQL server. For this task the app creates `support_tickets` and `support_tickets_test` if they are missing, and sets `DATABASE_URL` and `VINKUP_TEST_DATABASE_URL`. If the course database is still empty, load the schema once with `psql "$DATABASE_URL" -f db/setup.sql`. `npm test` rebuilds the test database first, then runs Vitest against it.\n\n## Today\'s goal\nConnect the Support Ticket API to PostgreSQL through a repository layer.\n\n## What you should know by the end of today\n- Configure connections safely.\n- Use parameterised queries.\n- Handle database failures.\n\n## Task\nReplace the file repository with PostgreSQL.\n\n## Functional requirements\n- Connection health check.\n- CRUD repository methods.\n- No SQL injection vulnerabilities.\n\n## Engineering expectations\n- Keep controllers and services unchanged where possible.\n- Never concatenate untrusted SQL values.\n\n## Suggested implementation order\n1. Configure database environment variables.\n2. Create connection module.\n3. Implement repository methods.\n4. Run endpoint tests.\n5. Test database failure.\n\n## Resources\n- Node.js Learn — Review environment variables.\n- PostgreSQL docs — Use connection and SQL references.\n',
      },
      {
        id: 'postgresql-day-06-t-2',
        sequenceOrder: 2,
        title: 'Add graceful shutdown of the connection pool',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**PostgreSQL · Day 6: Node.js with PostgreSQL** · Stretch task\n\n> Attempt this only when the main task is finished.\n\n## Task\nAdd graceful shutdown of the connection pool.\n\n## Builds on\nReplace the file repository with PostgreSQL.\n',
      },
    ],
  },
];
