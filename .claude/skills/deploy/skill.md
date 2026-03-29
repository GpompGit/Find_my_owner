# Deploy Skill

Triggered when preparing a deployment to the Synology NAS.

## Pre-flight Checklist

Run through each item and report pass/fail:

1. **No debug code** — Search for `console.log` statements that output sensitive data (passwords, emails, session secrets). Informational logs (startup messages, error context) are fine.

2. **No hardcoded secrets** — Search all `.js` and `.ejs` files for hardcoded passwords, API keys, IP addresses (except in docs/comments). All secrets must come from `process.env`.

3. **Environment variables** — Compare `.env.example` with all `process.env.*` references in the codebase. Flag any variable used in code but missing from `.env.example`.

4. **Schema sync** — Compare the table structure in `db/schema.sql` with any `CREATE TABLE` or `ALTER TABLE` statements found in route files or migration scripts.

5. **Dependencies** — Verify all `require()` calls reference packages listed in `package.json`. Flag any missing dependencies.

6. **Git status** — Check for uncommitted changes, untracked files that should be committed, or files that should be in `.gitignore`.

## Output

A deployment readiness report with pass/fail for each check and a final GO / NO-GO verdict.
