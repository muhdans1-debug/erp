# 🛒 Askar Supermarket POS & Autonomous Cloud ERP

[![Branch](https://img.shields.io/badge/branch-master-green.svg)](https://github.com/muhdans1-debug/erp)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue.svg)](https://nodejs.org)
[![Fastify](https://img.shields.io/badge/backend-Fastify%20v5-black.svg)](https://fastify.dev)
[![LibSQL](https://img.shields.io/badge/storage-LibSQL%20%2F%20Turso-orange.svg)](https://turso.tech)
[![Capacitor](https://img.shields.io/badge/terminals-Sunmi%20%26%20Feitian%20F100-purple.svg)](https://capacitorjs.com)

A unified, edge-replicated supermarket Point of Sale (POS), Khata customer credit ledger, multi-terminal fleet manager, and inventory procurement ERP system designed for high-throughput retail operations in the Kingdom of Bahrain.

---

## 🏛️ System Architecture

```text
                                 [ Cloud / Turso DB ]
                                          ▲
                                   Sync / Push (WAL)
                                          ▼
 [ Supermarket Master Laptop ] ─── (LibSQL local.db Embedded Replica)
  ├── Fastify REST API (:3000)
  ├── WebSocket Event Bus (:3000/ws)
  ├── Vite POS Web Register (:5173)
  ├── Manager Admin Dashboard (:5175)
  └── Customer Khata PWA (:5174)
           ▲
           │ Wi-Fi LAN / ADB USB Reverse
           ▼
 [ Smart POS Fleet ]
  ├── Sunmi D2mini (Dual-screen, thermal printer, cash drawer RJ12)
  └── Feitian F100 (Handheld Smart POS, camera barcode scanner)
```

### Monorepo Structure
- **`pos-mvp/`**: Fastify backend server, SQLite/LibSQL embedded replica engine, local REST API routes, ESC/POS & Sunmi printer drivers, cash drawer triggers, and Vite React POS register frontend.
- **`askar-admin-dashboard/`**: Manager portal for inventory management, stock ledger, employee shift reconciliation, Z-reports, and NFC customer loyalty enrollment.
- **`askar-khata-pwa/`**: Customer-facing digital statement portal for tab balances, transaction histories, and BenefitPay checkout.
- **`askar-khata-api/`**: Edge serverless Cloudflare Worker API for remote tab queries.

---

## 💻 Supermarket Laptop Installation Guide (Fresh Setup)

### Prerequisites
1. **Windows 10 / 11** (64-bit)
2. **Node.js** (v18.x or v20.x LTS) — [Download from nodejs.org](https://nodejs.org)
3. **Git** for Windows — [Download from git-scm.com](https://git-scm.com)

---

### Step 1: Clone the Repository
Open Command Prompt / PowerShell on the supermarket laptop and run:
```cmd
git clone https://github.com/muhdans1-debug/erp.git
cd erp
```

---

### Step 2: Run 1-Click Setup
In the `erp` folder, simply **double-click** `SETUP_STORE_LAPTOP.bat` (or run in CMD):
```cmd
SETUP_STORE_LAPTOP.bat
```
This automated script will:
1. Verify Node.js and Git.
2. Initialize `.env` files automatically with the store database credentials.
3. Install all npm package dependencies across all workspaces (`pos-mvp`, `askar-admin-dashboard`, `askar-khata-pwa`).
4. Initialize the offline-first `local.db` SQLite embedded replica.

---

### Step 3: Launch the Entire System
Double-click `START_SYSTEM.bat`:
```cmd
START_SYSTEM.bat
```
This script automatically starts:
- Fastify Unified REST & WebSocket Bus on `http://localhost:3000`
- Cashier POS Register on `http://localhost:5173`
- Detects any USB-connected Sunmi / Feitian terminals and binds reverse port tunnels
- Launches your default web browser directly to the POS screen.

---

## 🔑 Default Access & Credentials

| Component | URL | Default Credentials |
| :--- | :--- | :--- |
| **Cashier Register** | `http://localhost:5173` | Cashier PIN: `1234` |
| **Manager Admin Dashboard** | `http://localhost:5175` | Manager PIN: `9999` |
| **Fastify Server & WS Bus** | `http://localhost:3000` | Token: Built-in `DEV_SECRET` |
| **Customer Khata PWA** | `http://localhost:5174` | Phone Number verification |

---

## 📱 Hardware & Smart POS Fleet Setup

### 1. Sunmi D2mini POS Terminal
- **Wi-Fi Mode**: Connect the Sunmi D2mini to the store Wi-Fi network. Open POS Settings and set Master Server URL to `http://<laptop-lan-ip>:3000` (e.g. `http://192.168.8.12:3000`).
- **USB Mode**: Plug the terminal via USB cable into the laptop. `START_SYSTEM.bat` will automatically establish reverse port forwarding (`adb reverse tcp:3000 tcp:3000`).
- **Cash Drawer**: Connect standard RJ11/RJ12 drawer cable to the Sunmi printer port. The drawer automatically kicks on:
  - Cash checkout
  - Cash-Out expense entries
  - Khata debt settlement (Payment-In).
- **Thermal Printer**: Automatic NBR VAT QR code generation on all invoices. Khata ledger and balance QR codes print only when the customer owes a balance or pays on credit.

### 2. Feitian F100 Handheld Terminal
- Connect F100 to the store Wi-Fi network.
- Launch `com.retail.pos` application to perform floor inventory lookups, mobile checkouts, or barcode scans.

---

## 🔄 Automated Zero-Downtime Updates (GitOps)

To pull the latest verified improvements, features, and fixes from GitHub onto the store laptop, simply run:
```cmd
deploy.bat
```
This pulls from `origin master`, installs any newly added dependencies, synchronizes the database schema, and reloads the services with zero store disruption.
