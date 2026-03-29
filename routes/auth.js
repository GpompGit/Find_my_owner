/**
 * routes/auth.js — Authentication Routes
 *
 * Handles user registration, login, and logout.
 *
 * Routes:
 *   GET  /register  — show registration form
 *   POST /register  — create new user account
 *   GET  /login     — show login form
 *   POST /login     — authenticate and create session
 *   GET  /logout    — destroy session and redirect
 *
 * Security measures:
 * - Passwords hashed with bcrypt (12 salt rounds)
 * - Passwords compared with bcrypt.compare() (timing-safe)
 * - Login errors use generic messages (don't reveal which field is wrong)
 * - Session regenerated on login to prevent session fixation attacks
 */

const express = require('express')
const bcrypt = require('bcrypt')
const db = require('../db/connection')

// Create a Router instance — this is a mini-app that handles
// a group of related routes. We export it and mount it in app.js.
const router = express.Router()

// ─── Number of bcrypt salt rounds ───────────────────────────────────────────
// Higher = more secure but slower. 12 is the recommended minimum.
// Each increment roughly doubles the computation time:
//   10 rounds ≈ 10 hashes/sec
//   12 rounds ≈ 2-3 hashes/sec
//   14 rounds ≈ 0.5 hashes/sec
const SALT_ROUNDS = 12

// ─── Landing Page ───────────────────────────────────────────────────────────

/**
 * GET / — Landing page
 *
 * If the user is already logged in, redirect to dashboard.
 * Otherwise, show the landing/welcome page.
 */
router.get('/', (req, res) => {
  // If already logged in, go straight to dashboard
  if (req.session.userId) {
    return res.redirect('/dashboard')
  }
  res.render('landing', { title: 'Welcome' })
})

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * GET /register — Show the registration form
 *
 * Renders the register.ejs template with an empty form.
 * If user is already logged in, redirect to dashboard instead.
 */
router.get('/register', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard')
  }
  res.render('auth/register', { title: 'Register' })
})

/**
 * POST /register — Create a new user account
 *
 * Steps:
 * 1. Extract form fields from req.body
 * 2. Validate required fields
 * 3. Check if email is already registered
 * 4. Hash the password with bcrypt
 * 5. Insert the new user into the database
 * 6. Flash a success message and redirect to login
 *
 * What could go wrong:
 * - Missing required fields → flash error, redirect back
 * - Email already taken → flash error, redirect back
 * - Database error → flash error, redirect back
 */
router.post('/register', async (req, res) => {
  try {
    // Destructure form fields from the request body.
    // express.urlencoded() middleware already parsed the form data.
    const { email, password, name, phone } = req.body

    // ── Validate required fields ──
    // Check that email, password, and name are present and not empty strings.
    // Phone is optional (used for contact, not required for registration).
    if (!email || !password || !name) {
      req.flash('error', 'Email, password, and name are required')
      return res.redirect('/register')
    }

    // ── Validate password length ──
    // Short passwords are easy to brute-force even with bcrypt.
    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters')
      return res.redirect('/register')
    }

    // ── Check if email already exists ──
    // We query for any user with this email. If found, registration fails.
    // Using parameterized query (?) to prevent SQL injection.
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    )

    if (existing.length > 0) {
      req.flash('error', 'An account with this email already exists')
      return res.redirect('/register')
    }

    // ── Hash the password ──
    // bcrypt.hash() generates a random salt and hashes the password.
    // The result looks like: $2b$12$LJ3m4ys3Lg...
    // It includes the salt, so we only need to store this one string.
    // NEVER store the plain password anywhere.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // ── Insert the new user ──
    // phone can be null if not provided (|| null converts empty string to null)
    await db.query(
      'INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)',
      [email, passwordHash, name, phone || null]
    )

    // ── Success — redirect to login ──
    req.flash('success', 'Registration successful! Please log in.')
    res.redirect('/login')
  } catch (err) {
    console.error('Registration error:', err.message)
    req.flash('error', 'Registration failed. Please try again.')
    res.redirect('/register')
  }
})

// ─── Login ──────────────────────────────────────────────────────────────────

/**
 * GET /login — Show the login form
 */
router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard')
  }
  res.render('auth/login', { title: 'Login' })
})

/**
 * POST /login — Authenticate user and create session
 *
 * Steps:
 * 1. Find user by email
 * 2. Compare submitted password with stored hash
 * 3. If match: store user ID in session, redirect to dashboard
 * 4. If no match: flash generic error, redirect to login
 *
 * SECURITY: We use the same error message for "wrong email" and
 * "wrong password" — this prevents attackers from discovering
 * which emails are registered (enumeration attack).
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // ── Validate input ──
    if (!email || !password) {
      req.flash('error', 'Email and password are required')
      return res.redirect('/login')
    }

    // ── Find user by email ──
    // We need the password hash to verify, plus the name for the session.
    const [rows] = await db.query(
      'SELECT id, email, password_hash, name FROM users WHERE email = ?',
      [email]
    )

    // If no user found, use a GENERIC error message.
    // Don't say "email not found" — that reveals valid emails.
    if (rows.length === 0) {
      req.flash('error', 'Invalid email or password')
      return res.redirect('/login')
    }

    const user = rows[0]

    // ── Compare passwords ──
    // bcrypt.compare() hashes the submitted password with the same salt
    // that was used originally, then compares the results.
    // This is timing-safe — it takes the same time whether correct or not,
    // preventing timing attacks.
    const passwordMatch = await bcrypt.compare(password, user.password_hash)

    if (!passwordMatch) {
      // Same generic message as "user not found" — prevents enumeration
      req.flash('error', 'Invalid email or password')
      return res.redirect('/login')
    }

    // ── Regenerate session ──
    // req.session.regenerate() creates a new session ID.
    // This prevents "session fixation" attacks where an attacker
    // sets a known session ID before the user logs in.
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err.message)
        req.flash('error', 'Login failed. Please try again.')
        return res.redirect('/login')
      }

      // ── Store user data in the new session ──
      req.session.userId = user.id
      req.session.userName = user.name

      // Check if this user is the admin (email matches ADMIN_EMAIL from .env)
      req.session.isAdmin = (user.email === process.env.ADMIN_EMAIL)

      // ── Save session and redirect ──
      // req.session.save() ensures the session is written to the store
      // before the redirect happens. Without this, the redirect could
      // arrive at the dashboard before the session is saved.
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err.message)
          req.flash('error', 'Login failed. Please try again.')
          return res.redirect('/login')
        }
        res.redirect('/dashboard')
      })
    })
  } catch (err) {
    console.error('Login error:', err.message)
    req.flash('error', 'Login failed. Please try again.')
    res.redirect('/login')
  }
})

// ─── Logout ─────────────────────────────────────────────────────────────────

/**
 * GET /logout — Destroy session and redirect to home
 *
 * req.session.destroy() removes all session data from the server.
 * We also clear the session cookie from the browser with res.clearCookie().
 * After this, the user is completely logged out — no trace remains.
 */
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err.message)
    }
    // Clear the session cookie from the browser.
    // 'connect.sid' is the default cookie name used by express-session.
    res.clearCookie('connect.sid')
    res.redirect('/')
  })
})

module.exports = router
