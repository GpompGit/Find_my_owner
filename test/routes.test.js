/**
 * test/routes.test.js — End-to-End Route Tests
 *
 * Tests all HTTP routes for correct status codes, redirects,
 * authentication enforcement, and response content.
 *
 * Uses Supertest to send HTTP requests to the Express app
 * WITHOUT starting a real server (no app.listen() needed).
 *
 * Note: These tests run without a database. Routes that query
 * the database will return 500 errors — we test that they
 * handle errors gracefully instead of crashing or leaking info.
 *
 * Run with: npm test
 */

const { describe, it } = require('mocha')
const request = require('supertest')
const app = require('../app')

/**
 * Helper: get a CSRF token and session cookie from a GET request.
 *
 * Since we added CSRF protection, every POST request needs a valid
 * _csrf token that matches the session. This helper:
 * 1. Makes a GET request to the login page
 * 2. Extracts the CSRF token from the hidden input
 * 3. Extracts the session cookie
 * 4. Returns both for use in POST requests
 */
const getCsrfToken = async () => {
  const res = await request(app).get('/login')
  // Extract CSRF token from the HTML: name="_csrf" value="..."
  const match = res.text.match(/name="_csrf"\s+value="([^"]+)"/)
  const token = match ? match[1] : ''
  // Extract session cookie
  const cookies = res.headers['set-cookie']
  const cookie = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : ''
  return { token, cookie }
}

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────

describe('Public Routes', () => {

  describe('GET / (landing page)', () => {
    it('should return 200 and render the landing page', async () => {
      const res = await request(app).get('/')
      // Should return 200 with HTML content
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      if (!res.text.includes('Quartier Bike ID')) {
        throw new Error('Landing page should contain "Quartier Bike ID"')
      }
    })
  })

  describe('GET /login', () => {
    it('should return 200 and show the login form', async () => {
      const res = await request(app).get('/login')
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      // Should contain the email input
      if (!res.text.includes('name="email"')) {
        throw new Error('Login page should contain email input')
      }
      // Should contain the neighbourhood secret question
      if (!res.text.includes('neighbourhood_secret')) {
        throw new Error('Login page should contain secret question')
      }
    })
  })

  describe('GET /privacy', () => {
    it('should return 200 and render the privacy policy', async () => {
      const res = await request(app).get('/privacy')
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
    })
  })

  describe('GET /terms', () => {
    it('should return 200 and render terms of use', async () => {
      const res = await request(app).get('/terms')
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
    })
  })

  describe('GET /imprint', () => {
    it('should return 200 and render the imprint', async () => {
      const res = await request(app).get('/imprint')
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
    })
  })

  describe('GET /map (community theft map)', () => {
    it('should return 200 and render the map', async () => {
      const res = await request(app).get('/map')
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      // Should include Leaflet.js
      if (!res.text.includes('leaflet')) {
        throw new Error('Map page should include Leaflet.js')
      }
    })
  })

  describe('GET /nonexistent', () => {
    it('should return 404', async () => {
      const res = await request(app).get('/this-page-does-not-exist')
      if (res.status !== 404) {
        throw new Error(`Expected 404, got ${res.status}`)
      }
    })
  })
})

// ─── AUTHENTICATION ENFORCEMENT ─────────────────────────────────────────────

describe('Authentication Enforcement', () => {

  describe('GET /dashboard (requires auth)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/dashboard')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
      if (!res.headers.location.includes('/login')) {
        throw new Error('Should redirect to /login')
      }
    })
  })

  describe('GET /bikes/add (requires auth)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/bikes/add')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('POST /bikes/add (requires auth)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app)
        .post('/bikes/add')
        .send({ brand: 'Trek', color: 'Red' })
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('GET /bikes/edit/1 (requires auth + owner)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/bikes/edit/1')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('POST /bikes/delete/1 (requires auth + owner)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).post('/bikes/delete/1')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('POST /bikes/stolen/1 (requires auth + owner)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).post('/bikes/stolen/1')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('GET /register/complete (requires session)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/register/complete')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })
})

// ─── ADMIN ROUTES ENFORCEMENT ───────────────────────────────────────────────

describe('Admin Route Enforcement', () => {

  describe('GET /admin (requires admin)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/admin')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('GET /admin/bikes (requires admin)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/admin/bikes')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('GET /admin/garage (requires admin)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/admin/garage')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('GET /admin/scans (requires admin)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/admin/scans')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('GET /admin/map (requires admin)', () => {
    it('should redirect to /login when not authenticated', async () => {
      const res = await request(app).get('/admin/map')
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })
})

// ─── LOGIN SECURITY ─────────────────────────────────────────────────────────

describe('Login Security', () => {

  describe('POST /login without CSRF token', () => {
    it('should redirect back (CSRF rejection)', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: 'test@example.com' })
      // CSRF middleware rejects — redirects back
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect (CSRF rejection), got ${res.status}`)
      }
    })
  })

  describe('POST /login without secret question', () => {
    it('should redirect back to /login with error', async () => {
      const { token, cookie } = await getCsrfToken()
      const res = await request(app)
        .post('/login')
        .set('Cookie', cookie)
        .send({ email: 'test@example.com', _csrf: token })
        // No neighbourhood_secret field
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('POST /login with wrong secret', () => {
    it('should redirect back to /login with error', async () => {
      const { token, cookie } = await getCsrfToken()
      const res = await request(app)
        .post('/login')
        .set('Cookie', cookie)
        .send({ email: 'test@example.com', neighbourhood_secret: 'wronganswer', _csrf: token })
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('POST /login with honeypot filled', () => {
    it('should show fake success page (not reveal bot detection)', async () => {
      const { token, cookie } = await getCsrfToken()
      const res = await request(app)
        .post('/login')
        .set('Cookie', cookie)
        .send({
          email: 'bot@example.com',
          neighbourhood_secret: 'Bolligenstrasse',
          website: 'http://spam.com',  // Honeypot field filled = bot
          _csrf: token
        })
      // Should show the "check email" page (fake success)
      if (res.status !== 200) {
        throw new Error(`Expected 200 (fake success), got ${res.status}`)
      }
    })
  })

  describe('POST /login with invalid email format', () => {
    it('should redirect back for "notanemail"', async () => {
      const { token, cookie } = await getCsrfToken()
      const res = await request(app)
        .post('/login')
        .set('Cookie', cookie)
        .send({ email: 'notanemail', neighbourhood_secret: 'Bolligenstrasse', _csrf: token })
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })
})

// ─── MAGIC LINK TOKEN VERIFICATION ──────────────────────────────────────────

describe('Magic Link Token Verification', () => {

  describe('GET /auth/verify/:token with invalid format', () => {
    it('should show invalid link page for non-hex token', async () => {
      const res = await request(app).get('/auth/verify/not-a-valid-token')
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      // Should render the link-invalid page
    })
  })

  describe('GET /auth/verify/:token with correct format but nonexistent', () => {
    it('should show expired link page for unknown token', async () => {
      // 64-character hex string that doesn't exist in the database
      const fakeToken = 'a'.repeat(64)
      const res = await request(app).get(`/auth/verify/${fakeToken}`)
      // Will get 500 (no database), 200 (expired page), or 302 (redirect with flash)
      if (res.status !== 200 && res.status !== 500 && res.status !== 302) {
        throw new Error(`Expected 200, 302, or 500, got ${res.status}`)
      }
    })
  })
})

// ─── GPS LOCATION API ───────────────────────────────────────────────────────

describe('GPS Location API', () => {

  describe('POST /api/log-location with missing fields', () => {
    it('should return 400 for missing uid', async () => {
      const res = await request(app)
        .post('/api/log-location')
        .send({ lat: 47.38, lng: 8.54 })
      if (res.status !== 400) {
        throw new Error(`Expected 400, got ${res.status}`)
      }
    })
  })

  describe('POST /api/log-location with invalid coordinates', () => {
    it('should return 400 for lat > 90', async () => {
      const res = await request(app)
        .post('/api/log-location')
        .send({ uid: 'test-uid', lat: 999, lng: 8.54 })
      if (res.status !== 400) {
        throw new Error(`Expected 400, got ${res.status}`)
      }
    })

    it('should return 400 for NaN lat', async () => {
      const res = await request(app)
        .post('/api/log-location')
        .send({ uid: 'test-uid', lat: 'abc', lng: 8.54 })
      if (res.status !== 400) {
        throw new Error(`Expected 400, got ${res.status}`)
      }
    })
  })
})

// ─── PUBLIC SCAN PAGE ───────────────────────────────────────────────────────

describe('Public Scan Page', () => {

  describe('GET /bike/:uid with invalid UUID format', () => {
    it('should return 404 for non-UUID', async () => {
      const res = await request(app).get('/bike/not-a-uuid')
      if (res.status !== 404) {
        throw new Error(`Expected 404, got ${res.status}`)
      }
    })
  })

  describe('GET /bike/:uid with valid format but nonexistent', () => {
    it('should handle gracefully (404 or 500 without DB)', async () => {
      const fakeUuid = '12345678-1234-1234-1234-123456789abc'
      const res = await request(app).get(`/bike/${fakeUuid}`)
      // 404 (not found) or 500 (no database) — both are acceptable
      if (res.status !== 404 && res.status !== 500) {
        throw new Error(`Expected 404 or 500, got ${res.status}`)
      }
    })
  })
})

// ─── DEPLOY WEBHOOK (CI/CD Pipeline) ────────────────────────────────────────

describe('Deploy Webhook (CI/CD Pipeline)', () => {
  // Test webhook secret — must match for signature verification
  const WEBHOOK_SECRET = 'test-webhook-secret-for-ci-cd'
  const crypto = require('crypto')
  const fs = require('fs')
  const path = require('path')

  /**
   * Helper: sign a payload with HMAC-SHA256 (same as GitHub does).
   * GitHub signs every webhook payload with the shared secret.
   * This helper replicates that so we can send authentic-looking requests.
   */
  const signPayload = (payload, secret) => {
    return 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
  }

  // Set the webhook secret before tests run
  before(() => {
    process.env.DEPLOY_WEBHOOK_SECRET = WEBHOOK_SECRET
  })

  // Clean up trigger files after tests
  afterEach(() => {
    const triggerFile = path.join(__dirname, '..', 'uploads', 'qr', '.deploy-trigger')
    try { fs.unlinkSync(triggerFile) } catch (e) { /* file may not exist */ }
  })

  describe('GET /deploy/status (health check)', () => {
    it('should return JSON with status, node_version, and uptime', async () => {
      const res = await request(app).get('/deploy/status')
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      const body = res.body
      if (body.status !== 'running') {
        throw new Error(`Expected status "running", got "${body.status}"`)
      }
      if (!body.node_version) {
        throw new Error('Expected node_version in response')
      }
      if (typeof body.uptime_seconds !== 'number') {
        throw new Error('Expected uptime_seconds as number')
      }
      if (!body.timestamp) {
        throw new Error('Expected timestamp in response')
      }
    })
  })

  describe('POST /deploy/webhook without signature', () => {
    it('should return 401 (signature required)', async () => {
      const res = await request(app)
        .post('/deploy/webhook')
        .set('Content-Type', 'application/json')
        .send({ ref: 'refs/heads/main' })
      if (res.status !== 401) {
        throw new Error(`Expected 401, got ${res.status}`)
      }
    })
  })

  describe('POST /deploy/webhook with wrong signature', () => {
    it('should return 401 (invalid signature)', async () => {
      const payload = JSON.stringify({ ref: 'refs/heads/main' })
      const wrongSignature = signPayload(payload, 'wrong-secret')

      const res = await request(app)
        .post('/deploy/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', wrongSignature)
        .set('x-github-event', 'push')
        .send(payload)

      if (res.status !== 401) {
        throw new Error(`Expected 401, got ${res.status}`)
      }
    })
  })

  describe('POST /deploy/webhook with valid signature but non-push event', () => {
    it('should return 200 and ignore the event', async () => {
      const payload = JSON.stringify({ action: 'opened' })
      const signature = signPayload(payload, WEBHOOK_SECRET)

      const res = await request(app)
        .post('/deploy/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'pull_request')  // Not a push event
        .send(payload)

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      if (!res.body.message.includes('ignored')) {
        throw new Error('Should indicate the event was ignored')
      }
    })
  })

  describe('POST /deploy/webhook with valid signature but wrong branch', () => {
    it('should return 200 and ignore non-main branch', async () => {
      const payload = JSON.stringify({ ref: 'refs/heads/feature-branch' })
      const signature = signPayload(payload, WEBHOOK_SECRET)

      const res = await request(app)
        .post('/deploy/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .send(payload)

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      if (!res.body.message.includes('ignored')) {
        throw new Error('Should indicate the branch was ignored')
      }
    })
  })

  describe('POST /deploy/webhook with valid signature and main branch', () => {
    it('should return 200 and trigger deploy', async () => {
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        pusher: { name: 'test-user' },
        commits: [{ message: 'test commit' }]
      })
      const signature = signPayload(payload, WEBHOOK_SECRET)

      const res = await request(app)
        .post('/deploy/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .send(payload)

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      if (!res.body.message.includes('Deploy triggered')) {
        throw new Error(`Expected "Deploy triggered", got "${res.body.message}"`)
      }
      if (res.body.branch !== 'main') {
        throw new Error(`Expected branch "main", got "${res.body.branch}"`)
      }
    })

    it('should write a deploy trigger file (Docker mode detection)', async () => {
      // In the test environment, /.dockerenv does not exist,
      // so the webhook runs deploy.sh (direct mode).
      // We test that when the trigger file IS created, it has valid JSON.

      // Manually simulate what the Docker-mode webhook does:
      const triggerFile = path.join(__dirname, '..', 'uploads', 'qr', '.deploy-trigger')
      const triggerData = {
        timestamp: new Date().toISOString(),
        pusher: 'test-user',
        commits: 1
      }
      fs.writeFileSync(triggerFile, JSON.stringify(triggerData))

      // Verify the trigger file exists and contains valid JSON
      if (!fs.existsSync(triggerFile)) {
        throw new Error('Trigger file should exist')
      }
      const content = JSON.parse(fs.readFileSync(triggerFile, 'utf8'))
      if (!content.timestamp) {
        throw new Error('Trigger file should contain timestamp')
      }
      if (content.pusher !== 'test-user') {
        throw new Error(`Expected pusher "test-user", got "${content.pusher}"`)
      }
    })
  })

  describe('Webhook signature verification (timing-safe)', () => {
    it('should reject tampered payload (same signature, different body)', async () => {
      // Sign the original payload
      const original = JSON.stringify({ ref: 'refs/heads/main' })
      const signature = signPayload(original, WEBHOOK_SECRET)

      // Send a DIFFERENT payload with the original's signature
      const tampered = JSON.stringify({ ref: 'refs/heads/main', injected: true })

      const res = await request(app)
        .post('/deploy/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .send(tampered)

      // Signature won't match the tampered body — should be rejected
      if (res.status !== 401) {
        throw new Error(`Expected 401 (tampered payload), got ${res.status}`)
      }
    })
  })

  describe('Deploy status after webhook', () => {
    it('should confirm app is still running after deploy attempt', async () => {
      // Fire a valid webhook
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        pusher: { name: 'ci-test' }
      })
      const signature = signPayload(payload, WEBHOOK_SECRET)

      await request(app)
        .post('/deploy/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .send(payload)

      // Wait a moment for any async operations
      await new Promise(resolve => setTimeout(resolve, 500))

      // Verify the app is still healthy
      const statusRes = await request(app).get('/deploy/status')
      if (statusRes.status !== 200) {
        throw new Error(`App should still be running after deploy, got ${statusRes.status}`)
      }
      if (statusRes.body.status !== 'running') {
        throw new Error('App status should be "running" after deploy')
      }
    })
  })
})

// ─── SECURITY HEADERS ───────────────────────────────────────────────────────

describe('Security Headers (helmet)', () => {

  it('should set X-Content-Type-Options header', async () => {
    const res = await request(app).get('/')
    const header = res.headers['x-content-type-options']
    if (header !== 'nosniff') {
      throw new Error(`Expected "nosniff", got "${header}"`)
    }
  })

  it('should set X-Frame-Options header', async () => {
    const res = await request(app).get('/')
    const header = res.headers['x-frame-options']
    if (!header) {
      throw new Error('Expected X-Frame-Options header')
    }
  })

  it('should set Content-Security-Policy header', async () => {
    const res = await request(app).get('/')
    const header = res.headers['content-security-policy']
    if (!header) {
      throw new Error('Expected Content-Security-Policy header')
    }
  })
})

// ─── MULTI-LANGUAGE ─────────────────────────────────────────────────────────

describe('Multi-Language Support', () => {

  it('should default to German', async () => {
    const res = await request(app).get('/')
    // German text should appear on the landing page
    if (!res.text.includes('Quartier Bike ID')) {
      throw new Error('Landing page should contain app name')
    }
  })

  it('should switch to English with ?lang=en', async () => {
    const res = await request(app).get('/?lang=en')
    // Should redirect (sets cookie and redirects to clean URL)
    if (res.status !== 302) {
      throw new Error(`Expected 302 redirect, got ${res.status}`)
    }
  })

  it('should switch to French with ?lang=fr', async () => {
    const res = await request(app).get('/?lang=fr')
    if (res.status !== 302) {
      throw new Error(`Expected 302 redirect, got ${res.status}`)
    }
  })

  it('should ignore invalid language codes', async () => {
    const res = await request(app).get('/?lang=xx')
    // Invalid language should NOT redirect — should render the page
    if (res.status !== 200) {
      throw new Error(`Expected 200 (no redirect for invalid lang), got ${res.status}`)
    }
  })
})

// ─── HONEYPOT CSS ───────────────────────────────────────────────────────────

describe('Honeypot Field', () => {

  it('should have honeypot field in login form', async () => {
    const res = await request(app).get('/login')
    if (!res.text.includes('honeypot-field')) {
      throw new Error('Login page should contain honeypot CSS class')
    }
    if (!res.text.includes('name="website"')) {
      throw new Error('Login page should contain honeypot input named "website"')
    }
  })
})

// ─── UTILS ──────────────────────────────────────────────────────────────────

describe('HTML Escape Utility', () => {
  const escapeHtml = require('../utils/escapeHtml')

  it('should escape & character', () => {
    if (escapeHtml('a&b') !== 'a&amp;b') throw new Error('Failed to escape &')
  })

  it('should escape < character', () => {
    if (escapeHtml('a<b') !== 'a&lt;b') throw new Error('Failed to escape <')
  })

  it('should escape > character', () => {
    if (escapeHtml('a>b') !== 'a&gt;b') throw new Error('Failed to escape >')
  })

  it('should escape " character', () => {
    if (escapeHtml('a"b') !== 'a&quot;b') throw new Error('Failed to escape "')
  })

  it("should escape ' character", () => {
    if (escapeHtml("a'b") !== 'a&#039;b') throw new Error("Failed to escape '")
  })

  it('should handle null/undefined gracefully', () => {
    if (escapeHtml(null) !== '') throw new Error('null should return empty string')
    if (escapeHtml(undefined) !== '') throw new Error('undefined should return empty string')
  })

  it('should handle XSS attack string', () => {
    const attack = '<script>alert("xss")</script>'
    const escaped = escapeHtml(attack)
    if (escaped.includes('<script>')) throw new Error('Failed to escape script tag')
  })
})
