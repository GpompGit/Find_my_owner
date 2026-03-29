# Test Routes

Audit all route handlers for correctness, security, and completeness.

## Process

1. Read every file in `routes/` and `middleware/`
2. For each route, verify:

### Authentication & Authorization
- Public routes (`/`, `/login`, `/register`, `/bike/:uid`, `/contact/:id`) — no auth required
- User routes (`/dashboard`, `/bikes/*`) — `requireAuth` applied
- Owner routes (`/bikes/edit/:id`, `/bikes/delete/:id`, `/bikes/stolen/:id`) — `requireAuth` + `requireOwner` applied
- Admin routes (`/admin/*`) — `requireAdmin` applied

### HTTP Methods
- Data reads use `GET`
- Data mutations use `POST`
- No `GET` routes that modify data (delete, status change, payment)

### Response Handling
- Every route sends a response (render, redirect, or JSON)
- No hanging requests (missing `return` before `res.render/redirect`)
- Error cases return appropriate status codes

### Input Handling
- Route parameters validated (`:id` is numeric, `:uid` is UUID format)
- Form data validated before database operations
- File uploads restricted to allowed types and sizes

## Output

A table of all routes with their status:

| Route | Method | Auth | Owner | Validation | Status |
|-------|--------|------|-------|------------|--------|

Mark each as PASS or FAIL with explanation for failures.
