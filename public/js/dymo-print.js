/**
 * public/js/dymo-print.js — Dymo LabelWriter SDK Integration (Client-Side)
 *
 * This script runs in the ADMIN'S BROWSER (not on the server).
 * It communicates with the Dymo Web Service running on the admin's computer
 * to print labels directly from the browser.
 *
 * Prerequisites:
 * - Dymo Label Software installed on the admin's PC
 * - Dymo Web Service running (background service)
 * - The printer connected and powered on
 *
 * How it works:
 * 1. Admin clicks "Print with Dymo" on the /admin/print/:id page
 * 2. This script fetches bike data from /admin/bike-data/:id (JSON API)
 * 3. It builds a Dymo label XML with the QR code image
 * 4. It sends the label to the Dymo Web Service for printing
 *
 * NOTE: The Dymo JavaScript SDK must be loaded before this script.
 * If Dymo is not available, we fall back to browser printing.
 */

/**
 * Print bike labels using the Dymo SDK.
 *
 * This function is called when the admin clicks the "Print with Dymo" button.
 * It's attached to the button via onclick="printBikeLabels(bikeId)".
 *
 * @param {number} bikeId - The bike's database ID
 */
async function printBikeLabels(bikeId) {
  try {
    // ── Step 1: Fetch bike data from our API ──
    var response = await fetch('/admin/bike-data/' + bikeId)

    if (!response.ok) {
      alert('Could not load bike data. Please try again.')
      return
    }

    var bike = await response.json()

    // ── Step 2: Check if Dymo SDK is available ──
    // The Dymo SDK loads as a global 'dymo' object.
    // If it's not available, the Dymo software isn't installed.
    if (typeof dymo === 'undefined' || !dymo.label || !dymo.label.framework) {
      alert(
        'Dymo Label Software is not detected.\n\n' +
        'Please install the Dymo Label Software and ensure the ' +
        'Dymo Web Service is running.\n\n' +
        'Falling back to browser printing...'
      )
      window.print()
      return
    }

    // ── Step 3: Find the Dymo printer ──
    var printers = dymo.label.framework.getPrinters()
    var printer = printers.find(function (p) {
      return p.name.toUpperCase().indexOf('DYMO') !== -1
    })

    if (!printer) {
      alert('No Dymo printer found. Please check the connection.')
      return
    }

    // ── Step 4: Build and print the bike ID label ──
    var bikeLabelXml = buildBikeLabelXml(
      bike.qr_url, bike.brand, bike.color, bike.garage_parking
    )
    var bikeLabel = dymo.label.framework.openLabelXml(bikeLabelXml)
    bikeLabel.print(printer.name)

    // ── Step 5: Print TWINT label if garage parking ──
    if (bike.garage_parking && bike.twint_qr_url) {
      var twintLabelXml = buildTwintLabelXml(bike.twint_qr_url)
      var twintLabel = dymo.label.framework.openLabelXml(twintLabelXml)
      twintLabel.print(printer.name)
    }

    alert('Labels sent to printer: ' + printer.name)
  } catch (err) {
    console.error('Dymo print error:', err)
    alert('Print failed: ' + err.message + '\n\nTry using browser print instead.')
  }
}

/**
 * Build the Dymo label XML for a bike ID QR code.
 *
 * Dymo SDK uses XML to define label layouts.
 * This creates a simple label with a QR code image and text.
 *
 * @param {string} qrUrl - URL path to the QR code PNG
 * @param {string} brand - Bike brand
 * @param {string} color - Bike color
 * @param {boolean} garageParking - Whether the bike has garage parking
 * @returns {string} Dymo label XML
 */
function buildBikeLabelXml(qrUrl, brand, color, garageParking) {
  // This is a simplified Dymo label template.
  // In production, you would create the label in Dymo Label Software,
  // export it as XML, and use it as a template here.
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<DieCutLabel Version="8.0">' +
    '<PaperOrientation>Landscape</PaperOrientation>' +
    '<ObjectInfo>' +
      '<ImageObject>' +
        '<Name>QRCode</Name>' +
        '<Data>' + qrUrl + '</Data>' +
      '</ImageObject>' +
      '<TextObject>' +
        '<Name>BikeInfo</Name>' +
        '<Text>' + brand + ' · ' + color +
        (garageParking ? ' · Garage' : '') +
        '</Text>' +
      '</TextObject>' +
    '</ObjectInfo>' +
    '</DieCutLabel>'
}

/**
 * Build the Dymo label XML for a TWINT payment QR code.
 *
 * @param {string} twintQrUrl - URL path to the TWINT QR code PNG
 * @returns {string} Dymo label XML
 */
function buildTwintLabelXml(twintQrUrl) {
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<DieCutLabel Version="8.0">' +
    '<PaperOrientation>Landscape</PaperOrientation>' +
    '<ObjectInfo>' +
      '<ImageObject>' +
        '<Name>TwintQR</Name>' +
        '<Data>' + twintQrUrl + '</Data>' +
      '</ImageObject>' +
      '<TextObject>' +
        '<Name>PaymentInfo</Name>' +
        '<Text>Garage contribution · CHF 40.00/year · Quartier Bike ID</Text>' +
      '</TextObject>' +
    '</ObjectInfo>' +
    '</DieCutLabel>'
}
