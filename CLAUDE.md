# Quartier Bike ID — Project Brief

## Overview

A community bicycle registration and identification system running entirely on a self-hosted Synology NAS. Neighbours register an account with email and password, then register as many bicycles as they want under their account. Each bicycle gets a unique QR code label printed on a Dymo LabelWriter. Anyone who finds the bicycle scans the QR with any smartphone camera — no app required — and sees the owner info plus a contact form. The system also manages a voluntary garage parking contribution of CHF 40/year per bike, collected via TWINT QR code.

-----

## Goals

- Neighbours self-register with email + password — each user sees only their own bicycles
- Each user can add unlimited bicycles with Edit / Delete / Report Stolen per bike
- Generate a unique QR code per bicycle automatically at registration
- Print QR labels on a Dymo LabelWriter 450 Twin Turbo from admin panel
- Serve a public scan page (photo + owner first name + contact form) accessible to anyone worldwide via Cloudflare Tunnel
- Log GPS coordinates when a **stolen** bike is scanned — with explicit user permission and clear reason displayed
- Auto-delete location data after 90 days (GDPR compliance)
- Manage garage parking registration: CHF 40/year per bike, paid via TWINT QR code
- Print a TWINT payment QR label alongside the bike ID label for garage users
- Notify admin (Guillermo) by email on new registrations, contact form submissions, and stolen bike scans with location

-----

## Infrastructure

|Component        |Details                                                                  |
|-----------------|-------------------------------------------------------------------------|
|**Lab NAS**      |Synology DS713+ · DSM 6.2.4 · 192.168.1.252 · hostname: Home_Server_3    |
|**Primary NAS**  |Synology DS214play · DSM 7.1.1 · 192.168.1.4 · hostname: Home_Server2    |
|**Label printer**|Dymo LabelWriter 450 Twin Turbo · 192.168.1.121 · connected to home LAN  |
|**Router**       |Salt router · 192.168.1.1                                                |
|**Public access**|Cloudflare Tunnel (free tier) — no port forwarding, home IP never exposed|
|**Domain**       |To be configured via Cloudflare                                          |

The application runs on **DS713+** (lab NAS). DS713+ supports Docker and Node.js packages via DSM Package Center.

-----

## Tech Stack

|Layer          |Technology                       |Reason                                  |
|---------------|---------------------------------|----------------------------------------|
|Runtime        |Node.js (LTS)                    |Available as Synology package, async I/O|
|Web framework  |Express.js                       |Lightweight, well documented            |
|Database       |MariaDB                          |Synology native package, relational     |
|Auth           |bcrypt + express-session         |Industry standard password hashing      |
|QR generation  |`qrcode` npm package             |SVG + PNG output, print-ready           |
|Photo handling |`multer`                         |Multipart form uploads                  |
|Email          |`nodemailer`                     |Admin + user notifications              |
|Templates      |EJS                              |Simple server-side HTML rendering       |
|Label printing |Dymo JavaScript SDK              |Direct browser-to-printer               |
|Tunnel         |Cloudflare Tunnel (`cloudflared`)|Public HTTPS, hides home IP             |
|Process manager|PM2                              |Keep Node.js running after NAS reboot   |

-----

## Application Structure

```
quartier-bike-id/
├── app.js
├── package.json
├── .env
├── routes/
│   ├── auth.js             # /register, /login, /logout
│   ├── dashboard.js        # /dashboard — user's own bikes
│   ├── bikes.js            # /bikes/add, /edit/:id, /delete/:id, /stolen/:id
│   ├── public.js           # /bike/:uid — public scan page
│   ├── contact.js          # /contact/:id — finder contact form
│   ├── location.js         # /api/log-location — stolen bike GPS endpoint
│   └── admin.js            # /admin/* — password protected
├── middleware/
│   ├── requireAuth.js      # Redirect to login if no session
│   ├── requireOwner.js     # Validate bike belongs to logged-in user
│   └── requireAdmin.js     # Admin-only routes
├── views/
│   ├── auth/
│   │   ├── register.ejs
│   │   └── login.ejs
│   ├── dashboard.ejs       # User's bike list
│   ├── bikes/
│   │   ├── add.ejs
│   │   └── edit.ejs
│   ├── public/
│   │   ├── bike.ejs            # Public scan page — active bike
│   │   ├── bike-stolen.ejs     # Stolen bike scan page (requests GPS)
│   │   └── contact-sent.ejs
│   ├── admin/
│   │   ├── dashboard.ejs
│   │   ├── print.ejs           # Print-ready QR label page
│   │   ├── bike-list.ejs
│   │   ├── garage.ejs          # Garage users + payment status
│   │   └── scans.ejs
│   └── partials/
│       ├── header.ejs
│       └── footer.ejs
├── public/
│   ├── css/style.css
│   └── js/
│       ├── dymo-print.js       # Dymo SDK integration
│       └── location.js         # GPS request for stolen bikes
├── uploads/
│   ├── photos/                 # Bike photos (UUID filenames)
│   └── qr/                     # Generated QR PNG files
└── db/
    ├── schema.sql
    └── connection.js
```

-----

## Database Schema

```sql
-- Users (neighbours)
CREATE TABLE users (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  email          VARCHAR(150) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(100) NOT NULL,
  phone          VARCHAR(30),
  verified       BOOLEAN DEFAULT FALSE,
  created_at     DATETIME DEFAULT NOW()
);

-- Bicycles (many per user)
CREATE TABLE bicycles (
  id                   INT PRIMARY KEY AUTO_INCREMENT,
  owner_id             INT NOT NULL REFERENCES users(id),
  tag_uid              VARCHAR(50) UNIQUE NOT NULL,
  brand                VARCHAR(100),
  color                VARCHAR(50),
  description          VARCHAR(300),
  photo_url            VARCHAR(200),
  status               ENUM('active','stolen','inactive') DEFAULT 'active',
  garage_parking       BOOLEAN DEFAULT FALSE,
  garage_start_date    DATETIME NULL,         -- date garage parking was registered
  payment_status       ENUM('pending','paid','exempt') DEFAULT 'pending',
  payment_date         DATETIME NULL,         -- date last payment was received
  payment_due_date     DATETIME NULL,         -- garage_start_date + 365 days, updated on each payment
  payment_reminder_sent BOOLEAN DEFAULT FALSE, -- avoid duplicate reminder emails
  payment_amount       DECIMAL(6,2) DEFAULT 40.00,
  registered           DATETIME DEFAULT NOW()
);

-- Scan log
CREATE TABLE scans (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  bicycle_id          INT NOT NULL REFERENCES bicycles(id),
  scanned_at          DATETIME DEFAULT NOW(),
  lat                 DECIMAL(10, 8) NULL,
  lng                 DECIMAL(11, 8) NULL,
  accuracy            FLOAT NULL,
  city                VARCHAR(100) NULL,
  user_agent          VARCHAR(300),
  location_expires_at DATETIME NULL
);

-- Contact messages from finders
CREATE TABLE contact_messages (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  bicycle_id   INT NOT NULL REFERENCES bicycles(id),
  finder_name  VARCHAR(100),
  finder_phone VARCHAR(30),
  message      TEXT,
  sent_at      DATETIME DEFAULT NOW()
);
```

-----

## Authentication & Security

### Password hashing (bcrypt)

```javascript
const bcrypt = require('bcrypt')

// Registration
const hash = await bcrypt.hash(plainPassword, 12)
await db.query(
  'INSERT INTO users (email, password_hash, name, phone) VALUES (?,?,?,?)',
  [email, hash, name, phone]
)

// Login
const match = await bcrypt.compare(plainPassword, storedHash)
if (match) req.session.userId = user.id
```

### Ownership validation — applied to every bike route

```javascript
// middleware/requireOwner.js
const bike = await db.query(
  'SELECT * FROM bicycles WHERE id = ? AND owner_id = ?',
  [req.params.id, req.session.userId]
)
if (!bike) return res.status(403).send('Not your bicycle')
next()
```

### Session config

```javascript
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
  }
}))
```

-----

## Routes

|Route                      |Access      |Description                          |
|---------------------------|------------|-------------------------------------|
|`GET /`                    |Public      |Landing page                         |
|`GET /register`            |Public      |Create account form                  |
|`POST /register`           |Public      |Save user + send verification email  |
|`GET /login`               |Public      |Login form                           |
|`POST /login`              |Public      |Authenticate + create session        |
|`GET /logout`              |Auth        |Destroy session                      |
|`GET /dashboard`           |Auth        |User's own bikes list                |
|`GET /bikes/add`           |Auth        |Add new bike form                    |
|`POST /bikes/add`          |Auth        |Save bike + generate QR              |
|`GET /bikes/edit/:id`      |Auth + owner|Edit bike form                       |
|`POST /bikes/edit/:id`     |Auth + owner|Save changes                         |
|`POST /bikes/delete/:id`   |Auth + owner|Delete bike                          |
|`POST /bikes/stolen/:id`   |Auth + owner|Mark as stolen                       |
|`POST /bikes/recovered/:id`|Auth + owner|Mark as recovered                    |
|`GET /bike/:uid`           |Public      |Scan page                            |
|`POST /api/log-location`   |Public      |GPS coordinates from stolen bike scan|
|`POST /contact/:id`        |Public      |Finder contact form                  |
|`GET /admin`               |Admin       |Dashboard                            |
|`GET /admin/bikes`         |Admin       |All registered bikes                 |
|`GET /admin/print/:id`     |Admin       |Print-ready labels                   |
|`GET /admin/garage`        |Admin       |Garage users + payment status        |
|`POST /admin/payment/:id`  |Admin       |Mark payment received                |
|`GET /admin/scans`         |Admin       |Full scan history                    |

-----

## GPS Location — Stolen Bikes Only

Location is **never requested** for active bikes. Only triggered when status = stolen.

### Server side

```javascript
app.get('/bike/:uid', async (req, res) => {
  const bike = await getBikeByUid(req.params.uid)
  await logScan(bike.id, req)

  if (bike.status === 'stolen') {
    return res.render('public/bike-stolen', { bike })
  }
  res.render('public/bike', { bike })
})
```

### Client side — explicit consent with clear reason

```javascript
// location.js
navigator.geolocation.getCurrentPosition(
  async (pos) => {
    await fetch('/api/log-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: bikeUid,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      })
    })
    document.getElementById('location-status').textContent =
      'Thank you — location shared with owner.'
  },
  () => {
    document.getElementById('location-status').textContent =
      'Location not shared — that is fine.'
  }
)
```

### Message shown to finder

```
⚠️ This bicycle has been reported stolen

We would like to share your current location
with the owner to help recover this bike.

Your location will only be used for this purpose
and automatically deleted after 90 days.

[ Share my location ]   [ Continue without ]
```

### GDPR auto-delete — runs nightly via PM2 cron

```javascript
// cleanup.js
await db.query(`
  UPDATE scans
  SET lat = NULL, lng = NULL, accuracy = NULL, location_expires_at = NULL
  WHERE location_expires_at IS NOT NULL
  AND location_expires_at < NOW()
`)
```

-----

## Garage Payment — Annual Reminder

### When garage parking is registered

```javascript
const now = new Date()
const dueDate = new Date(now)
dueDate.setDate(dueDate.getDate() + 365)

await db.query(`
  UPDATE bicycles
  SET garage_start_date = ?,
      payment_due_date = ?,
      payment_status = 'pending'
  WHERE id = ?`,
  [now, dueDate, bikeId]
)
```

### When admin marks payment received — reset cycle

```javascript
const nextDue = new Date()
nextDue.setDate(nextDue.getDate() + 365)

await db.query(`
  UPDATE bicycles
  SET payment_status = 'paid',
      payment_date = NOW(),
      payment_due_date = ?,
      payment_reminder_sent = FALSE
  WHERE id = ?`,
  [nextDue, bikeId]
)
await sendPaymentConfirmation(bike)
```

### Nightly reminder cron — runs alongside GDPR cleanup

```javascript
// Added to cleanup.js
const sendGarageReminders = async () => {
  const dueSoon = await db.query(`
    SELECT b.*, u.email, u.name
    FROM bicycles b
    JOIN users u ON b.owner_id = u.id
    WHERE b.garage_parking = TRUE
    AND b.payment_status != 'exempt'
    AND b.payment_due_date <= DATE_ADD(NOW(), INTERVAL 14 DAY)
    AND b.payment_reminder_sent = FALSE
  `)

  for (const bike of dueSoon) {
    await sendPaymentReminder(bike)
    await db.query(
      'UPDATE bicycles SET payment_reminder_sent = TRUE WHERE id = ?',
      [bike.id]
    )
  }
}
```

### Reminder email to user

```javascript
const sendPaymentReminder = async (bike) => {
  const dueDate = new Date(bike.payment_due_date).toLocaleDateString('de-CH')
  const garageStart = new Date(bike.garage_start_date).toLocaleDateString('de-CH')

  await transporter.sendMail({
    to: bike.email,
    subject: `Garage contribution due — ${bike.brand} ${bike.color}`,
    html: `
      <h2>Annual Garage Contribution Reminder</h2>
      <p>Dear ${bike.name},</p>
      <p>
        Your annual garage parking contribution of
        <strong>CHF 40.00</strong> is due on <strong>${dueDate}</strong>
        for your <strong>${bike.color} ${bike.brand}</strong>.
      </p>
      <p>Garage parking registered since: ${garageStart}</p>
      <p>
        Please pay via TWINT using the QR code on your bike sticker,
        or contact the building admin.
      </p>
      <hr>
      <small>
        Quartier Bike ID · To unsubscribe from garage parking,
        log in and update your bike settings.
      </small>
    `
  })
}
```

### Admin garage panel

```
Garage Users (12 bikes)              CHF 480 / year expected

Name          Bike           Registered    Due          Status
Jan Mueller   Trek 520       01.01.2026    01.01.2027   Paid ✓
Anna Meier    Giant Escape   15.03.2026    15.03.2027   Pending    [Mark paid]
Peter Koch    Scott Scale    20.03.2026    03.04.2026   OVERDUE    [Mark paid]
```

-----

## Garage Parking + TWINT Payment

### On bike registration form

```html
<fieldset>
  <legend>Garage Parking</legend>
  <label>
    <input type="checkbox" name="garage_parking" value="1">
    This bicycle parks in the building garage
  </label>
  <div id="garage-info" style="display:none">
    <p>
      Annual garage contribution: <strong>CHF 40.00 per bicycle</strong>.
      Payment is voluntary via TWINT.
      You will receive a TWINT payment QR code with your bike sticker.
    </p>
  </div>
</fieldset>
```

### Admin print — two labels for garage bikes

**Label 1 — Bike ID QR**

```
┌─────────────────────┐
│  [QR CODE]          │
│  Trek · Red         │
│  🅿️ Garage         │
└─────────────────────┘
```

**Label 2 — TWINT Payment QR**

```
┌─────────────────────┐
│  [TWINT QR CODE]    │
│  Garage contribution│
│  CHF 40.00 / year  │
│  Quartier Bike ID   │
└─────────────────────┘
```

### TWINT QR generation

```javascript
const twintUrl = `${process.env.TWINT_PAYMENT_URL}?amount=40.00&message=Garage+${bike.tag_uid}`

await QRCode.toFile(
  `./uploads/qr/twint_${bike.tag_uid}.png`,
  twintUrl,
  { width: 300 }
)
```

### Admin garage panel

Shows all garage users with payment status. Admin manually marks payment received after TWINT notification.

-----

## QR Code Generation

```javascript
const QRCode = require('qrcode')
const { v4: uuidv4 } = require('uuid')

const registerBike = async (ownerId, bikeData, photoFile) => {
  const tagUid = uuidv4()
  const url = `${process.env.BASE_URL}/bike/${tagUid}`

  await QRCode.toFile(`./uploads/qr/${tagUid}.png`, url, { width: 400 })

  await db.query(
    `INSERT INTO bicycles
     (owner_id, tag_uid, brand, color, description, photo_url, garage_parking)
     VALUES (?,?,?,?,?,?,?)`,
    [ownerId, tagUid, bikeData.brand, bikeData.color,
     bikeData.description, photoFile.filename, bikeData.garage_parking]
  )

  if (bikeData.garage_parking) {
    const twintUrl = `${process.env.TWINT_PAYMENT_URL}?amount=40.00&message=Garage+${tagUid}`
    await QRCode.toFile(`./uploads/qr/twint_${tagUid}.png`, twintUrl, { width: 300 })
  }

  await notifyAdmin(tagUid, bikeData)
  return tagUid
}
```

-----

## Dymo Label Printing

```javascript
// dymo-print.js — runs in admin browser
const printBikeLabels = async (bikeId) => {
  const res = await fetch(`/admin/bike-data/${bikeId}`)
  const bike = await res.json()

  const printers = dymo.label.framework.getPrinters()
  const printer = printers.find(p => p.name.includes('DYMO'))

  const bikeLabel = dymo.label.framework.openLabelXml(
    buildBikeLabelXml(bike.qr_url, bike.brand, bike.color, bike.garage_parking)
  )
  bikeLabel.print(printer.name)

  if (bike.garage_parking) {
    const twintLabel = dymo.label.framework.openLabelXml(
      buildTwintLabelXml(bike.twint_qr_url)
    )
    twintLabel.print(printer.name)
  }
}
```

-----

## Email Notifications

|Event                          |Recipient|Content                        |
|-------------------------------|---------|-------------------------------|
|New registration               |Admin    |Name, bike details, garage flag|
|Stolen bike scanned with GPS   |Owner    |Time + Google Maps link        |
|Stolen bike scanned without GPS|Owner    |Time + device info             |
|Contact form submitted         |Owner    |Finder message + optional phone|
|Payment marked as received     |User     |Receipt confirmation           |

### Stolen bike GPS alert

```javascript
const sendStolenAlert = async (bike, scan) => {
  const mapsUrl = scan.lat
    ? `https://maps.google.com/?q=${scan.lat},${scan.lng}`
    : null

  await transporter.sendMail({
    to: bike.owner_email,
    subject: `⚠️ Your stolen ${bike.brand} was just scanned`,
    html: `
      <h2>Your stolen bicycle was scanned</h2>
      <p><strong>Time:</strong> ${scan.scanned_at}</p>
      <p><strong>Bike:</strong> ${bike.color} ${bike.brand}</p>
      ${mapsUrl
        ? `<p><a href="${mapsUrl}">View on Google Maps</a>
           (accuracy: ~${Math.round(scan.accuracy)}m)</p>`
        : `<p>Location was not shared by the finder.</p>`
      }
      <p>Contact your local police with this information.</p>
    `
  })
}
```

-----

## Cloudflare Tunnel Setup

```bash
cloudflared tunnel create quartier-bike-id
cloudflared tunnel route dns quartier-bike-id bikes.yourdomain.com
cloudflared tunnel run --url http://localhost:8080 quartier-bike-id

pm2 start "cloudflared tunnel run quartier-bike-id" --name cf-tunnel
pm2 save
```

-----

## Privacy Policy — Key Points

- All data stored on private NAS in Switzerland — never shared with third parties
- Contact details never shown publicly — only first name on scan page
- GPS location collected only for stolen bikes, only with explicit consent
- Location data automatically deleted after **90 days**
- Users can request full account and data deletion at any time
- TWINT payment QR is static — no payment data stored in the system
- Scan logs retained for 12 months then purged

-----

## Environment Variables (.env)

```
PORT=8080
BASE_URL=https://bikes.yourdomain.com
DB_HOST=localhost
DB_USER=bikeapp
DB_PASS=yourdbpassword
DB_NAME=quartier_bikes
SESSION_SECRET=yourSessionSecret
ADMIN_EMAIL=guillermo@youremail.com
ADMIN_PASSWORD_HASH=bcrypt_hashed_admin_password
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=youremail@domain.com
SMTP_PASS=youremailpassword
UPLOAD_PATH=/volume1/web/bikes
GDPR_LOCATION_DAYS=90
GARAGE_FEE_CHF=40.00
TWINT_PAYMENT_URL=https://payment.twint.ch/yourlink
```

-----

## npm Packages

```bash
npm install express
npm install express-session
npm install bcrypt
npm install connect-flash
npm install qrcode
npm install uuid
npm install multer
npm install nodemailer
npm install mysql2
npm install ejs
npm install dotenv
npm install node-cron
```

-----

## Setup Checklist

- [ ] Install Node.js on DS713+ via Package Center
- [ ] Install MariaDB on DS713+ via Package Center
- [ ] Create database and run schema.sql
- [ ] Clone project to `/volume1/web/quartier-bike-id`
- [ ] Run `npm install`
- [ ] Configure `.env`
- [ ] Install PM2: `npm install -g pm2`
- [ ] Start app: `pm2 start app.js --name quartier-bike-id`
- [ ] Schedule nightly cleanup: `pm2 start cleanup.js --cron "0 3 * * *"`
- [ ] Save PM2: `pm2 save && pm2 startup`
- [ ] Install `cloudflared` on DS713+
- [ ] Create Cloudflare Tunnel → localhost:8080
- [ ] Configure domain DNS in Cloudflare
- [ ] Configure TWINT static QR with CHF 40 amount
- [ ] Test full registration flow end to end
- [ ] Test Dymo print — bike label + TWINT label
- [ ] Test QR scan on iPhone and Android
- [ ] Test stolen bike GPS permission prompt
- [ ] Test GDPR cleanup script
- [ ] Test all email notifications

-----

## Hardware Reference

- **Dymo LabelWriter 450 Twin Turbo** — 54×70mm labels for QR codes or 36×89mm address labels
- **NFC tags (optional addition)** — NTAG213 anti-metal ferrite tags for metal frames (~€2 each)
- **QR stickers outdoor** — weatherproof vinyl + laminate

-----

## Future Extensions

- Multi-language: German + French for Swiss neighbourhood
- Stolen bike map — admin view of all scan locations
- Annual payment reminder emails (auto-sent each January)
- NFC tag support alongside QR — same URL, dual technology sticker
- Extend to other objects: scooters, strollers, shared tools
- Lost pets module — same architecture, different category

-----

*Project owner: Guillermo · Lab NAS: DS713+ (192.168.1.252) · Printer: Dymo (192.168.1.121)*
*Home network infrastructure context lives in a separate Claude project.*
