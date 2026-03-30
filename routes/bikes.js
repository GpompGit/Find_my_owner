/**
 * routes/bikes.js — Bicycle Management Routes
 *
 * Handles the full lifecycle of a bicycle in the system:
 * - Add a new bike (with photo upload and QR code generation)
 * - Edit bike details
 * - Delete a bike
 * - Mark as stolen / recovered
 *
 * All routes require authentication (requireAuth).
 * Routes that modify a specific bike also require ownership (requireOwner).
 *
 * Route prefix: /bikes (mounted in app.js as app.use('/bikes', bikesRoutes))
 * So a route defined as '/add' here becomes '/bikes/add' in the browser.
 *
 * Routes:
 *   GET  /add           → show the "add bike" form
 *   POST /add           → save new bike + generate QR code
 *   GET  /edit/:id      → show the "edit bike" form (pre-filled)
 *   POST /edit/:id      → save changes to an existing bike
 *   POST /delete/:id    → delete a bike and its files
 *   POST /stolen/:id    → change status to 'stolen'
 *   POST /recovered/:id → change status back to 'active'
 */

const express = require('express')
const path = require('path')
const fs = require('fs').promises   // Promise-based file system operations
const crypto = require('crypto')         // Built-in: crypto.randomUUID() for unique IDs
const QRCode = require('qrcode')    // Generate QR code images
const multer = require('multer')    // Handle file uploads (multipart/form-data)
const db = require('../db/connection')
const requireAuth = require('../middleware/requireAuth')
const requireOwner = require('../middleware/requireOwner')

const router = express.Router()

// ─── Multer Configuration — File Upload Handling ────────────────────────────
//
// Multer is middleware that handles multipart/form-data (file uploads).
// It intercepts the upload before your route handler runs, saves the file
// to disk, and puts file metadata into req.file (single) or req.files (multiple).
//
// Key decisions:
// - We use diskStorage (saves to disk) instead of memoryStorage (saves to RAM)
// - Filenames are random UUIDs — never use the original filename (security)
// - Only image files are accepted (JPEG, PNG, GIF, WebP)
// - Max file size: 5 MB

/**
 * Storage configuration — controls WHERE and HOW files are saved.
 *
 * destination: which folder to save uploaded files to
 * filename: what to name the saved file
 */
const storage = multer.diskStorage({
  // Save all bike photos to the uploads/photos/ directory
  destination: (req, file, cb) => {
    // cb = callback(error, destination)
    // null = no error
    cb(null, path.join(__dirname, '..', 'uploads', 'photos'))
  },

  // Generate a random filename using UUID to prevent:
  // 1. Filename collisions (two users upload "photo.jpg")
  // 2. Path traversal attacks (malicious filenames like "../../etc/passwd")
  // 3. Information leakage (original filename might contain personal info)
  filename: (req, file, cb) => {
    // Extract the file extension from the original name
    // e.g., "my-bike.jpg" → ".jpg"
    const ext = path.extname(file.originalname).toLowerCase()

    // Generate a UUID filename: "a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg"
    cb(null, crypto.randomUUID() + ext)
  }
})

/**
 * File filter — controls WHICH files are accepted.
 *
 * We only accept image files. If someone tries to upload a .exe or .pdf,
 * multer will reject it with an error.
 */
const fileFilter = (req, file, cb) => {
  // List of allowed MIME types for images
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  if (allowedTypes.includes(file.mimetype)) {
    // Accept the file — cb(null, true)
    cb(null, true)
  } else {
    // Reject the file — cb(error, false)
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'), false)
  }
}

/**
 * Create the multer upload middleware.
 *
 * .single('photo') means: expect ONE file in the form field named "photo"
 * After processing, the file info is available at req.file
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024  // 5 MB max (in bytes)
  }
})

// ─── ADD BIKE ───────────────────────────────────────────────────────────────

/**
 * GET /bikes/add — Show the "add bike" form
 *
 * requireAuth ensures only logged-in users can access this.
 */
router.get('/add', requireAuth, (req, res) => {
  res.render('bikes/add', { title: 'Add Bike' })
})

/**
 * POST /bikes/add — Save a new bike
 *
 * This is the most complex route. Here's what happens:
 * 1. Multer processes the uploaded photo (if any)
 * 2. We validate the form data
 * 3. Generate a unique tag_uid (UUID) for the QR code URL
 * 4. Generate a QR code PNG file
 * 5. Insert the bike into the database
 * 6. If garage parking, generate a TWINT payment QR code too
 * 7. Redirect to dashboard with success message
 *
 * upload.single('photo') runs multer BEFORE our handler.
 * If a file was uploaded, it's available at req.file.
 * Form text fields are in req.body (as usual).
 */
router.post('/add', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    // ── Extract form fields ──
    const { brand, color, description, garage_parking } = req.body
    const ownerId = req.session.userId

    // ── Validate required fields ──
    if (!brand || !color) {
      req.flash('error', req.t('bikes.brand_color_required'))
      return res.redirect('/bikes/add')
    }

    // ── Generate unique tag UID ──
    // This UUID becomes part of the public QR code URL.
    // Using UUID v4 (random) — virtually impossible to guess.
    // Example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    const tagUid = crypto.randomUUID()

    // ── Build the public URL for this bike ──
    // This is what the QR code will point to.
    // BASE_URL comes from .env (e.g., "https://bikes.yourdomain.com")
    const bikeUrl = `${process.env.BASE_URL}/bike/${tagUid}`

    // ── Generate QR code PNG ──
    // QRCode.toFile() creates a PNG image file at the specified path.
    // width: 300 gives ~300 DPI on a 25mm Dymo 30332 square label —
    // optimal for reliable scanning from phone cameras.
    const qrPath = path.join(__dirname, '..', 'uploads', 'qr', `${tagUid}.png`)
    await QRCode.toFile(qrPath, bikeUrl, { width: 300, margin: 1 })

    // ── Get the photo filename (if uploaded) ──
    // req.file is set by multer if a file was uploaded.
    // We store just the filename (not the full path) in the database.
    const photoUrl = req.file ? req.file.filename : null

    // ── Convert garage_parking checkbox to boolean ──
    // HTML checkboxes send their value ("1") when checked, or nothing when unchecked.
    // We convert to a proper boolean for the database.
    const isGarageParking = garage_parking === '1'

    // ── Insert bike into the database ──
    // Parameterized query with ? placeholders prevents SQL injection.
    await db.query(
      `INSERT INTO bicycles
       (owner_id, tag_uid, brand, color, description, photo_url, garage_parking)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, tagUid, brand, color, description || null, photoUrl, isGarageParking]
    )

    // ── Handle garage parking setup ──
    if (isGarageParking) {
      // Set the garage start date and payment due date (365 days from now)
      const now = new Date()
      const dueDate = new Date(now)
      dueDate.setDate(dueDate.getDate() + 365)

      await db.query(
        `UPDATE bicycles
         SET garage_start_date = ?, payment_due_date = ?, payment_status = 'pending'
         WHERE tag_uid = ?`,
        [now, dueDate, tagUid]
      )

      // Generate a TWINT payment QR code for garage users.
      // This QR points to the TWINT payment link with the amount and bike reference.
      if (process.env.TWINT_PAYMENT_URL) {
        const twintUrl = `${process.env.TWINT_PAYMENT_URL}?amount=40.00&message=Garage+${tagUid}`
        const twintQrPath = path.join(__dirname, '..', 'uploads', 'qr', `twint_${tagUid}.png`)
        await QRCode.toFile(twintQrPath, twintUrl, { width: 300 })
      }
    }

    req.flash('success', `${req.t('bikes.registered_success')} ${brand} ${color}`)
    res.redirect('/dashboard')
  } catch (err) {
    console.error('Add bike error:', err.message)
    req.flash('error', req.t('bikes.add_failed'))
    res.redirect('/bikes/add')
  }
})

// ─── EDIT BIKE ──────────────────────────────────────────────────────────────

/**
 * GET /bikes/edit/:id — Show the edit form (pre-filled with current data)
 *
 * requireOwner middleware:
 * 1. Checks the user owns this bike
 * 2. Attaches the bike data to req.bike
 * So we don't need to query the database again here.
 */
router.get('/edit/:id', requireAuth, requireOwner, (req, res) => {
  res.render('bikes/edit', {
    title: 'Edit Bike',
    bike: req.bike   // Attached by requireOwner middleware
  })
})

/**
 * POST /bikes/edit/:id — Save changes to an existing bike
 *
 * Allows updating: brand, color, description, garage_parking, and photo.
 * If a new photo is uploaded, the old one is deleted from disk.
 */
router.post('/edit/:id', requireAuth, requireOwner, upload.single('photo'), async (req, res) => {
  try {
    const { brand, color, description, garage_parking } = req.body
    const bikeId = req.params.id

    // ── Validate required fields ──
    if (!brand || !color) {
      req.flash('error', req.t('bikes.brand_color_required'))
      return res.redirect(`/bikes/edit/${bikeId}`)
    }

    const isGarageParking = garage_parking === '1'

    // ── Handle photo update ──
    // If a new photo was uploaded, use it. Otherwise, keep the existing one.
    let photoUrl = req.bike.photo_url  // Current photo from requireOwner

    if (req.file) {
      // New photo uploaded — delete the old one from disk (if it exists)
      if (req.bike.photo_url) {
        const oldPhotoPath = path.join(__dirname, '..', 'uploads', 'photos', req.bike.photo_url)
        try {
          await fs.unlink(oldPhotoPath)  // Delete old file
        } catch (unlinkErr) {
          // File might not exist — that's okay, just log and continue
          console.error('Could not delete old photo:', unlinkErr.message)
        }
      }
      photoUrl = req.file.filename  // Use the new filename
    }

    // ── Update the database ──
    await db.query(
      `UPDATE bicycles
       SET brand = ?, color = ?, description = ?, photo_url = ?, garage_parking = ?
       WHERE id = ? AND owner_id = ?`,
      [brand, color, description || null, photoUrl, isGarageParking, bikeId, req.session.userId]
    )

    // ── Handle garage parking changes ──
    // If garage parking was just enabled (wasn't before), set up payment tracking
    if (isGarageParking && !req.bike.garage_parking) {
      const now = new Date()
      const dueDate = new Date(now)
      dueDate.setDate(dueDate.getDate() + 365)

      await db.query(
        `UPDATE bicycles
         SET garage_start_date = ?, payment_due_date = ?, payment_status = 'pending'
         WHERE id = ?`,
        [now, dueDate, bikeId]
      )

      // Generate TWINT QR if not already present
      if (process.env.TWINT_PAYMENT_URL) {
        const twintUrl = `${process.env.TWINT_PAYMENT_URL}?amount=40.00&message=Garage+${req.bike.tag_uid}`
        const twintQrPath = path.join(__dirname, '..', 'uploads', 'qr', `twint_${req.bike.tag_uid}.png`)
        await QRCode.toFile(twintQrPath, twintUrl, { width: 300 })
      }
    }

    req.flash('success', req.t('bikes.updated_success'))
    res.redirect('/dashboard')
  } catch (err) {
    console.error('Edit bike error:', err.message)
    req.flash('error', req.t('bikes.update_failed'))
    res.redirect(`/bikes/edit/${req.params.id}`)
  }
})

// ─── DELETE BIKE ────────────────────────────────────────────────────────────

/**
 * POST /bikes/delete/:id — Delete a bike and its associated files
 *
 * This removes:
 * 1. The bike record from the database
 * 2. The uploaded photo file (if any)
 * 3. The QR code PNG file
 * 4. The TWINT QR code PNG file (if garage parking)
 * 5. Associated scan logs and contact messages (cascade)
 *
 * Uses POST (not GET/DELETE) because HTML forms only support GET and POST.
 * We don't want accidental deletion via a link (GET request).
 */
router.post('/delete/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const bike = req.bike  // Attached by requireOwner middleware

    // ── Delete associated records first (referential integrity) ──
    // We delete child records before the parent to avoid foreign key errors.
    // In a production system, you might use ON DELETE CASCADE in the schema instead.
    await db.query('DELETE FROM contact_messages WHERE bicycle_id = ?', [bike.id])
    await db.query('DELETE FROM scans WHERE bicycle_id = ?', [bike.id])

    // ── Delete the bike record ──
    await db.query(
      'DELETE FROM bicycles WHERE id = ? AND owner_id = ?',
      [bike.id, req.session.userId]
    )

    // ── Clean up files from disk ──
    // We use try/catch for each file deletion because we don't want
    // a missing file to prevent the rest of the cleanup.

    // Delete bike photo
    if (bike.photo_url) {
      try {
        await fs.unlink(path.join(__dirname, '..', 'uploads', 'photos', bike.photo_url))
      } catch (e) { /* File might not exist — that's okay */ }
    }

    // Delete QR code
    try {
      await fs.unlink(path.join(__dirname, '..', 'uploads', 'qr', `${bike.tag_uid}.png`))
    } catch (e) { /* File might not exist */ }

    // Delete TWINT QR code (if garage bike)
    if (bike.garage_parking) {
      try {
        await fs.unlink(path.join(__dirname, '..', 'uploads', 'qr', `twint_${bike.tag_uid}.png`))
      } catch (e) { /* File might not exist */ }
    }

    req.flash('success', `${bike.brand} ${bike.color} ${req.t('bikes.deleted_success')}`)
    res.redirect('/dashboard')
  } catch (err) {
    console.error('Delete bike error:', err.message)
    req.flash('error', req.t('bikes.delete_failed'))
    res.redirect('/dashboard')
  }
})

// ─── MARK AS STOLEN ─────────────────────────────────────────────────────────

/**
 * POST /bikes/stolen/:id — Mark a bike as stolen
 *
 * Changes the bike's status from 'active' to 'stolen'.
 * When a stolen bike is scanned, the scan page will request GPS location
 * from the finder (with consent) to help the owner locate it.
 */
router.post('/stolen/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await db.query(
      "UPDATE bicycles SET status = 'stolen' WHERE id = ? AND owner_id = ?",
      [req.bike.id, req.session.userId]
    )

    req.flash('success', `${req.bike.brand} ${req.bike.color} ${req.t('bikes.stolen_success')}`)
    res.redirect('/dashboard')
  } catch (err) {
    console.error('Mark stolen error:', err.message)
    req.flash('error', req.t('bikes.status_failed'))
    res.redirect('/dashboard')
  }
})

// ─── MARK AS RECOVERED ──────────────────────────────────────────────────────

/**
 * POST /bikes/recovered/:id — Mark a stolen bike as recovered
 *
 * Changes the bike's status from 'stolen' back to 'active'.
 * GPS tracking stops on future scans.
 */
router.post('/recovered/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await db.query(
      "UPDATE bicycles SET status = 'active' WHERE id = ? AND owner_id = ?",
      [req.bike.id, req.session.userId]
    )

    req.flash('success', `${req.bike.brand} ${req.bike.color} ${req.t('bikes.recovered_success')}`)
    res.redirect('/dashboard')
  } catch (err) {
    console.error('Mark recovered error:', err.message)
    req.flash('error', req.t('bikes.status_failed'))
    res.redirect('/dashboard')
  }
})

module.exports = router
