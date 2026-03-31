/**
 * public/js/dymo-print.js — Dymo LabelWriter Print via Web Service REST API
 *
 * Prints QR code labels on the Dymo LabelWriter 450 Twin Turbo.
 * Uses the Dymo Web Service REST API (https://127.0.0.1:41951).
 * No SDK required — communicates directly via fetch().
 *
 * Prerequisites:
 * - Dymo Label Software installed on the admin's PC
 * - Dymo Web Service running (background service, port 41951)
 * - 30332 square labels loaded in the printer
 */

var DYMO_BASE = 'https://127.0.0.1:41951/DYMO/DLS/Printing'

/**
 * Print a single QR label via Dymo Web Service REST API.
 *
 * @param {string} printerName - Dymo printer name
 * @param {string} imageDataBase64 - Base64-encoded PNG image data
 */
async function printLabel(printerName, imageDataBase64) {
  // Build label XML with embedded base64 image
  var labelXml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<DieCutLabel Version="8.0" Units="twips">' +
      '<PaperOrientation>Landscape</PaperOrientation>' +
      '<Id>Small30332</Id>' +
      '<PaperName>30332 1 in x 1 in</PaperName>' +
      '<DrawCommands>' +
        '<RoundRectangle X="0" Y="0" Width="1440" Height="1440" Rx="0" Ry="0" />' +
      '</DrawCommands>' +
      '<ObjectInfo>' +
        '<ImageObject>' +
          '<Name>QRCode</Name>' +
          '<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />' +
          '<BackColor Alpha="0" Red="255" Green="255" Blue="255" />' +
          '<LinkedObjectName></LinkedObjectName>' +
          '<Rotation>Rotation0</Rotation>' +
          '<IsMirrored>False</IsMirrored>' +
          '<IsVariable>False</IsVariable>' +
          '<Image>' + imageDataBase64 + '</Image>' +
          '<ScaleMode>Uniform</ScaleMode>' +
          '<BorderWidth>0</BorderWidth>' +
          '<BorderColor Alpha="255" Red="0" Green="0" Blue="0" />' +
          '<HorizontalAlignment>Center</HorizontalAlignment>' +
          '<VerticalAlignment>Center</VerticalAlignment>' +
        '</ImageObject>' +
        '<Bounds X="100" Y="100" Width="1240" Height="1240" />' +
      '</ObjectInfo>' +
    '</DieCutLabel>'

  // Build print request XML
  var printXml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<LabelWriterPrintParams>' +
      '<Copies>1</Copies>' +
      '<PrintQuality>BarcodeAndGraphics</PrintQuality>' +
    '</LabelWriterPrintParams>'

  var formData = 'printerName=' + encodeURIComponent(printerName) +
    '&labelXml=' + encodeURIComponent(labelXml) +
    '&printParamsXml=' + encodeURIComponent(printXml) +
    '&labelSetXml='

  var response = await fetch(DYMO_BASE + '/PrintLabel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData
  })

  if (!response.ok) {
    var errText = await response.text()
    throw new Error('Print failed: ' + errText)
  }
}

/**
 * Fetch an image URL and return its base64 content.
 */
async function imageToBase64(url) {
  var response = await fetch(url)
  var blob = await response.blob()
  return new Promise(function (resolve, reject) {
    var reader = new FileReader()
    reader.onloadend = function () {
      // Remove the data:image/png;base64, prefix
      var base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Print the bike ID QR label.
 *
 * @param {number} bikeId - The bike's database ID
 */
async function printBikeLabel(bikeId) {
  try {
    var response = await fetch('/admin/bike-data/' + bikeId)
    if (!response.ok) {
      alert('Could not load bike data.')
      return
    }
    var bike = await response.json()

    // Get printer name
    var printersResponse = await fetch(DYMO_BASE + '/GetPrinters')
    var printersXml = await printersResponse.text()
    var match = printersXml.match(/<Name>(.*?)<\/Name>/)
    if (!match) {
      alert('No Dymo printer found. Is the Dymo Web Service running?')
      return
    }
    var printerName = match[1]

    // Convert QR image to base64
    var qrBase64 = await imageToBase64(bike.qr_url)

    await printLabel(printerName, qrBase64)
    alert('Bike QR label sent to: ' + printerName)
  } catch (err) {
    console.error('Dymo print error:', err)
    alert('Print failed: ' + err.message)
  }
}

/**
 * Print the TWINT payment QR label (garage bikes only).
 *
 * @param {number} bikeId - The bike's database ID
 */
async function printTwintLabel(bikeId) {
  try {
    var response = await fetch('/admin/bike-data/' + bikeId)
    if (!response.ok) {
      alert('Could not load bike data.')
      return
    }
    var bike = await response.json()

    if (!bike.twint_qr_url) {
      alert('No TWINT QR code for this bike.')
      return
    }

    // Get printer name
    var printersResponse = await fetch(DYMO_BASE + '/GetPrinters')
    var printersXml = await printersResponse.text()
    var match = printersXml.match(/<Name>(.*?)<\/Name>/)
    if (!match) {
      alert('No Dymo printer found.')
      return
    }
    var printerName = match[1]

    var twintBase64 = await imageToBase64(bike.twint_qr_url)

    await printLabel(printerName, twintBase64)
    alert('TWINT label sent to: ' + printerName)
  } catch (err) {
    console.error('Dymo print error:', err)
    alert('Print failed: ' + err.message)
  }
}

/**
 * Print both labels (legacy function for backwards compatibility).
 */
async function printBikeLabels(bikeId) {
  await printBikeLabel(bikeId)
}
