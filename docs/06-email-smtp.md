# 06 — Email / SMTP Configuration

The application sends email notifications for several events using `nodemailer`. This guide covers configuring SMTP for reliable delivery.

## Events That Send Email

| Event | Recipient | Priority |
|-------|-----------|----------|
| New user registration | Admin (Guillermo) | Normal |
| New bike registered | Admin | Normal |
| Stolen bike scanned (with GPS) | Bike owner + Admin | High |
| Stolen bike scanned (without GPS) | Bike owner + Admin | High |
| Contact form submitted by finder | Bike owner | Normal |
| Garage payment marked received | Bike owner | Normal |
| Garage payment reminder (14 days before due) | Bike owner | Normal |

## Step 1: Choose an SMTP Provider

### Option A — Gmail (Simplest for personal use)

1. Go to your Google Account → **Security** → **2-Step Verification** (enable if not already)
2. Go to **App passwords** → generate a new app password for "Mail"
3. Copy the 16-character password

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
```

> **Limit:** 500 emails/day. Sufficient for a neighbourhood app.

### Option B — Infomaniak (Swiss provider)

If you have a Swiss hosting account:

```env
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=587
SMTP_USER=your.email@yourdomain.com
SMTP_PASS=your_email_password
```

### Option C — Mailgun / SendGrid (Transactional email)

For higher reliability and delivery tracking:

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASS=your_mailgun_api_key
```

## Step 2: Update .env

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=your_app_password
ADMIN_EMAIL=guillermo@youremail.com
```

## Step 3: Test Email Delivery

Create a quick test script:

```bash
cd /volume1/web/quartier-bike-id
node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
t.sendMail({
  from: process.env.SMTP_USER,
  to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
  subject: 'Quartier Bike ID — Test Email',
  text: 'If you see this, SMTP is working correctly.'
}).then(() => console.log('Email sent successfully'))
  .catch(e => console.error('SMTP Error:', e.message));
"
```

> **Note:** Load `.env` first with `require('dotenv').config()` if variables are not exported in your shell.

## Step 4: Verify Outbound Port 587

If the email test fails with a connection timeout, the DSM firewall may be blocking outbound port 587.

Check the firewall rule from [04-firewall-and-ports.md](04-firewall-and-ports.md) — Rule 6 must allow outbound TCP 587.

Test from SSH:

```bash
# Quick connectivity test
nc -zv smtp.gmail.com 587
```

Expected: `Connection to smtp.gmail.com 587 port [tcp/submission] succeeded!`

## Step 5: Configure the From Address

In the app's email configuration, set a friendly sender name:

```javascript
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

// Use this as the "from" in all emails:
const FROM_ADDRESS = `"Quartier Bike ID" <${process.env.SMTP_USER}>`
```

## Email Delivery Tips

### Avoid Spam Filters

- Use a consistent "From" address
- Include a plain-text version alongside HTML
- Do not use ALL CAPS in subjects
- Keep HTML simple — avoid heavy images or complex layouts
- If using a custom domain, set up SPF, DKIM, and DMARC records in Cloudflare DNS

### SPF Record (Cloudflare DNS)

If sending from `@yourdomain.com`, add a TXT record:

```
Type: TXT
Name: @
Value: v=spf1 include:_spf.google.com ~all
```

(Adjust `include:` for your SMTP provider)

### Rate Limiting

The app sends emails for specific events only. Expected volume for a small neighbourhood:

| Scenario | Emails/day |
|----------|-----------|
| Normal usage (registrations, contacts) | 1–5 |
| Stolen bike scans | 0–10 |
| Garage reminders (annual, batched) | 0–20 |

Gmail's 500/day limit is more than sufficient.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` on port 587 | Firewall blocking outbound — add Rule 6 from firewall guide |
| `Invalid login` (Gmail) | Use an App Password, not your regular password. Ensure 2FA is enabled |
| `Self-signed certificate` error | Add `tls: { rejectUnauthorized: false }` to transporter (only for trusted internal SMTP) |
| Emails going to spam | Set up SPF/DKIM records for your domain |
| `ETIMEDOUT` | Check DNS resolution: `nslookup smtp.gmail.com` from the NAS |
