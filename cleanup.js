/**
 * cleanup.js — Nightly GDPR Cleanup + Garage Payment Reminders
 *
 * This script runs as a scheduled job via PM2 cron:
 *   pm2 start cleanup.js --name cleanup --cron "0 3 * * *" --no-autorestart
 *
 * It runs every night at 03:00 and handles:
 * 1. GDPR location cleanup — deletes GPS data older than 90 days
 * 2. Garage payment reminders — emails users 14 days before due date
 *
 * Why a separate script (not inside app.js)?
 * - Keeps the web server lean — cleanup is a batch job, not a web request
 * - Can be scheduled independently with its own cron timing
 * - If cleanup crashes, the web server keeps running (isolation)
 * - PM2's --no-autorestart prevents it from running continuously
 */

// Load environment variables
require('dotenv').config()

const db = require('./db/connection')
const nodemailer = require('nodemailer')

/**
 * Email transporter for garage payment reminders.
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
 * Task 1: GDPR Location Cleanup
 *
 * Nullifies GPS coordinates (lat, lng, accuracy) on scan records
 * where the location_expires_at date has passed.
 *
 * This is a GDPR requirement — location data must not be kept
 * longer than necessary. The default retention is 90 days.
 *
 * We SET the values to NULL rather than DELETE the rows because
 * we still want to keep the scan log (date, device info) — just
 * without the GPS coordinates.
 */
const cleanupExpiredLocations = async () => {
  try {
    const [result] = await db.query(`
      UPDATE scans
      SET lat = NULL,
          lng = NULL,
          accuracy = NULL,
          location_expires_at = NULL
      WHERE location_expires_at IS NOT NULL
        AND location_expires_at < NOW()
    `)

    // result.affectedRows tells us how many records were cleaned
    if (result.affectedRows > 0) {
      console.log(`GDPR cleanup: nullified GPS data on ${result.affectedRows} scan(s)`)
    } else {
      console.log('GDPR cleanup: no expired location data found')
    }
  } catch (err) {
    console.error('GDPR cleanup error:', err.message)
  }
}

/**
 * Task 2: Garage Payment Reminders
 *
 * Sends email reminders to bike owners whose garage parking payment
 * is due within the next 14 days.
 *
 * Conditions for sending a reminder:
 * - Bike has garage_parking = TRUE
 * - Payment status is not 'exempt' (some users are exempt)
 * - Payment due date is within 14 days from now
 * - Reminder hasn't already been sent (payment_reminder_sent = FALSE)
 *
 * After sending, we set payment_reminder_sent = TRUE to prevent
 * duplicate emails on subsequent runs.
 */
const sendGarageReminders = async () => {
  try {
    // Find bikes with payments due in the next 14 days
    // that haven't received a reminder yet
    const [dueSoon] = await db.query(`
      SELECT b.id, b.brand, b.color, b.tag_uid,
             b.garage_start_date, b.payment_due_date,
             u.email, u.name
      FROM bicycles b
      JOIN users u ON b.owner_id = u.id
      WHERE b.garage_parking = TRUE
        AND b.payment_status != 'exempt'
        AND b.payment_status != 'paid'
        AND b.payment_due_date <= DATE_ADD(NOW(), INTERVAL 14 DAY)
        AND b.payment_reminder_sent = FALSE
    `)

    if (dueSoon.length === 0) {
      console.log('Garage reminders: no reminders to send')
      return
    }

    console.log(`Garage reminders: sending ${dueSoon.length} reminder(s)`)

    // Send a reminder email for each bike
    for (const bike of dueSoon) {
      try {
        // Format dates in Swiss locale (dd.mm.yyyy)
        const dueDate = new Date(bike.payment_due_date).toLocaleDateString('de-CH')
        const garageStart = new Date(bike.garage_start_date).toLocaleDateString('de-CH')

        await transporter.sendMail({
          from: `"Quartier Bike ID" <${process.env.SMTP_USER}>`,
          to: bike.email,
          subject: `Garage contribution due — ${bike.brand} ${bike.color}`,
          html: `
            <h2>Annual Garage Contribution Reminder</h2>
            <p>Dear ${bike.name},</p>
            <p>
              Your annual garage parking contribution of
              <strong>CHF ${parseFloat(process.env.GARAGE_FEE_CHF || 40).toFixed(2)}</strong>
              is due on <strong>${dueDate}</strong>
              for your <strong>${bike.color} ${bike.brand}</strong>.
            </p>
            <p>Garage parking registered since: ${garageStart}</p>
            <p>
              Please pay via TWINT using the QR code on your bike sticker,
              or contact the building admin.
            </p>
            <hr>
            <small>
              Quartier Bike ID &middot; To unsubscribe from garage parking,
              log in and update your bike settings.
            </small>
          `
        })

        // Mark reminder as sent so we don't send it again tomorrow
        await db.query(
          'UPDATE bicycles SET payment_reminder_sent = TRUE WHERE id = ?',
          [bike.id]
        )

        console.log(`  Reminder sent to ${bike.email} for ${bike.brand} ${bike.color}`)
      } catch (emailErr) {
        // If one email fails, continue with the others
        console.error(`  Failed to send reminder for bike ${bike.id}:`, emailErr.message)
      }
    }
  } catch (err) {
    console.error('Garage reminders error:', err.message)
  }
}

/**
 * Task 3: Clean Up Expired Magic Link Tokens
 *
 * Deletes magic link tokens that are expired or already used.
 * These are no longer needed and just take up database space.
 * Expired = older than TOKEN_EXPIRY_MINUTES (default 15 min).
 * Used = the user already clicked the link.
 */
const cleanupExpiredTokens = async () => {
  try {
    const [result] = await db.query(`
      DELETE FROM magic_tokens
      WHERE used = TRUE
         OR expires_at < NOW()
    `)

    if (result.affectedRows > 0) {
      console.log(`Token cleanup: deleted ${result.affectedRows} expired/used token(s)`)
    } else {
      console.log('Token cleanup: no expired tokens found')
    }
  } catch (err) {
    console.error('Token cleanup error:', err.message)
  }
}

/**
 * Main function — runs all tasks and exits.
 *
 * We use an async IIFE (Immediately Invoked Function Expression)
 * to await the async tasks and then exit the process.
 *
 * PM2 with --no-autorestart will NOT restart this script after it exits.
 * The cron schedule will start it again at the next scheduled time.
 */
;(async () => {
  console.log(`\n=== Cleanup job started at ${new Date().toLocaleString('de-CH')} ===\n`)

  // Run all tasks
  await cleanupExpiredLocations()
  await cleanupExpiredTokens()
  await sendGarageReminders()

  console.log(`\n=== Cleanup job completed ===\n`)

  // Close the database pool and exit
  // Without this, the script would hang because the pool keeps connections open
  await db.end()
  process.exit(0)
})()
