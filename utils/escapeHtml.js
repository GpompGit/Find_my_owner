/**
 * utils/escapeHtml.js — HTML Entity Escaping
 *
 * Escapes special HTML characters to prevent HTML injection in email templates.
 * EJS templates handle escaping automatically with <%= %>, but when we build
 * HTML emails in JavaScript (nodemailer), we must escape user data manually.
 *
 * Characters escaped:
 *   & → &amp;    (prevents entity injection)
 *   < → &lt;     (prevents tag injection)
 *   > → &gt;     (closes tag injection)
 *   " → &quot;   (prevents attribute injection)
 *   ' → &#039;   (prevents attribute injection)
 *
 * Usage:
 *   const escapeHtml = require('../utils/escapeHtml')
 *   const safe = escapeHtml(userInput)
 *   html: `<p>${safe}</p>`
 */

const escapeHtml = (str) => {
  if (!str) return ''
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return String(str).replace(/[&<>"']/g, (char) => map[char])
}

module.exports = escapeHtml
