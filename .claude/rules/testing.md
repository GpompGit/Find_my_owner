# Testing Rules

## Framework

- Use **Mocha** as the test runner, **Chai** for assertions, **Supertest** for HTTP route testing
- Test files go in a `test/` directory mirroring the source structure
- Name test files with `.test.js` suffix: `auth.test.js`, `bikes.test.js`

## What to Test

### Route Tests (required for every route)
- Authentication: unauthenticated requests get redirected to `/login` (302)
- Authorization: accessing another user's bike returns 403
- Admin routes: non-admin users get 403
- Valid requests return correct status codes and render expected templates
- Form submissions with missing/invalid data return appropriate errors

### Middleware Tests
- `requireAuth` — blocks unauthenticated, passes authenticated
- `requireOwner` — blocks non-owners, passes owners
- `requireAdmin` — blocks regular users, passes admin

### Database Tests
- Parameterized queries work correctly with edge-case inputs (special characters, unicode)
- Ownership checks prevent cross-user data access

### GDPR Tests
- Cleanup script nullifies location data past expiry
- Location is NOT requested for active bikes
- Public page shows only first name

### Integration Tests
- Full registration → login → add bike → view dashboard flow
- Public scan → contact form submission flow
- Stolen bike scan → GPS consent → location logged flow

## Test Database

- Tests run against a separate test database (`quartier_bikes_test`)
- Each test suite sets up and tears down its own data
- Never run tests against the production database
