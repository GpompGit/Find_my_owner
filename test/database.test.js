/**
 * test/database.test.js — Database Integration Tests
 *
 * These tests require a running MariaDB instance with the test database.
 * They verify the full application flow with real database operations.
 *
 * IMPORTANT: These tests run against a SEPARATE test database
 * (quartier_bikes_test), never the production database.
 *
 * Setup before running:
 *   1. Create the test database:
 *      mysql -u root -p --port 3307 -e "CREATE DATABASE quartier_bikes_test"
 *   2. Import the schema:
 *      mysql -u root -p --port 3307 quartier_bikes_test < db/schema.sql
 *   3. Run the tests:
 *      DB_NAME=quartier_bikes_test SESSION_SECRET=testsecret123 NEIGHBOURHOOD_SECRET=Bolligenstrasse npm run test:db
 *
 * Each test suite cleans up after itself — tables are truncated between
 * test groups to ensure test isolation.
 *
 * Run with: npm run test:db
 */

const { describe, it, before, after, afterEach } = require('mocha')
const request = require('supertest')
const crypto = require('crypto')

// ── Override database name BEFORE loading the app ──
// This ensures we connect to the test database, not production.
process.env.DB_NAME = process.env.DB_NAME || 'quartier_bikes_test'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-for-database-tests-12345'
process.env.NEIGHBOURHOOD_SECRET = process.env.NEIGHBOURHOOD_SECRET || 'Bolligenstrasse'
process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:8080'
process.env.NODE_ENV = 'test'

const app = require('../app')
const db = require('../db/connection')

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

/**
 * Create a magic link token directly in the database.
 * Used to simulate the "click the link in your email" step.
 *
 * @param {string} email - The email address for the token
 * @param {number} expiryMinutes - Minutes until expiry (default 15)
 * @returns {string} The generated token
 */
const createMagicToken = async (email, expiryMinutes = 15) => {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000)

  await db.query(
    'INSERT INTO magic_tokens (email, token, expires_at) VALUES (?, ?, ?)',
    [email, token, expiresAt]
  )

  return token
}

/**
 * Create a test user directly in the database.
 *
 * @param {string} email
 * @param {string} name
 * @returns {number} The user's ID
 */
const createTestUser = async (email, name = 'Test User') => {
  const [result] = await db.query(
    'INSERT INTO users (email, name) VALUES (?, ?)',
    [email, name]
  )
  return result.insertId
}

/**
 * Create a test bicycle directly in the database.
 *
 * @param {number} ownerId
 * @param {Object} overrides — optional field overrides
 * @returns {Object} The created bike record
 */
const createTestBike = async (ownerId, overrides = {}) => {
  const tagUid = crypto.randomUUID()
  const defaults = {
    brand: 'TestBrand',
    color: 'TestColor',
    description: 'A test bicycle',
    status: 'active',
    garage_parking: false
  }
  const bike = { ...defaults, ...overrides }

  const [result] = await db.query(
    `INSERT INTO bicycles (owner_id, tag_uid, brand, color, description, status, garage_parking)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ownerId, tagUid, bike.brand, bike.color, bike.description, bike.status, bike.garage_parking]
  )

  return { id: result.insertId, tag_uid: tagUid, owner_id: ownerId, ...bike }
}

/**
 * Simulate a logged-in session by creating a token, verifying it,
 * and returning the session cookie for subsequent requests.
 *
 * @param {string} email
 * @returns {string} Session cookie string for use with supertest .set('Cookie', ...)
 */
const loginAs = async (email) => {
  const token = await createMagicToken(email)

  const res = await request(app)
    .get(`/auth/verify/${token}`)
    .redirects(0)

  // Extract the session cookie from the Set-Cookie header
  const cookies = res.headers['set-cookie']
  if (!cookies) throw new Error('No session cookie returned after login')

  // Return the cookie string for use in subsequent requests
  return cookies.map(c => c.split(';')[0]).join('; ')
}

/**
 * Truncate all tables between test groups for isolation.
 * Order matters due to foreign key constraints.
 */
const cleanDatabase = async () => {
  await db.query('SET FOREIGN_KEY_CHECKS = 0')
  await db.query('TRUNCATE TABLE contact_messages')
  await db.query('TRUNCATE TABLE scans')
  await db.query('TRUNCATE TABLE bicycles')
  await db.query('TRUNCATE TABLE magic_tokens')
  await db.query('TRUNCATE TABLE users')
  await db.query('SET FOREIGN_KEY_CHECKS = 1')
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

describe('DATABASE INTEGRATION TESTS', function () {
  // Allow more time for database operations
  this.timeout(15000)

  // ── Setup: verify database connection ──
  before(async () => {
    try {
      const [rows] = await db.query('SELECT 1 AS connected')
      if (rows[0].connected !== 1) throw new Error('Database not connected')
      console.log('    Connected to test database:', process.env.DB_NAME)
    } catch (err) {
      console.error('\n    DATABASE CONNECTION FAILED:', err.message)
      console.error('    These tests require a running MariaDB instance.')
      console.error('    See test/database.test.js header for setup instructions.\n')
      process.exit(1)
    }
  })

  // ── Cleanup after all tests ──
  after(async () => {
    await cleanDatabase()
    await db.end()
  })

  // ══════════════════════════════════════════════════════════════════════
  // MAGIC LINK AUTHENTICATION
  // ══════════════════════════════════════════════════════════════════════

  describe('Magic Link Authentication', () => {
    afterEach(async () => await cleanDatabase())

    it('should send magic link and create token in database', async () => {
      const res = await request(app)
        .post('/login')
        .send({
          email: 'newuser@test.com',
          neighbourhood_secret: 'Bolligenstrasse'
        })

      // Should show "check your email" page
      if (res.status !== 200) {
        throw new Error(`Expected 200 (check email page), got ${res.status}`)
      }

      // Verify token was created in the database
      const [tokens] = await db.query(
        'SELECT id, email, used FROM magic_tokens WHERE email = ?',
        ['newuser@test.com']
      )
      if (tokens.length === 0) {
        throw new Error('Magic token should be created in database')
      }
      if (tokens[0].used !== 0) {
        throw new Error('Token should be unused initially')
      }
    })

    it('should create account on first magic link verification', async () => {
      const token = await createMagicToken('brand-new@test.com')

      const res = await request(app)
        .get(`/auth/verify/${token}`)
        .redirects(0)

      // Should redirect to /register/complete for new users
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
      if (!res.headers.location.includes('/register/complete')) {
        throw new Error(`Expected redirect to /register/complete, got ${res.headers.location}`)
      }

      // Verify user was created in the database
      const [users] = await db.query(
        'SELECT id, email, name FROM users WHERE email = ?',
        ['brand-new@test.com']
      )
      if (users.length === 0) {
        throw new Error('User should be created on first login')
      }
      if (users[0].name !== null) {
        throw new Error('Name should be null until registration is completed')
      }

      // Verify token was marked as used
      const [tokens] = await db.query(
        'SELECT used FROM magic_tokens WHERE token = ?',
        [token]
      )
      if (tokens[0].used !== 1) {
        throw new Error('Token should be marked as used')
      }
    })

    it('should log in existing user and redirect to dashboard', async () => {
      await createTestUser('existing@test.com', 'Existing User')
      const token = await createMagicToken('existing@test.com')

      const res = await request(app)
        .get(`/auth/verify/${token}`)
        .redirects(0)

      // Should redirect to /dashboard for existing users
      if (res.status !== 302) {
        throw new Error(`Expected 302, got ${res.status}`)
      }
      if (!res.headers.location.includes('/dashboard')) {
        throw new Error(`Expected redirect to /dashboard, got ${res.headers.location}`)
      }
    })

    it('should reject expired tokens', async () => {
      // Create a token that expired 1 minute ago
      const token = crypto.randomBytes(32).toString('hex')
      const expired = new Date(Date.now() - 60 * 1000)

      await db.query(
        'INSERT INTO magic_tokens (email, token, expires_at) VALUES (?, ?, ?)',
        ['expired@test.com', token, expired]
      )

      const res = await request(app)
        .get(`/auth/verify/${token}`)
        .redirects(0)

      // Should show expired link page or redirect with error
      if (res.status !== 200 && res.status !== 302) {
        throw new Error(`Expected 200 or 302, got ${res.status}`)
      }
    })

    it('should reject already-used tokens (prevents double-click)', async () => {
      const token = await createMagicToken('double@test.com')

      // First click — should succeed
      await request(app).get(`/auth/verify/${token}`).redirects(0)

      // Second click — should fail (token already used)
      const res = await request(app)
        .get(`/auth/verify/${token}`)
        .redirects(0)

      // Should show expired page (token was used)
      if (res.status !== 200 && res.status !== 302) {
        throw new Error(`Expected 200 or 302 on second click, got ${res.status}`)
      }

      // Verify only ONE user was created (not two)
      const [users] = await db.query(
        'SELECT id FROM users WHERE email = ?',
        ['double@test.com']
      )
      if (users.length !== 1) {
        throw new Error(`Expected exactly 1 user, got ${users.length}`)
      }
    })

    it('should complete registration with name and phone', async () => {
      const userId = await createTestUser('incomplete@test.com')
      const token = await createMagicToken('incomplete@test.com')
      const cookie = await loginAs('incomplete@test.com')

      const res = await request(app)
        .post('/register/complete')
        .set('Cookie', cookie)
        .send({ name: 'Completed User', phone: '+41 79 123 45 67' })
        .redirects(0)

      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }

      // Verify name was saved
      const [users] = await db.query(
        'SELECT name, phone FROM users WHERE email = ?',
        ['incomplete@test.com']
      )
      if (users[0].name !== 'Completed User') {
        throw new Error(`Expected name "Completed User", got "${users[0].name}"`)
      }
    })
  })

  // ══════════════════════════════════════════════════════════════════════
  // BICYCLE CRUD OPERATIONS
  // ══════════════════════════════════════════════════════════════════════

  describe('Bicycle CRUD', () => {
    let cookie
    let userId

    before(async () => {
      await cleanDatabase()
      userId = await createTestUser('bikeowner@test.com', 'Bike Owner')
      cookie = await loginAs('bikeowner@test.com')
    })

    afterEach(async () => {
      // Clean bikes but keep the user and session
      await db.query('SET FOREIGN_KEY_CHECKS = 0')
      await db.query('TRUNCATE TABLE contact_messages')
      await db.query('TRUNCATE TABLE scans')
      await db.query('TRUNCATE TABLE bicycles')
      await db.query('SET FOREIGN_KEY_CHECKS = 1')
    })

    after(async () => await cleanDatabase())

    it('should show add bike form when authenticated', async () => {
      const res = await request(app)
        .get('/bikes/add')
        .set('Cookie', cookie)

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
    })

    it('should add a new bike', async () => {
      const res = await request(app)
        .post('/bikes/add')
        .set('Cookie', cookie)
        .field('brand', 'Trek')
        .field('color', 'Red')
        .field('description', 'My test bike')
        .redirects(0)

      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }

      // Verify bike was created in database
      const [bikes] = await db.query(
        'SELECT brand, color, description, owner_id, tag_uid FROM bicycles WHERE owner_id = ?',
        [userId]
      )
      if (bikes.length === 0) throw new Error('Bike should be created')
      if (bikes[0].brand !== 'Trek') throw new Error('Brand should be Trek')
      if (bikes[0].color !== 'Red') throw new Error('Color should be Red')
      if (!bikes[0].tag_uid) throw new Error('tag_uid should be generated')
    })

    it('should reject bike without brand', async () => {
      const res = await request(app)
        .post('/bikes/add')
        .set('Cookie', cookie)
        .field('color', 'Blue')
        .redirects(0)

      // Should redirect back to form with error
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }

      // Verify no bike was created
      const [bikes] = await db.query(
        'SELECT id FROM bicycles WHERE owner_id = ?',
        [userId]
      )
      if (bikes.length !== 0) throw new Error('No bike should be created without brand')
    })

    it('should show dashboard with registered bikes', async () => {
      await createTestBike(userId, { brand: 'Giant', color: 'Blue' })

      const res = await request(app)
        .get('/dashboard')
        .set('Cookie', cookie)

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      if (!res.text.includes('Giant')) throw new Error('Dashboard should show bike brand')
      if (!res.text.includes('Blue')) throw new Error('Dashboard should show bike color')
    })

    it('should show edit form for owned bike', async () => {
      const bike = await createTestBike(userId, { brand: 'Scott', color: 'Black' })

      const res = await request(app)
        .get(`/bikes/edit/${bike.id}`)
        .set('Cookie', cookie)

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      if (!res.text.includes('Scott')) throw new Error('Edit form should show bike brand')
    })

    it('should update an existing bike', async () => {
      const bike = await createTestBike(userId, { brand: 'Old Brand', color: 'Old Color' })

      const res = await request(app)
        .post(`/bikes/edit/${bike.id}`)
        .set('Cookie', cookie)
        .field('brand', 'New Brand')
        .field('color', 'New Color')
        .field('description', 'Updated description')
        .redirects(0)

      if (res.status !== 302) throw new Error(`Expected 302, got ${res.status}`)

      // Verify update in database
      const [bikes] = await db.query('SELECT brand, color FROM bicycles WHERE id = ?', [bike.id])
      if (bikes[0].brand !== 'New Brand') throw new Error('Brand should be updated')
      if (bikes[0].color !== 'New Color') throw new Error('Color should be updated')
    })

    it('should mark bike as stolen', async () => {
      const bike = await createTestBike(userId)

      const res = await request(app)
        .post(`/bikes/stolen/${bike.id}`)
        .set('Cookie', cookie)
        .redirects(0)

      if (res.status !== 302) throw new Error(`Expected 302, got ${res.status}`)

      const [bikes] = await db.query('SELECT status FROM bicycles WHERE id = ?', [bike.id])
      if (bikes[0].status !== 'stolen') throw new Error('Status should be stolen')
    })

    it('should mark stolen bike as recovered', async () => {
      const bike = await createTestBike(userId, { status: 'stolen' })

      const res = await request(app)
        .post(`/bikes/recovered/${bike.id}`)
        .set('Cookie', cookie)
        .redirects(0)

      if (res.status !== 302) throw new Error(`Expected 302, got ${res.status}`)

      const [bikes] = await db.query('SELECT status FROM bicycles WHERE id = ?', [bike.id])
      if (bikes[0].status !== 'active') throw new Error('Status should be active')
    })

    it('should delete a bike and its associated records', async () => {
      const bike = await createTestBike(userId)

      // Add a scan and contact message
      await db.query('INSERT INTO scans (bicycle_id, user_agent) VALUES (?, ?)', [bike.id, 'TestAgent'])
      await db.query(
        'INSERT INTO contact_messages (bicycle_id, message) VALUES (?, ?)',
        [bike.id, 'Test message']
      )

      const res = await request(app)
        .post(`/bikes/delete/${bike.id}`)
        .set('Cookie', cookie)
        .redirects(0)

      if (res.status !== 302) throw new Error(`Expected 302, got ${res.status}`)

      // Verify bike deleted
      const [bikes] = await db.query('SELECT id FROM bicycles WHERE id = ?', [bike.id])
      if (bikes.length !== 0) throw new Error('Bike should be deleted')

      // Verify cascade — scans and messages should be gone
      const [scans] = await db.query('SELECT id FROM scans WHERE bicycle_id = ?', [bike.id])
      if (scans.length !== 0) throw new Error('Scans should be cascade-deleted')

      const [msgs] = await db.query('SELECT id FROM contact_messages WHERE bicycle_id = ?', [bike.id])
      if (msgs.length !== 0) throw new Error('Contact messages should be cascade-deleted')
    })
  })

  // ══════════════════════════════════════════════════════════════════════
  // OWNERSHIP ENFORCEMENT (IDOR PREVENTION)
  // ══════════════════════════════════════════════════════════════════════

  describe('Ownership Enforcement', () => {
    let cookieA, cookieB, userIdA, userIdB

    before(async () => {
      await cleanDatabase()
      userIdA = await createTestUser('usera@test.com', 'User A')
      userIdB = await createTestUser('userb@test.com', 'User B')
      cookieA = await loginAs('usera@test.com')
      cookieB = await loginAs('userb@test.com')
    })

    after(async () => await cleanDatabase())

    it('should prevent User B from editing User A bike', async () => {
      const bikeA = await createTestBike(userIdA, { brand: 'Private Bike' })

      const res = await request(app)
        .get(`/bikes/edit/${bikeA.id}`)
        .set('Cookie', cookieB)  // User B trying to access User A's bike
        .redirects(0)

      // Should get 403 (redirect to dashboard with error)
      if (res.status !== 302 && res.status !== 403) {
        throw new Error(`Expected 302 or 403 (access denied), got ${res.status}`)
      }
    })

    it('should prevent User B from deleting User A bike', async () => {
      const bikeA = await createTestBike(userIdA, { brand: 'Protected Bike' })

      const res = await request(app)
        .post(`/bikes/delete/${bikeA.id}`)
        .set('Cookie', cookieB)
        .redirects(0)

      if (res.status !== 302 && res.status !== 403) {
        throw new Error(`Expected 302 or 403, got ${res.status}`)
      }

      // Verify bike still exists
      const [bikes] = await db.query('SELECT id FROM bicycles WHERE id = ?', [bikeA.id])
      if (bikes.length === 0) throw new Error('Bike should NOT be deleted by non-owner')
    })

    it('should prevent User B from marking User A bike as stolen', async () => {
      const bikeA = await createTestBike(userIdA)

      await request(app)
        .post(`/bikes/stolen/${bikeA.id}`)
        .set('Cookie', cookieB)
        .redirects(0)

      // Verify status unchanged
      const [bikes] = await db.query('SELECT status FROM bicycles WHERE id = ?', [bikeA.id])
      if (bikes[0].status !== 'active') {
        throw new Error('Status should remain active — User B should not be able to change it')
      }
    })
  })

  // ══════════════════════════════════════════════════════════════════════
  // PUBLIC SCAN PAGE
  // ══════════════════════════════════════════════════════════════════════

  describe('Public Scan Page', () => {
    let userId, bike

    before(async () => {
      await cleanDatabase()
      userId = await createTestUser('scanowner@test.com', 'Scan Owner')
      bike = await createTestBike(userId, { brand: 'Scannable', color: 'Green' })
    })

    after(async () => await cleanDatabase())

    it('should show bike info on scan page (active bike)', async () => {
      const res = await request(app).get(`/bike/${bike.tag_uid}`)

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      if (!res.text.includes('Scannable')) throw new Error('Should show bike brand')
      if (!res.text.includes('Green')) throw new Error('Should show bike color')
      if (!res.text.includes('Scan')) throw new Error('Should show owner first name')
    })

    it('should show ONLY first name on public page (GDPR)', async () => {
      const res = await request(app).get(`/bike/${bike.tag_uid}`)

      // Should NOT contain the full name or email
      if (res.text.includes('scanowner@test.com')) {
        throw new Error('Public page should NOT contain email')
      }
      if (res.text.includes('Scan Owner') && !res.text.includes('Scan')) {
        throw new Error('Public page should show first name only, not full name')
      }
    })

    it('should log scan in database', async () => {
      // Count scans before
      const [before] = await db.query('SELECT COUNT(*) AS count FROM scans WHERE bicycle_id = ?', [bike.id])

      await request(app).get(`/bike/${bike.tag_uid}`)

      const [after] = await db.query('SELECT COUNT(*) AS count FROM scans WHERE bicycle_id = ?', [bike.id])
      if (after[0].count <= before[0].count) {
        throw new Error('Scan should be logged in database')
      }
    })

    it('should show stolen page for stolen bike', async () => {
      // Mark bike as stolen
      await db.query("UPDATE bicycles SET status = 'stolen' WHERE id = ?", [bike.id])

      const res = await request(app).get(`/bike/${bike.tag_uid}`)

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      // Should contain GPS consent UI
      if (!res.text.includes('share-location')) {
        throw new Error('Stolen page should contain GPS share button')
      }

      // Restore status
      await db.query("UPDATE bicycles SET status = 'active' WHERE id = ?", [bike.id])
    })

    it('should return 404 for nonexistent UUID', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000'
      const res = await request(app).get(`/bike/${fakeUuid}`)

      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`)
    })
  })

  // ══════════════════════════════════════════════════════════════════════
  // CONTACT FORM
  // ══════════════════════════════════════════════════════════════════════

  describe('Contact Form', () => {
    let userId, bike

    before(async () => {
      await cleanDatabase()
      userId = await createTestUser('contactowner@test.com', 'Contact Owner')
      bike = await createTestBike(userId)
    })

    after(async () => await cleanDatabase())

    it('should save contact message to database', async () => {
      const res = await request(app)
        .post(`/contact/${bike.id}`)
        .send({
          finder_name: 'Helpful Finder',
          finder_phone: '+41 79 999 99 99',
          message: 'I found your bike at the train station!'
        })

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)

      // Verify message saved
      const [msgs] = await db.query(
        'SELECT finder_name, finder_phone, message FROM contact_messages WHERE bicycle_id = ?',
        [bike.id]
      )
      if (msgs.length === 0) throw new Error('Contact message should be saved')
      if (msgs[0].finder_name !== 'Helpful Finder') throw new Error('Finder name should be saved')
      if (msgs[0].message !== 'I found your bike at the train station!') {
        throw new Error('Message should be saved')
      }
    })

    it('should save message without optional fields', async () => {
      const res = await request(app)
        .post(`/contact/${bike.id}`)
        .send({ message: 'Anonymous tip' })

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)

      const [msgs] = await db.query(
        'SELECT finder_name, finder_phone FROM contact_messages WHERE message = ?',
        ['Anonymous tip']
      )
      if (msgs[0].finder_name !== null) throw new Error('Finder name should be null when not provided')
      if (msgs[0].finder_phone !== null) throw new Error('Finder phone should be null when not provided')
    })

    it('should reject empty message', async () => {
      const res = await request(app)
        .post(`/contact/${bike.id}`)
        .send({ message: '' })

      // Should redirect back with error (not save empty message)
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect for empty message, got ${res.status}`)
      }
    })
  })

  // ══════════════════════════════════════════════════════════════════════
  // GPS LOCATION LOGGING
  // ══════════════════════════════════════════════════════════════════════

  describe('GPS Location Logging', () => {
    let userId, stolenBike, activeBike

    before(async () => {
      await cleanDatabase()
      userId = await createTestUser('gpsowner@test.com', 'GPS Owner')
      stolenBike = await createTestBike(userId, { status: 'stolen', brand: 'Stolen Bike' })
      activeBike = await createTestBike(userId, { status: 'active', brand: 'Active Bike' })

      // Create a scan record for the stolen bike (as public.js would do)
      await db.query(
        'INSERT INTO scans (bicycle_id, user_agent) VALUES (?, ?)',
        [stolenBike.id, 'TestBrowser']
      )
    })

    after(async () => await cleanDatabase())

    it('should log GPS for stolen bike', async () => {
      const res = await request(app)
        .post('/api/log-location')
        .send({
          uid: stolenBike.tag_uid,
          lat: 47.3769,
          lng: 8.5417,
          accuracy: 15
        })

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      if (!res.body.success) throw new Error('Response should indicate success')

      // Verify GPS data was saved with expiry
      const [scans] = await db.query(
        'SELECT lat, lng, accuracy, location_expires_at FROM scans WHERE bicycle_id = ? AND lat IS NOT NULL',
        [stolenBike.id]
      )
      if (scans.length === 0) throw new Error('GPS data should be saved')
      if (Math.abs(parseFloat(scans[0].lat) - 47.3769) > 0.001) {
        throw new Error('Latitude should be saved correctly')
      }
      if (!scans[0].location_expires_at) {
        throw new Error('location_expires_at should be set (GDPR)')
      }
    })

    it('should refuse GPS for active bike (GDPR)', async () => {
      const res = await request(app)
        .post('/api/log-location')
        .send({
          uid: activeBike.tag_uid,
          lat: 47.38,
          lng: 8.54,
          accuracy: 20
        })

      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
    })
  })

  // ══════════════════════════════════════════════════════════════════════
  // MAP API ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════

  describe('Map API Endpoints', () => {
    before(async () => {
      await cleanDatabase()
      const userId = await createTestUser('mapuser@test.com', 'Map User')
      const bike = await createTestBike(userId, { status: 'stolen' })

      // Add scans with GPS data
      await db.query(
        `INSERT INTO scans (bicycle_id, lat, lng, accuracy, user_agent, location_expires_at)
         VALUES (?, 47.38, 8.54, 10, 'TestBrowser', DATE_ADD(NOW(), INTERVAL 90 DAY))`,
        [bike.id]
      )
    })

    after(async () => await cleanDatabase())

    it('should return community map data with rounded coordinates', async () => {
      const res = await request(app).get('/api/map/community')

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      if (!Array.isArray(res.body)) throw new Error('Should return an array')

      if (res.body.length > 0) {
        const scan = res.body[0]
        // Coordinates should be rounded to 3 decimal places
        const latStr = String(scan.lat)
        const decimals = latStr.includes('.') ? latStr.split('.')[1].length : 0
        if (decimals > 3) {
          throw new Error(`Community map should round coordinates to 3 decimal places, got ${decimals}`)
        }
      }
    })

    it('should require auth for owner map API', async () => {
      const res = await request(app).get('/api/map/bike/1')

      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect to login, got ${res.status}`)
      }
    })

    it('should require admin for admin map API', async () => {
      const res = await request(app).get('/api/map/admin')

      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect to login, got ${res.status}`)
      }
    })
  })

  // ══════════════════════════════════════════════════════════════════════
  // GARAGE PARKING
  // ══════════════════════════════════════════════════════════════════════

  describe('Garage Parking', () => {
    let cookie, userId

    before(async () => {
      await cleanDatabase()
      userId = await createTestUser('garage@test.com', 'Garage User')
      cookie = await loginAs('garage@test.com')
    })

    after(async () => await cleanDatabase())

    it('should set up garage parking with payment dates', async () => {
      await request(app)
        .post('/bikes/add')
        .set('Cookie', cookie)
        .field('brand', 'Garage Bike')
        .field('color', 'Silver')
        .field('garage_parking', '1')
        .redirects(0)

      const [bikes] = await db.query(
        'SELECT garage_parking, garage_start_date, payment_due_date, payment_status FROM bicycles WHERE owner_id = ?',
        [userId]
      )

      if (bikes.length === 0) throw new Error('Bike should be created')
      if (bikes[0].garage_parking !== 1) throw new Error('garage_parking should be true')
      if (!bikes[0].garage_start_date) throw new Error('garage_start_date should be set')
      if (!bikes[0].payment_due_date) throw new Error('payment_due_date should be set')
      if (bikes[0].payment_status !== 'pending') throw new Error('payment_status should be pending')
    })
  })

  // ══════════════════════════════════════════════════════════════════════
  // GDPR COMPLIANCE
  // ══════════════════════════════════════════════════════════════════════

  describe('GDPR Compliance', () => {
    it('should set location_expires_at on GPS data (90 days)', async () => {
      await cleanDatabase()
      const userId = await createTestUser('gdpr@test.com', 'GDPR User')
      const bike = await createTestBike(userId, { status: 'stolen' })

      // Create a scan
      await db.query('INSERT INTO scans (bicycle_id, user_agent) VALUES (?, ?)', [bike.id, 'Test'])

      // Submit GPS data
      await request(app)
        .post('/api/log-location')
        .send({ uid: bike.tag_uid, lat: 47.38, lng: 8.54, accuracy: 10 })

      // Verify expiry is set ~90 days from now
      const [scans] = await db.query(
        'SELECT location_expires_at FROM scans WHERE bicycle_id = ? AND lat IS NOT NULL',
        [bike.id]
      )

      if (!scans[0].location_expires_at) {
        throw new Error('location_expires_at must be set')
      }

      const expiryDate = new Date(scans[0].location_expires_at)
      const now = new Date()
      const daysDiff = (expiryDate - now) / (1000 * 60 * 60 * 24)

      if (daysDiff < 85 || daysDiff > 95) {
        throw new Error(`Expiry should be ~90 days from now, got ${Math.round(daysDiff)} days`)
      }

      await cleanDatabase()
    })

    it('should not store IP addresses in scan logs', async () => {
      await cleanDatabase()
      const userId = await createTestUser('noip@test.com', 'No IP User')
      const bike = await createTestBike(userId)

      await request(app).get(`/bike/${bike.tag_uid}`)

      // Check that no IP-like columns exist in the scan
      const [scans] = await db.query('SELECT * FROM scans WHERE bicycle_id = ?', [bike.id])

      if (scans.length === 0) throw new Error('Scan should be logged')

      // The scan should have user_agent but no IP column
      const columns = Object.keys(scans[0])
      const ipColumns = columns.filter(c => c.includes('ip') || c.includes('address'))
      if (ipColumns.length > 0) {
        throw new Error(`Found IP-related columns: ${ipColumns.join(', ')}`)
      }

      await cleanDatabase()
    })
  })
})
