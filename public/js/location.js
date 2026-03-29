/**
 * public/js/location.js — GPS Location for Stolen Bikes (Client-Side)
 *
 * This script runs in the BROWSER (not on the server).
 * It handles the GPS consent flow on the stolen bike scan page.
 *
 * Multi-language support:
 * All user-facing strings are passed from the server via data attributes
 * on the #bike-data element. The server renders these in the user's
 * detected language (DE/EN/FR), so this script doesn't need to know
 * which language is active — it just reads the pre-translated strings.
 */

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

  // ── Read data from the server-rendered data attributes ──
  var bikeUid = bikeData.getAttribute('data-uid')

  // Translated status messages — rendered by the server in the correct language
  var msgShared = bikeData.getAttribute('data-msg-shared')
  var msgDenied = bikeData.getAttribute('data-msg-denied')
  var msgSkipped = bikeData.getAttribute('data-msg-skipped')
  var msgError = bikeData.getAttribute('data-msg-error')
  var msgNetwork = bikeData.getAttribute('data-msg-network')
  var msgUnsupported = bikeData.getAttribute('data-msg-unsupported')
  var msgRequesting = bikeData.getAttribute('data-msg-requesting')

  // ── "Share my location" button ──
  shareBtn.addEventListener('click', function () {
    shareBtn.disabled = true
    shareBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> ' + msgRequesting

    if (!navigator.geolocation) {
      statusText.textContent = msgUnsupported
      statusText.className = 'mt-2 mb-0 text-warning'
      shareBtn.disabled = false
      shareBtn.innerHTML = '<i class="bi bi-geo-alt"></i> ' + bikeData.getAttribute('data-msg-requesting')
      return
    }

    navigator.geolocation.getCurrentPosition(
      // Success — user allowed GPS
      function (position) {
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
              statusText.textContent = msgShared
              statusText.className = 'mt-2 mb-0 text-success fw-bold'
            } else {
              statusText.textContent = msgError
              statusText.className = 'mt-2 mb-0 text-warning'
            }
          })
          .catch(function () {
            statusText.textContent = msgNetwork
            statusText.className = 'mt-2 mb-0 text-warning'
          })

        shareBtn.classList.add('d-none')
        skipBtn.classList.add('d-none')
      },

      // Error — user denied GPS or it failed
      function (error) {
        var message = msgSkipped
        if (error.code === 1) {
          message = msgDenied
        }
        statusText.textContent = message
        statusText.className = 'mt-2 mb-0 text-muted'
        shareBtn.disabled = false
        shareBtn.innerHTML = '<i class="bi bi-geo-alt"></i> ' + msgRequesting
      },

      // Options
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    )
  })

  // ── "Continue without" button ──
  skipBtn.addEventListener('click', function () {
    shareBtn.classList.add('d-none')
    skipBtn.classList.add('d-none')
    statusText.textContent = msgSkipped
    statusText.className = 'mt-2 mb-0 text-muted'
  })
})
