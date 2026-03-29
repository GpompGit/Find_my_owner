/**
 * middleware/rateLimit.js — Simple In-Memory Rate Limiter
 *
 * Limits how many times a specific action can be performed within a time window.
 * Used to prevent abuse of the magic link login endpoint.
 *
 * How it works:
 * - Tracks requests by a key (e.g., email address or IP)
 * - Each key gets a counter and a window expiry timestamp
 * - If the counter exceeds the limit within the window, the request is rejected
 * - When the window expires, the counter resets automatically
 *
 * This is an in-memory implementation — it resets when the server restarts.
 * For a small neighbourhood app, this is perfectly sufficient.
 * For high-traffic apps, you'd use Redis or a database instead.
 *
 * Usage:
 *   const rateLimit = require('../middleware/rateLimit')
 *   const loginLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyFn: ... })
 *   router.post('/login', loginLimiter, handler)
 *
 * @param {Object} options
 * @param {number} options.windowMs    — Time window in milliseconds (default: 1 hour)
 * @param {number} options.max         — Max requests per key per window (default: 5)
 * @param {Function} options.keyFn     — Function to extract the rate limit key from req
 *                                        Default: uses req.body.email or req.ip
 */

const createRateLimiter = (options = {}) => {
  const {
    windowMs = 60 * 60 * 1000,  // Default: 1 hour window
    max = 5,                      // Default: 5 requests per window
    keyFn = null                  // Function to extract key from request
  } = options

  // In-memory store: { key: { count: Number, resetTime: Date } }
  // This object holds the counters for each rate-limited key.
  const store = {}

  // ── Periodic cleanup ──
  // Every 10 minutes, remove expired entries to prevent memory leaks.
  // Without this, the store would grow forever with old keys.
  setInterval(() => {
    const now = Date.now()
    for (const key in store) {
      if (store[key].resetTime < now) {
        delete store[key]
      }
    }
  }, 10 * 60 * 1000)  // Clean up every 10 minutes

  // ── The middleware function ──
  return (req, res, next) => {
    // Determine the rate limit key.
    // Default: use the email from the form body (for login rate limiting).
    // Falls back to a generic key if no email is provided.
    let key
    if (keyFn) {
      key = keyFn(req)
    } else {
      key = (req.body && req.body.email)
        ? req.body.email.trim().toLowerCase()
        : 'unknown'
    }

    const now = Date.now()

    // ── Check if this key has an active window ──
    if (store[key] && store[key].resetTime > now) {
      // Window is still active — increment the counter
      store[key].count++

      if (store[key].count > max) {
        // Rate limit exceeded — reject the request
        // Show a flash message and redirect back to the login page.
        // We use req.t() for the translated error message.
        req.flash('error', req.t('auth.rate_limited'))
        return res.redirect('/login')
      }
    } else {
      // No active window or window expired — start a new one
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      }
    }

    // Within the limit — allow the request through
    next()
  }
}

module.exports = createRateLimiter
