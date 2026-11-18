// Sample data for the PostgreSQL days that start from the Support Ticket schema
// (reports, transactions and indexes). The design/implement/assessment days start empty.
// It ships in the task as sample-data.sql instead of being loaded by the app: the trainee
// creates the database and runs the file with psql.

const TICKET_SCHEMA = `create table users (
  id serial primary key,
  name text not null,
  email text not null unique,
  role text not null default 'agent' check (role in ('agent', 'admin'))
);

create table customers (
  id serial primary key,
  name text not null,
  email text not null unique
);

create table categories (
  id serial primary key,
  name text not null unique
);

create table tickets (
  id serial primary key,
  title text not null,
  description text not null default '',
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  customer_id int not null references customers (id),
  category_id int references categories (id),
  assignee_id int references users (id),
  created_at timestamptz not null default now()
);

create table ticket_assignments (
  id serial primary key,
  ticket_id int not null references tickets (id) on delete cascade,
  user_id int not null references users (id),
  assigned_at timestamptz not null default now()
);

create table comments (
  id serial primary key,
  ticket_id int not null references tickets (id) on delete cascade,
  author_id int references users (id),
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table ticket_status_history (
  id serial primary key,
  ticket_id int not null references tickets (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by int references users (id),
  changed_at timestamptz not null default now()
);
`;

const TICKET_SEED = `insert into users (name, email, role) values
  ('Asha Menon', 'asha@example.com', 'admin'),
  ('Rahul Nair', 'rahul@example.com', 'agent'),
  ('Meera Pillai', 'meera@example.com', 'agent'),
  ('Vikram Das', 'vikram@example.com', 'agent'),
  ('Nisha Varma', 'nisha@example.com', 'agent');

insert into customers (name, email) values
  ('Acme Logistics', 'support@acme.example'),
  ('Blue Harbour Foods', 'it@blueharbour.example'),
  ('Coastal Clinics', 'ops@coastal.example'),
  ('Delta Schools', 'admin@delta.example'),
  ('Evergreen Retail', 'help@evergreen.example');

insert into categories (name) values ('Billing'), ('Bug'), ('Access'), ('Feature request');

insert into tickets (title, priority, status, customer_id, category_id, assignee_id, created_at) values
  ('Invoice total is wrong', 'high', 'open', 1, 1, 2, now() - interval '12 days'),
  ('Cannot reset password', 'urgent', 'in_progress', 2, 3, 3, now() - interval '3 days'),
  ('Export to CSV fails', 'medium', 'open', 1, 2, 2, now() - interval '9 days'),
  ('Add dark mode', 'low', 'open', 3, 4, null, now() - interval '20 days'),
  ('Duplicate charge on card', 'urgent', 'resolved', 4, 1, 4, now() - interval '15 days'),
  ('Report page is slow', 'high', 'open', 1, 2, 3, now() - interval '6 days'),
  ('New user cannot log in', 'high', 'closed', 5, 3, 2, now() - interval '30 days'),
  ('Typo on pricing page', 'low', 'resolved', 3, 2, 4, now() - interval '8 days');

-- Acme Logistics has more than five open tickets (for the "customers with more than five open tickets" report)
insert into tickets (title, priority, status, customer_id, category_id, assignee_id, created_at)
select 'Acme follow-up #' || n, 'medium', 'open', 1, 2, 2, now() - (n || ' days')::interval
from generate_series(1, 4) as n;

insert into ticket_assignments (ticket_id, user_id)
select id, assignee_id from tickets where assignee_id is not null;

insert into comments (ticket_id, author_id, body) values
  (1, 2, 'Checked the invoice, looks like a tax rounding issue.'),
  (2, 3, 'Asked the customer for the email address used.'),
  (5, 4, 'Refund issued.');

insert into ticket_status_history (ticket_id, from_status, to_status, changed_by) values
  (2, 'open', 'in_progress', 3),
  (5, 'open', 'resolved', 4),
  (7, 'open', 'closed', 2);
`;

// 5,000 extra tickets so EXPLAIN shows a real difference before and after an index
const BULK_TICKETS = `insert into tickets (title, priority, status, customer_id, category_id, assignee_id, created_at)
select
  'Generated ticket ' || n,
  (array['low', 'medium', 'high', 'urgent'])[1 + n % 4],
  (array['open', 'in_progress', 'resolved', 'closed'])[1 + n % 4],
  1 + n % 5,
  1 + n % 4,
  2 + n % 4,
  now() - (n % 90 || ' days')::interval
from generate_series(1, 5000) as n;

analyze;
`;

/** The Support Ticket tables, without rows. Day 6's project creates a test database from this. */
export const POSTGRES_TICKET_SCHEMA = TICKET_SCHEMA;

export const POSTGRES_SAMPLE_DATA_BY_DAY: Record<string, string | null> = {
  'postgresql-day-01': null, // design the schema yourself
  'postgresql-day-02': null, // implement and seed it yourself
  'postgresql-day-03': TICKET_SCHEMA + '\n' + TICKET_SEED, // reports
  'postgresql-day-04': TICKET_SCHEMA + '\n' + TICKET_SEED + '\n' + BULK_TICKETS, // transactions + EXPLAIN
  'postgresql-day-05': null, // assessment: new domain from scratch
};
