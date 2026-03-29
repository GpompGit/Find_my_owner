/**
 * middleware/requireAuth.js — Authentication Guard
 *
 * Express middleware that protects routes from unauthenticated access.
 *
 * How Express middleware works:
 * - Middleware is a function that sits between the incoming request and
 *   your route handler. It runs BEFORE your route code.
 * - It receives (req, res, next):
 *   - req: the incoming request object (has session data, form data, etc.)
 *   - res: the response object (used to send a reply)
 *   - next: a function to call when you're done — passes control to the
 *           next middleware or to the route handler
 * - If the user is authenticated, call next() to let the request continue.
 * - If not, redirect to /login — the route handler never runs.
 *
 * Usage in a route file:
 *   const requireAuth = require('../middleware/requireAuth')
 *   router.get('/dashboard', requireAuth, (req, res) => { ... })
 */

const requireAuth = (req, res, next) => {
  // When a user logs in, we store their user ID in the session.
  // If req.session.userId exists, they are logged in.
  if (req.session && req.session.userId) {
    // User is authenticated — let the request continue
    // to the next middleware or route handler
    return next()
  }

  // No session or no userId — user is not logged in.
  // Store a flash message so the login page can show a friendly notice.
  // connect-flash stores messages in the session and clears them after display.
  req.flash('error', 'Please log in to access this page')

  // Redirect to the login page (HTTP 302 — temporary redirect)
  res.redirect('/login')
}

module.exports = requireAuth
