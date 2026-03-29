# Security Review Skill

Triggered when authentication, authorization, or middleware files are modified.

## Trigger Files

- `middleware/requireAuth.js`
- `middleware/requireOwner.js`
- `middleware/requireAdmin.js`
- `routes/auth.js`
- `routes/location.js`
- `app.js` (session configuration)

## Audit Steps

1. **Middleware coverage** — Read `app.js` and all route files. Build a map of every route and which middleware is applied. Flag any protected route missing auth middleware.

2. **Password handling** — Verify bcrypt is used with >= 12 rounds. Confirm passwords are never logged, returned in responses, or stored in session.

3. **Session configuration** — Check that session cookies have `secure`, `httpOnly`, and `sameSite` flags set. Verify `SESSION_SECRET` comes from `.env`.

4. **SQL injection scan** — Search all `.js` files for SQL queries. Flag any that use string concatenation or template literals with variables instead of `?` placeholders.

5. **XSS scan** — Search all `.ejs` files for `<%- %>` (unescaped output). Flag any that output user-supplied data without escaping. Allowed: `include()` calls, QR SVG output.

6. **File upload safety** — Check multer configuration for file size limits and MIME type restrictions. Verify uploaded filenames are UUIDs, not user-supplied.

7. **Public route exposure** — Verify `/bike/:uid` only exposes first name. Verify no internal IDs leak in public HTML or API responses.

## Output

Report findings as:
- **CRITICAL** — Must fix before deployment (SQL injection, auth bypass, exposed secrets)
- **WARNING** — Should fix (missing httpOnly, overly permissive queries)
- **INFO** — Best practice suggestions
