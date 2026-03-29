/**
 * public/js/location.js — GPS Location for Stolen Bikes (Client-Side)
 *
 * This script runs in the BROWSER (not on the server).
 * It handles the GPS consent flow on the stolen bike scan page.
 *
 * Flow:
 * 1. User scans QR code → sees the stolen bike page
 * 2. User clicks "Share my location" → browser asks for GPS permission
 * 3. If granted → coordinates sent to /api/log-location via fetch()
 * 4. If denied or skipped → that's fine, contact form still works
 *
 * GDPR compliance:
 * - Location is NEVER auto-requested (no geolocation on page load)
 * - User must actively click the button
 * - Clear explanation shown BEFORE requesting
 * - "Continue without" option always available
 * - Data auto-deletes after 90 days (server-side)
 *
 * This script uses the Geolocation API:
 * https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
 */

// Wait for the page to fully load before attaching event listeners.
// DOMContentLoaded fires when the HTML is parsed (doesn't wait for images).
document.addEventListener('DOMContentLoaded', function () {

  // ── Get references to the UI elements ──
  var shareBtn = document.getElementById('share-location')
  var skipBtn = document.getElementById('skip-location')
  var statusText = document.getElementById('location-status')
  var bikeData = document.getElementById('bike-data')

  // If any element is missing, this isn't the stolen bike page — exit silently
  if (!shareBtn || !skipBtn || !statusText || !bikeData) {
    return
  }

  // Read the bike's tag UID from the data attribute set in the EJS template.
  // This is a safe way to pass server data to client JS (no inline scripts).
  var bikeUid = bikeData.getAttribute('data-uid')

  // ── "Share my location" button ──
  shareBtn.addEventListener('click', function () {

    // Disable the button to prevent double-clicks
    shareBtn.disabled = true
    shareBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Requesting location...'

    // Check if the browser supports geolocation
    if (!navigator.geolocation) {
      statusText.textContent = 'Geolocation is not supported by your browser.'
      statusText.className = 'mt-2 mb-0 text-warning'
      shareBtn.disabled = false
      shareBtn.innerHTML = '<i class="bi bi-geo-alt"></i> Share my location'
      return
    }

    /**
     * Request the user's GPS position.
     *
     * navigator.geolocation.getCurrentPosition() triggers the browser's
     * location permission popup. The user can Allow or Block.
     *
     * Arguments:
     * 1. Success callback — called with position data if allowed
     * 2. Error callback — called if denied or failed
     * 3. Options — timeout, accuracy settings
     */
    navigator.geolocation.getCurrentPosition(

      // ── Success: user allowed GPS ──
      function (position) {
        // position.coords contains:
        // - latitude: decimal degrees (e.g. 47.3769)
        // - longitude: decimal degrees (e.g. 8.5417)
        // - accuracy: metres (e.g. 20 = accurate to 20m)

        // Send the coordinates to our server via the API endpoint
        fetch('/api/log-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: bikeUid,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          })
        })
          .then(function (response) {
            if (response.ok) {
              // Show success message
              statusText.textContent = 'Thank you — location shared with the owner.'
              statusText.className = 'mt-2 mb-0 text-success fw-bold'
            } else {
              statusText.textContent = 'Could not send location. The contact form below still works.'
              statusText.className = 'mt-2 mb-0 text-warning'
            }
          })
          .catch(function () {
            // Network error — the server might be unreachable
            statusText.textContent = 'Network error. Please use the contact form below.'
            statusText.className = 'mt-2 mb-0 text-warning'
          })

        // Hide the buttons after the action
        shareBtn.classList.add('d-none')
        skipBtn.classList.add('d-none')
      },

      // ── Error: user denied GPS or it failed ──
      function (error) {
        // error.code values:
        // 1 = PERMISSION_DENIED — user clicked "Block"
        // 2 = POSITION_UNAVAILABLE — GPS hardware failed
        // 3 = TIMEOUT — took too long to get a fix
        var message = 'Location not shared — that is perfectly fine.'
        if (error.code === 1) {
          message = 'Location permission denied — no problem. Use the contact form below.'
        }
        statusText.textContent = message
        statusText.className = 'mt-2 mb-0 text-muted'

        // Re-enable the button in case they want to try again
        shareBtn.disabled = false
        shareBtn.innerHTML = '<i class="bi bi-geo-alt"></i> Share my location'
      },

      // ── Options ──
      {
        enableHighAccuracy: true,  // Use GPS if available (more accurate than cell tower)
        timeout: 15000,            // Wait up to 15 seconds for a position
        maximumAge: 60000          // Accept a cached position up to 1 minute old
      }
    )
  })

  // ── "Continue without" button ──
  skipBtn.addEventListener('click', function () {
    // Hide the GPS consent UI and show a friendly message
    shareBtn.classList.add('d-none')
    skipBtn.classList.add('d-none')
    statusText.textContent = 'Location not shared — you can still use the contact form below.'
    statusText.className = 'mt-2 mb-0 text-muted'
  })
})
