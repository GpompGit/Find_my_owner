# Security Rules

## SQL Injection Prevention

- ALWAYS use parameterized queries with `?` placeholders: `db.query('SELECT * FROM users WHERE id = ?', [id])`
- NEVER concatenate user input into SQL strings
- NEVER use template literals for SQL with user-supplied values
- This applies to ALL queries — SELECT, INSERT, UPDATE, DELETE

## Authentication (Magic Link — Passwordless)

- No passwords are stored or transmitted — authentication is via magic link email
- Generate tokens with `crypto.randomBytes(32)` — never use predictable values
- Magic link tokens MUST expire (default: 15 minutes)
- Tokens are single-use — mark as `used = TRUE` after verification
- Clean up expired tokens regularly (nightly cleanup job)
- Store user ID in session after login: `req.session.userId`
- Destroy session completely on logout: `req.session.destroy()`

## Authorization

- Every route that accesses user-specific data MUST use `requireAuth` middleware
- Every route that modifies a specific bike MUST use `requireOwner` middleware
- Admin routes MUST use `requireAdmin` middleware
- Never trust client-side data for authorization decisions — always verify server-side

## Session Security

- Set `secure: true` on session cookies (HTTPS via Cloudflare Tunnel)
- Set `httpOnly: true` — cookies must not be accessible from JavaScript
- Set `sameSite: 'lax'` minimum
- Use a strong, random `SESSION_SECRET` (minimum 32 bytes)

## Input Validation

- Validate and sanitize all user input on the server side
- Validate email format before database insertion
- Limit file upload size and allowed MIME types (images only for bike photos)
- Validate UUID format for `tag_uid` parameters in public routes

## XSS Prevention

- Use EJS escaped output `<%= %>` for ALL user-supplied data in templates
- Only use unescaped `<%- %>` for trusted content (partials, pre-sanitized HTML)
- Never render raw user input in HTML attributes without escaping

## Secrets Management

- All secrets go in `.env` — never hardcode in source files
- `.env` is in `.gitignore` — never commit it
- Use `.env.example` as a template with placeholder values only
- Never log secret values (passwords, session secrets, API keys, SMTP credentials)

## File Uploads

- Generate random UUIDs for uploaded filenames — never use the original filename
- Store uploads outside the web root or in a dedicated directory with restricted access
- Validate file type by checking both MIME type and file extension
- Set reasonable size limits via multer configuration
