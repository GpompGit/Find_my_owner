# Fix Issue

Takes a GitHub issue number or description and applies a fix.

## Process

1. Read the issue description and any comments for full context
2. Identify the affected files — search the codebase for relevant code
3. Understand the root cause before writing any fix
4. Implement the minimal fix that resolves the issue without side effects
5. Verify the fix doesn't break existing functionality
6. Check that the fix follows project rules (security, database, GDPR, code style)
7. Commit with a message referencing the issue: `Fix #<number>: <description>`

## Guidelines

- Fix the actual problem, not just the symptom
- Don't refactor surrounding code — keep the diff minimal
- If the fix requires a database schema change, update `db/schema.sql`
- If the fix affects public-facing pages, verify XSS safety
- If the fix touches authentication or authorization, run through the security checklist
