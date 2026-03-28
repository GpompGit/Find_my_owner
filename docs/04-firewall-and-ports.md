# 04 — Firewall, Ports, and Network Security

This guide covers the DSM firewall configuration, which ports must be open (and which must stay closed), and the Salt router configuration.

## Architecture Overview

```
Internet
   │
   ▼
Cloudflare Edge (HTTPS 443)
   │
   │  (encrypted tunnel — no open inbound ports)
   ▼
cloudflared on DS713+ (192.168.1.252)
   │
   │  localhost:8080
   ▼
Node.js (Express app)
   │
   │  localhost:3307
   ▼
MariaDB
```

**Key principle:** The Cloudflare Tunnel establishes an **outbound** connection from the NAS to Cloudflare. No inbound ports need to be opened on the router or NAS firewall for public access.

## Part A — DSM Firewall Configuration

### Step 1: Open the Firewall Settings

1. Open **DSM** → **Control Panel** → **Security** → **Firewall**
2. Check **Enable firewall**
3. Select the **Default** firewall profile (or create a new one called `quartier-bike-id`)
4. Click **Edit Rules**

### Step 2: Add Rules in This Order

Rules are evaluated top-to-bottom. Order matters — put ALLOW rules first, then DENY ALL last.

#### Rule 1 — Allow DSM Management (LAN only)

| Field | Value |
|-------|-------|
| Ports | Custom: **5000, 5001** |
| Protocol | TCP |
| Source IP | Specific IP: **192.168.1.0/24** |
| Action | **Allow** |

> This ensures you can always access DSM from your home network.

#### Rule 2 — Allow SSH (LAN only)

| Field | Value |
|-------|-------|
| Ports | Custom: **22** |
| Protocol | TCP |
| Source IP | Specific IP: **192.168.1.0/24** |
| Action | **Allow** |

#### Rule 3 — Allow MariaDB (Localhost only)

| Field | Value |
|-------|-------|
| Ports | Custom: **3307** |
| Protocol | TCP |
| Source IP | Specific IP: **127.0.0.1** |
| Action | **Allow** |

> MariaDB should only accept connections from the local machine. The app connects via localhost.

#### Rule 4 — Allow Node.js App (LAN only)

| Field | Value |
|-------|-------|
| Ports | Custom: **8080** |
| Protocol | TCP |
| Source IP | Specific IP: **192.168.1.0/24** |
| Action | **Allow** |

> Allows direct LAN access for testing. Public access goes through the Cloudflare Tunnel, not this port.

#### Rule 5 — Allow Outbound for Cloudflare Tunnel

The tunnel uses outbound HTTPS. Most firewalls allow all outbound by default, but if yours restricts outbound:

| Field | Value |
|-------|-------|
| Ports | Custom: **443, 7844** |
| Protocol | TCP |
| Source IP | All |
| Action | **Allow** |

> Port 7844 is used by `cloudflared` for QUIC connections. Port 443 is the HTTPS fallback.

#### Rule 6 — Allow Outbound SMTP

| Field | Value |
|-------|-------|
| Ports | Custom: **587** |
| Protocol | TCP |
| Source IP | All |
| Action | **Allow** |

> Required for sending email notifications via nodemailer. Use port 465 if your provider uses implicit TLS.

#### Rule 7 — Deny All Other Traffic

| Field | Value |
|-------|-------|
| Ports | All |
| Protocol | All |
| Source IP | All |
| Action | **Deny** |

> **This must be the last rule.** It blocks everything not explicitly allowed above.

### Step 3: Apply the Rules

1. Review the rules — they should appear in the order above
2. Click **OK** to save
3. Click **Apply** on the Firewall page

### Step 4: Verify Firewall Rules

From another machine on your LAN:

```bash
# Should work — DSM management
curl -k https://192.168.1.252:5001

# Should work — App direct access from LAN
curl http://192.168.1.252:8080

# Should be blocked — MariaDB from another machine
mysql -h 192.168.1.252 -P 3307 -u root -p
# Expected: Connection refused or timeout
```

## Part B — Salt Router Configuration

### No Port Forwarding Required

Because Cloudflare Tunnel is outbound-only, you do **NOT** need to:

- Forward port 8080 on the router
- Forward port 443 on the router
- Set up a DMZ
- Configure dynamic DNS

### Recommended Router Settings

Access the Salt router at `http://192.168.1.1`:

#### 1. Reserve a Static IP for the NAS

1. Go to **LAN** → **DHCP** (or similar)
2. Find the DS713+ by MAC address
3. Reserve IP: **192.168.1.252**

> This prevents the NAS IP from changing after a router reboot.

#### 2. Reserve a Static IP for the Dymo Printer

1. Find the Dymo LabelWriter by MAC address
2. Reserve IP: **192.168.1.121**

#### 3. Disable UPnP (Recommended)

1. Go to **NAT** or **Security** settings
2. Disable **UPnP** (Universal Plug and Play)

> UPnP can automatically open ports without your knowledge. Since we use a tunnel, no ports need to be open.

#### 4. Verify No Port Forwards Exist

1. Go to **NAT** → **Port Forwarding**
2. Ensure there are **no rules** forwarding to 192.168.1.252
3. Delete any stale rules

## Part C — Ports Summary

### Ports Used by the Application

| Port | Protocol | Service | Accessible From | Notes |
|------|----------|---------|-----------------|-------|
| 8080 | TCP | Node.js (Express) | LAN only (192.168.1.0/24) | App HTTP server |
| 3307 | TCP | MariaDB | Localhost only (127.0.0.1) | Database |
| 443 | TCP | cloudflared (outbound) | Outbound to Cloudflare | Tunnel HTTPS |
| 7844 | UDP/TCP | cloudflared (outbound) | Outbound to Cloudflare | Tunnel QUIC |
| 587 | TCP | SMTP (outbound) | Outbound to mail server | Email notifications |

### Ports Used by DSM (Management)

| Port | Protocol | Service | Accessible From |
|------|----------|---------|-----------------|
| 5000 | TCP | DSM HTTP | LAN only |
| 5001 | TCP | DSM HTTPS | LAN only |
| 22 | TCP | SSH | LAN only |

### Ports NOT Needed (Keep Closed)

| Port | Service | Reason |
|------|---------|--------|
| 80 | HTTP | Cloudflare handles HTTPS termination |
| 443 inbound | HTTPS | Tunnel is outbound — no inbound 443 needed |
| 3306 | MySQL default | Synology MariaDB uses 3307 |
| 21 | FTP | Not used — use SSH/SFTP if needed |
| 139, 445 | SMB | Only enable if needed for NAS file sharing on LAN |

## Part D — Additional Security Hardening

### 1. Enable Auto-Block in DSM

1. Go to **Control Panel** → **Security** → **Account**
2. Enable **Auto Block**
3. Set: Block after **5 failed login attempts** within **5 minutes**
4. Set: Unblock after **1 day** (or never)

### 2. Enable 2FA for DSM Admin

1. Go to **Control Panel** → **User** → select your admin user
2. Click **2-Factor Authentication** → enable

### 3. Disable Unused DSM Services

Go to **Control Panel** → **File Services** and disable:

- [ ] SMB — unless you use network shares
- [ ] AFP — unless you have older Macs
- [ ] FTP — use SFTP via SSH instead
- [ ] NFS — unless other Linux systems mount NAS shares

### 4. Enable DSM Login Notifications

1. Go to **Control Panel** → **Notification** → **Email**
2. Configure your SMTP settings
3. Go to **Control Panel** → **Security** → **Account**
4. Enable: **Send notification on login**

### 5. Keep DSM Updated

1. Go to **Control Panel** → **Update & Restore**
2. Click **Check for Updates**
3. Install any available security patches

> **Note:** DSM 6.2.4 is end-of-support. Consider upgrading to DSM 7.x if the hardware supports it, or ensure you monitor Synology security advisories.

## Verification Checklist

After completing all firewall and network configuration:

- [ ] DSM accessible from LAN at `https://192.168.1.252:5001`
- [ ] DSM NOT accessible from outside the LAN
- [ ] SSH works from LAN: `ssh admin@192.168.1.252`
- [ ] App loads from LAN: `http://192.168.1.252:8080`
- [ ] App loads publicly: `https://bikes.yourdomain.com`
- [ ] MariaDB rejects remote connections
- [ ] No port forwards exist on the router
- [ ] NAS IP is reserved (static) on the router
- [ ] Auto-block is enabled in DSM
- [ ] All unused file services are disabled
