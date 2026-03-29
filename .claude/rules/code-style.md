# Code Style — Express / Node.js Conventions

## General

- Use `async/await` for all asynchronous operations — never raw callbacks
- Wrap async route handlers with try/catch or an async error wrapper
- Use `const` by default, `let` only when reassignment is needed, never `var`
- Use strict equality (`===`) everywhere
- Keep route handlers thin — extract business logic into separate functions when a handler exceeds ~30 lines

## Route Handlers

- Every route file exports an Express Router instance
- Group related routes in a single file (e.g. all `/bikes/*` routes in `routes/bikes.js`)
- Apply middleware in the router, not in `app.js`, unless it's global
- Always return a response — never leave a request hanging
- Use appropriate HTTP status codes: 200 OK, 201 Created, 301/302 Redirect, 400 Bad Request, 403 Forbidden, 404 Not Found, 500 Internal Server Error

## Error Handling

- Never expose stack traces or internal error details to the client
- Log errors to console with enough context to debug (route, user ID, error message)
- Use a global error handler middleware as the last `app.use()` in `app.js`
- Flash messages for user-facing errors in form submissions (via `connect-flash`)

## File Naming

- Use kebab-case for file names: `require-auth.js`, `bike-list.ejs`
- Exception: existing files use camelCase (`requireAuth.js`) — maintain consistency with what exists

## Dependencies

- Use `require()` (CommonJS) — this project does not use ES modules
- Group requires: Node built-ins first, then npm packages, then local modules
- Never require inside functions — keep all requires at the top of the file
