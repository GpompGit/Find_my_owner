/**
 * db/connection.js — MariaDB Connection Pool
 *
 * This module creates a single database connection pool that the entire
 * application shares. A "pool" keeps several database connections open
 * and ready, so each request doesn't have to wait for a new connection
 * to be established. When a query finishes, the connection goes back
 * into the pool for the next request to use.
 *
 * We use mysql2/promise (the promise-based version of mysql2) so we can
 * use async/await instead of callbacks — much cleaner code.
 *
 * Usage in any route file:
 *   const db = require('../db/connection')
 *   const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId])
 */

// Load environment variables from .env file into process.env
// This must happen before we reference any process.env values
require('dotenv').config()

// mysql2/promise gives us a pool that returns Promises,
// so we can use await instead of callback functions
const mysql = require('mysql2/promise')

/**
 * Create the connection pool.
 *
 * A pool is like a queue of pre-opened database connections.
 * Instead of opening a new connection for every single query
 * (which is slow), the pool keeps connections alive and recycles them.
 *
 * Key configuration options:
 * - host:            Where the database server is running (localhost = same machine)
 * - port:            Synology MariaDB uses 3307, not the usual 3306
 * - user:            The database user we created in schema setup
 * - password:        That user's password (from .env, never hardcoded)
 * - database:        Which database to connect to
 * - waitForConnections: If all connections are busy, wait instead of throwing an error
 * - connectionLimit: Maximum simultaneous connections (10 is plenty for a small app)
 * - queueLimit:      How many requests can wait in line (0 = unlimited)
 * - charset:         utf8mb4 supports emojis and special characters
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
})

/**
 * Test the database connection on startup.
 *
 * This is an IIFE (Immediately Invoked Function Expression) — it runs
 * as soon as this file is loaded. We try to get a connection from the pool,
 * and if it works, we know the database is reachable. If not, we log the
 * error so you can fix it (wrong password, database not running, etc.).
 *
 * The connection.release() call returns the connection back to the pool —
 * we don't want to hold onto it, we just wanted to test that it works.
 */
;(async () => {
  try {
    const connection = await pool.getConnection()
    console.log('Database connected successfully to', process.env.DB_NAME)
    connection.release() // Always release back to pool after use
  } catch (err) {
    console.error('Database connection failed:', err.message)
    // We log the error but don't crash — the app can still start,
    // and individual queries will fail with a clear error
  }
})()

/**
 * Export the pool so other files can use it:
 *
 *   const db = require('../db/connection')
 *   const [rows] = await db.query('SELECT id, name FROM users WHERE id = ?', [1])
 *
 * The query() method returns an array: [rows, fields]
 * - rows: the actual data (array of objects)
 * - fields: metadata about the columns (rarely needed)
 *
 * We typically destructure like this:
 *   const [rows] = await db.query(...)    // just the data
 *   const [rows, fields] = await db.query(...)  // data + metadata
 */
module.exports = pool
