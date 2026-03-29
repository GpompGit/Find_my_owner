/**
 * routes/contact.js — Finder Contact Form
 *
 * Handles messages sent by someone who found or saw a bike.
 * The form is on the public scan page (/bike/:uid).
 *
 * When a message is submitted:
 * 1. Save it to the contact_messages table
 * 2. Send an email notification to the bike owner
 * 3. Show a "message sent" confirmation page
 *
 * No authentication required — anyone can send a message.
 * finder_name and finder_phone are optional (data minimization).
 *
 * Routes:
 *   POST /contact/:id — submit finder contact form
 */

const express = require('express')
const db = require('../db/connection')
const nodemailer = require('nodemailer')
const escapeHtml = require('../utils/escapeHtml')
const createRateLimiter = require('../middleware/rateLimit')

const router = express.Router()

// Rate limit contact form — max 10 messages per IP per hour
const contactLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyFn: (req) => req.ip || 'unknown'
})

/**
 * Create the email transporter.
 *
 * nodemailer uses a "transporter" object to send emails.
 * The configuration comes from environment variables (.env).
 *
 * secure: false + port 587 = STARTTLS (connection starts unencrypted,
 * then upgrades to TLS). This is the standard for most SMTP providers.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,  // true for port 465 (implicit TLS), false for 587 (STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

/**
 * POST /contact/:id — Handle contact form submission
 *
 * :id is the bicycle's internal database ID (not the public tag_uid).
 * This is safe because the form is generated server-side — the user
 * never sees or manipulates this ID in the browser URL.
 *
 * Steps:
 * 1. Validate that the bike exists
 * 2. Validate the message (required field)
 * 3. Save the message to the database
 * 4. Email the bike owner
 * 5. Redirect to confirmation page
 */
router.post('/contact/:id', contactLimiter, async (req, res) => {
  try {
    const bikeId = req.params.id
    const { finder_name, finder_phone, message } = req.body

    // ── Validate message ──
    // The message is the only required field
    if (!message || message.trim().length === 0) {
      req.flash('error', req.t('public.message_required'))
      return res.redirect('back')  // Go back to the previous page
    }

    // ── Verify the bike exists and get owner info ──
    // We need the owner's email to send the notification.
    const [rows] = await db.query(
      `SELECT b.id, b.brand, b.color, b.tag_uid,
              u.email AS owner_email, u.name AS owner_name
       FROM bicycles b
       JOIN users u ON b.owner_id = u.id
       WHERE b.id = ?`,
      [bikeId]
    )

    if (rows.length === 0) {
      return res.status(404).render('404', { title: 'Bike Not Found' })
    }

    const bike = rows[0]

    // ── Save the contact message ──
    // finder_name and finder_phone are optional — store null if empty.
    // The || null pattern converts empty strings to null.
    await db.query(
      `INSERT INTO contact_messages (bicycle_id, finder_name, finder_phone, message)
       VALUES (?, ?, ?, ?)`,
      [bikeId, finder_name || null, finder_phone || null, message.trim()]
    )

    // ── Send email notification to the bike owner ──
    // We wrap this in try/catch separately because email failure
    // shouldn't prevent the message from being saved.
    try {
      await transporter.sendMail({
        from: `"Quartier Bike ID" <${process.env.SMTP_USER}>`,
        to: bike.owner_email,
        subject: `Someone contacted you about your ${bike.brand} ${bike.color}`,
        html: `
          <h2>New message about your bicycle</h2>
          <p><strong>Bike:</strong> ${escapeHtml(bike.brand)} ${escapeHtml(bike.color)}</p>
          ${finder_name ? `<p><strong>From:</strong> ${escapeHtml(finder_name)}</p>` : ''}
          ${finder_phone ? `<p><strong>Phone:</strong> ${escapeHtml(finder_phone)}</p>` : ''}
          <p><strong>Message:</strong></p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 10px; color: #555;">
            ${escapeHtml(message.trim())}
          </blockquote>
          <hr>
          <small>
            Quartier Bike ID — This message was sent via the QR code on your bike.
          </small>
        `
      })
    } catch (emailErr) {
      // Email failed — log it but don't show error to the finder.
      // The message is already saved in the database.
      console.error('Contact email failed:', emailErr.message)
    }

    // ── Show confirmation page ──
    res.render('public/contact-sent', { title: 'Message Sent' })
  } catch (err) {
    console.error('Contact form error:', err.message)
    res.status(500).render('error', {
      title: 'Error',
      message: 'Could not send your message. Please try again.'
    })
  }
})

module.exports = router
