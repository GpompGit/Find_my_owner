/**
 * routes/legal.js — Legal Pages
 *
 * Serves the static legal pages: privacy policy, terms of use, and imprint.
 * These pages are public — no authentication required.
 *
 * Routes:
 *   GET /privacy  — privacy policy
 *   GET /terms    — terms of use
 *   GET /imprint  — imprint (Impressum)
 */

const express = require('express')

const router = express.Router()

/**
 * GET /privacy — Privacy Policy
 *
 * Explains what personal data is collected, why, how long it's kept,
 * and what rights users have under Swiss data protection law (nDSG)
 * and the EU GDPR.
 */
router.get('/privacy', (req, res) => {
  res.render('legal/privacy', { title: 'Privacy Policy' })
})

/**
 * GET /terms — Terms of Use
 *
 * Defines the rules for using the service, liability limitations,
 * and acceptable use conditions.
 */
router.get('/terms', (req, res) => {
  res.render('legal/terms', { title: 'Terms of Use' })
})

/**
 * GET /imprint — Imprint (Impressum)
 *
 * Required by Swiss law — identifies who operates the service.
 * Contains the operator's name, address, and contact information.
 */
router.get('/imprint', (req, res) => {
  res.render('legal/imprint', { title: 'Imprint' })
})

module.exports = router
