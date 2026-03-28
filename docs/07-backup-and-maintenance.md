# 07 — Backup, Maintenance, and Monitoring

## Part A — Database Backups

### Step 1: Create a Backup Script

Create `/volume1/web/quartier-bike-id/scripts/backup-db.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/volume1/backups/quartier-bike-id"
DATE=$(date +%Y-%m-%d_%H%M)
DB_NAME="quartier_bikes"
DB_PORT=3307

mkdir -p "$BACKUP_DIR"

# Dump the database
mysqldump -u root -p"YOUR_ROOT_PASSWORD" --port "$DB_PORT" "$DB_NAME" \
  > "$BACKUP_DIR/db_${DATE}.sql"

# Compress
gzip "$BACKUP_DIR/db_${DATE}.sql"

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/db_*.sql.gz | tail -n +31 | xargs rm -f 2>/dev/null

echo "Backup completed: db_${DATE}.sql.gz"
```

Make it executable:

```bash
chmod +x /volume1/web/quartier-bike-id/scripts/backup-db.sh
```

> **Security:** Store the root password securely. Alternatively, create a `~/.my.cnf` file with credentials so the script does not need inline passwords.

### Step 2: Schedule Daily Backups

**Option A — DSM Task Scheduler:**

1. Go to **DSM** → **Control Panel** → **Task Scheduler**
2. Create → **Scheduled Task** → **User-defined script**
3. Schedule: **Daily at 02:00**
4. User: **root**
5. Script:
   ```bash
   /volume1/web/quartier-bike-id/scripts/backup-db.sh
   ```

**Option B — PM2 cron:**

```bash
pm2 start /volume1/web/quartier-bike-id/scripts/backup-db.sh \
  --name db-backup \
  --cron "0 2 * * *" \
  --no-autorestart \
  --interpreter bash
pm2 save
```

### Step 3: Backup Upload Directories

Add to the backup script or create a separate one:

```bash
#!/bin/bash

BACKUP_DIR="/volume1/backups/quartier-bike-id"
DATE=$(date +%Y-%m-%d_%H%M)
APP_DIR="/volume1/web/quartier-bike-id"

# Backup photos and QR codes
tar -czf "$BACKUP_DIR/uploads_${DATE}.tar.gz" \
  -C "$APP_DIR" uploads/photos uploads/qr

# Keep only last 14 upload backups
ls -t "$BACKUP_DIR"/uploads_*.tar.gz | tail -n +15 | xargs rm -f 2>/dev/null
```

## Part B — Synology Hyper Backup (Offsite)

For additional safety, use Synology's built-in backup tool:

1. Open **Hyper Backup** from Package Center (install if needed)
2. Create a new backup task
3. Select backup destination:
   - Another Synology NAS (DS214play at 192.168.1.4)
   - Or a cloud provider (Cloudflare R2, Backblaze B2, etc.)
4. Select folders to back up:
   - `/volume1/web/quartier-bike-id/`
   - `/volume1/backups/quartier-bike-id/`
5. Schedule: **Weekly**
6. Enable **rotation** to keep the last 4 versions

## Part C — Log Management

### PM2 Log Rotation

Install the PM2 log rotation module:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

This keeps logs manageable — max 10 MB per file, 7 rotated files, compressed.

### View Logs

```bash
# All app logs
pm2 logs quartier-bike-id

# Last 100 lines
pm2 logs quartier-bike-id --lines 100

# Tunnel logs
pm2 logs cf-tunnel

# All processes
pm2 logs
```

### Log Locations

| Log | Path |
|-----|------|
| App stdout | `~/.pm2/logs/quartier-bike-id-out.log` |
| App stderr | `~/.pm2/logs/quartier-bike-id-error.log` |
| Tunnel | `~/.pm2/logs/cf-tunnel-out.log` |
| Cleanup job | `~/.pm2/logs/cleanup-out.log` |

## Part D — Application Maintenance

### Nightly Cleanup Job (Already Configured)

The `cleanup.js` process runs via PM2 cron at 03:00 daily and handles:

1. **GDPR location cleanup** — nullifies GPS data older than 90 days
2. **Garage payment reminders** — emails users 14 days before due date

Verify it's running:

```bash
pm2 show cleanup
```

### Update the Application

```bash
cd /volume1/web/quartier-bike-id
git pull origin main
npm install              # In case dependencies changed
pm2 restart quartier-bike-id
```

### Update Node.js

When a new LTS version is available:

1. Download the new version
2. Stop the app: `pm2 stop all`
3. Install the update
4. Verify: `node --version`
5. Restart: `pm2 restart all`

### Update cloudflared

```bash
cd /usr/local/bin
pm2 stop cf-tunnel
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
chmod +x cloudflared
pm2 restart cf-tunnel
```

## Part E — Monitoring

### PM2 Monitoring Dashboard

```bash
pm2 monit
```

Shows real-time CPU, memory, and log output for all processes.

### Quick Health Check Script

Create `/volume1/web/quartier-bike-id/scripts/health-check.sh`:

```bash
#!/bin/bash

echo "=== Quartier Bike ID — Health Check ==="
echo ""

# PM2 processes
echo "--- PM2 Processes ---"
pm2 jlist | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  d.forEach(p => console.log(p.name.padEnd(20), p.pm2_env.status.padEnd(10),
    'CPU:', p.monit.cpu + '%', 'MEM:', Math.round(p.monit.memory/1024/1024) + 'MB'));
"
echo ""

# App responding
echo "--- App HTTP Check ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080)
echo "localhost:8080 → HTTP $HTTP_CODE"
echo ""

# Database
echo "--- Database Check ---"
mysql -u bikeapp -p"$DB_PASS" --port 3307 quartier_bikes \
  -e "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS bikes FROM bicycles;" 2>/dev/null \
  || echo "Database connection failed"
echo ""

# Disk usage
echo "--- Disk Usage ---"
du -sh /volume1/web/quartier-bike-id/uploads/photos/ 2>/dev/null
du -sh /volume1/web/quartier-bike-id/uploads/qr/ 2>/dev/null
du -sh /volume1/backups/quartier-bike-id/ 2>/dev/null
echo ""

echo "=== Done ==="
```

### DSM Notifications

Configure DSM to alert you on system issues:

1. **Control Panel** → **Notification** → **Email**
2. Enter SMTP settings (same as the app's SMTP config)
3. Enable notifications for:
   - Disk space warnings
   - System events (shutdowns, reboots)
   - Package updates available

## Maintenance Schedule Summary

| Task | Frequency | Method | Time |
|------|-----------|--------|------|
| GDPR location cleanup | Daily | PM2 cron (`cleanup.js`) | 03:00 |
| Garage payment reminders | Daily | PM2 cron (`cleanup.js`) | 03:00 |
| Database backup | Daily | DSM Task Scheduler | 02:00 |
| Upload files backup | Daily | DSM Task Scheduler | 02:30 |
| PM2 log rotation | Automatic | `pm2-logrotate` module | — |
| Hyper Backup (offsite) | Weekly | Synology Hyper Backup | Sunday 04:00 |
| DSM security updates | Monthly | Manual check | — |
| Node.js updates | Quarterly | Manual update | — |
| cloudflared updates | Quarterly | Manual update | — |
