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
 *   POST /exempt/:id   → toggle payment exemption
 *   GET  /scans        → scan history log
 *   GET  /users        → all registered users
 *   GET  /users/:id    → user detail with their bikes
 *   POST /users/:id/delete → delete user and all their data
 *   POST /bikes/:id/delete → delete any bike (admin override)
 *   POST /bikes/:id/status → change any bike's status
 *   GET  /messages     → all contact form messages
 */

const express = require('express')
const path = require('path')
const fs = require('fs').promises       // For file cleanup on bike/user deletion
const db = require('../db/connection')
const requireAuth = require('../middleware/requireAuth')
const requireAdmin = require('../middleware/requireAdmin')
const escapeHtml = require('../utils/escapeHtml')
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
          <p>Dear ${escapeHtml(bike.owner_name)},</p>
          <p>
            Your annual garage parking contribution of
            <strong>CHF ${parseFloat(process.env.GARAGE_FEE_CHF || 40).toFixed(2)}</strong>
            has been received for your
            <strong>${escapeHtml(bike.color)} ${escapeHtml(bike.brand)}</strong>.
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

/**
 * POST /admin/scans/:id/delete — Delete a scan entry
 */
router.post('/scans/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM scans WHERE id = ?', [req.params.id])
    req.flash('success', 'Scan deleted')
    res.redirect('/admin/scans')
  } catch (err) {
    console.error('Delete scan error:', err.message)
    req.flash('error', 'Failed to delete scan')
    res.redirect('/admin/scans')
  }
})

// ─── USER MANAGEMENT ────────────────────────────────────────────────────────

/**
 * GET /admin/users — List all registered users
 *
 * Shows every user with their bike count, registration date,
 * and a link to view their details.
 */
router.get('/users', async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT u.id, u.email, u.name, u.phone, u.created_at,
              COUNT(b.id) AS bike_count
       FROM users u
       LEFT JOIN bicycles b ON b.owner_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    )

    res.render('admin/users', { title: req.t('admin.all_users'), users })
  } catch (err) {
    console.error('Admin users error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.render('admin/users', { title: req.t('admin.all_users'), users: [] })
  }
})

/**
 * GET /admin/users/:id — User detail page
 *
 * Shows a specific user's info and all their bikes.
 * Admin can delete the user or manage their bikes from here.
 */
router.get('/users/:id', async (req, res) => {
  try {
    // Get user info
    const [users] = await db.query(
      'SELECT id, email, name, phone, created_at FROM users WHERE id = ?',
      [req.params.id]
    )

    if (users.length === 0) {
      req.flash('error', req.t('admin.user_not_found'))
      return res.redirect('/admin/users')
    }

    // Get their bikes
    const [bikes] = await db.query(
      `SELECT id, tag_uid, brand, color, description, photo_url, status,
              garage_parking, payment_status, registered
       FROM bicycles WHERE owner_id = ?
       ORDER BY registered DESC`,
      [req.params.id]
    )

    // Get their contact messages received
    const [messages] = await db.query(
      `SELECT cm.finder_name, cm.message, cm.sent_at, b.brand, b.color
       FROM contact_messages cm
       JOIN bicycles b ON cm.bicycle_id = b.id
       WHERE b.owner_id = ?
       ORDER BY cm.sent_at DESC
       LIMIT 20`,
      [req.params.id]
    )

    res.render('admin/user-detail', {
      title: users[0].name || users[0].email,
      user: users[0],
      bikes,
      messages
    })
  } catch (err) {
    console.error('Admin user detail error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.redirect('/admin/users')
  }
})

/**
 * POST /admin/users/:id/delete — Delete a user and all their data
 *
 * Cascading delete: user → bikes → scans → contact messages → files.
 * Foreign keys with ON DELETE CASCADE handle the database records.
 * We manually clean up uploaded files (photos, QR codes).
 */
router.post('/users/:id/delete', async (req, res) => {
  try {
    // Get user info for confirmation
    const [users] = await db.query(
      'SELECT id, name, email FROM users WHERE id = ?',
      [req.params.id]
    )

    if (users.length === 0) {
      req.flash('error', req.t('admin.user_not_found'))
      return res.redirect('/admin/users')
    }

    // Prevent admin from deleting themselves
    if (users[0].id === req.session.userId) {
      req.flash('error', req.t('admin.cannot_delete_self'))
      return res.redirect('/admin/users')
    }

    // Get their bikes to clean up files
    const [bikes] = await db.query(
      'SELECT tag_uid, photo_url, garage_parking FROM bicycles WHERE owner_id = ?',
      [req.params.id]
    )

    // Delete the user — ON DELETE CASCADE handles bikes, scans, messages
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id])

    // Clean up uploaded files for each bike
    for (const bike of bikes) {
      // Delete bike photo
      if (bike.photo_url) {
        try { await fs.unlink(path.join(__dirname, '..', 'uploads', 'photos', bike.photo_url)) }
        catch (e) { /* file may not exist */ }
      }
      // Delete QR code
      try { await fs.unlink(path.join(__dirname, '..', 'uploads', 'qr', `${bike.tag_uid}.png`)) }
      catch (e) { /* file may not exist */ }
      // Delete TWINT QR
      if (bike.garage_parking) {
        try { await fs.unlink(path.join(__dirname, '..', 'uploads', 'qr', `twint_${bike.tag_uid}.png`)) }
        catch (e) { /* file may not exist */ }
      }
    }

    // Also clean up any magic tokens for this email
    await db.query('DELETE FROM magic_tokens WHERE email = ?', [users[0].email])

    req.flash('success', `${req.t('admin.user_deleted')}: ${users[0].name || users[0].email}`)
    res.redirect('/admin/users')
  } catch (err) {
    console.error('Admin delete user error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.redirect('/admin/users')
  }
})

// ─── ADMIN BIKE MANAGEMENT ──────────────────────────────────────────────────

/**
 * POST /admin/bikes/:id/status — Change any bike's status
 *
 * Admin can change any bike to active, stolen, or inactive.
 * The new status comes from req.body.status.
 */
router.post('/bikes/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['active', 'stolen', 'inactive']

    if (!validStatuses.includes(status)) {
      req.flash('error', req.t('admin.invalid_status'))
      return res.redirect('/admin/bikes')
    }

    const [result] = await db.query(
      'UPDATE bicycles SET status = ? WHERE id = ?',
      [status, req.params.id]
    )

    if (result.affectedRows === 0) {
      req.flash('error', req.t('bikes.not_found'))
      return res.redirect('/admin/bikes')
    }

    req.flash('success', req.t('admin.status_changed'))
    res.redirect('/admin/bikes')
  } catch (err) {
    console.error('Admin change status error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.redirect('/admin/bikes')
  }
})

/**
 * POST /admin/bikes/:id/delete — Delete any bike (admin override)
 *
 * Unlike the user's delete which requires ownership,
 * admin can delete any bike in the system.
 * ON DELETE CASCADE handles scans and contact messages.
 */
router.post('/bikes/:id/delete', async (req, res) => {
  try {
    // Get bike info for file cleanup
    const [bikes] = await db.query(
      'SELECT id, tag_uid, photo_url, garage_parking FROM bicycles WHERE id = ?',
      [req.params.id]
    )

    if (bikes.length === 0) {
      req.flash('error', req.t('bikes.not_found'))
      return res.redirect('/admin/bikes')
    }

    const bike = bikes[0]

    // Delete the bike — cascades to scans and messages
    await db.query('DELETE FROM bicycles WHERE id = ?', [bike.id])

    // Clean up files
    if (bike.photo_url) {
      try { await fs.unlink(path.join(__dirname, '..', 'uploads', 'photos', bike.photo_url)) }
      catch (e) { /* file may not exist */ }
    }
    try { await fs.unlink(path.join(__dirname, '..', 'uploads', 'qr', `${bike.tag_uid}.png`)) }
    catch (e) { /* file may not exist */ }
    if (bike.garage_parking) {
      try { await fs.unlink(path.join(__dirname, '..', 'uploads', 'qr', `twint_${bike.tag_uid}.png`)) }
      catch (e) { /* file may not exist */ }
    }

    req.flash('success', req.t('admin.bike_deleted'))
    res.redirect('/admin/bikes')
  } catch (err) {
    console.error('Admin delete bike error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.redirect('/admin/bikes')
  }
})

// ─── PAYMENT EXEMPTION ──────────────────────────────────────────────────────

/**
 * POST /admin/exempt/:id — Toggle payment exemption
 *
 * Switches a garage bike between 'exempt' and 'pending' status.
 * Exempt users don't receive payment reminders.
 */
router.post('/exempt/:id', async (req, res) => {
  try {
    const [bikes] = await db.query(
      'SELECT id, payment_status FROM bicycles WHERE id = ? AND garage_parking = TRUE',
      [req.params.id]
    )

    if (bikes.length === 0) {
      req.flash('error', req.t('bikes.not_found'))
      return res.redirect('/admin/garage')
    }

    // Toggle: exempt → pending, anything else → exempt
    const newStatus = bikes[0].payment_status === 'exempt' ? 'pending' : 'exempt'

    await db.query(
      'UPDATE bicycles SET payment_status = ?, payment_reminder_sent = FALSE WHERE id = ?',
      [newStatus, req.params.id]
    )

    req.flash('success', req.t('admin.exemption_toggled'))
    res.redirect('/admin/garage')
  } catch (err) {
    console.error('Admin exempt error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.redirect('/admin/garage')
  }
})

// ─── CONTACT MESSAGES ───────────────────────────────────────────────────────

/**
 * GET /admin/messages — All contact form messages
 *
 * Shows every message sent through the QR code contact form,
 * with bike and owner details. Most recent first.
 */
router.get('/messages', async (req, res) => {
  try {
    const [messages] = await db.query(
      `SELECT cm.id, cm.finder_name, cm.finder_phone, cm.message, cm.sent_at,
              b.brand, b.color, b.tag_uid,
              u.name AS owner_name
       FROM contact_messages cm
       JOIN bicycles b ON cm.bicycle_id = b.id
       JOIN users u ON b.owner_id = u.id
       ORDER BY cm.sent_at DESC
       LIMIT 200`
    )

    res.render('admin/messages', { title: req.t('admin.all_messages'), messages })
  } catch (err) {
    console.error('Admin messages error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.render('admin/messages', { title: req.t('admin.all_messages'), messages: [] })
  }
})

/**
 * POST /admin/messages/:id/delete — Delete a contact message
 */
router.post('/messages/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM contact_messages WHERE id = ?', [req.params.id])
    req.flash('success', req.t('admin.message_deleted'))
    res.redirect('/admin/messages')
  } catch (err) {
    console.error('Admin delete message error:', err.message)
    req.flash('error', req.t('errors.load_failed'))
    res.redirect('/admin/messages')
  }
})

module.exports = router
