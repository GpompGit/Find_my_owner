# 09 — Docker Setup on Synology NAS

Run the entire application (Node.js + MariaDB) in Docker containers. One command to start, one command to stop. Data persists across restarts.

## Why Docker on the NAS

| Benefit | Explanation |
|---------|-------------|
| One-command setup | `docker-compose up -d` starts everything |
| No package conflicts | App runs in its own isolated environment |
| Easy updates | Rebuild and restart — no manual dependency management |
| Portable | Same setup works on NAS, AWS, any Linux server |
| Rollback | Bad update? Run the previous image version |

## Prerequisites

- Synology DS713+ or DS214play with DSM 6.2+
- Docker package installed from Package Center
- SSH access to the NAS

## Step 1: Install Docker on the NAS

1. Open **DSM** → **Package Center**
2. Search for **Docker**
3. Click **Install**
4. Once installed, the Docker app appears in the DSM main menu

> **Note:** Docker on Synology uses the same Docker engine as Linux servers. The `docker` and `docker-compose` commands work the same way via SSH.

## Step 2: Install Docker Compose

Docker Compose may not be included by default on older DSM versions. Check and install:

```bash
ssh admin@192.168.1.252
sudo -i

# Check if docker-compose is available
docker-compose --version

# If not installed, download it:
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

## Step 3: Clone the Project

```bash
cd /volume1/docker
git clone https://github.com/GpompGit/Find_my_owner.git quartier-bike-id
cd quartier-bike-id
```

## Step 4: Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Fill in your values:

```env
PORT=8080
BASE_URL=https://bikes.yourdomain.com

# Database — these are used by docker-compose to create the DB on first start
DB_HOST=db
DB_PORT=3306
DB_USER=bikeapp
DB_PASS=choose_a_strong_password
DB_NAME=quartier_bikes
DB_ROOT_PASSWORD=choose_a_strong_root_password

# Session
SESSION_SECRET=generate_with_node_e_crypto_randomBytes_32_hex

# Admin
ADMIN_EMAIL=guillermo@youremail.com

# Magic link
MAGIC_LINK_EXPIRY_MINUTES=15
NEIGHBOURHOOD_SECRET=Bolligenstrasse

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=your_app_password

# GDPR
GDPR_LOCATION_DAYS=90

# Garage
GARAGE_FEE_CHF=40.00
TWINT_PAYMENT_URL=https://payment.twint.ch/yourlink

# Deploy webhook (optional)
DEPLOY_WEBHOOK_SECRET=generate_a_random_secret
```

Generate secrets:

```bash
# Session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Webhook secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 5: Add Your Garage Photo

```bash
mkdir -p public/img
# Copy your garage photo to this location:
cp /path/to/your/garage-photo.jpg public/img/garage.jpg
```

## Step 6: Start Everything

```bash
docker-compose up -d
```

This command:
1. Builds the Node.js app image from the Dockerfile (~1 minute first time)
2. Pulls the MariaDB 10 image (~100MB download first time)
3. Creates the database and imports `schema.sql` automatically
4. Starts both containers in the background
5. The app waits for MariaDB to be healthy before accepting requests

Check if everything is running:

```bash
docker-compose ps
```

Expected output:

```
NAME                      STATUS          PORTS
quartier-bike-id          Up (healthy)    0.0.0.0:8080->8080/tcp
quartier-bike-id-db       Up (healthy)    0.0.0.0:3307->3306/tcp
```

Test the app:

```bash
curl http://localhost:8080
```

## Step 7: Set Up Cloudflare Tunnel

The Cloudflare Tunnel connects to the Docker container on port 8080 — same as before:

```bash
cloudflared tunnel run --url http://localhost:8080 quartier-bike-id
```

Or with docker-compose (add to docker-compose.yml if desired):

```bash
pm2 start cloudflared --name cf-tunnel -- tunnel run quartier-bike-id
```

## Step 8: Set Up the Cleanup Cron Job

The cleanup job (GDPR + garage reminders) runs inside the app container:

```bash
# Add a cron job on the NAS that runs cleanup.js inside the container
crontab -e
```

Add this line:

```
0 3 * * * docker exec quartier-bike-id node /app/cleanup.js >> /var/log/quartier-cleanup.log 2>&1
```

This runs the cleanup job every night at 03:00 inside the running container.

## Step 9: Auto-Start on NAS Boot

Docker on Synology auto-starts containers with `restart: unless-stopped` policy (already configured in docker-compose.yml). Verify:

1. Reboot the NAS
2. After boot, check: `docker-compose ps`
3. Both containers should be `Up (healthy)`

If Docker doesn't auto-start, add a boot task:

1. **DSM** → **Control Panel** → **Task Scheduler**
2. Create → **Triggered Task** → **User-defined script**
3. Event: **Boot-up**, User: **root**
4. Script:
   ```bash
   cd /volume1/docker/quartier-bike-id && docker-compose up -d
   ```

## Daily Operations

### View Logs

```bash
# App logs (Express server)
docker-compose logs -f app

# Database logs
docker-compose logs -f db

# Last 50 lines
docker-compose logs --tail 50 app
```

### Restart the App

```bash
# Restart app only (database keeps running)
docker-compose restart app

# Restart everything
docker-compose restart
```

### Update the App (After Git Pull)

```bash
cd /volume1/docker/quartier-bike-id
git pull origin main

# Rebuild the image and restart (database untouched)
docker-compose up -d --build app
```

### Access the Database

```bash
# Connect to MariaDB inside the container
docker exec -it quartier-bike-id-db mysql -u root -p quartier_bikes

# Run a query
docker exec quartier-bike-id-db mysql -u bikeapp -p quartier_bikes \
  -e "SELECT COUNT(*) FROM users;"
```

### Backup the Database

```bash
# Dump the database to a file on the host
docker exec quartier-bike-id-db mysqldump -u root -p"$DB_ROOT_PASSWORD" quartier_bikes \
  > /volume1/backups/quartier-bikes-$(date +%Y%m%d).sql
```

### Stop Everything

```bash
# Stop containers (data preserved in volumes)
docker-compose down

# Stop AND delete volumes (DESTROYS ALL DATA)
docker-compose down -v
```

## Data Persistence

| Data | Stored In | Survives `docker-compose down`? | Survives `down -v`? |
|------|-----------|-------------------------------|---------------------|
| Database (tables, rows) | `quartier-bike-id-db-data` volume | Yes | **NO** |
| Bike photos | `quartier-bike-id-photos` volume | Yes | **NO** |
| QR code images | `quartier-bike-id-qr` volume | Yes | **NO** |
| Garage photo | `./public/img/` on host | Yes | Yes |
| `.env` config | Host filesystem | Yes | Yes |

> **Warning:** `docker-compose down -v` deletes ALL volumes. Always back up before using it.

## Migrating to AWS (Future)

If the NAS can't handle the load, the same Docker setup works on AWS:

```
1. Push image to AWS ECR (Elastic Container Registry)
   docker tag quartier-bike-id:latest 123456.dkr.ecr.eu-central-1.amazonaws.com/quartier-bike-id
   docker push 123456.dkr.ecr.eu-central-1.amazonaws.com/quartier-bike-id

2. Run on ECS Fargate (serverless containers)
   - No server management needed
   - Scales automatically
   - ~$15/month for a small app

3. Use RDS for MariaDB
   - Managed database with automatic backups
   - ~$15/month for db.t3.micro

4. Use S3 for uploads
   - Infinite storage for photos and QR codes
   - ~$0.02/GB/month
```

Total AWS cost estimate: **~$30-40/month** (vs free on NAS).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `docker-compose: command not found` | Install docker-compose (Step 2) |
| `Error: connect ECONNREFUSED db:3306` | MariaDB not ready yet — wait 30 seconds and retry |
| Container keeps restarting | Check logs: `docker-compose logs app` |
| `permission denied` on uploads | Check volume permissions: `docker exec quartier-bike-id ls -la /app/uploads/` |
| Database not created | Check `docker-compose logs db` — look for schema import errors |
| Port 8080 already in use | Change the port in docker-compose.yml: `"8081:8080"` |
| Out of disk space | Clean old images: `docker system prune -a` |
| Can't connect from browser | Check firewall allows port 8080 from LAN |

## Docker vs Direct Install (Comparison)

| Aspect | Direct Install (docs 01-07) | Docker (this guide) |
|--------|----------------------------|---------------------|
| Setup complexity | 7 guides, ~30 steps | 1 guide, ~9 steps |
| Start command | `pm2 start app.js` | `docker-compose up -d` |
| Database setup | Manual install + configure | Auto-created on first start |
| Node.js install | Manual from Package Center | Included in container |
| Updates | `git pull && npm install && pm2 restart` | `git pull && docker-compose up -d --build` |
| Migration | Reinstall everything | Push image + `docker-compose up` |
| Isolation | Shares NAS system packages | Fully isolated container |
| Resource usage | ~50MB RAM | ~80MB RAM (extra container overhead) |
