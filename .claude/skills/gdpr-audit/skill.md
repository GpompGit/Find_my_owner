# GDPR Audit Skill

Triggered when scan, location, or user data handling code is modified.

## Trigger Files

- `routes/location.js`
- `routes/public.js`
- `routes/contact.js`
- `cleanup.js`
- `views/public/bike.ejs`
- `views/public/bike-stolen.ejs`

## Audit Steps

1. **Location collection scope** — Verify GPS is ONLY requested when `bike.status === 'stolen'`. The public scan page for active bikes must never trigger geolocation. Check both server-side (route logic) and client-side (`location.js`).

2. **Consent flow** — The stolen bike page must:
   - Display a clear explanation of why location is requested
   - Explain how long data is retained (90 days)
   - Offer explicit opt-in (button click, not auto-request)
   - Provide a "Continue without" option
   - Show confirmation after sharing

3. **Expiry enforcement** — Every `INSERT INTO scans` with GPS data must set `location_expires_at = DATE_ADD(NOW(), INTERVAL 90 DAY)`. Search for all scan insertions and verify.

4. **Cleanup job** — Verify `cleanup.js` correctly nullifies `lat`, `lng`, `accuracy`, and `location_expires_at` where expired. Confirm it runs on schedule (PM2 cron `0 3 * * *`).

5. **Data minimization on public pages** — The `/bike/:uid` page must show only the owner's first name. Search the template and route for any leakage of: full name, email, phone, address, user ID.

6. **Contact messages** — Verify finder name and phone are optional (not required fields). Verify contact messages are associated with the bike, not the finder's identity.

7. **User deletion** — If account deletion is implemented, verify it cascades: user -> bicycles -> scans -> contact_messages -> uploaded photos -> QR files.

## Output

Report each item as COMPLIANT or NON-COMPLIANT with specific file/line references and remediation steps.
