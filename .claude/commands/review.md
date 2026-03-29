# Code Review

Review the changed or specified files for issues specific to this project.

## Checklist

1. **SQL Injection** — Are all queries parameterized with `?` placeholders? Flag any string concatenation in SQL.
2. **Authentication** — Do all non-public routes use `requireAuth`? Do bike-specific routes use `requireOwner`?
3. **XSS** — Are all EJS outputs using escaped `<%= %>` for user data? Flag any `<%- %>` with user input.
4. **Input Validation** — Is user input validated before use? Check email format, UUID format, file types.
5. **Error Handling** — Do async handlers have try/catch? Are errors logged without exposing PII?
6. **GDPR** — Does location code respect stolen-only rule? Are expiry dates set on GPS records?
7. **Session Security** — Are session cookies configured with secure, httpOnly, sameSite flags?
8. **Database** — Are queries selecting specific columns (not `SELECT *`)? Are ownership checks present?
9. **Business Logic** — Does garage payment logic correctly reset cycles? Are reminder flags updated?
10. **Templates** — Do all pages include header/footer partials? Do forms use POST method?

## Output Format

For each issue found, report:
- **File and line number**
- **Severity:** Critical / Warning / Suggestion
- **Issue description** and **fix recommendation**

Summarize with a pass/fail verdict and count of issues by severity.
