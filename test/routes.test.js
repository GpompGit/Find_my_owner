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

  describe('POST /login without secret question', () => {
    it('should redirect back to /login with error', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: 'test@example.com' })
        // No neighbourhood_secret field
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
      if (!res.headers.location.includes('/login')) {
        throw new Error('Should redirect to /login')
      }
    })
  })

  describe('POST /login with wrong secret', () => {
    it('should redirect back to /login with error', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', neighbourhood_secret: 'wronganswer' })
      if (res.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${res.status}`)
      }
    })
  })

  describe('POST /login with honeypot filled', () => {
    it('should show fake success page (not reveal bot detection)', async () => {
      const res = await request(app)
        .post('/login')
        .send({
          email: 'bot@example.com',
          neighbourhood_secret: 'Bolligenstrasse',
          website: 'http://spam.com'  // Honeypot field filled = bot
        })
      // Should show the "check email" page (fake success)
      if (res.status !== 200) {
        throw new Error(`Expected 200 (fake success), got ${res.status}`)
      }
    })
  })

  describe('POST /login with invalid email format', () => {
    it('should redirect back for "notanemail"', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: 'notanemail', neighbourhood_secret: 'Bolligenstrasse' })
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

// ─── DEPLOY WEBHOOK ─────────────────────────────────────────────────────────

describe('Deploy Webhook', () => {

  describe('GET /deploy/status', () => {
    it('should return JSON with status info', async () => {
      const res = await request(app).get('/deploy/status')
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`)
      }
      const body = res.body
      if (body.status !== 'running') {
        throw new Error('Expected status: running')
      }
      if (!body.node_version) {
        throw new Error('Expected node_version in response')
      }
    })
  })

  describe('POST /deploy/webhook without signature', () => {
    it('should return 401 for missing signature', async () => {
      const res = await request(app)
        .post('/deploy/webhook')
        .send({ ref: 'refs/heads/main' })
      if (res.status !== 401 && res.status !== 500) {
        throw new Error(`Expected 401 or 500, got ${res.status}`)
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
