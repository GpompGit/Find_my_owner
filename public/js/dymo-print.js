/**
 * public/js/dymo-print.js — Dymo LabelWriter SDK Integration (Client-Side)
 *
 * Prints QR code labels on the Dymo LabelWriter 450 Twin Turbo.
 * Uses the 30332 square labels (25 x 25 mm) for bike ID QR codes.
 *
 * Label layout (25 x 25 mm square):
 * ┌─────────────┐
 * │             │
 * │  ┌───────┐  │
 * │  │  QR   │  │
 * │  │ 20x20 │  │
 * │  └───────┘  │
 * │             │
 * └─────────────┘
 *
 * The QR code fills most of the label — no text.
 * All information is shown on the scan page when the QR is scanned.
 *
 * For garage bikes, a second label is printed with the TWINT payment QR
 * on the same 25x25mm square format.
 *
 * Prerequisites:
 * - Dymo Label Software installed on the admin's PC
 * - Dymo Web Service running (background service)
 * - 30332 square labels loaded in the printer
 */

/**
 * Print bike labels using the Dymo SDK.
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

    // ── Step 4: Build and print the bike ID label (25x25mm square) ──
    var bikeLabelXml = buildSquareQrLabel(bike.qr_url)
    var bikeLabel = dymo.label.framework.openLabelXml(bikeLabelXml)
    bikeLabel.print(printer.name)

    // ── Step 5: Print TWINT label if garage parking (same 25x25mm) ──
    if (bike.garage_parking && bike.twint_qr_url) {
      var twintLabelXml = buildSquareQrLabel(bike.twint_qr_url)
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
 * Build Dymo label XML for a 25x25mm square QR code label.
 *
 * The label contains only the QR code image, centred and filling
 * as much of the 25x25mm area as possible (~20mm QR with ~2.5mm margins).
 *
 * Dymo SDK uses XML to define label layouts. The label dimensions
 * are specified in twips (1 inch = 1440 twips):
 * - 25mm = ~0.984 inches = ~1417 twips
 *
 * @param {string} qrImageUrl - URL path to the QR code PNG image
 * @returns {string} Dymo label XML
 */
function buildSquareQrLabel(qrImageUrl) {
  // 25mm ≈ 1417 twips (1 inch = 1440 twips, 25mm = 0.984 inches)
  var labelSize = '1417'
  // QR area: ~20mm = 1134 twips, centered with ~2.5mm margins
  var qrSize = '1134'
  var margin = '142'  // (1417 - 1134) / 2 ≈ 142 twips = ~2.5mm

  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<DieCutLabel Version="8.0" Units="twips">' +
      '<PaperOrientation>Landscape</PaperOrientation>' +
      '<Id>Small30332</Id>' +
      '<PaperName>30332 1 in x 1 in</PaperName>' +
      '<DrawCommands>' +
        // Draw the QR code image, centred in the label
        '<RoundRectangle X="0" Y="0" Width="' + labelSize + '" Height="' + labelSize + '" Rx="0" Ry="0" />' +
        '<ImageObject>' +
          '<Name>QRCode</Name>' +
          '<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />' +
          '<BackColor Alpha="0" Red="255" Green="255" Blue="255" />' +
          '<LinkedObjectName></LinkedObjectName>' +
          '<Rotation>Rotation0</Rotation>' +
          '<IsMirrored>False</IsMirrored>' +
          '<IsVariable>False</IsVariable>' +
          '<ImageLocation>' + qrImageUrl + '</ImageLocation>' +
          '<ScaleMode>Uniform</ScaleMode>' +
          '<BorderWidth>0</BorderWidth>' +
          '<HorizontalAlignment>Center</HorizontalAlignment>' +
          '<VerticalAlignment>Center</VerticalAlignment>' +
        '</ImageObject>' +
      '</DrawCommands>' +
    '</DieCutLabel>'
}
