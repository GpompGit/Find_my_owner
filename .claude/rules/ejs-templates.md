# EJS Template Rules — Bootstrap 5

## Output Escaping

- Use `<%= expression %>` (escaped) for ALL user-supplied data — this is the default and the safe choice
- Only use `<%- expression %>` (unescaped) for:
  - Including partials: `<%- include('../partials/header') %>`
  - Pre-generated HTML that is trusted (e.g. QR code SVG from the `qrcode` library)
- When in doubt, use escaped `<%= %>`

## Layout Structure

- Every page MUST include the header and footer partials:
  ```ejs
  <%- include('../partials/header', { title: 'Page Title' }) %>
  <main class="container py-4">
    <!-- page content -->
  </main>
  <%- include('../partials/footer') %>
  ```
- The header partial loads Bootstrap 5 CSS and Bootstrap Icons via CDN
- The footer partial loads Bootstrap 5 JS bundle via CDN
- Pass the page title to the header partial for the `<title>` tag

## Bootstrap 5 Component Usage

### Navigation
- Use `navbar navbar-expand-lg navbar-dark bg-dark` for the top navigation
- Include `navbar-toggler` for mobile responsive collapse
- Authenticated pages show user name and logout link in the navbar
- Public pages show minimal navigation (brand only, no auth links)

### Forms
- Use `form-control` on all text inputs, `form-select` on dropdowns
- Use `form-label` on all labels — every input must have an associated label
- Use `form-check` and `form-check-input` for checkboxes (e.g. garage parking)
- Use `form-floating` for login/register forms for a cleaner look
- Center forms on the page: `col-12 col-md-8 col-lg-6 mx-auto`
- Submit buttons use `btn btn-primary`, cancel/back links use `btn btn-outline-secondary`

### Tables
- Use `table table-striped table-hover` for data tables (dashboard, admin panels)
- Wrap tables in `<div class="table-responsive">` for mobile scrolling
- Use `table-dark` on `<thead>` for admin tables
- Status badges: `badge bg-success` (paid/active), `badge bg-warning text-dark` (pending), `badge bg-danger` (stolen/overdue)

### Cards
- Use `card` with `card-body` for content sections (bike details, forms, stats)
- Public scan page: `card` with `card-img-top` for the bike photo
- Admin stats: `card` in a `row` / `col` grid layout

### Alerts and Flash Messages
- Success: `alert alert-success`
- Error: `alert alert-danger`
- Info: `alert alert-info`
- Warning: `alert alert-warning`
- Flash messages render in the header partial, above the page content
- Use `alert-dismissible fade show` with a close button for flash messages

### Buttons
- Primary actions: `btn btn-primary` (submit, save, login)
- Secondary actions: `btn btn-outline-secondary` (cancel, back)
- Danger actions: `btn btn-outline-danger` (delete, report stolen)
- Success actions: `btn btn-outline-success` (mark paid, recover)
- Small buttons in tables: add `btn-sm`
- Group related buttons with `btn-group` or `d-flex gap-2`

## Forms

- All forms that modify data MUST use `POST` method
- Delete and status-change actions use `POST`, not `GET` — prevent accidental triggering via links
- Display validation errors and success messages using `connect-flash` messages
- Show flash messages in the header partial so they appear on every page

## Responsive Design

- All pages must work on mobile screens (QR scans happen on phones)
- Use Bootstrap grid: `col-12 col-md-6 col-lg-4` for card layouts
- Use `d-none d-md-block` to hide non-essential columns on mobile
- Test the public scan page on narrow viewports — it must be readable without zooming

## Accessibility

- All `<img>` tags must have `alt` attributes
- Form inputs must have associated `<label>` elements
- Use semantic HTML elements (`<nav>`, `<main>`, `<footer>`, `<section>`)
- Buttons must have descriptive text or `aria-label` for icon-only buttons

## Public vs Authenticated Pages

- Public pages (scan page, contact form) must NOT include navigation links to authenticated areas
- Authenticated pages show the user's name and a logout link in the navbar
- Admin pages use the same layout but may include additional admin navigation links

## Custom CSS

- `public/css/style.css` is for project-specific overrides only
- Do NOT rewrite Bootstrap utilities — use the built-in classes
- Use `style.css` for: brand colors, QR code sizing, print styles (`@media print`), stolen bike alert customization
