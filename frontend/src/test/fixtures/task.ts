import type { TaskResponse, TaskCodeResponse } from '@itp/types';

export const taskFixture: TaskResponse = {
  id: 't1',
  title: 'Services Grid Layout',
  isStretchGoal: false,
  sequenceOrder: 7,
  estimatedMinutes: 50,
  status: 'in_progress',
  reviewStatus: null,
  submissionCount: 0,
  day: {
    id: 'd1',
    dayNumber: 1,
    courseTitle: 'CSS',
  },
  runtime: 'browser',
  runCommand: null,
  setupSql: null,
  instructionsMarkdown: `## Hands-on Objective
Implement production-grade responsive layout components for the client portal
services view inside \`services.html\` adhering to semantic structuring and
responsive grid mechanics.

## Functional Requirements
- **Three-Column Services Grid** — Construct a responsive card cluster using
  \`repeat(3, 1fr)\` with consistent 24px gutter distributions.
- **Highlighted Pricing Matrix** — Style tier comparison layout with an
  elevated accent glow for the center _Recommended_ enterprise tier.
- **Two-Column CTA Split** — Integrate call-to-action layout section
  featuring inline contact trigger action with dynamic alignment.
- **Breakpoint Adaptability** — Define explicit adaptive media queries at
  \`768px\` and \`480px\` viewport limits.

## Engineering Standards
> - Prioritize modern CSS Grid syntax over legacy floating containers or flex
hacks.
> - Maintain strict BEM semantic naming convention (\`.service-card__badge\`).
> - Enforce WCAG 2.1 AA compliant color contrast ratios across all states.

## Suggested Roadmap
1. Map HTML skeleton structure & semantic tags
2. Build the three-column grid
3. Style the featured pricing tier
4. Add 768px and 480px breakpoints
`,
};

export const taskCodeFixture: TaskCodeResponse = {
  updatedAt: null,
  files: [
    {
      path: 'services.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Services</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="service-grid">
      <div class="service-card">Starter</div>
      <div class="service-card service-card--recommended">Recommended</div>
      <div class="service-card">Enterprise</div>
    </main>
    <section class="cta-split">
      <div>Ready to get started?</div>
      <a href="#" class="cta-split__action">Contact us</a>
    </section>
    <script src="script.js"></script>
  </body>
</html>
`,
    },
    {
      path: 'styles.css',
      content: `.service-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 24px;
}

.service-card {
  border: 1px solid #e4e5ec;
  border-radius: 12px;
  padding: 16px;
}

.service-card--recommended {
  box-shadow: 0 0 0 2px #7c41e4;
}

@media (max-width: 768px) {
  .service-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .service-grid {
    grid-template-columns: 1fr;
  }
}
`,
    },
    {
      path: 'script.js',
      content: `// Add interactivity for the services grid here.
`,
    },
    {
      path: 'package.json',
      content: `{
  "name": "services-grid-task",
  "version": "1.0.0",
  "private": true
}
`,
    },
    {
      path: 'test.spec.js',
      content: `describe('services grid', () => {
  it.todo('renders three service cards');
});
`,
    },
    {
      path: 'assets/logo.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#7c41e4"/></svg>
`,
    },
    {
      path: 'assets/banner-grid.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="24" viewBox="0 0 64 24"><rect width="64" height="24" rx="4" fill="#ead5ff"/></svg>
`,
    },
  ],
};

export function makeTaskCode(overrides: Partial<TaskCodeResponse> = {}): TaskCodeResponse {
  return { ...taskCodeFixture, ...overrides };
}

export const nodeTaskFixture: TaskResponse = {
  id: 't-node',
  title: 'System Information CLI',
  isStretchGoal: false,
  sequenceOrder: 1,
  estimatedMinutes: 30,
  status: 'not_started',
  reviewStatus: null,
  submissionCount: 0,
  day: {
    id: 'd-node-1',
    dayNumber: 1,
    courseTitle: 'Node.js',
  },
  runtime: 'node',
  runCommand: 'npm test',
  setupSql: null,
  instructionsMarkdown: `## Hands-on Objective
Write a small Node.js module that reports basic information about the
current system, and make the provided test pass.

## Functional Requirements
- Export a \`getInfo()\` function from \`src/sysinfo.js\`.
- Return an object with \`platform\`, \`arch\` and \`nodeVersion\` keys.
- Make \`npm test\` pass without changing \`src/sysinfo.test.js\`.
`,
};

export const nodeTaskCodeFixture: TaskCodeResponse = {
  updatedAt: null,
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "system-info-cli",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
`,
    },
    {
      path: 'src/sysinfo.js',
      content: `function getInfo() {
  // TODO: return platform, arch and nodeVersion
}

module.exports = { getInfo };
`,
    },
    {
      path: 'src/sysinfo.test.js',
      content: `const test = require('node:test');
const assert = require('node:assert');
const { getInfo } = require('./sysinfo');

test('getInfo returns platform, arch and nodeVersion', () => {
  const info = getInfo();
  assert.ok(info.platform);
  assert.ok(info.arch);
  assert.ok(info.nodeVersion);
});
`,
    },
  ],
};

export const sqlTaskFixture: TaskResponse = {
  id: 't-sql',
  title: 'Ticket System Schema',
  isStretchGoal: false,
  sequenceOrder: 1,
  estimatedMinutes: 40,
  status: 'not_started',
  reviewStatus: null,
  submissionCount: 0,
  day: {
    id: 'd-sql-1',
    dayNumber: 1,
    courseTitle: 'PostgreSQL',
  },
  runtime: 'sql',
  runCommand: null,
  setupSql: null,
  instructionsMarkdown: `## Hands-on Objective
Design a simple ticket-tracking schema in \`schema.sql\`, seed it with a
few rows in \`seed.sql\`, and write two read queries in \`queries.sql\`.

## Functional Requirements
- A \`tickets\` table with an id, title, status and created_at column.
- \`seed.sql\` inserts three sample tickets.
- \`queries.sql\` selects all open tickets, and counts tickets per status.
`,
};

export const sqlTaskCodeFixture: TaskCodeResponse = {
  updatedAt: null,
  files: [
    {
      path: 'schema.sql',
      content: `create table tickets (
  id serial primary key,
  title text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
`,
    },
    {
      path: 'seed.sql',
      content: `insert into tickets (title, status) values
  ('Login button is unresponsive', 'open'),
  ('Add dark mode toggle', 'open'),
  ('Fix typo on pricing page', 'closed');
`,
    },
    {
      path: 'queries.sql',
      content: `select * from tickets where status = 'open';

select status, count(*) from tickets group by status;
`,
    },
  ],
};

/** Not wired to a URL: a SQL task whose database starts with a table and two rows. */
export const sqlTaskWithSetupFixture: TaskResponse = {
  ...sqlTaskFixture,
  id: 't-sql-setup',
  setupSql:
    "create table rooms (id serial primary key, name text not null); insert into rooms (name) values ('A'), ('B');",
};
