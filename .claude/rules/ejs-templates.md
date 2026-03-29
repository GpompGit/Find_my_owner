# EJS Template Rules

## Output Escaping

- Use `<%= expression %>` (escaped) for ALL user-supplied data — this is the default and the safe choice
- Only use `<%- expression %>` (unescaped) for:
  - Including partials: `<%- include('../partials/header') %>`
  - Pre-generated HTML that is trusted (e.g. QR code SVG from the `qrcode` library)
- When in doubt, use escaped `<%= %>`

## Layout Structure

- Every page MUST include the header and footer partials:
  ```ejs
  <%- include('../partials/header') %>
  <!-- page content -->
  <%- include('../partials/footer') %>
  ```
- Pass the page title to the header partial: `<%- include('../partials/header', { title: 'Dashboard' }) %>`

## Forms

- All forms that modify data MUST use `POST` method
- Delete and status-change actions use `POST`, not `GET` — prevent accidental triggering via links
- Display validation errors and success messages using `connect-flash` messages
- Show flash messages in the header partial so they appear on every page

## Accessibility

- All `<img>` tags must have `alt` attributes
- Form inputs must have associated `<label>` elements
- Use semantic HTML elements (`<nav>`, `<main>`, `<footer>`, `<section>`)

## Public vs Authenticated Pages

- Public pages (scan page, contact form) must NOT include navigation links to authenticated areas
- Authenticated pages show the user's name and a logout link in the header
- Admin pages use the same layout but may include additional admin navigation
