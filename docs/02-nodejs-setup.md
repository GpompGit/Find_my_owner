# 02 — Node.js and Application Setup on Synology DS713+

## Step 1: Install Node.js from Package Center

1. Open **DSM** → **Package Center**
2. Search for **Node.js v18** (or the latest LTS available for DSM 6.2)
3. Click **Install**
4. Once installed, verify via SSH:

```bash
ssh admin@192.168.1.252
node --version
```

> **Note:** If Node.js v18 is not available in Package Center for DSM 6.2.4, you have two alternatives:
>
> **Option A — Community package:** Install from the SynoCommunity repository:
> 1. Go to Package Center → Settings → Package Sources
> 2. Add: `https://packages.synocommunity.com`
> 3. Search for Node.js again
>
> **Option B — Manual install:** Download the Linux ARM/x86 binary from https://nodejs.org and extract to `/usr/local/`:
> ```bash
> sudo -i
> cd /tmp
> wget https://nodejs.org/dist/v18.20.2/node-v18.20.2-linux-x64.tar.xz
> tar -xf node-v18.20.2-linux-x64.tar.xz
> cp -r node-v18.20.2-linux-x64/{bin,lib,include,share} /usr/local/
> node --version
> ```

## Step 2: Clone the Project

```bash
sudo -i
mkdir -p /volume1/web
cd /volume1/web
git clone <your-repo-url> quartier-bike-id
cd quartier-bike-id
```

## Step 3: Install Dependencies

```bash
cd /volume1/web/quartier-bike-id
npm install
```

This installs all packages from `package.json`: express, bcrypt, mysql2, ejs, qrcode, multer, nodemailer, etc.

## Step 4: Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in all values — see [01-mariadb-setup.md](01-mariadb-setup.md) for database credentials.

Key values to configure:

```
PORT=8080
BASE_URL=https://bikes.yourdomain.com    # Your Cloudflare Tunnel domain
DB_HOST=localhost
DB_PORT=3307
DB_USER=bikeapp
DB_PASS=your_db_password
DB_NAME=quartier_bikes
SESSION_SECRET=generate_a_random_64_char_string
ADMIN_EMAIL=guillermo@youremail.com
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 5: Create Upload Directories

```bash
mkdir -p /volume1/web/quartier-bike-id/uploads/photos
mkdir -p /volume1/web/quartier-bike-id/uploads/qr
chown -R http:http /volume1/web/quartier-bike-id/uploads
```

## Step 6: Test the Application

```bash
cd /volume1/web/quartier-bike-id
node app.js
```

Open `http://192.168.1.252:8080` in your browser. Confirm the app loads. Press `Ctrl+C` to stop.

## Step 7: Install PM2

```bash
npm install -g pm2
```

Verify:

```bash
pm2 --version
```

## Step 8: Start the App with PM2

```bash
cd /volume1/web/quartier-bike-id
pm2 start app.js --name quartier-bike-id
```

## Step 9: Start the Nightly Cleanup Job

```bash
pm2 start cleanup.js --name cleanup --cron "0 3 * * *" --no-autorestart
```

This runs the GDPR location cleanup and garage payment reminders every night at 03:00.

## Step 10: Configure PM2 to Survive Reboots

```bash
pm2 save
pm2 startup
```

PM2 will print a command — copy and run it exactly as shown. Example:

```bash
sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u root --hp /root
```

> **DSM 6.2 note:** Synology DSM 6.2 uses upstart/systemd depending on the model. If `pm2 startup` does not work, create a Triggered Task instead:
>
> 1. Go to **DSM** → **Control Panel** → **Task Scheduler**
> 2. Create → **Triggered Task** → **User-defined script**
> 3. Event: **Boot-up**
> 4. User: **root**
> 5. Script:
>    ```bash
>    /usr/local/bin/pm2 resurrect
>    ```

## Step 11: Verify PM2 Status

```bash
pm2 list
```

Expected output:

```
┌─────────────────┬────┬──────┬───────┬────────┐
│ Name            │ id │ mode │ ↺     │ status │
├─────────────────┼────┼──────┼───────┼────────┤
│ quartier-bike-id│ 0  │ fork │ 0     │ online │
│ cleanup         │ 1  │ fork │ 0     │ online │
└─────────────────┴────┴──────┴───────┴────────┘
```

## Useful PM2 Commands

| Command | Description |
|---------|-------------|
| `pm2 logs quartier-bike-id` | View app logs in real time |
| `pm2 restart quartier-bike-id` | Restart the app |
| `pm2 stop quartier-bike-id` | Stop the app |
| `pm2 monit` | Live monitoring dashboard |
| `pm2 flush` | Clear all log files |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `bcrypt` fails to install | Run `npm install --build-from-source bcrypt` — requires `gcc` and `make` (install via `opkg` or Entware) |
| `node: command not found` | Add Node.js to PATH: `export PATH=$PATH:/usr/local/bin` and add to `/etc/profile` |
| App crashes on start | Check `pm2 logs quartier-bike-id` for the error — usually a missing `.env` variable |
| PM2 not persisting after reboot | Use the Task Scheduler method described in Step 10 |
