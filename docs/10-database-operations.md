# 10 — Database Operations Reference

How to query and manage the database from the command line (SSH) or a GUI tool (DBeaver).

> **Note:** The admin web panel (`/admin`) handles most operations without needing direct database access. Use this guide only when you need to do something the web panel doesn't support, or for debugging.

## Two Database Users

| User | Password (from .env) | Permissions | When to use |
|------|---------------------|-------------|-------------|
| `root` | `DB_ROOT_PASSWORD` | Full admin — create/drop tables, manage users | Schema changes, emergencies |
| `bikeapp` | `DB_PASS` | SELECT, INSERT, UPDATE, DELETE only | Day-to-day queries, data fixes |

**Always use `bikeapp` for routine operations.** Only use `root` when you need to change the database structure.

## Connecting via SSH (Command Line)

```bash
# SSH into the NAS
ssh admin@192.168.1.252

# Connect as the app user
docker exec -it quartier-bike-id-db mysql -u bikeapp -p quartier_bikes
# Enter your DB_PASS when prompted

# Connect as root (full admin)
docker exec -it quartier-bike-id-db mysql -u root -p quartier_bikes
# Enter your DB_ROOT_PASSWORD when prompted
```

Once connected, you see the MariaDB prompt:
```
MariaDB [quartier_bikes]>
```

Type SQL commands here. End every command with `;` and press Enter.

Type `EXIT;` to disconnect.

## Connecting via DBeaver (GUI)

1. Download DBeaver from https://dbeaver.io (free, works on Mac/Windows/Linux)
2. Open DBeaver → **Database** → **New Database Connection**
3. Select **MariaDB** (or MySQL — both work)
4. Fill in:

| Field | Value |
|-------|-------|
| **Host** | `192.168.1.252` (your NAS IP) |
| **Port** | `3307` |
| **Database** | `quartier_bikes` |
| **Username** | `bikeapp` (or `root` for full access) |
| **Password** | Your `DB_PASS` (or `DB_ROOT_PASSWORD`) |

5. Click **Test Connection** — should show "Connected"
6. Click **Finish**

Now you can browse tables, run queries, and edit data visually.

## Common Queries

### View Data

```sql
-- All users
SELECT id, email, name, phone, created_at FROM users ORDER BY created_at DESC;

-- All bikes with owner info
SELECT b.id, b.brand, b.color, b.status, b.garage_parking,
       u.name AS owner, u.email
FROM bicycles b
JOIN users u ON b.owner_id = u.id
ORDER BY b.registered DESC;

-- Only stolen bikes
SELECT b.brand, b.color, u.name, u.email
FROM bicycles b
JOIN users u ON b.owner_id = u.id
WHERE b.status = 'stolen';

-- Garage payment status
SELECT b.brand, b.color, u.name, b.payment_status,
       b.payment_due_date, b.payment_amount
FROM bicycles b
JOIN users u ON b.owner_id = u.id
WHERE b.garage_parking = TRUE
ORDER BY b.payment_due_date;

-- Recent scans (last 20)
SELECT s.scanned_at, b.brand, b.color, s.lat, s.lng, s.accuracy
FROM scans s
JOIN bicycles b ON s.bicycle_id = b.id
ORDER BY s.scanned_at DESC
LIMIT 20;

-- Scans with GPS location (stolen bikes)
SELECT s.scanned_at, b.brand, b.color, s.lat, s.lng,
       s.accuracy, s.location_expires_at
FROM scans s
JOIN bicycles b ON s.bicycle_id = b.id
WHERE s.lat IS NOT NULL
ORDER BY s.scanned_at DESC;

-- Contact messages
SELECT cm.sent_at, cm.finder_name, cm.finder_phone, cm.message,
       b.brand, b.color, u.name AS owner
FROM contact_messages cm
JOIN bicycles b ON cm.bicycle_id = b.id
JOIN users u ON b.owner_id = u.id
ORDER BY cm.sent_at DESC;

-- Count everything
SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM bicycles) AS bikes,
  (SELECT COUNT(*) FROM bicycles WHERE status = 'stolen') AS stolen,
  (SELECT COUNT(*) FROM bicycles WHERE garage_parking = TRUE) AS garage,
  (SELECT COUNT(*) FROM scans) AS scans,
  (SELECT COUNT(*) FROM contact_messages) AS messages;

-- Unused magic tokens (should be cleaned up nightly)
SELECT COUNT(*) AS expired_tokens
FROM magic_tokens
WHERE used = TRUE OR expires_at < NOW();
```

### Modify Data

```sql
-- Mark a bike as stolen (by bike ID)
UPDATE bicycles SET status = 'stolen' WHERE id = 5;

-- Mark a bike as recovered
UPDATE bicycles SET status = 'active' WHERE id = 5;

-- Mark a bike as inactive
UPDATE bicycles SET status = 'inactive' WHERE id = 5;

-- Mark garage payment received (resets 365-day cycle)
UPDATE bicycles
SET payment_status = 'paid',
    payment_date = NOW(),
    payment_due_date = DATE_ADD(NOW(), INTERVAL 365 DAY),
    payment_reminder_sent = FALSE
WHERE id = 12;

-- Exempt someone from garage payment
UPDATE bicycles SET payment_status = 'exempt' WHERE id = 8;

-- Remove garage exemption (back to pending)
UPDATE bicycles SET payment_status = 'pending' WHERE id = 8;

-- Change a user's email
UPDATE users SET email = 'new.email@example.com' WHERE id = 3;
-- IMPORTANT: also update .env ADMIN_EMAIL if this is the admin

-- Change a user's name
UPDATE users SET name = 'New Name' WHERE id = 3;

-- Change a user's phone
UPDATE users SET phone = '+41 79 000 00 00' WHERE id = 3;
```

### Delete Data

```sql
-- Delete a specific contact message
DELETE FROM contact_messages WHERE id = 15;

-- Delete all messages for a specific bike
DELETE FROM contact_messages WHERE bicycle_id = 5;

-- Delete a bike (cascades to scans + messages automatically)
DELETE FROM bicycles WHERE id = 5;
-- NOTE: also manually delete the files:
--   uploads/photos/<photo_url>
--   uploads/qr/<tag_uid>.png
--   uploads/qr/twint_<tag_uid>.png (if garage)

-- Delete a user (cascades to ALL their bikes, scans, messages)
DELETE FROM users WHERE id = 3;
-- NOTE: also clean up their magic tokens:
DELETE FROM magic_tokens WHERE email = 'user@example.com';

-- Manually run GDPR cleanup (delete expired GPS data)
UPDATE scans
SET lat = NULL, lng = NULL, accuracy = NULL, location_expires_at = NULL
WHERE location_expires_at IS NOT NULL AND location_expires_at < NOW();

-- Delete expired magic tokens
DELETE FROM magic_tokens WHERE used = TRUE OR expires_at < NOW();

-- Delete all scans older than 12 months
DELETE FROM scans WHERE scanned_at < DATE_SUB(NOW(), INTERVAL 12 MONTH);
```

### Schema Information

```sql
-- List all tables
SHOW TABLES;

-- See table structure
DESCRIBE users;
DESCRIBE magic_tokens;
DESCRIBE bicycles;
DESCRIBE scans;
DESCRIBE contact_messages;

-- See indexes on a table
SHOW INDEX FROM bicycles;

-- See foreign keys
SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'quartier_bikes'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- See table sizes
SELECT table_name,
       ROUND(data_length / 1024, 2) AS data_kb,
       ROUND(index_length / 1024, 2) AS index_kb,
       table_rows
FROM information_schema.tables
WHERE table_schema = 'quartier_bikes';
```

## Backup and Restore

### Create a Backup

```bash
# From the NAS (via SSH)

# Full backup to a dated file
docker exec quartier-bike-id-db mysqldump \
  -u root -p"YOUR_ROOT_PASSWORD" quartier_bikes \
  > /volume1/backups/quartier-bikes-$(date +%Y%m%d).sql

# Backup a single table
docker exec quartier-bike-id-db mysqldump \
  -u root -p"YOUR_ROOT_PASSWORD" quartier_bikes bicycles \
  > /volume1/backups/bicycles-$(date +%Y%m%d).sql

# Compressed backup (saves disk space)
docker exec quartier-bike-id-db mysqldump \
  -u root -p"YOUR_ROOT_PASSWORD" quartier_bikes \
  | gzip > /volume1/backups/quartier-bikes-$(date +%Y%m%d).sql.gz
```

### Restore from Backup

```bash
# Restore a full backup
docker exec -i quartier-bike-id-db mysql \
  -u root -p"YOUR_ROOT_PASSWORD" quartier_bikes \
  < /volume1/backups/quartier-bikes-20260329.sql

# Restore a compressed backup
gunzip -c /volume1/backups/quartier-bikes-20260329.sql.gz \
  | docker exec -i quartier-bike-id-db mysql \
    -u root -p"YOUR_ROOT_PASSWORD" quartier_bikes
```

### Automated Daily Backup

Add this to the NAS crontab:

```bash
crontab -e
```

```
# Daily database backup at 02:00
0 2 * * * docker exec quartier-bike-id-db mysqldump -u root -p"YOUR_ROOT_PASSWORD" quartier_bikes | gzip > /volume1/backups/quartier-bikes-$(date +\%Y\%m\%d).sql.gz

# Delete backups older than 30 days
0 3 * * * find /volume1/backups -name "quartier-bikes-*.sql.gz" -mtime +30 -delete
```

## Emergency Operations

### Reset a User's Session (Force Logout)

```sql
-- If a user is stuck or their session is corrupted
-- Delete their sessions from the session store
DELETE FROM sessions WHERE data LIKE '%userId%3A3%';
-- (Replace 3 with the actual user ID)
```

### Check Database Health

```bash
# Check if MariaDB is running
docker exec quartier-bike-id-db mysqladmin -u root -p"YOUR_ROOT_PASSWORD" ping

# Check database integrity
docker exec quartier-bike-id-db mysqlcheck -u root -p"YOUR_ROOT_PASSWORD" quartier_bikes

# Show active connections
docker exec quartier-bike-id-db mysql -u root -p"YOUR_ROOT_PASSWORD" -e "SHOW PROCESSLIST;"
```

### Reset the Database (Nuclear Option)

**WARNING: This deletes ALL data.**

```bash
# Stop the app
docker-compose stop app

# Drop and recreate the database
docker exec -i quartier-bike-id-db mysql -u root -p"YOUR_ROOT_PASSWORD" <<EOF
DROP DATABASE IF EXISTS quartier_bikes;
CREATE DATABASE quartier_bikes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOF

# Re-import the schema
docker exec -i quartier-bike-id-db mysql -u root -p"YOUR_ROOT_PASSWORD" quartier_bikes \
  < db/schema.sql

# Restart the app
docker-compose start app
```
