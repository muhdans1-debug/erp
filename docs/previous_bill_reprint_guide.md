# Previous Bill & Receipt Reprint System Guide

## Overview
The Previous Bill & Receipt Reprint System enables cashiers (aged 60–80) to instantly reprint receipts if thermal paper jams or a customer requests a duplicate bill, without needing manager PIN authorization.

---

## 🚀 Cashier Workflows

### 1. Instant 1-Tap Reprint (Last Bill)
- **Where**: Pinned directly in the Cart Footer: `[Last (#5088)]` and Top Banner in Previous Bills modal.
- **Workflow**:
  1. Cashier taps `[Last (#XXXX)]`.
  2. Thermal receipt prints immediately.
  3. Toast displays: `🖨️ Printing Receipt #INV-XXXX...` -> `✅ Receipt #INV-XXXX Printed`.
- **Durable Persistence**: Survives browser refreshes (`F5`), app reboots, and terminal restarts via `askar_recent_sales_history_v1`.

### 2. Search & Browse Previous Bills (`[F9]`)
- **Hotkey**: Press `[F9]` anywhere on the keyboard.
- **Touch Button**: Tap `[🧾 Previous Bills [F9]]` in the top header or `[Bills [F9]]` in the cart footer.
- **Features**:
  - **Live Filter**: Type invoice digits (e.g. `5088`), customer name, or payment mode.
  - **Filter Chips**: 1-tap filtering for `ALL`, `CASH`, `BENEFITPAY`, and `KHATA`.
  - **Thermal Slip Preview (`[👁️]`)**: View the exact receipt layout before dispatching to hardware.
  - **1-Tap Print Button**: Massive neon green `[🖨️ PRINT]` button per card.

---

## 🇧🇭 NBR Duplicate Watermark Compliance
In compliance with Bahrain tax audit requirements (NBR Article 53), any reprinted bill is automatically stamped with:

```text
================================
*** DUPLICATE / REPRINT COPY ***
       نسخة معاد طباعتها
================================
```

This prevents fraudulent return claims and ensures clear accounting records.

---

## 🛠️ Architecture & Files
- **Storage Service**: `pos-mvp/src/services/recentSalesService.ts`
  - Caches up to 50 recent transactions in `localStorage`.
  - Backfilled from SQLite `Sale` and `SaleItem` tables on demand.
  - Emits `askar-recent-sales-updated` custom DOM events.
- **UI Component**: `pos-mvp/src/components/PreviousBillsModal.tsx`
  - Elderly-friendly Layali palette: OLED black (`bg-black`), dark charcoal (`bg-neutral-900`), Zain neon green (`bg-green-500`).
- **Printer Pipeline**: `pos-mvp/src/utils/printer.ts`, `pos-mvp/src/utils/receiptTemplate.ts`, `pos-mvp/src/workers/printer.worker.ts`
  - Supports `isReprint: true` in ESC/POS command stream, Web Worker, and HTML preview.
- **Live POS URL**: `https://askar-pos-web.layali-askar-pos.workers.dev`
- **Native Android APK**: `pos-mvp/apk/pos.apk` (40.7 MB)
