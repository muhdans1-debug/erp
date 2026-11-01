const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '..', '..', 'Ai erp software.md');
let content = fs.readFileSync(targetFile, 'utf8');

const sectionIX = `
---

## IX. PIN-Locked Front-Counter Receiving Drawer & Barcode Audit Architecture

### 1. Executive Summary & Problem Context
In retail grocers and convenience supermarkets operating with front-desk POS terminals (such as the Sunmi D2mini), vendor delivery drivers (e.g., Almarai, Arla, Coca-Cola) frequently drop shipments directly at the checkout counter during operating hours.

Historically, store systems forced cashiers to either:
1. Log out or navigate away from the POS sales screen, losing the current customer's ringing cart.
2. Blindly trust paper delivery slips and manually punch in stock numbers later, leading to stock shrinkage and discrepancy.

**The Solution:** A non-disruptive, PIN-locked **"Receiving Drawer"** that smoothly slides out from the right edge (\`w-1/2\` overlaying the Quick Products grid) while leaving the active customer cart on the left intact. Protected by Manager PIN \`9999\`, it intercepts the hardware barcode scanner to audit incoming goods against in-transit Purchase Orders and atomically updates SQLite inventory stock.

\`\`\`
+-----------------------------------------------------------------------------------+
|  [POS HEADER]   Current Register: 01    [🚚 Receiving] [🔑 Manager] [⚙ Settings]  |
+------------------------------------------+----------------------------------------+
|                                          |                                        |
|         LEFT: ACTIVE CASHIER CART        |      RIGHT: RECEIVING DRAWER (w-1/2)   |
|                                          |                                        |
|  Customer: Walk-in                       |  Delivery: Almarai Dairy Co.           |
|  - Almarai Fresh Milk 2L     1x  0.950   |  Status: IN_TRANSIT                    |
|  - Khubz Flatbread           2x  0.200   |  ------------------------------------  |
|                                          |  [Scan Barcode to Audit Incoming Item] |
|  Subtotal:                     1.150 BHD |  - Milk 2L:   [ 24 / 24 ]  ✓ MATCHED   |
|  Total Due:                    1.150 BHD |  - Laban:     [ 30 / 30 ]  ✓ MATCHED   |
|                                          |  ------------------------------------  |
|  [ CASH ]   [ BENEFITPAY ]   [ CARD ]    |  [ ✔ Ingest Stock & Close PO ]         |
+------------------------------------------+----------------------------------------+
\`\`\`

---

### 2. Database Schema (Prisma / SQLite)

The lifecycle of an inventory shipment transitions through \`DRAFT\` -> \`IN_TRANSIT\` (or \`SENT\`) -> \`RECEIVED\`:

\`\`\`prisma
model PurchaseOrder {
  id              String      @id @default(uuid())
  supplier_name   String
  whatsapp_number String?
  supplier_email  String?
  status          String      @default("IN_TRANSIT") // DRAFT, SENT, IN_TRANSIT, RECEIVED
  estimated_cost  Float       @default(0.0)
  items           POItem[]
  created_at      DateTime    @default(now())
  updated_at      DateTime    @updatedAt
}

model POItem {
  id                String        @id @default(uuid())
  purchase_order_id String
  product_id        String?
  barcode           String
  name              String
  expected_qty      Int
  received_qty      Int           @default(0)
  unit_cost         Float         @default(0.0)
  purchase_order    PurchaseOrder @relation(fields: [purchase_order_id], references: [id], onDelete: Cascade)
}
\`\`\`

---

### 3. Backend Atomic Inventory Ingestion API (\`server.js\`)

When the manager approves the incoming delivery, the backend updates the PO status to \`RECEIVED\` and increments the physical stock inside the SQLite database using an atomic transaction:

\`\`\`javascript
// Fastify Endpoint: POST /api/purchase-orders/:id/receive & /po/:id/receive
fastify.post('/api/purchase-orders/:id/receive', async (req, reply) => {
  const { id } = req.params;
  const { receivedItems } = req.body || {};

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Fetch active PO
      const po = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!po) throw new Error(\`Purchase order \${id} not found\`);

      // 2. Increment stock in Product inventory for each verified item
      if (Array.isArray(receivedItems) && receivedItems.length > 0) {
        for (const item of receivedItems) {
          const qty = Number(item.qty || item.received_qty || item.reorderQuantity || 0);
          if (qty > 0 && item.barcode) {
            await tx.product.updateMany({
              where: { barcode: String(item.barcode) },
              data: { stockQuantity: { increment: qty } }
            });
          }
        }
      }

      // 3. Mark Purchase Order status as RECEIVED
      return await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED' }
      });
    });

    return reply.send({ success: true, result: updated });
  } catch (err) {
    req.log.error(err, 'Failed to receive purchase order');
    return reply.status(500).send({ success: false, error: err.message });
  }
});
\`\`\`

---

### 4. Barcode Auditing & Scanner Interceptor Workflow

Physical POS barcode scanners (USB HID / Keyboard Emulation) continuously broadcast keystrokes. When the Receiving Drawer is open:

1. **Focus & Scanner Interception:** The top-level \`handleBarcodeScan\` hook detects that \`isReceivingDrawerOpen === true\`.
2. **Diversion:** The barcode string is routed to the \`ReceivingDrawer\` callback instead of adding an item to the customer's sales cart.
3. **Audit Match:**
   - If the scanned barcode matches an expected PO line item:
     - \`received_qty\` is incremented by \`+1\`.
     - An affirmative audio chime (880Hz sine wave) plays via Web Audio API.
     - The item card glows emerald (\`#10b981\`) with a \`✓ VERIFIED\` badge when \`received_qty >= expected_qty\`.
   - If the scanned barcode does not belong to the manifest:
     - An alert buzz (220Hz saw wave) plays.
     - A banner notifies the manager: *"Barcode not in delivery manifest!"*

\`\`\`typescript
// Global Scanner Hook Interception in CheckoutScreen.tsx
const handleBarcodeScan = useCallback((barcode: string) => {
  if (showReceivingDrawer && receivingScanCallbackRef.current) {
    // Intercepted: Divert to Receiving Drawer Audit
    receivingScanCallbackRef.current(barcode);
    return;
  }

  // Normal Cashier Checkout Ring-up
  handleScannedProduct(barcode);
}, [showReceivingDrawer]);
\`\`\`

---

### 5. Manager PIN Security Pad

To prevent cashiers or unauthorized staff from tampering with inventory records during receiving, the drawer requires the Manager PIN (\`9999\`) before granting access to in-transit POs:
- Built with large $3 \\times 4$ on-screen touch buttons designed specifically for touch screen terminals (e.g. Sunmi D2mini 10.1" display).
- Prevents the OS soft keyboard from popping up and obstructing screen views.
- Automatically resets on drawer close to maintain continuous security.

---

### 6. Verification & Quality Matrix

| Test Scenario | Action Performed | Expected Behavior | Verification Status |
| :--- | :--- | :--- | :--- |
| **Drawer Activation** | Tap \`[🚚 Receiving]\` in header | Manager PIN pad slides out on right; cart stays visible on left | Passed |
| **PIN Lockout** | Enter \`1234\` | PIN error chime, red shake indicator, input cleared | Passed |
| **PIN Unlock** | Enter \`9999\` | Success chime; fetches all \`IN_TRANSIT\` manifests | Passed |
| **Barcode Intercept** | Scan Milk 2L (\`00104\`) with drawer open | Increments PO Milk received qty; **0 items added to sales cart** | Passed |
| **Manual Adjust** | Tap \`+\` / \`-\` on PO item | Adjusts audited quantity with immediate progress bar update | Passed |
| **Stock Ingestion** | Tap \`[✔ Receive & Ingest Stock]\` | SQLite \`Product.stockQuantity\` incremented; PO status -> \`RECEIVED\` | Passed |
| **Drawer Close** | Tap \`[X]\` or after successful ingest | Drawer closes, cashier returns to instant checkout flow | Passed |
`;

if (!content.includes('## IX. PIN-Locked Front-Counter Receiving Drawer')) {
  fs.writeFileSync(targetFile, content.trimEnd() + '\n' + sectionIX + '\n', 'utf8');
  console.log('Appended Section IX successfully to Ai erp software.md');
} else {
  console.log('Section IX already exists in Ai erp software.md');
}
