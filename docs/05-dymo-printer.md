# 05 — Dymo LabelWriter 450 Twin Turbo Setup

The Dymo LabelWriter 450 Twin Turbo is connected to the home LAN at **192.168.1.121**. Label printing is triggered from the admin panel in the browser using the Dymo JavaScript SDK.

## Architecture

```
Admin browser (any PC on LAN)
   │
   │  Dymo JS SDK (browser plugin)
   │
   ▼
Dymo LabelWriter 450 Twin Turbo (192.168.1.121)
   │
   │  Prints:
   │  - Bike ID QR label
   │  - TWINT payment QR label (garage bikes)
```

> **Important:** The Dymo SDK runs in the **browser**, not on the NAS. The admin's computer (the one with the browser open) must have the Dymo software installed.

## Step 1: Connect the Printer to the Network

The Dymo LabelWriter 450 Twin Turbo is a USB printer. To make it network-accessible:

### Option A — USB connected to a PC that shares it

1. Connect the Dymo via USB to a PC on the LAN
2. Share the printer via Windows/macOS sharing
3. The Dymo SDK on other browsers will discover it via the local Dymo Web Service

### Option B — USB connected to the Synology NAS (print server)

1. Connect the Dymo via USB to the DS713+
2. Go to **DSM** → **Control Panel** → **External Devices** → **Printer**
3. The Dymo should appear — enable it
4. Go to **Control Panel** → **External Devices** → **Printer** → **Set as Network Printer**

### Option C — USB print server (dedicated)

1. Connect a USB print server device to the Dymo
2. Configure it with IP **192.168.1.121**
3. Reserve this IP in the Salt router DHCP settings

## Step 2: Install Dymo Software on the Admin PC

The computer used to access the admin panel must have:

1. **Dymo Label Software** — download from Dymo support site
   - Includes drivers and the Dymo Label application
2. **Dymo Label Web Service** — installed alongside the label software
   - Runs as a background service on the admin PC
   - Listens on `https://127.0.0.1:41951` by default
   - The browser JS SDK communicates with this service

### Installation Steps (Windows)

1. Download **DLS (Dymo Label Software)** from Dymo's download page
2. Run the installer — select **Complete** installation
3. Restart the computer
4. Verify the **Dymo Label Web Service** is running:
   - Open Task Manager → Services tab
   - Look for `DymoPnpService` — status should be **Running**

### Installation Steps (macOS)

1. Download **DYMO Label** from the Mac App Store or Dymo's download page
2. Install and open once to complete setup
3. The web service runs automatically

## Step 3: Verify Printer Connectivity

### From the admin PC browser:

Open the browser console (F12) and run:

```javascript
// Check if Dymo Web Service is responding
fetch('https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected')
  .then(r => r.text())
  .then(console.log)
```

Expected: Response indicating the service is connected.

### List available printers:

```javascript
fetch('https://127.0.0.1:41951/DYMO/DLS/Printing/GetPrinters')
  .then(r => r.text())
  .then(console.log)
```

You should see the **DYMO LabelWriter 450 Twin Turbo** listed with both trays.

## Step 4: Load the Correct Labels

The LabelWriter 450 Twin Turbo has **two label trays**:

| Tray | Label Size | Used For |
|------|-----------|----------|
| Left tray | **25mm x 54mm** (return address) | Bike ID QR code labels |
| Right tray | **25mm x 54mm** (return address) | TWINT payment QR labels |

> Adjust tray/label assignments based on your preferred label stock. The 54x70mm labels also work well for QR codes.

## Step 5: Browser Certificate Trust

The Dymo Web Service uses a self-signed HTTPS certificate on `127.0.0.1:41951`. Modern browsers may block this:

1. Open `https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected` directly in the browser
2. Accept the security warning / add exception
3. This only needs to be done once per browser

## Label Specifications

### Bike ID Label

```
┌─────────────────────────┐
│                         │
│      ┌─────────┐        │
│      │ QR CODE │        │
│      └─────────┘        │
│                         │
│   Trek · Red            │
│   🅿️ Garage             │
│                         │
└─────────────────────────┘
```

- QR encodes: `https://bikes.yourdomain.com/bike/<uuid>`
- QR image: 300x300px minimum for print clarity
- Text: bike brand + color
- Garage indicator if applicable

### TWINT Payment Label (garage bikes only)

```
┌─────────────────────────┐
│                         │
│      ┌─────────┐        │
│      │ TWINT   │        │
│      │ QR CODE │        │
│      └─────────┘        │
│                         │
│   Garage contribution   │
│   CHF 40.00 / year     │
│   Quartier Bike ID      │
│                         │
└─────────────────────────┘
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No printers found | Verify Dymo Web Service is running (Task Manager → Services → DymoPnpService) |
| Browser blocks `127.0.0.1:41951` | Navigate to the URL directly and accept the certificate |
| Print is blank or misaligned | Check label size matches the tray — re-calibrate in Dymo Label Software |
| SDK error: `Framework is not initialized` | Ensure the Dymo JS SDK script is loaded before calling print functions |
| Printer only shows one tray | Install latest Dymo drivers — Twin Turbo needs specific driver for dual trays |
