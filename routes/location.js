/**
 * routes/location.js — GPS Location Endpoint
 *
 * Receives GPS coordinates from the stolen bike scan page.
 * Called by the client-side location.js script via fetch().
 *
 * This is a JSON API endpoint — it receives and returns JSON,
 * not HTML. It's mounted at /api/log-location in app.js.
 *
 * GDPR compliance:
 * - Only processes location for bikes with status = 'stolen'
 * - Sets location_expires_at = NOW() + 90 days on every record
 * - The nightly cleanup.js job deletes expired location data
 * - No IP addresses are stored
 *
 * Routes:
 *   POST /log-location — receive GPS data (mounted as /api/log-location)
 */

const express = require('express')
const db = require('../db/connection')
const nodemailer = require('nodemailer')
const escapeHtml = require('../utils/escapeHtml')
const createRateLimiter = require('../middleware/rateLimit')

const router = express.Router()

// Rate limit GPS submissions — max 20 per IP per hour
const locationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyFn: (req) => req.ip || 'unknown'
})

/**
 * Email transporter — same config as contact.js.
 * Used to send stolen bike scan alerts to the owner.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

/**
 * POST /log-location — Receive GPS coordinates from a stolen bike scan
 *
 * Request body (JSON):
 * {
 *   uid: "a1b2c3d4-...",    // The bike's tag_uid
 *   lat: 47.3769,           // Latitude (decimal degrees)
 *   lng: 8.5417,            // Longitude (decimal degrees)
 *   accuracy: 20            // Accuracy in metres
 * }
 *
 * Response:
 *   200 { success: true }    — location logged
 *   400 { error: "..." }     — invalid input
 *   403 { error: "..." }     — bike is not stolen (won't store location)
 *   500 { error: "..." }     — server error
 */
router.post('/log-location', locationLimiter, async (req, res) => {
  try {
    const { uid, lat, lng, accuracy } = req.body

    // ── Validate required fields and types ──
    // Check presence AND that lat/lng are actual numbers (not strings or NaN).
    // parseFloat handles string-to-number conversion if the client sends strings.
    const parsedLat = parseFloat(lat)
    const parsedLng = parseFloat(lng)

    if (!uid || isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ error: 'Missing or invalid fields: uid, lat, lng' })
    }

    // ── Validate coordinate ranges ──
    // Latitude: -90 to 90, Longitude: -180 to 180
    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' })
    }

    // ── Look up the bike ──
    const [rows] = await db.query(
      `SELECT b.id, b.status, b.brand, b.color,
              u.email AS owner_email, u.name AS owner_name
       FROM bicycles b
       JOIN users u ON b.owner_id = u.id
       WHERE b.tag_uid = ?`,
      [uid]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bike not found' })
    }

    const bike = rows[0]

    // ── CRITICAL: Only store location for stolen bikes ──
    // This is a GDPR requirement. We NEVER store GPS data for active bikes.
    if (bike.status !== 'stolen') {
      return res.status(403).json({ error: 'Location tracking not active for this bike' })
    }

    // ── Calculate the expiry date (90 days from now) ──
    // GDPR requires automatic deletion of location data.
    // The GDPR_LOCATION_DAYS env var controls the retention period.
    const retentionDays = parseInt(process.env.GDPR_LOCATION_DAYS, 10) || 90
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + retentionDays)

    // ── Update the existing scan record with GPS data ──
    // The scan was already logged (without GPS) when the page was loaded
    // in routes/public.js. Now we update the most recent scan for this bike
    // with the GPS coordinates.
    await db.query(
      `UPDATE scans
       SET lat = ?, lng = ?, accuracy = ?, location_expires_at = ?
       WHERE bicycle_id = ?
       ORDER BY scanned_at DESC
       LIMIT 1`,
      [parsedLat, parsedLng, accuracy || null, expiresAt, bike.id]
    )

    // ── Send alert email to the bike owner ──
    // This is critical — the owner needs to know their stolen bike was scanned
    // and where it was last seen.
    try {
      // Build a Google Maps link for easy viewing
      const mapsUrl = `https://maps.google.com/?q=${parsedLat},${parsedLng}`

      await transporter.sendMail({
        from: `"Quartier Bike ID" <${process.env.SMTP_USER}>`,
        to: bike.owner_email,
        subject: `Your stolen ${bike.brand} was just scanned!`,
        html: `
          <h2>Your stolen bicycle was scanned</h2>
          <p><strong>Time:</strong> ${new Date().toLocaleString('de-CH')}</p>
          <p><strong>Bike:</strong> ${escapeHtml(bike.color)} ${escapeHtml(bike.brand)}</p>
          <p>
            <a href="${mapsUrl}">View location on Google Maps</a>
            (accuracy: ~${Math.round(accuracy || 0)}m)
          </p>
          <p>Contact your local police with this information.</p>
          <hr>
          <small>
            Quartier Bike ID — Location data will be automatically
            deleted after ${retentionDays} days.
          </small>
        `
      })
    } catch (emailErr) {
      // Email failure shouldn't prevent the location from being saved
      console.error('Stolen alert email failed:', emailErr.message)
    }

    // ── Also notify the admin ──
    try {
      if (process.env.ADMIN_EMAIL) {
        const mapsUrl = `https://maps.google.com/?q=${parsedLat},${parsedLng}`

        await transporter.sendMail({
          from: `"Quartier Bike ID" <${process.env.SMTP_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: `[ADMIN] Stolen bike scanned: ${bike.brand} ${bike.color}`,
          html: `
            <h2>Stolen bike scan with GPS</h2>
            <p><strong>Bike:</strong> ${escapeHtml(bike.color)} ${escapeHtml(bike.brand)}</p>
            <p><strong>Owner:</strong> ${escapeHtml(bike.owner_name)}</p>
            <p><a href="${mapsUrl}">View on Google Maps</a></p>
          `
        })
      }
    } catch (adminEmailErr) {
      console.error('Admin alert email failed:', adminEmailErr.message)
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Log location error:', err.message)
    res.status(500).json({ error: 'Failed to log location' })
  }
})

module.exports = router
