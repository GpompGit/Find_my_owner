/**
 * routes/dashboard.js — User Dashboard
 *
 * Shows the logged-in user their registered bicycles.
 * This is a stub — full implementation coming in the next phase.
 *
 * Routes:
 *   GET /dashboard — user's bike list
 */

const express = require('express')
const requireAuth = require('../middleware/requireAuth')

const router = express.Router()

// GET /dashboard — protected by requireAuth middleware
router.get('/dashboard', requireAuth, (req, res) => {
  // Placeholder — will query user's bikes from database
  res.render('dashboard', { title: 'My Bikes', bikes: [] })
})

module.exports = router
