/**
 * routes/admin.js — Admin Panel
 *
 * Admin-only routes for managing all bikes, printing labels,
 * viewing scan history, and managing garage payments.
 * This is a stub — full implementation coming in the next phase.
 *
 * Routes:
 *   GET  /admin           — admin dashboard
 *   GET  /admin/bikes     — all registered bikes
 *   GET  /admin/print/:id — print-ready labels
 *   GET  /admin/garage    — garage users + payment status
 *   POST /admin/payment/:id — mark payment received
 *   GET  /admin/scans     — full scan history
 */

const express = require('express')

const router = express.Router()

// Placeholder routes — will be implemented in the next phase

module.exports = router
