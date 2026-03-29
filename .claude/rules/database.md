# Database Rules — MariaDB

## Query Safety

- Always use parameterized queries: `db.query('... WHERE id = ?', [id])`
- Never build SQL with string concatenation or template literals containing user input
- Use `?` for single values and `(??)` for column names only when absolutely necessary

## Query Style

- Avoid `SELECT *` in application code — list specific columns needed
- Always include `WHERE` clauses on UPDATE and DELETE — never update/delete all rows unintentionally
- Use `LIMIT` on SELECT queries that could return large result sets

## Ownership Validation

- Every query that reads or modifies a bicycle MUST include `AND owner_id = ?` with the session user ID
- Exception: admin routes and public scan routes (which use `tag_uid`, not `id`)
- The `requireOwner` middleware handles this — never bypass it

## Connection Management

- Use a connection pool via `mysql2` — never create individual connections per request
- The pool is configured in `db/connection.js` — import from there, never create new pools
- Use `pool.promise()` for async/await compatibility

## Schema Changes

- All schema changes must be reflected in `db/schema.sql`
- Test migrations on a backup database before applying to production
- Never drop columns or tables without confirming data is backed up
- Add appropriate indexes for columns used in WHERE clauses (`tag_uid`, `owner_id`, `status`)

## Data Types

- Use `DATETIME` for timestamps, not `TIMESTAMP` (avoids timezone conversion issues)
- Use `DECIMAL` for money values (e.g. `payment_amount DECIMAL(6,2)`)
- Use `VARCHAR` with appropriate length limits — not `TEXT` unless truly unbounded
- Use `ENUM` for fixed sets of values (`status`, `payment_status`)
