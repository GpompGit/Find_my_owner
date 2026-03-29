/**
 * app.js — Quartier Bike ID — Main Application Entry Point
 *
 * This is the file that starts everything. It:
 * 1. Loads environment variables from .env
 * 2. Creates an Express application
 * 3. Configures middleware (session, flash messages, static files)
 * 4. Mounts route files on their URL paths
 * 5. Adds error handling
 * 6. Starts the HTTP server
 *
 * Run with: node app.js
 * Or with PM2: pm2 start app.js --name quartier-bike-id
 */

// ─── 1. Load environment variables ──────────────────────────────────────────
// dotenv reads the .env file and sets each KEY=VALUE pair as process.env.KEY
// This MUST be the first thing that runs, before any code reads process.env
require('dotenv').config()

// ─── 2. Import dependencies ─────────────────────────────────────────────────
// Node built-ins first, then npm packages, then local modules

const path = require('path')        // Node built-in: file path utilities
const express = require('express')  // Web framework — handles HTTP requests
const session = require('express-session')  // Session middleware — remembers logged-in users
const flash = require('connect-flash')      // Flash messages — one-time notifications

// ─── 3. Import route files ──────────────────────────────────────────────────
// Each file handles a group of related routes (see routes/ folder)
const authRoutes = require('./routes/auth')
const dashboardRoutes = require('./routes/dashboard')
const bikesRoutes = require('./routes/bikes')
const publicRoutes = require('./routes/public')
const contactRoutes = require('./routes/contact')
const locationRoutes = require('./routes/location')
const adminRoutes = require('./routes/admin')
const legalRoutes = require('./routes/legal')

// ─── 4. Create the Express app ──────────────────────────────────────────────
const app = express()

// ─── 5. Configure the template engine ───────────────────────────────────────
// EJS (Embedded JavaScript) renders HTML templates with dynamic data.
// When you call res.render('dashboard', { bikes }), Express:
// 1. Looks in the 'views' folder for 'dashboard.ejs'
// 2. Passes { bikes } to the template
// 3. Returns the generated HTML to the browser
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

// ─── 6. Configure middleware (order matters!) ───────────────────────────────

/**
 * Parse URL-encoded form data.
 *
 * When a user submits a form like:
 *   <form method="POST" action="/register">
 *     <input name="email" value="a@b.com">
 *   </form>
 *
 * The browser sends: email=a%40b.com in the request body.
 * This middleware parses that into req.body.email = 'a@b.com'
 *
 * { extended: false } uses the simpler querystring library (sufficient for forms)
 */
app.use(express.urlencoded({ extended: false }))

/**
 * Parse JSON request bodies.
 *
 * Used by the GPS location endpoint — the browser sends:
 *   fetch('/api/log-location', { body: JSON.stringify({ lat, lng }) })
 *
 * This middleware parses that JSON into req.body.lat, req.body.lng
 */
app.use(express.json())

/**
 * Serve static files (CSS, JavaScript, images).
 *
 * Files in the 'public/' folder are served directly to the browser:
 *   public/css/style.css → GET /css/style.css
 *   public/js/location.js → GET /js/location.js
 *
 * The browser can request these files without going through any route handler.
 */
app.use(express.static(path.join(__dirname, 'public')))

/**
 * Serve uploaded files (bike photos and QR codes).
 *
 * Files in 'uploads/' are served under the /uploads URL path:
 *   uploads/photos/abc-123.jpg → GET /uploads/photos/abc-123.jpg
 *   uploads/qr/abc-123.png → GET /uploads/qr/abc-123.png
 */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

/**
 * Session middleware — how the app remembers who is logged in.
 *
 * HTTP is "stateless" — each request is independent. The browser doesn't
 * automatically tell the server "I'm user #5." Sessions solve this:
 *
 * 1. On first visit, Express creates a session and sends a cookie (session ID)
 * 2. The browser sends that cookie with every subsequent request
 * 3. Express looks up the session by that ID and restores req.session
 * 4. We store userId in the session at login, and check it in requireAuth
 *
 * Configuration:
 * - secret:            Used to sign the session cookie (prevents tampering)
 * - resave:            Don't save session if nothing changed (performance)
 * - saveUninitialized: Don't create session until something is stored (privacy)
 * - cookie.secure:     Only send cookie over HTTPS (Cloudflare Tunnel provides this)
 * - cookie.httpOnly:   JavaScript cannot read the cookie (prevents XSS theft)
 * - cookie.sameSite:   Cookie only sent for same-site requests (CSRF protection)
 * - cookie.maxAge:     Session lasts 7 days (in milliseconds)
 */
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // true in production (HTTPS), false in dev (HTTP)
    httpOnly: true,                                  // Browser JS cannot access this cookie
    sameSite: 'lax',                                 // Basic CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000                 // 7 days in milliseconds
  }
}))

/**
 * Flash messages — one-time notifications between requests.
 *
 * Flash messages are stored in the session and deleted after being displayed.
 * This is how the app shows "Registration successful!" after a redirect:
 *
 *   // In the route handler (before redirect):
 *   req.flash('success', 'Registration successful!')
 *   res.redirect('/login')
 *
 *   // In the EJS template (on the next page):
 *   <% if (messages.success) { %>
 *     <div class="alert alert-success"><%= messages.success %></div>
 *   <% } %>
 *
 * connect-flash requires express-session to work (flash data lives in the session).
 */
app.use(flash())

/**
 * Make flash messages and session data available to ALL templates.
 *
 * res.locals is an object that EJS templates can access automatically.
 * Instead of passing { messages, user } to every single res.render() call,
 * we set them once here and every template gets them for free.
 *
 * This middleware runs on EVERY request (no path filter).
 */
app.use((req, res, next) => {
  // Flash messages — available in templates as 'messages.success', 'messages.error'
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error')
  }

  // Current user info — available in templates as 'currentUser'
  // Templates use this to show/hide navigation items (e.g., logout link)
  res.locals.currentUser = {
    id: req.session.userId || null,
    name: req.session.userName || null,
    isAdmin: req.session.isAdmin || false
  }

  next()
})

// ─── 7. Mount route files ───────────────────────────────────────────────────
//
// app.use(path, router) tells Express:
// "For any request starting with this path, use this router."
//
// The path here is a prefix — it's prepended to the routes defined
// in each route file. For example:
//   app.use('/', authRoutes)     → authRoutes defines '/login' → final path: /login
//   app.use('/admin', adminRoutes) → adminRoutes defines '/' → final path: /admin
//
// Order doesn't matter for app.use() with different paths,
// but we list them logically anyway.

app.use('/', authRoutes)             // /register, /login, /logout
app.use('/', dashboardRoutes)        // /dashboard
app.use('/bikes', bikesRoutes)       // /bikes/add, /bikes/edit/:id, etc.
app.use('/', publicRoutes)           // /bike/:uid (public scan page)
app.use('/', contactRoutes)          // /contact/:id (finder contact form)
app.use('/api', locationRoutes)      // /api/log-location (GPS endpoint)
app.use('/admin', adminRoutes)       // /admin, /admin/bikes, /admin/garage, etc.
app.use('/', legalRoutes)            // /privacy, /terms, /imprint

// ─── 8. 404 handler — no route matched ──────────────────────────────────────
//
// If no route above matched the request, this middleware catches it.
// It must come AFTER all route definitions.
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' })
})

// ─── 9. Global error handler ────────────────────────────────────────────────
//
// Express recognises a middleware with 4 parameters as an error handler.
// When any route calls next(err), or an unhandled error occurs,
// Express skips all remaining middleware and jumps directly here.
//
// We log the error for debugging but send a generic message to the user —
// never expose stack traces or internal details in production.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message)
  res.status(500).render('error', {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again later.'
  })
})

// ─── 10. Start the server ───────────────────────────────────────────────────
//
// app.listen() starts the HTTP server on the specified port.
// The callback runs once the server is ready to accept connections.
const PORT = process.env.PORT || 8080

app.listen(PORT, () => {
  console.log(`Quartier Bike ID running on http://localhost:${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})
