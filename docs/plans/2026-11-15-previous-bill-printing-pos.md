# Previous Bill & Receipt Reprint System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a robust, offline-first system for cashiers to instantly reprint the last bill with 1 tap or browse, search, and reprint any previous transaction directly from the POS interface with NBR-compliant duplicate watermarks.

**Architecture:** A durable multi-tiered transaction history service (`recentSalesService`) caches the last 50 transactions in `localStorage` and hydrates from local SQLite (`local.db`), feeding both an instant 1-tap "Reprint Last Bill" button and a dedicated elderly-friendly "Previous Bills" modal (`PreviousBillsModal.tsx`) with instant search, receipt preview, and Sunmi thermal hardware dispatch.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, SQLite/LibSQL, Capacitor Sunmi Printer SDK, Web Worker off-thread printer pipeline.

---

### Task 1: Create Durable Recent Sales History Service (`recentSalesService.ts`)

**Files:**
- Create: `pos-mvp/src/services/recentSalesService.ts`
- Test: `scratch/test_recent_sales_service.mjs`

**Step 1: Write the failing test**
Create `scratch/test_recent_sales_service.mjs` to test adding sales, persisting to storage, retrieving the last sale, and querying fallback sales from `local.db`.

```javascript
import assert from 'assert';
// Test saving and retrieving recent sales with cap at 50
```

**Step 2: Run test to verify it fails**
Run: `node scratch/test_recent_sales_service.mjs`
Expected: FAIL with module not found or functions undefined.

**Step 3: Implement minimal service**
Create `pos-mvp/src/services/recentSalesService.ts` with:
- `RecentSale` data contract (invoiceNo, total, subtotal, vat, items, paymentMode, timestamp, customerName, etc.).
- `saveRecentSale(sale: RecentSale)`: prepends to localStorage cache, caps at 50, emits `askar-recent-sales-updated`.
- `getRecentSales()`: returns cached sales; if empty, fetches from local SQLite (`Sale` + `SaleItem` + `Customer`).
- `getLastSale()`: returns `getRecentSales()[0] || null`.

**Step 4: Run test to verify it passes**
Run: `node scratch/test_recent_sales_service.mjs`
Expected: PASS.

**Step 5: Commit**
```bash
git add pos-mvp/src/services/recentSalesService.ts scratch/test_recent_sales_service.mjs
git commit -m "feat(pos): add durable recent sales history service"
```

---

### Task 2: Add NBR Duplicate/Reprint Watermark to Printer Utilities

**Files:**
- Modify: `pos-mvp/src/utils/printer.ts`
- Modify: `pos-mvp/src/utils/receiptTemplate.ts`
- Modify: `pos-mvp/src/workers/printer.worker.ts`

**Step 1: Write test for reprint watermark**
Add test in `scratch/test_reprint_watermark.mjs` verifying that when `isReprint: true` is passed:
- `formatSaleReceiptText` contains `*** DUPLICATE / REPRINT COPY ***` and Arabic `نسخة معاد طباعتها`.
- `generateNBRReceiptHtml` contains the duplicate watermark badge.

**Step 2: Run test to verify it fails**
Run: `node scratch/test_reprint_watermark.mjs`
Expected: FAIL (watermark text missing).

**Step 3: Implement minimal code**
- In `receiptTemplate.ts`: add `isReprint?: boolean` to `ReceiptTemplateProps`. Render badge below the header if true.
- In `printer.ts`: add `isReprint?: boolean` to `FullReceiptProps` and pass to `formatSaleReceiptText`.
- In `printer.worker.ts`: support `isReprint` in ESC/POS command stream.

**Step 4: Run test to verify it passes**
Run: `node scratch/test_reprint_watermark.mjs`
Expected: PASS.

**Step 5: Commit**
```bash
git add pos-mvp/src/utils/printer.ts pos-mvp/src/utils/receiptTemplate.ts pos-mvp/src/workers/printer.worker.ts
git commit -m "feat(receipt): add NBR-compliant duplicate reprint watermark"
```

---

### Task 3: Build the "Previous Bills & Reprints" Modal (`PreviousBillsModal.tsx`)

**Files:**
- Create: `pos-mvp/src/components/PreviousBillsModal.tsx`

**Ergonomics & Layout (Layali Design System):**
- Dark Charcoal surfaces (`bg-neutral-900`), OLED Black background (`bg-black`).
- Top Search Bar: Instant live filtering as cashier types invoice number (e.g. `5048`), customer name, or selects payment filter chips (`ALL`, `CASH`, `BENEFIT`, `KHATA`).
- Pinned Banner at Top: "Most Recent Bill" with immediate 1-tap `[🖨️ REPRINT LAST BILL]` button.
- Transaction Card List:
  - Big font invoice number (`#INV-005048`), formatted elapsed time ("4 mins ago • 06:30 PM").
  - Clear total amount (`BD 0.100`), payment badge, and line item snippet.
  - Action buttons:
    - `[🖨️ PRINT]` (Massive green button, `h-12`, `text-base font-black`).
    - `[👁️ VIEW]` (Opens slip preview side-sheet or modal).
- Keyboard accessibility: `[ESC]` to close, `[Enter]` to reprint first match, arrow keys navigation.

**Step 1: Create component**
Implement `PreviousBillsModal.tsx` with clean TypeScript interfaces, audio click feedback, and zero-freeze thermal dispatch via `printFullReceipt`.

**Step 2: Test rendering & build**
Run: `npm --prefix pos-mvp run build`
Expected: Clean compilation with 0 TypeScript errors.

**Step 3: Commit**
```bash
git add pos-mvp/src/components/PreviousBillsModal.tsx
git commit -m "feat(pos): add PreviousBillsModal component for cashier reprint"
```

---

### Task 4: Integrate Previous Bills System into `CheckoutScreen.tsx` & `PaymentModal.tsx`

**Files:**
- Modify: `pos-mvp/src/pages/CheckoutScreen.tsx`
- Modify: `pos-mvp/src/components/PaymentModal.tsx`

**Integration Points:**
1. **Durable Persistence on Sale Completion**:
   - In `PaymentModal.tsx` (line 370) and `CheckoutScreen.tsx` (wherever checkout finishes), call `saveRecentSale(...)`.
   - On `CheckoutScreen` mount, initialize `lastCompletedSale` from `getLastSale()` so reloads never lose the last bill.
2. **Prominent 1-Tap Reprint Button**:
   - Place permanent button in cart footer and header bar:
     `[🖨️ Last Bill (#XXXX)]`
   - Clicking it prints the last transaction immediately and shows a toast.
3. **Previous Bills Trigger Button [F9]**:
   - Add button in top navigation header: `[🧾 Previous Bills [F9]]`.
   - Add `[F9]` key listener in global keyboard shortcuts.
   - Add menu entry in `More Actions [F7]` menu.
4. **Wire Modal**:
   - Render `<PreviousBillsModal isOpen={showPreviousBillsModal} onClose={() => setShowPreviousBillsModal(false)} />`.

**Step 1: Apply edits**
Update `PaymentModal.tsx` and `CheckoutScreen.tsx`.

**Step 2: Compile & verify**
Run: `npm --prefix pos-mvp run build`
Expected: Build passes with 0 errors.

**Step 3: Commit**
```bash
git add pos-mvp/src/pages/CheckoutScreen.tsx pos-mvp/src/components/PaymentModal.tsx
git commit -m "feat(pos): wire previous bill modal and F9 hotkey into CheckoutScreen"
```

---

### Task 5: End-to-End Automated Verification in Headless Chrome & Native Build

**Files:**
- Create: `scratch/test_previous_bill_flow.js`

**Verification Steps:**
1. Complete a test sale on the POS.
2. Verify `lastCompletedSale` updates and the 1-tap `[Reprint Last Bill]` button activates.
3. Trigger reprint and verify print dispatch.
4. Trigger `[F9]` (or click "Previous Bills" button) to open `PreviousBillsModal`.
5. Verify transaction appears in the list with invoice number, amount, and items.
6. Test search filter: type invoice digits and verify filtering.
7. Test reprint button inside modal: verify print is called with `isReprint: true`.
8. Refresh page (`F5`) and verify `lastCompletedSale` and previous bills history persist seamlessly from storage.
9. Capture screenshots:
   - `previous_bills_modal_open.png`
   - `previous_bills_search_filtered.png`
   - `reprint_receipt_watermark_preview.png`
10. Build native Android APK (`pos.apk`) and deploy to Cloudflare Worker.

---

### Task 6: Documentation & User Walkthrough

**Files:**
- Create: `docs/previous_bill_reprint_guide.md`
- Provide concise report to user with screenshots and key decision checkpoints.
