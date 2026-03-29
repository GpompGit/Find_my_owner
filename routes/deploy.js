/**
 * routes/deploy.js — GitHub Webhook Auto-Deploy
 *
 * Receives webhook POST requests from GitHub when code is pushed to main.
 * Triggers a deploy script that pulls the latest code and restarts the app.
 *
 * How the flow works:
 * 1. You edit code on your iPhone (or any device) and merge to main on GitHub
 * 2. GitHub sends a POST request to https://bikes.yourdomain.com/deploy/webhook
 * 3. This route verifies the request is really from GitHub (using a shared secret)
 * 4. If valid, it runs the deploy script (git pull + npm install + pm2 restart)
 * 5. The app restarts with the new code — automatic deployment in ~10 seconds
 *
 * Security:
 * - GitHub signs every webhook payload with HMAC-SHA256 using a shared secret
 * - We verify that signature before running any deploy commands
 * - Without the correct secret, the endpoint does nothing
 * - The secret is stored in .env (DEPLOY_WEBHOOK_SECRET), never in code
 *
 * Routes:
 *   POST /deploy/webhook — receives GitHub webhook (mounted as /deploy in app.js)
 */

const express = require('express')
const crypto = require('crypto')           // Node built-in: cryptographic functions
const { execFile } = require('child_process')  // Node built-in: run external scripts
const fs = require('fs')                   // Node built-in: file system
const path = require('path')

const router = express.Router()

/**
 * Verify GitHub webhook signature.
 *
 * GitHub sends a header 'x-hub-signature-256' with every webhook request.
 * This header contains an HMAC-SHA256 hash of the request body, computed
 * using the shared secret you configured in GitHub.
 *
 * We compute the same hash locally and compare. If they match, the request
 * is authentic — it really came from GitHub, not an attacker.
 *
 * @param {string} payload - The raw request body (as a string)
 * @param {string} signature - The x-hub-signature-256 header value
 * @param {string} secret - The shared secret from .env
 * @returns {boolean} True if the signature is valid
 */
const verifySignature = (payload, signature, secret) => {
  // If any parameter is missing, the signature is invalid
  if (!payload || !signature || !secret) {
    return false
  }

  // Compute the expected signature using HMAC-SHA256.
  // HMAC = Hash-based Message Authentication Code.
  // It combines the secret key with the message to produce a unique hash.
  // Only someone who knows the secret can produce the correct hash.
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)   // Create HMAC with our secret
    .update(payload)                 // Feed in the request body
    .digest('hex')                   // Output as hexadecimal string

  // Use timingSafeEqual to compare the signatures.
  // This prevents "timing attacks" where an attacker could guess the
  // signature one character at a time by measuring response times.
  // timingSafeEqual always takes the same amount of time regardless
  // of how many characters match.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch (err) {
    // If the buffers are different lengths, timingSafeEqual throws
    return false
  }
}

/**
 * POST /webhook — GitHub webhook endpoint
 *
 * GitHub sends this request when code is pushed or a PR is merged.
 * The request body contains details about the event (branch, commits, etc.).
 *
 * We only deploy on pushes to the 'main' branch — other branches are ignored.
 */
router.post('/webhook', express.json(), (req, res) => {
  const secret = process.env.DEPLOY_WEBHOOK_SECRET

  // ── Check that the webhook secret is configured ──
  if (!secret) {
    console.error('Deploy webhook: DEPLOY_WEBHOOK_SECRET not set in .env')
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  // ── Verify the GitHub signature ──
  // The signature is sent in the 'x-hub-signature-256' header.
  // We need the raw body as a string to verify it.
  const signature = req.headers['x-hub-signature-256']
  const payload = JSON.stringify(req.body)

  if (!verifySignature(payload, signature, secret)) {
    console.error('Deploy webhook: invalid signature — request rejected')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // ── Check the event type ──
  // GitHub sends different events (push, pull_request, issues, etc.).
  // We only care about 'push' events.
  const event = req.headers['x-github-event']
  if (event !== 'push') {
    // Not a push event — acknowledge but don't deploy
    return res.json({ message: `Event '${event}' ignored — only 'push' triggers deploy` })
  }

  // ── Check the branch ──
  // Only deploy when the push is to 'main'.
  // req.body.ref contains the full ref: "refs/heads/main"
  const branch = req.body.ref
  if (branch !== 'refs/heads/main') {
    return res.json({ message: `Push to '${branch}' ignored — only 'main' triggers deploy` })
  }

  // ── Respond immediately ──
  // We respond to GitHub right away (within their 10-second timeout),
  // then run the deploy script asynchronously in the background.
  // GitHub doesn't need to wait for the deploy to finish.
  res.json({ message: 'Deploy triggered', branch: 'main' })

  // ── Run the deploy ──
  // Two modes:
  // 1. Docker: write a trigger file → host watcher picks it up and rebuilds
  // 2. Direct: run deploy.sh directly (npm install + pm2 restart)
  //
  // In Docker, the container can't run docker-compose on the host.
  // So we write a small file to a shared volume (uploads/).
  // A watcher script on the host detects it and runs the rebuild.

  const triggerFile = path.join(__dirname, '..', 'uploads', '.deploy-trigger')
  const scriptPath = path.join(__dirname, '..', 'scripts', 'deploy.sh')

  console.log(`\n=== Auto-deploy triggered at ${new Date().toLocaleString('de-CH')} ===`)
  console.log(`  Branch: main`)
  console.log(`  Pusher: ${req.body.pusher ? req.body.pusher.name : 'unknown'}`)

  // Check if we're running inside Docker (the /.dockerenv file exists in containers)
  const isDocker = fs.existsSync('/.dockerenv')

  if (isDocker) {
    // ── Docker mode: write trigger file for host watcher ──
    console.log('  Mode: Docker — writing deploy trigger file')
    try {
      fs.writeFileSync(triggerFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        pusher: req.body.pusher ? req.body.pusher.name : 'unknown',
        commits: req.body.commits ? req.body.commits.length : 0
      }))
      console.log('  Trigger file written — host watcher will rebuild')
      console.log('=== Deploy trigger set ===\n')
    } catch (err) {
      console.error('  Failed to write trigger file:', err.message)
    }
  } else {
    // ── Direct mode: run deploy.sh ──
    console.log(`  Mode: Direct — running ${scriptPath}`)
    execFile('bash', [scriptPath], {
      cwd: path.join(__dirname, '..'),
      timeout: 60000
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('Deploy script failed:', error.message)
        if (stderr) console.error('stderr:', stderr)
        return
      }
      console.log('Deploy output:', stdout)
      console.log('=== Auto-deploy completed ===\n')
    })
  }
})

/**
 * GET /status — Simple health check for the deploy system
 *
 * Returns the current app version info. Useful for verifying
 * that a deploy actually went through.
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    node_version: process.version,
    uptime_seconds: Math.floor(process.uptime())
  })
})

module.exports = router
