/**
 * middleware/requireAdmin.js — Admin Access Guard
 *
 * Protects admin-only routes (/admin/*). Only the admin user can access
 * these routes — all other authenticated users get a 403 Forbidden.
 *
 * How admin is identified:
 * - When a user logs in, we check if their email matches ADMIN_EMAIL
 *   from the environment variables.
 * - If it matches, we set req.session.isAdmin = true in the login route.
 * - This middleware simply checks that flag.
 *
 * This middleware should be used AFTER requireAuth:
 *   router.get('/admin', requireAuth, requireAdmin, handler)
 *
 * Why not use a separate admin login?
 * For a small neighbourhood app with one admin (Guillermo), a separate
 * login system would be overkill. The admin is just a regular user with
 * an extra flag in their session.
 */

const requireAdmin = (req, res, next) => {
  // Check if the session has the admin flag set to true.
  // This flag is set during login when the user's email matches ADMIN_EMAIL.
  if (req.session && req.session.isAdmin) {
    // User is admin — let the request continue
    return next()
  }

  // User is logged in (requireAuth already checked that) but is not admin.
  // Return 403 Forbidden — they don't have permission for this resource.
  req.flash('error', req.t ? req.t('errors.admin_required') : 'Admin access required')
  res.status(403).redirect('/dashboard')
}

module.exports = requireAdmin
