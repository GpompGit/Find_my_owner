# 03 — Cloudflare Tunnel Setup

Cloudflare Tunnel exposes the local app (port 8080) to the internet over HTTPS without opening any router ports. Your home IP address is never revealed.

## Prerequisites

- A Cloudflare account (free tier)
- A domain added to Cloudflare (DNS managed by Cloudflare)
- SSH access to the DS713+

## Step 1: Install cloudflared on the Synology

SSH into the NAS:

```bash
ssh admin@192.168.1.252
sudo -i
```

Download the `cloudflared` binary:

```bash
cd /usr/local/bin

# For x86_64 (DS713+ uses Intel Atom):
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
chmod +x cloudflared

cloudflared --version
```

> **Note:** If DS713+ is ARM-based, use `cloudflared-linux-arm64` instead. Check your CPU architecture with `uname -m`.

## Step 2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a URL in the output. Copy and paste it into your browser, then:

1. Log in to your Cloudflare account
2. Select the domain you want to use (e.g. `yourdomain.com`)
3. Click **Authorize**
4. A certificate is saved to `~/.cloudflared/cert.pem`

## Step 3: Create the Tunnel

```bash
cloudflared tunnel create quartier-bike-id
```

Output will show a **Tunnel ID** (UUID). Note it down. A credentials file is saved to:

```
~/.cloudflared/<TUNNEL_ID>.json
```

## Step 4: Configure the Tunnel

Create the config file:

```bash
mkdir -p /etc/cloudflared
nano /etc/cloudflared/config.yml
```

Contents:

```yaml
tunnel: quartier-bike-id
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: bikes.yourdomain.com
    service: http://localhost:8080
  - service: http_status:404
```

> Replace `<TUNNEL_ID>` with the actual UUID from Step 3 and `bikes.yourdomain.com` with your chosen subdomain.

## Step 5: Create the DNS Route

```bash
cloudflared tunnel route dns quartier-bike-id bikes.yourdomain.com
```

This creates a CNAME record in Cloudflare DNS pointing `bikes.yourdomain.com` to your tunnel.

Verify in **Cloudflare Dashboard** → **DNS** → you should see:

```
CNAME  bikes  →  <TUNNEL_ID>.cfargotunnel.com  (proxied)
```

## Step 6: Test the Tunnel Manually

```bash
cloudflared tunnel run quartier-bike-id
```

Open `https://bikes.yourdomain.com` in your browser. The app should load. Press `Ctrl+C` to stop.

## Step 7: Run the Tunnel with PM2

```bash
pm2 start cloudflared --name cf-tunnel -- tunnel run quartier-bike-id
pm2 save
```

Verify:

```bash
pm2 list
```

You should see `cf-tunnel` with status `online`.

## Step 8: Verify End-to-End

1. From a phone on mobile data (not your home Wi-Fi), open `https://bikes.yourdomain.com`
2. The app should load over HTTPS
3. Check the certificate — it should be issued by Cloudflare

## Cloudflare Dashboard Settings

After the tunnel is working, configure these in the Cloudflare dashboard:

### SSL/TLS (Cloudflare Dashboard → SSL/TLS)

| Setting | Value | Reason |
|---------|-------|--------|
| SSL mode | **Full** | Cloudflare ↔ tunnel is already encrypted |
| Always Use HTTPS | **On** | Redirect all HTTP to HTTPS |
| Minimum TLS Version | **1.2** | Drop outdated clients |

### Security (Cloudflare Dashboard → Security → Settings)

| Setting | Value | Reason |
|---------|-------|--------|
| Security Level | **Medium** | Basic bot protection |
| Challenge Passage | **30 minutes** | Reasonable for real users |
| Browser Integrity Check | **On** | Block basic bots |

### Caching (Cloudflare Dashboard → Caching)

| Setting | Value | Reason |
|---------|-------|--------|
| Caching Level | **Standard** | Cache static assets |
| Browser Cache TTL | **4 hours** | For CSS/JS/images |

> **Do NOT cache** HTML pages — the app serves dynamic content per user.

## Tunnel Maintenance

| Command | Description |
|---------|-------------|
| `pm2 logs cf-tunnel` | View tunnel connection logs |
| `pm2 restart cf-tunnel` | Restart the tunnel |
| `cloudflared tunnel list` | List all tunnels on this account |
| `cloudflared tunnel info quartier-bike-id` | Show tunnel details and connections |
| `cloudflared tunnel cleanup quartier-bike-id` | Remove stale connections |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `502 Bad Gateway` | The app is not running on port 8080 — check `pm2 list` |
| `DNS resolution error` | Wait 1–2 minutes for DNS propagation, then retry |
| `cloudflared: command not found` | Ensure `/usr/local/bin` is in your PATH |
| Tunnel disconnects frequently | Check NAS internet connectivity; PM2 will auto-restart |
| `failed to sufficiently increase receive buffer size` | Safe to ignore — does not affect functionality |
