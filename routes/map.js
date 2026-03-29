/**
 * routes/map.js — Stolen Bike Maps
 *
 * Three map views showing where stolen bikes have been scanned:
 *
 * 1. Community Map (public) — theft hotspot map with approximate locations
 *    Coordinates rounded to ~200m to protect finder privacy.
 *
 * 2. Owner Map (authenticated) — exact scan locations for the owner's bike
 *    Only visible to the bike's owner. Shows timestamps and accuracy.
 *
 * 3. Admin Map (admin only) — all scan locations with full details
 *    Shows every scan with GPS data across all bikes.
 *
 * Each map has two endpoints:
 * - A page endpoint (renders the EJS template with Leaflet.js)
 * - A JSON API endpoint (provides the marker data to the map JS)
 *
 * Maps use Leaflet.js (open-source) with OpenStreetMap tiles — no API key needed.
 *
 * Routes:
 *   GET /map                  → community theft hotspot map (public)
 *   GET /map/bike/:id         → owner's stolen bike scan map (auth + owner)
 *   GET /admin/map            → admin map with all scans (admin only, mounted separately)
 *   GET /api/map/community    → JSON: approximate scan coordinates (public)
 *   GET /api/map/bike/:id     → JSON: exact scan coordinates (auth + owner)
 *   GET /api/map/admin        → JSON: all scan coordinates (admin only)
 */

const express = require('express')
const db = require('../db/connection')
const requireAuth = require('../middleware/requireAuth')
const requireOwner = require('../middleware/requireOwner')
const requireAdmin = require('../middleware/requireAdmin')

const router = express.Router()

// ─── COMMUNITY MAP (Public) ────────────────────────────────────────────────

/**
 * GET /map — Community theft hotspot map
 *
 * Shows approximate locations where stolen bikes were scanned.
 * No login required — anyone in the neighbourhood can view this.
 * The map helps residents understand theft patterns in Baumgarten.
 */
router.get('/map', (req, res) => {
  res.render('map/community', { title: req.t('map.community_title') })
})

/**
 * GET /api/map/community — JSON API for community map markers
 *
 * Returns scan locations with coordinates rounded to ~200m.
 * This "coarsening" protects the exact location of the finder
 * while still showing useful theft hotspot information.
 *
 * Rounding to 3 decimal places ≈ ~111m accuracy at Swiss latitudes.
 * This is precise enough to show "near the train station" but not
 * "at this exact building."
 *
 * Only returns scans from stolen bikes with GPS data.
 * No personal info (no bike owner, no finder details).
 */
router.get('/api/map/community', async (req, res) => {
  try {
    const [scans] = await db.query(
      `SELECT
        ROUND(s.lat, 3) AS lat,
        ROUND(s.lng, 3) AS lng,
        b.brand, b.color,
        DATE_FORMAT(s.scanned_at, '%d.%m.%Y') AS scan_date
       FROM scans s
       JOIN bicycles b ON s.bicycle_id = b.id
       WHERE s.lat IS NOT NULL
         AND s.lng IS NOT NULL
         AND b.status = 'stolen'
       ORDER BY s.scanned_at DESC
       LIMIT 100`
    )

    res.json(scans)
  } catch (err) {
    console.error('Community map API error:', err.message)
    res.status(500).json({ error: 'Failed to load map data' })
  }
})

// ─── OWNER MAP (Authenticated + Owner) ──────────────────────────────────────

/**
 * GET /map/bike/:id — Owner's stolen bike scan map
 *
 * Shows exact scan locations for a specific bike.
 * Only the bike's owner can view this — requireOwner middleware
 * verifies ownership and attaches the bike to req.bike.
 */
router.get('/map/bike/:id', requireAuth, requireOwner, (req, res) => {
  res.render('map/owner', {
    title: `${req.bike.brand} ${req.bike.color} — ${req.t('map.owner_title')}`,
    bike: req.bike
  })
})

/**
 * GET /api/map/bike/:id — JSON API for owner's bike scan markers
 *
 * Returns EXACT coordinates (not rounded) for the owner's bike.
 * Includes timestamp, accuracy, and expiry date.
 * Only scans with GPS data are returned.
 */
router.get('/api/map/bike/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const [scans] = await db.query(
      `SELECT
        s.lat, s.lng, s.accuracy,
        s.scanned_at,
        DATE_FORMAT(s.scanned_at, '%d.%m.%Y %H:%i') AS scan_date,
        DATE_FORMAT(s.location_expires_at, '%d.%m.%Y') AS expires_date
       FROM scans s
       WHERE s.bicycle_id = ?
         AND s.lat IS NOT NULL
         AND s.lng IS NOT NULL
       ORDER BY s.scanned_at DESC`,
      [req.bike.id]
    )

    res.json(scans)
  } catch (err) {
    console.error('Owner map API error:', err.message)
    res.status(500).json({ error: 'Failed to load map data' })
  }
})

// ─── ADMIN MAP ──────────────────────────────────────────────────────────────
// Note: The admin map page is mounted in app.js under /admin prefix.
// These are the route handlers — they expect requireAuth + requireAdmin
// to be applied at the router level (as done in routes/admin.js).

/**
 * GET /admin/map — Admin map with all scan locations
 * (This handler is exported and mounted separately in app.js or admin.js)
 */
router.get('/admin/map', requireAuth, requireAdmin, (req, res) => {
  res.render('map/admin', { title: req.t('map.admin_title') })
})

/**
 * GET /api/map/admin — JSON API for admin map markers
 *
 * Returns ALL scan locations with full details:
 * exact coordinates, bike info, owner name, accuracy, and expiry.
 */
router.get('/api/map/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [scans] = await db.query(
      `SELECT
        s.lat, s.lng, s.accuracy,
        DATE_FORMAT(s.scanned_at, '%d.%m.%Y %H:%i') AS scan_date,
        DATE_FORMAT(s.location_expires_at, '%d.%m.%Y') AS expires_date,
        b.brand, b.color, b.status, b.tag_uid,
        u.name AS owner_name
       FROM scans s
       JOIN bicycles b ON s.bicycle_id = b.id
       JOIN users u ON b.owner_id = u.id
       WHERE s.lat IS NOT NULL
         AND s.lng IS NOT NULL
       ORDER BY s.scanned_at DESC
       LIMIT 500`
    )

    res.json(scans)
  } catch (err) {
    console.error('Admin map API error:', err.message)
    res.status(500).json({ error: 'Failed to load map data' })
  }
})

module.exports = router
