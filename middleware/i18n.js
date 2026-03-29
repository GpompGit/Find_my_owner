/**
 * middleware/i18n.js — Internationalization (i18n) Middleware
 *
 * Handles multi-language support for the entire application.
 * Every page — including public scan pages seen by anyone —
 * is displayed in the user's preferred language.
 *
 * Language detection order (first match wins):
 * 1. Query parameter ?lang=fr → sets a cookie and redirects
 * 2. Cookie 'lang' → user previously chose a language
 * 3. Browser Accept-Language header → phone/browser setting
 * 4. Default: 'de' (German) — the neighbourhood is in Switzerland
 *
 * Supported languages: de (German), en (English), fr (French)
 *
 * How it works:
 * - This middleware runs on EVERY request (before route handlers)
 * - It determines the language and loads the correct translation file
 * - Translations are available in templates as t('key') or t.key
 * - Route handlers can also access req.lang and req.t()
 *
 * Usage in EJS templates:
 *   <%= t('nav.dashboard') %>     → "Meine Velos" (in German)
 *   <%= t('nav.dashboard') %>     → "My Bikes" (in English)
 *
 * Usage in route handlers:
 *   req.flash('error', req.t('auth.login_required'))
 */

const path = require('path')

// ─── Supported Languages ────────────────────────────────────────────────────
// Add new languages here — just create a matching JSON file in /locales/
const SUPPORTED_LANGS = ['de', 'en', 'fr']
const DEFAULT_LANG = 'de'  // German is the default for the Swiss neighbourhood

// ─── Load All Translation Files ─────────────────────────────────────────────
// We load all translations into memory at startup (not on every request).
// These are small JSON files — keeping them in memory is efficient.
const translations = {}

SUPPORTED_LANGS.forEach(lang => {
  try {
    // require() caches the file after first load — fast on subsequent access
    translations[lang] = require(path.join(__dirname, '..', 'locales', `${lang}.json`))
  } catch (err) {
    console.error(`Failed to load translation file: locales/${lang}.json —`, err.message)
    translations[lang] = {}
  }
})

/**
 * Get a nested value from an object using a dot-separated key.
 *
 * Example: getNestedValue(obj, 'nav.dashboard') → obj.nav.dashboard
 *
 * If any part of the path doesn't exist, returns the key itself
 * as a fallback (so you can see which translations are missing).
 *
 * @param {Object} obj - The translation object
 * @param {string} key - Dot-separated key like 'nav.dashboard'
 * @returns {string} The translated string or the key as fallback
 */
const getNestedValue = (obj, key) => {
  // Split 'nav.dashboard' into ['nav', 'dashboard']
  // and walk through the object one level at a time
  const value = key.split('.').reduce((current, part) => {
    return current && current[part] !== undefined ? current[part] : undefined
  }, obj)

  // If the value was found and is a string, return it.
  // Otherwise, return the key itself (makes missing translations visible).
  return typeof value === 'string' ? value : key
}

/**
 * Parse the Accept-Language header to find the best matching language.
 *
 * The Accept-Language header looks like:
 *   "fr-CH,fr;q=0.9,en;q=0.8,de;q=0.7"
 *
 * This means: prefer French (Switzerland), then French, then English, then German.
 * The q= value is a quality weight (0 to 1, higher = more preferred).
 *
 * We extract the base language codes (fr, en, de) and return the first
 * one that matches our supported languages.
 *
 * @param {string} header - The Accept-Language header value
 * @returns {string|null} The best matching language code or null
 */
const parseAcceptLanguage = (header) => {
  if (!header) return null

  // Split by comma, extract language codes, sort by quality weight
  const languages = header
    .split(',')
    .map(part => {
      // "fr-CH;q=0.9" → { lang: 'fr', quality: 0.9 }
      const [langTag, qualityStr] = part.trim().split(';')
      const lang = langTag.split('-')[0].toLowerCase()  // 'fr-CH' → 'fr'
      const quality = qualityStr
        ? parseFloat(qualityStr.split('=')[1]) || 0
        : 1  // No q= means quality 1 (highest)
      return { lang, quality }
    })
    .sort((a, b) => b.quality - a.quality)  // Highest quality first

  // Return the first language that we support
  for (const { lang } of languages) {
    if (SUPPORTED_LANGS.includes(lang)) {
      return lang
    }
  }

  return null
}

/**
 * i18n Middleware — determines language and provides translation function.
 *
 * This middleware:
 * 1. Checks for ?lang= query parameter (manual switch via dropdown)
 * 2. Checks for 'lang' cookie (previous choice)
 * 3. Parses Accept-Language header (browser/phone setting)
 * 4. Falls back to German (DEFAULT_LANG)
 * 5. Creates a t() function bound to the chosen language
 * 6. Makes t() and lang available in all templates via res.locals
 */
const i18n = (req, res, next) => {
  let lang = null

  // ── Priority 1: Query parameter ?lang=fr ──
  // Used by the language switcher dropdown in the navbar.
  // When clicked, it adds ?lang=fr to the current URL.
  // We set a cookie so the choice persists across requests.
  if (req.query.lang && SUPPORTED_LANGS.includes(req.query.lang)) {
    lang = req.query.lang

    // Set a cookie that lasts 1 year (in milliseconds).
    // httpOnly: false — this cookie is not sensitive (just a language preference)
    // and could be read by client-side JS if needed.
    res.cookie('lang', lang, {
      maxAge: 365 * 24 * 60 * 60 * 1000,  // 1 year
      httpOnly: false,
      sameSite: 'lax'
    })

    // Redirect to the same URL without the ?lang= parameter.
    // This gives a clean URL after switching language.
    const url = new URL(req.originalUrl, `http://${req.headers.host}`)
    url.searchParams.delete('lang')
    return res.redirect(url.pathname + url.search)
  }

  // ── Priority 2: Cookie ──
  // If the user previously chose a language, it's stored in a cookie.
  if (!lang && req.cookies && req.cookies.lang && SUPPORTED_LANGS.includes(req.cookies.lang)) {
    lang = req.cookies.lang
  }

  // ── Priority 3: Accept-Language header ──
  // The browser sends this header based on the user's OS/browser language settings.
  if (!lang) {
    lang = parseAcceptLanguage(req.headers['accept-language'])
  }

  // ── Priority 4: Default ──
  if (!lang) {
    lang = DEFAULT_LANG
  }

  // ── Create the translation function ──
  // t('nav.dashboard') looks up the key in the current language's translations.
  // If not found, falls back to English, then returns the key itself.
  const t = (key) => {
    // Try the selected language first
    let value = getNestedValue(translations[lang], key)
    if (value !== key) return value

    // Fall back to English if the key is missing in the selected language
    if (lang !== 'en') {
      value = getNestedValue(translations['en'] || {}, key)
      if (value !== key) return value
    }

    // Key not found in any language — return the key itself
    // This makes missing translations easy to spot in the UI
    return key
  }

  // ── Make language and translation function available everywhere ──
  // req.lang — available in route handlers
  // req.t() — available in route handlers for flash messages
  req.lang = lang
  req.t = t

  // res.locals — available in all EJS templates automatically
  res.locals.lang = lang
  res.locals.t = t
  res.locals.supportedLangs = SUPPORTED_LANGS

  next()
}

module.exports = i18n
