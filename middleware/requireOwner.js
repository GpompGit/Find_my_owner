/**
 * middleware/requireOwner.js — Bicycle Ownership Guard
 *
 * Ensures that the logged-in user actually owns the bicycle they're
 * trying to view, edit, or delete. This prevents User A from modifying
 * User B's bikes by changing the ID in the URL.
 *
 * This middleware should ALWAYS be used AFTER requireAuth, because
 * it depends on req.session.userId being set:
 *
 *   router.post('/bikes/edit/:id', requireAuth, requireOwner, handler)
 *
 * How it works:
 * 1. Read the bike ID from the URL parameter (:id)
 * 2. Query the database for a bike with that ID AND the logged-in user's ID
 * 3. If found → the user owns it → attach it to req.bike and continue
 * 4. If not found → either the bike doesn't exist, or they don't own it → 403
 *
 * By attaching the bike to req.bike, the route handler doesn't need to
 * query the database again — it can just use req.bike directly.
 */

const db = require('../db/connection')

const requireOwner = async (req, res, next) => {
  try {
    // Get the bike ID from the URL — e.g., /bikes/edit/5 → req.params.id = '5'
    const bikeId = req.params.id

    // Get the logged-in user's ID from the session
    // (requireAuth middleware already confirmed this exists)
    const userId = req.session.userId

    // Query for a bike that matches BOTH the bike ID and the owner ID.
    // This single query handles two checks at once:
    // - Does this bike exist?
    // - Does it belong to this user?
    // Using parameterized query (? placeholders) to prevent SQL injection.
    const [rows] = await db.query(
      'SELECT id, owner_id, tag_uid, brand, color, description, photo_url, status, garage_parking FROM bicycles WHERE id = ? AND owner_id = ?',
      [bikeId, userId]
    )

    // rows is an array — if empty, either the bike doesn't exist
    // or it belongs to someone else. We return 403 (Forbidden) either way
    // so we don't reveal whether the bike exists.
    if (rows.length === 0) {
      req.flash('error', req.t ? req.t('bikes.not_found') : 'Bicycle not found or access denied')
      return res.status(403).redirect('/dashboard')
    }

    // Bike found and user owns it — attach it to the request object.
    // Now the route handler can use req.bike without re-querying.
    req.bike = rows[0]

    // Continue to the next middleware or route handler
    next()
  } catch (err) {
    // Something went wrong with the database query.
    // Log the error with context (which middleware, which user)
    // but don't expose internal details to the client.
    console.error('requireOwner error:', err.message)
    res.status(500).send('Internal server error')
  }
}

module.exports = requireOwner
