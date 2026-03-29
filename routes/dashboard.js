/**
 * routes/dashboard.js — User Dashboard
 *
 * Shows the logged-in user their registered bicycles.
 * Each user sees ONLY their own bikes (filtered by owner_id).
 *
 * Routes:
 *   GET /dashboard — user's bike list
 */

const express = require('express')
const db = require('../db/connection')
const requireAuth = require('../middleware/requireAuth')

const router = express.Router()

/**
 * GET /dashboard — Show the user's registered bikes
 *
 * Queries the database for all bicycles owned by the logged-in user.
 * The results are passed to the dashboard.ejs template for display.
 *
 * We select specific columns (not SELECT *) for two reasons:
 * 1. Performance — only fetch what the template needs
 * 2. Security — don't accidentally expose sensitive data
 */
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    // Query bikes belonging to the current user.
    // ORDER BY registered DESC shows newest bikes first.
    const [bikes] = await db.query(
      `SELECT id, tag_uid, brand, color, description, photo_url,
              status, garage_parking, payment_status, registered
       FROM bicycles
       WHERE owner_id = ?
       ORDER BY registered DESC`,
      [req.session.userId]
    )

    res.render('dashboard', { title: 'My Bikes', bikes })
  } catch (err) {
    console.error('Dashboard error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.render('dashboard', { title: 'My Bikes', bikes: [] })
  }
})

module.exports = router
