/**
 * routes/auth.js — Magic Link Authentication (Passwordless)
 *
 * No passwords — users authenticate via email magic links.
 *
 * Flow:
 * 1. User enters email at /login → POST /login
 * 2. Server generates a random token and sends a magic link email
 * 3. User clicks the link → GET /auth/verify/:token
 * 4. Server validates the token (exists, not expired, not used)
 * 5a. If user exists → create session → redirect to /dashboard
 * 5b. If new user → create session → redirect to /register/complete
 * 6. At /register/complete, new users enter their name and phone
 *
 * Security:
 * - Tokens generated with crypto.randomBytes(32) — 64 hex chars, unpredictable
 * - Tokens expire after 15 minutes (configurable via MAGIC_LINK_EXPIRY_MINUTES)
 * - Tokens are single-use — marked as used after first verification
 * - Expired/used tokens are cleaned up nightly by cleanup.js
 * - Session regenerated on login to prevent session fixation
 *
 * Routes:
 *   GET  /              — landing page (redirect to dashboard if logged in)
 *   GET  /login         — show email form
 *   POST /login         — send magic link email
 *   GET  /auth/verify/:token — verify token and create session
 *   GET  /register/complete  — show name/phone form (new users only)
 *   POST /register/complete  — save name/phone
 *   GET  /logout        — destroy session
 */

const express = require('express')
const crypto = require('crypto')    // Node built-in: generate secure random tokens
const db = require('../db/connection')
const nodemailer = require('nodemailer')

const router = express.Router()

// ─── Email transporter for magic link emails ────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

// ─── Token expiry time (default 15 minutes) ─────────────────────────────────
const TOKEN_EXPIRY_MINUTES = parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES, 10) || 15

// ─── Landing Page ───────────────────────────────────────────────────────────

/**
 * GET / — Landing page
 * If already logged in, redirect to dashboard.
 */
router.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard')
  }
  res.render('landing', { title: req.t('landing.title') })
})

// ─── Login (Send Magic Link) ────────────────────────────────────────────────

/**
 * GET /login — Show the email form
 *
 * This single form handles both login AND registration.
 * The user enters their email — if they have an account, they get logged in.
 * If they don't, an account is created when they click the link.
 */
router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard')
  }
  res.render('auth/login', { title: req.t('auth.login_title') })
})

/**
 * POST /login — Generate a magic link token and send it by email
 *
 * Steps:
 * 1. Validate the email format
 * 2. Generate a cryptographically secure random token
 * 3. Store the token in the database with an expiry time
 * 4. Send an email with the magic link
 * 5. Show a "check your email" confirmation page
 *
 * SECURITY: We always show the same success message, whether the email
 * exists in our system or not. This prevents email enumeration attacks
 * (an attacker can't discover which emails are registered).
 */
router.post('/login', async (req, res) => {
  try {
    const { email } = req.body

    // ── Validate email ──
    if (!email || !email.includes('@')) {
      req.flash('error', req.t('auth.email_required'))
      return res.redirect('/login')
    }

    // Normalize email to lowercase to prevent duplicate accounts
    const normalizedEmail = email.trim().toLowerCase()

    // ── Generate a secure random token ──
    // crypto.randomBytes(32) produces 32 bytes of random data.
    // .toString('hex') converts to a 64-character hex string.
    // This is cryptographically unpredictable — impossible to guess.
    const token = crypto.randomBytes(32).toString('hex')

    // ── Calculate expiry time ──
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000)

    // ── Store the token ──
    await db.query(
      'INSERT INTO magic_tokens (email, token, expires_at) VALUES (?, ?, ?)',
      [normalizedEmail, token, expiresAt]
    )

    // ── Build the magic link URL ──
    const magicLink = `${process.env.BASE_URL}/auth/verify/${token}`

    // ── Send the magic link email ──
    try {
      await transporter.sendMail({
        from: `"Quartier Bike ID" <${process.env.SMTP_USER}>`,
        to: normalizedEmail,
        subject: 'Your login link — Quartier Bike ID',
        html: `
          <h2>Quartier Bike ID — Login Link</h2>
          <p>Click the button below to log in:</p>
          <p>
            <a href="${magicLink}"
               style="display: inline-block; padding: 12px 24px;
                      background-color: #0d6efd; color: #ffffff;
                      text-decoration: none; border-radius: 6px;
                      font-size: 16px;">
              Log in to Quartier Bike ID
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link expires in ${TOKEN_EXPIRY_MINUTES} minutes and can only be used once.
          </p>
          <p style="color: #999; font-size: 12px;">
            If you didn't request this link, you can safely ignore this email.
          </p>
          <hr>
          <small>Quartier Bike ID — Community bicycle registration</small>
        `
      })
    } catch (emailErr) {
      // If email sending fails, log it but still show the success page.
      // We don't reveal whether the email was actually sent (security).
      console.error('Magic link email failed:', emailErr.message)
    }

    // ── Always show the same success page ──
    // Whether the email exists or not, whether the email sent or not,
    // we show "check your email." This prevents enumeration attacks.
    res.render('auth/check-email', {
      title: req.t('auth.check_email_title'),
      email: normalizedEmail
    })
  } catch (err) {
    console.error('Login error:', err.message)
    req.flash('error', req.t('auth.login_failed'))
    res.redirect('/login')
  }
})

// ─── Verify Magic Link ──────────────────────────────────────────────────────

/**
 * GET /auth/verify/:token — Verify the magic link token
 *
 * This is the URL the user clicks in the email.
 *
 * Steps:
 * 1. Look up the token in the database
 * 2. Check it hasn't expired and hasn't been used
 * 3. Mark it as used (single-use — can't be clicked again)
 * 4. Find or create the user by email
 * 5. Create a session (regenerate for security)
 * 6. Redirect to dashboard (existing user) or /register/complete (new user)
 */
router.get('/auth/verify/:token', async (req, res) => {
  try {
    const { token } = req.params

    // ── Validate token format ──
    // Tokens are 64-character hex strings. Reject anything else early.
    if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
      return res.render('auth/link-invalid', { title: req.t('auth.link_invalid_title') })
    }

    // ── Look up the token ──
    // Must exist, not be expired, and not already used.
    const [rows] = await db.query(
      'SELECT id, email FROM magic_tokens WHERE token = ? AND expires_at > NOW() AND used = FALSE',
      [token]
    )

    if (rows.length === 0) {
      // Token is invalid, expired, or already used
      return res.render('auth/link-expired', { title: req.t('auth.link_expired_title') })
    }

    const magicToken = rows[0]

    // ── Mark token as used (single-use) ──
    // This prevents the same link from being clicked again.
    await db.query('UPDATE magic_tokens SET used = TRUE WHERE id = ?', [magicToken.id])

    // ── Find the user by email ──
    const [users] = await db.query(
      'SELECT id, email, name FROM users WHERE email = ?',
      [magicToken.email]
    )

    let userId
    let userName
    let isNewUser = false

    if (users.length > 0) {
      // ── Existing user — log them in ──
      userId = users[0].id
      userName = users[0].name
    } else {
      // ── New user — create account with email only ──
      // Name and phone will be collected at /register/complete
      const [result] = await db.query(
        'INSERT INTO users (email) VALUES (?)',
        [magicToken.email]
      )
      userId = result.insertId
      userName = null
      isNewUser = true
    }

    // ── Regenerate session (security — prevents session fixation) ──
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err.message)
        req.flash('error', req.t('auth.login_failed'))
        return res.redirect('/login')
      }

      // ── Store user data in session ──
      req.session.userId = userId
      req.session.userName = userName
      req.session.isAdmin = (magicToken.email === process.env.ADMIN_EMAIL)

      // ── Save session and redirect ──
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err.message)
          req.flash('error', req.t('auth.login_failed'))
          return res.redirect('/login')
        }

        if (isNewUser) {
          // New user — they need to complete their profile (name, phone)
          return res.redirect('/register/complete')
        }

        // Existing user — go to dashboard
        res.redirect('/dashboard')
      })
    })
  } catch (err) {
    console.error('Token verification error:', err.message)
    req.flash('error', req.t('auth.login_failed'))
    res.redirect('/login')
  }
})

// ─── Complete Registration (New Users) ──────────────────────────────────────

/**
 * GET /register/complete — Show the name/phone form for new users
 *
 * After clicking the magic link for the first time, the user is logged in
 * but has no name yet. This page collects their name and optional phone.
 */
router.get('/register/complete', (req, res) => {
  // Must be logged in (magic link was verified)
  if (!req.session.userId) {
    return res.redirect('/login')
  }
  res.render('auth/register', { title: req.t('auth.register_title') })
})

/**
 * POST /register/complete — Save the user's name and phone
 *
 * After this, the user's profile is complete and they can use all features.
 */
router.post('/register/complete', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login')
    }

    const { name, phone } = req.body

    // ── Validate name ──
    if (!name || name.trim().length === 0) {
      req.flash('error', req.t('auth.name_required'))
      return res.redirect('/register/complete')
    }

    // ── Update the user record with name and phone ──
    await db.query(
      'UPDATE users SET name = ?, phone = ? WHERE id = ?',
      [name.trim(), phone || null, req.session.userId]
    )

    // ── Update session with the name ──
    req.session.userName = name.trim()

    req.flash('success', req.t('auth.registration_success'))
    res.redirect('/dashboard')
  } catch (err) {
    console.error('Registration complete error:', err.message)
    req.flash('error', req.t('auth.registration_failed'))
    res.redirect('/register/complete')
  }
})

// ─── Logout ─────────────────────────────────────────────────────────────────

/**
 * GET /logout — Destroy session and redirect to home
 */
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err.message)
    }
    res.clearCookie('connect.sid')
    res.redirect('/')
  })
})

module.exports = router
