# Practical checkpoint: workspace skills

You have **45 minutes** to finish the tasks below. Each practical question opens a
workspace with starter files. Edit the files, use the terminal if you need it, and
press **Run** when you are ready. Your workspace autosaves as you work.

Read each question carefully. Partial credit is given for working starter code.

## Question 1: Implement the greeting

Type: practical
Marks: 10
Runtime: node
Run: npm test

Open `index.js` and implement `greet(name)` so it returns `Hello, <name>!`.

Run `npm test` from the terminal (or press **Run**) until all tests pass.

```json file=package.json
{
  "name": "checkpoint-greeting",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node test.js"
  }
}
```

```javascript file=index.js
function greet(name) {
  // TODO: return "Hello, <name>!"
}

module.exports = { greet };
```

```javascript file=test.js
const assert = require('node:assert');
const { greet } = require('./index');

assert.strictEqual(greet('Ada'), 'Hello, Ada!');
assert.strictEqual(greet('Grace'), 'Hello, Grace!');

console.log('All tests passed.');
```

## Question 2: Build the profile card

Type: practical
Marks: 10
Runtime: browser

Finish the profile card in `index.html` and `styles.css`:

1. Give `.card` a white background, 24px padding, rounded corners and a shadow.
2. Center the card on the page.
3. Make the name use the accent colour `#6c47ff`.

The Result pane previews the page automatically. Edit the files and check the preview.

```html file=index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Profile card</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <article class="card">
      <h1 class="name">Ada Lovelace</h1>
      <p class="role">Mathematician</p>
    </article>
  </body>
</html>
```

```css file=styles.css
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #f3f4f6;
}

.card {
  /* TODO: background, padding, radius and shadow */
}

.name {
  /* TODO: accent colour */
}

.role {
  color: #4b5563;
}
```

## Question 3: Report the top customers

Type: practical
Marks: 10
Runtime: sql

The workspace database already contains `customers` and `orders`.

Write a query in `answer.sql` that returns every customer's `name` and their total
order value as `total_spent`, highest total first. Customers with no orders may be
left out.

```sql setup
create table customers (
  id serial primary key,
  name text not null,
  city text not null
);

create table orders (
  id serial primary key,
  customer_id integer not null references customers (id),
  total numeric(10, 2) not null
);

insert into customers (name, city) values
  ('Ada', 'London'),
  ('Grace', 'New York'),
  ('Linus', 'Helsinki');

insert into orders (customer_id, total) values
  (1, 120.00),
  (1, 80.00),
  (2, 200.00),
  (3, 50.00);
```

```sql file=answer.sql
-- Return name and total_spent, highest total first.
select
  c.name,
  -- TODO: total order value as total_spent
from customers c
join orders o on o.customer_id = c.id
group by c.id, c.name
order by total_spent desc;
```

## Question 4: Choose the install command

Type: Multiple choice
Marks: 5
Choices: npm install express | npm run express | node install express | git install express
Correct: A

Which command adds the `express` package to a Node project?

## Question 5: Explain transactions

Type: Long text
Marks: 5

In two or three sentences, explain when you would wrap several SQL statements in a
transaction, and what happens if one of them fails.
