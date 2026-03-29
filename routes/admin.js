/**
 * routes/admin.js — Admin Panel Routes
 *
 * Admin-only routes for managing the entire system.
 * All routes require both authentication AND admin privileges.
 *
 * The admin is identified by matching their email against ADMIN_EMAIL
 * in the .env file. There is no separate admin login — it's just a
 * regular user with extra permissions.
 *
 * Route prefix: /admin (mounted in app.js as app.use('/admin', adminRoutes))
 *
 * Routes:
 *   GET  /             → admin dashboard (stats overview)
 *   GET  /bikes        → all registered bikes (all users)
 *   GET  /print/:id    → print-ready QR label page
 *   GET  /bike-data/:id → JSON API for Dymo SDK (bike data for printing)
 *   GET  /garage       → garage users + payment status
 *   POST /payment/:id  → mark garage payment as received
 *   GET  /scans        → scan history log
 */

const express = require('express')
const db = require('../db/connection')
const requireAuth = require('../middleware/requireAuth')
const requireAdmin = require('../middleware/requireAdmin')
const nodemailer = require('nodemailer')

const router = express.Router()

/**
 * Email transporter for payment confirmations.
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

// ── Apply auth middleware to ALL admin routes ──
// router.use() applies middleware to every route in this router.
// This saves repeating requireAuth, requireAdmin on each route.
router.use(requireAuth, requireAdmin)

// ─── ADMIN DASHBOARD ────────────────────────────────────────────────────────

/**
 * GET /admin — Dashboard with system overview stats
 *
 * Shows counts of users, bikes, stolen bikes, garage users,
 * and recent scans. All data is fetched with separate queries
 * for clarity (could be optimised into one query with subqueries).
 */
router.get('/', async (req, res) => {
  try {
    // Run all stat queries in parallel using Promise.all().
    // This is faster than running them one after another because
    // the database can process multiple queries simultaneously.
    const [
      [userCount],
      [bikeCount],
      [stolenCount],
      [garageCount],
      [scanCount],
      [messageCount]
    ] = await Promise.all([
      db.query('SELECT COUNT(*) AS count FROM users'),
      db.query('SELECT COUNT(*) AS count FROM bicycles'),
      db.query("SELECT COUNT(*) AS count FROM bicycles WHERE status = 'stolen'"),
      db.query('SELECT COUNT(*) AS count FROM bicycles WHERE garage_parking = TRUE'),
      db.query('SELECT COUNT(*) AS count FROM scans'),
      db.query('SELECT COUNT(*) AS count FROM contact_messages')
    ])

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: {
        users: userCount[0].count,
        bikes: bikeCount[0].count,
        stolen: stolenCount[0].count,
        garage: garageCount[0].count,
        scans: scanCount[0].count,
        messages: messageCount[0].count
      }
    })
  } catch (err) {
    console.error('Admin dashboard error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: { users: 0, bikes: 0, stolen: 0, garage: 0, scans: 0, messages: 0 }
    })
  }
})

// ─── ALL BIKES LIST ─────────────────────────────────────────────────────────

/**
 * GET /admin/bikes — List all registered bikes (all users)
 *
 * Unlike the user dashboard which shows only the logged-in user's bikes,
 * this shows EVERY bike in the system with the owner's name.
 * Used for administration and searching for specific bikes.
 */
router.get('/bikes', async (req, res) => {
  try {
    const [bikes] = await db.query(
      `SELECT b.id, b.tag_uid, b.brand, b.color, b.status,
              b.garage_parking, b.registered,
              u.name AS owner_name, u.email AS owner_email
       FROM bicycles b
       JOIN users u ON b.owner_id = u.id
       ORDER BY b.registered DESC`
    )

    res.render('admin/bike-list', { title: 'All Bikes', bikes })
  } catch (err) {
    console.error('Admin bikes error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.render('admin/bike-list', { title: 'All Bikes', bikes: [] })
  }
})

// ─── PRINT LABELS ───────────────────────────────────────────────────────────

/**
 * GET /admin/print/:id — Print-ready label page
 *
 * Shows the QR code label (and TWINT QR for garage bikes) in a
 * print-optimised layout. The admin uses Ctrl+P or the Dymo SDK
 * to print from this page.
 */
router.get('/print/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.id, b.tag_uid, b.brand, b.color, b.garage_parking,
              u.name AS owner_name
       FROM bicycles b
       JOIN users u ON b.owner_id = u.id
       WHERE b.id = ?`,
      [req.params.id]
    )

    if (rows.length === 0) {
      req.flash('error', req.t('bikes.not_found'))
      return res.redirect('/admin/bikes')
    }

    res.render('admin/print', { title: 'Print Labels', bike: rows[0] })
  } catch (err) {
    console.error('Admin print error:', err.message)
    req.flash('error', 'Could not load bike data.')
    res.redirect('/admin/bikes')
  }
})

/**
 * GET /admin/bike-data/:id — JSON API for Dymo SDK
 *
 * The Dymo print JavaScript (dymo-print.js) calls this endpoint
 * to get bike data as JSON. The SDK then builds the label XML
 * and sends it to the printer.
 *
 * Returns JSON (not HTML) because it's consumed by client-side JavaScript.
 */
router.get('/bike-data/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, tag_uid, brand, color, garage_parking
       FROM bicycles WHERE id = ?`,
      [req.params.id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bike not found' })
    }

    const bike = rows[0]

    // Build URLs for the QR code images
    res.json({
      id: bike.id,
      brand: bike.brand,
      color: bike.color,
      garage_parking: bike.garage_parking,
      qr_url: `/uploads/qr/${bike.tag_uid}.png`,
      twint_qr_url: bike.garage_parking ? `/uploads/qr/twint_${bike.tag_uid}.png` : null
    })
  } catch (err) {
    console.error('Bike data API error:', err.message)
    res.status(500).json({ error: 'Failed to load bike data' })
  }
})

// ─── GARAGE MANAGEMENT ──────────────────────────────────────────────────────

/**
 * GET /admin/garage — Garage users + payment status
 *
 * Shows all bikes with garage parking enabled, their payment status,
 * and allows the admin to mark payments as received.
 */
router.get('/garage', async (req, res) => {
  try {
    const [garageBikes] = await db.query(
      `SELECT b.id, b.brand, b.color, b.payment_status,
              b.payment_amount, b.garage_start_date, b.payment_due_date,
              b.payment_date,
              u.name AS owner_name, u.email AS owner_email
       FROM bicycles b
       JOIN users u ON b.owner_id = u.id
       WHERE b.garage_parking = TRUE
       ORDER BY b.payment_due_date ASC`
    )

    // Calculate total expected revenue
    // garageBikes.length * CHF 40 (or the configured amount)
    const feePerBike = parseFloat(process.env.GARAGE_FEE_CHF) || 40.00
    const totalExpected = garageBikes.length * feePerBike

    res.render('admin/garage', {
      title: 'Garage Management',
      garageBikes,
      totalExpected,
      feePerBike
    })
  } catch (err) {
    console.error('Admin garage error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.render('admin/garage', {
      title: 'Garage Management',
      garageBikes: [],
      totalExpected: 0,
      feePerBike: 40.00
    })
  }
})

/**
 * POST /admin/payment/:id — Mark a garage payment as received
 *
 * When the admin confirms a TWINT payment was received:
 * 1. Update payment_status to 'paid'
 * 2. Set payment_date to now
 * 3. Reset payment_due_date to 365 days from now (new cycle)
 * 4. Reset the reminder flag so they get reminded again next year
 * 5. Send a confirmation email to the user
 */
router.post('/payment/:id', async (req, res) => {
  try {
    // ── Look up the bike and owner ──
    const [rows] = await db.query(
      `SELECT b.id, b.brand, b.color, b.tag_uid,
              u.email AS owner_email, u.name AS owner_name
       FROM bicycles b
       JOIN users u ON b.owner_id = u.id
       WHERE b.id = ? AND b.garage_parking = TRUE`,
      [req.params.id]
    )

    if (rows.length === 0) {
      req.flash('error', req.t('bikes.not_found'))
      return res.redirect('/admin/garage')
    }

    const bike = rows[0]

    // ── Update payment status ──
    // Start a new 365-day payment cycle from today
    const nextDue = new Date()
    nextDue.setDate(nextDue.getDate() + 365)

    await db.query(
      `UPDATE bicycles
       SET payment_status = 'paid',
           payment_date = NOW(),
           payment_due_date = ?,
           payment_reminder_sent = FALSE
       WHERE id = ?`,
      [nextDue, bike.id]
    )

    // ── Send payment confirmation email ──
    try {
      const paidDate = new Date().toLocaleDateString('de-CH')
      const dueDate = nextDue.toLocaleDateString('de-CH')

      await transporter.sendMail({
        from: `"Quartier Bike ID" <${process.env.SMTP_USER}>`,
        to: bike.owner_email,
        subject: `Payment received — ${bike.brand} ${bike.color}`,
        html: `
          <h2>Garage Payment Confirmed</h2>
          <p>Dear ${bike.owner_name},</p>
          <p>
            Your annual garage parking contribution of
            <strong>CHF ${parseFloat(process.env.GARAGE_FEE_CHF || 40).toFixed(2)}</strong>
            has been received for your
            <strong>${bike.color} ${bike.brand}</strong>.
          </p>
          <p><strong>Payment date:</strong> ${paidDate}</p>
          <p><strong>Next due:</strong> ${dueDate}</p>
          <hr>
          <small>Quartier Bike ID — Thank you for your contribution.</small>
        `
      })
    } catch (emailErr) {
      console.error('Payment confirmation email failed:', emailErr.message)
    }

    req.flash('success', `${req.t('admin.payment_received')} ${bike.brand} ${bike.color}`)
    res.redirect('/admin/garage')
  } catch (err) {
    console.error('Admin payment error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.redirect('/admin/garage')
  }
})

// ─── SCAN HISTORY ───────────────────────────────────────────────────────────

/**
 * GET /admin/scans — Full scan history log
 *
 * Shows all QR code scans across all bikes, ordered by most recent.
 * Includes GPS data for stolen bike scans (where the finder shared location).
 * Limited to the most recent 200 scans for performance.
 */
router.get('/scans', async (req, res) => {
  try {
    const [scans] = await db.query(
      `SELECT s.id, s.scanned_at, s.lat, s.lng, s.accuracy, s.city,
              s.user_agent, s.location_expires_at,
              b.brand, b.color, b.status, b.tag_uid
       FROM scans s
       JOIN bicycles b ON s.bicycle_id = b.id
       ORDER BY s.scanned_at DESC
       LIMIT 200`
    )

    res.render('admin/scans', { title: 'Scan History', scans })
  } catch (err) {
    console.error('Admin scans error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.render('admin/scans', { title: 'Scan History', scans: [] })
  }
})

module.exports = router
