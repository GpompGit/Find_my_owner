# GDPR and Privacy Rules

## Location Data

- GPS coordinates are ONLY collected for bicycles with `status = 'stolen'`
- NEVER request or store location for active or inactive bikes
- Every location record MUST set `location_expires_at` to `NOW() + 90 days` at insertion
- The nightly cleanup job nullifies `lat`, `lng`, `accuracy` where `location_expires_at < NOW()`

## Public Pages

- The public scan page (`/bike/:uid`) shows ONLY the owner's first name — never full name, email, or phone
- Never expose `owner_id`, internal `id`, or database identifiers in public-facing URLs or HTML
- Use `tag_uid` (UUID) for all public-facing bike identification

## Consent

- The stolen bike scan page must display a clear explanation before requesting GPS permission
- The user must actively click to share location — never auto-request on page load
- Provide a "Continue without sharing" option — location sharing is voluntary
- Display confirmation after sharing: what was shared, how long it's retained, purpose

## Data Minimization

- Do not store data that isn't needed for the application's purpose
- Scan logs store `user_agent` for device identification only — no IP addresses
- Contact form messages store `finder_name` and `finder_phone` only — both optional

## User Rights

- Users can delete their account and all associated data
- Deleting a user account must cascade: delete all their bikes, QR codes, scan logs, and contact messages
- Users can edit or delete individual bikes at any time

## Logging

- Never log personally identifiable information (PII) to application logs
- Never log email addresses, phone numbers, names, or GPS coordinates to console
- Error logs may include user IDs (numeric) but not personal details
