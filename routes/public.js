/**
 * routes/public.js — Public Scan Page
 *
 * This is what happens when someone scans a bike's QR code.
 * The QR code URL looks like: https://bikes.yourdomain.com/bike/a1b2c3d4-...
 *
 * The page shows:
 * - Active bikes: owner's first name, bike photo, and a contact form
 * - Stolen bikes: a warning + GPS consent prompt to help locate the bike
 * - Unknown bikes: a "not found" page
 *
 * PRIVACY: Only the owner's FIRST name is shown — never full name,
 * email, phone, or any internal IDs. This is a GDPR requirement.
 *
 * Every scan is logged (date, user agent) for the owner's reference.
 * GPS coordinates are ONLY logged for stolen bikes, and ONLY with
 * the finder's explicit consent.
 *
 * Routes:
 *   GET /bike/:uid — public scan page (no auth required)
 */

const express = require('express')
const db = require('../db/connection')

const router = express.Router()

/**
 * GET /bike/:uid — Public scan page
 *
 * :uid is the UUID tag assigned to the bike during registration.
 * It's part of the QR code URL — this is what the scanner's phone opens.
 *
 * Flow:
 * 1. Look up the bike by its tag_uid
 * 2. If not found → 404
 * 3. Log the scan (date, user agent — NO IP address for GDPR)
 * 4. If bike is stolen → render stolen page (with GPS consent)
 * 5. If bike is active → render normal page (owner name + contact form)
 */
router.get('/bike/:uid', async (req, res) => {
  try {
    const tagUid = req.params.uid

    // ── Validate the UID format ──
    // UUIDs have a specific format: 8-4-4-4-12 hex characters
    // This prevents SQL queries with garbage data
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(tagUid)) {
      return res.status(404).render('404', { title: 'Bike Not Found' })
    }

    // ── Look up the bike and its owner ──
    // JOIN with users table to get the owner's name.
    // We select ONLY the fields needed for the public page — data minimization.
    const [rows] = await db.query(
      `SELECT b.id, b.tag_uid, b.brand, b.color, b.description,
              b.photo_url, b.status, b.garage_parking,
              u.name AS owner_name
       FROM bicycles b
       JOIN users u ON b.owner_id = u.id
       WHERE b.tag_uid = ?`,
      [tagUid]
    )

    // ── Bike not found ──
    if (rows.length === 0) {
      return res.status(404).render('404', { title: 'Bike Not Found' })
    }

    const bike = rows[0]

    // ── Extract first name only (GDPR — data minimization) ──
    // If the owner registered as "Jan Mueller", we only show "Jan".
    // split(' ')[0] takes everything before the first space.
    bike.owner_first_name = bike.owner_name.split(' ')[0]
    // Remove the full name from the object so it can't leak to the template
    delete bike.owner_name

    // ── Log the scan ──
    // We record every scan for the owner's reference.
    // We store user_agent (browser/device info) but NOT the IP address (GDPR).
    // For stolen bikes, GPS is logged separately via the /api/log-location endpoint.
    const userAgent = req.headers['user-agent'] || 'Unknown'
    await db.query(
      'INSERT INTO scans (bicycle_id, user_agent) VALUES (?, ?)',
      [bike.id, userAgent.substring(0, 300)]  // Truncate to fit VARCHAR(300)
    )

    // ── Render the appropriate page based on bike status ──
    if (bike.status === 'stolen') {
      // Stolen bike — show warning and GPS consent prompt
      // The template includes location.js which handles the GPS request
      return res.render('public/bike-stolen', {
        title: 'Stolen Bicycle',
        bike
      })
    }

    // Active or inactive bike — show normal scan page with contact form
    res.render('public/bike', {
      title: `${bike.brand} ${bike.color}`,
      bike
    })
  } catch (err) {
    console.error('Public scan error:', err.message)
    res.status(500).render('error', {
      title: 'Error',
      message: 'Could not load bike information.'
    })
  }
})

module.exports = router
