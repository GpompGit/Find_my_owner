# Synology Setup Guides — Quartier Bike ID

Step-by-step installation instructions for deploying the application on a Synology DS713+ running DSM 6.2.4.

## Guides

| # | Guide | Description |
|---|-------|-------------|
| 1 | [01-mariadb-setup.md](01-mariadb-setup.md) | Install and configure MariaDB, create database and user |
| 2 | [02-nodejs-setup.md](02-nodejs-setup.md) | Install Node.js, PM2, and deploy the application |
| 3 | [03-cloudflare-tunnel.md](03-cloudflare-tunnel.md) | Install cloudflared and expose the app publicly |
| 4 | [04-firewall-and-ports.md](04-firewall-and-ports.md) | DSM firewall rules, port configuration, and network security |
| 5 | [05-dymo-printer.md](05-dymo-printer.md) | Configure the Dymo LabelWriter on the network |
| 6 | [06-email-smtp.md](06-email-smtp.md) | Configure SMTP for email notifications |
| 7 | [07-backup-and-maintenance.md](07-backup-and-maintenance.md) | Scheduled backups, log rotation, and PM2 persistence |
| 8 | [08-auto-deploy-webhook.md](08-auto-deploy-webhook.md) | GitHub webhook for automatic deployment |
| 9 | [09-docker-setup.md](09-docker-setup.md) | **Docker setup (recommended)** — one command to start everything |

### Deployment Options

- **Option A — Direct install** (guides 01-07): Install Node.js, MariaDB, PM2 individually on the NAS
- **Option B — Docker** (guide 09): Run everything in containers with `docker-compose up -d`

Docker is recommended — simpler setup, easier updates, and portable to AWS if needed.

## Target Infrastructure

- **NAS:** Synology DS713+ · DSM 6.2.4 · 192.168.1.252 · hostname: Home_Server_3
- **Printer:** Dymo LabelWriter 450 Twin Turbo · 192.168.1.121
- **Router:** Salt router · 192.168.1.1
- **Public access:** Cloudflare Tunnel (free tier)

## Prerequisites

- Admin (root) SSH access to the DS713+ enabled via DSM > Control Panel > Terminal & SNMP
- A Cloudflare account (free tier is sufficient)
- A domain name managed by Cloudflare DNS
- SMTP credentials for sending email (e.g. Gmail app password, Mailgun, or your provider)
- The Dymo LabelWriter connected to the LAN at 192.168.1.121
