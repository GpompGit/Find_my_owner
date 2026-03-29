# 08 — Auto-Deploy via GitHub Webhook

Deploy automatically when code is merged to `main` on GitHub. Edit on your iPhone, merge the PR, and the website updates in ~10 seconds.

## How It Works

```
You edit code (iPhone/PC) → Push/merge to main on GitHub
                                    ↓
                           GitHub sends POST request
                                    ↓
                           Cloudflare Tunnel (HTTPS)
                                    ↓
                           NAS receives webhook at /deploy/webhook
                                    ↓
                           Verify GitHub signature (HMAC-SHA256)
                                    ↓
                           Run scripts/deploy.sh
                                    ↓
                           git pull → npm install → pm2 restart
                                    ↓
                           Website updated! (~10 seconds)
```

## Step 1: Generate a Webhook Secret

On the NAS (or any machine), generate a random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output — you'll need it in two places.

## Step 2: Add the Secret to .env

SSH into the NAS:

```bash
ssh admin@192.168.1.252
sudo -i
cd /volume1/web/quartier-bike-id
nano .env
```

Add this line (paste your generated secret):

```
DEPLOY_WEBHOOK_SECRET=paste_your_64_character_hex_string_here
```

Restart the app to pick up the new variable:

```bash
pm2 restart quartier-bike-id
```

## Step 3: Configure the GitHub Webhook

1. Go to your repository on GitHub: `github.com/GpompGit/Find_my_owner`
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Fill in:

| Field | Value |
|-------|-------|
| **Payload URL** | `https://bikes.yourdomain.com/deploy/webhook` |
| **Content type** | `application/json` |
| **Secret** | Paste the same secret from Step 1 |
| **SSL verification** | Enable |
| **Events** | Select: "Just the push event" |
| **Active** | Check |

4. Click **Add webhook**

## Step 4: Test the Webhook

### Test from GitHub

1. Go to **Settings** → **Webhooks** → click your webhook
2. Scroll down to **Recent Deliveries**
3. Click **Redeliver** on the ping event
4. Check the response — you should see `{"message": "Event 'ping' ignored..."}`

### Test with a real deploy

1. Make a small change to any file (e.g., add a comment)
2. Commit and push to `main`
3. Check the app logs on the NAS:

```bash
pm2 logs quartier-bike-id --lines 30
```

You should see:

```
=== Auto-deploy triggered at 29.03.2026, 14:35:22 ===
  Branch: main
  Pusher: GpompGit
  Running: /volume1/web/quartier-bike-id/scripts/deploy.sh
Deploy output: Starting deploy...
Step 1: Pulling latest code...
Step 2: Installing dependencies...
Step 3: Restarting application...
Deploy completed successfully!
=== Auto-deploy completed ===
```

### Check deploy status

Visit `https://bikes.yourdomain.com/deploy/status` in your browser to see:

```json
{
  "status": "running",
  "timestamp": "2026-03-29T14:35:25.000Z",
  "node_version": "v18.20.2",
  "uptime_seconds": 3
}
```

The `uptime_seconds` resets to a low number after each deploy (app was just restarted).

## Step 5: Verify the Deploy Script Permissions

The deploy script must be executable:

```bash
chmod +x /volume1/web/quartier-bike-id/scripts/deploy.sh
```

Also verify git can pull without prompting for credentials:

```bash
cd /volume1/web/quartier-bike-id
git pull origin main
```

If it asks for a password, configure SSH keys or a personal access token:

```bash
git remote set-url origin https://<TOKEN>@github.com/GpompGit/Find_my_owner.git
```

## Security

| Measure | Details |
|---------|---------|
| **Shared secret** | GitHub signs every payload with HMAC-SHA256. We verify the signature before running any command. |
| **Timing-safe comparison** | Uses `crypto.timingSafeEqual()` to prevent timing attacks on the signature. |
| **Branch filter** | Only deploys on pushes to `main`. Other branches are ignored. |
| **No shell execution** | Uses `execFile()` instead of `exec()` — no shell injection risk. |
| **Cloudflare Tunnel** | Webhook arrives over HTTPS. No ports opened on the router. |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Webhook returns 401 | Secret mismatch — ensure the same secret is in both `.env` and GitHub webhook settings |
| Webhook returns 500 | `DEPLOY_WEBHOOK_SECRET` not set in `.env` — add it and restart PM2 |
| Deploy triggered but nothing happens | Check `pm2 logs quartier-bike-id` for the deploy script output |
| `git pull` fails | Ensure git credentials are configured (SSH key or token in remote URL) |
| `pm2 restart` fails | Verify PM2 process name is `quartier-bike-id`: run `pm2 list` |
| GitHub shows delivery failure | Verify the Payload URL is correct and the Cloudflare Tunnel is running |
| Changes not visible after deploy | Hard-refresh the browser (Ctrl+Shift+R) to clear cached CSS/JS |

## Editing from Your iPhone

### Option 1: GitHub Mobile App

1. Install the **GitHub** app from the App Store
2. Navigate to your repository
3. Browse to any file and tap the pencil icon to edit
4. Commit directly to `main` (for small changes) or create a branch + PR

### Option 2: github.com in Safari

1. Open `github.com/GpompGit/Find_my_owner` in Safari
2. Navigate to the file you want to edit
3. Tap the pencil icon
4. Edit, commit, and merge

### Option 3: Claude Code on the web

1. Use Claude Code at `claude.ai/code` to make changes
2. Claude commits and pushes to a branch
3. Merge the PR on GitHub
4. Webhook auto-deploys

All three methods end with a push to `main` → webhook → auto-deploy.
