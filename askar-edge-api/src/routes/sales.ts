import { Hono } from 'hono';
import { getDb, type Env } from '../db.ts';
import { tenantMiddleware, type TenantContext } from '../middleware/tenant.ts';
import { requirePosOrManagerAuth, requireManagerAuth } from '../middleware/auth.ts';
import { ensureRegionalIso, getRegionalIsoString, getRegionalDayRange } from '../utils/time.ts';

export const salesRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

salesRouter.use('*', tenantMiddleware);

/**
 * High-Speed Batched Sales Ingestion (Offline Drain & Online POS Checkouts)
 */
salesRouter.post('/sync', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const contextStoreId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const contextTerminalId = c.get('terminalId') || 'R01';

  try {
    const body = await c.req.json();
    const rawSales = Array.isArray(body) ? body : (body.sales || [body]);
    const salesToSync = rawSales.filter(Boolean);

    if (salesToSync.length === 0) {
      return c.json({ success: true, processed: 0, message: 'Empty batch provided' });
    }

    // Query already-synced invoices in this batch to prevent double-deduction on retried offline syncs
    const incomingInvoices = salesToSync.map((s: any) => s.invoiceNo || s.invoice_number).filter(Boolean);
    const alreadySyncedInvoices = new Set<string>();
    if (incomingInvoices.length > 0) {
      const placeholders = incomingInvoices.map(() => '?').join(',');
      try {
        const existingRes = await db.execute({
          sql: `SELECT invoiceNo FROM Sale WHERE invoiceNo IN (${placeholders}) AND syncStatus = 'SYNCED'`,
          args: incomingInvoices
        });
        if (existingRes.rows) {
          existingRes.rows.forEach((r: any) => alreadySyncedInvoices.add(r.invoiceNo as string));
        }
      } catch {}
    }

    let processedCount = 0;
    const affectedCustomerIds = new Set<string>();
    const batchStatements: { sql: string; args: any[] }[] = [];

    for (const sale of salesToSync) {
      if (!sale || (!sale.id && !sale.invoiceNo)) continue;

      const total = Number(sale.total || sale.totalAmount || 0);
      const subtotal = Number(sale.subtotal !== undefined && sale.subtotal !== null ? sale.subtotal : (total > 0 ? (total / 1.10) : 0));
      const roundedSubtotal = Number(subtotal.toFixed(3));
      const calculatedVat = Number((total > 0 ? (total - roundedSubtotal) : 0).toFixed(3));
      const finalVat = Number((sale.totalVat ?? sale.vatTotal ?? calculatedVat).toFixed(3));

      // Process line items
      const items = (Array.isArray(sale.items) && sale.items.length > 0)
        ? sale.items
        : (Array.isArray(sale.cart) && sale.cart.length > 0 ? sale.cart : []);

      // Safeguard against corrupted phantom zero-price sales
      if (total <= 0 && items.length === 0) {
        continue;
      }

      const storeId = sale.storeId || contextStoreId;
      const terminalId = sale.terminalId || contextTerminalId;
      const providedInvoiceNo = sale.invoiceNo || sale.invoice_number;
      const invoiceNo = providedInvoiceNo || `INV-${storeId.slice(-3).toUpperCase()}-${terminalId}-${Date.now()}`;
      // Deterministic saleId ensures idempotency across offline sync retries
      const saleId = sale.id || `sale_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const paymentType = sale.paymentType || sale.payment_type || 'CASH';
      const status = sale.status || 'COMPLETED';
      const createdAt = ensureRegionalIso(sale.createdAt || sale.created_at || sale.offlineTimestamp);
      const customerId = sale.customerId || sale.khata_id || null;
      const employeeId = sale.employeeId || sale.employee_id || null;
      const shiftId = sale.shiftId || sale.shift_id || null;
      const invoiceSeq = Number(sale.invoiceSeq || sale.sequence || 0);

      // 1. Queue master Sale record insert/update (idempotent ON CONFLICT)
      batchStatements.push({
        sql: `INSERT INTO Sale (
                id, tenantId, storeId, terminalId, invoiceNo, invoiceSeq,
                total, totalAmount, subtotal, totalVat, vatTotal, paymentType, status, syncStatus,
                customerId, employeeId, shiftId, createdAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?)
              ON CONFLICT(invoiceNo) DO UPDATE SET
                syncStatus = 'SYNCED',
                total = excluded.total,
                totalAmount = excluded.totalAmount,
                subtotal = excluded.subtotal,
                totalVat = excluded.totalVat,
                vatTotal = excluded.vatTotal,
                paymentType = excluded.paymentType,
                status = excluded.status`,
        args: [
          saleId, tenantId, storeId, terminalId, invoiceNo, invoiceSeq,
          total, total, roundedSubtotal, finalVat, finalVat, paymentType, status,
          customerId, employeeId, shiftId, createdAt
        ]
      });

      // 2. Queue Khata Credit Ledger if credit transaction
      const isCreditSale =
        paymentType === 'CREDIT' ||
        paymentType === 'CREDIT_PERSONAL' ||
        paymentType === 'CREDIT_MESS' ||
        paymentType === 'NFC_CREDIT' ||
        paymentType === 'MESS_KHATA';

      const isMessSync =
        paymentType === 'MESS_KHATA' ||
        paymentType === 'CREDIT_MESS' ||
        Boolean(sale.messId || sale.mess_id);

      if (isMessSync) {
        let targetMessId = sale.messId || sale.mess_id;
        if (!targetMessId && customerId) {
          try {
            const cCheck = await db.execute({
              sql: 'SELECT mess_id FROM Customer WHERE id = ? LIMIT 1',
              args: [customerId]
            });
            if (cCheck.rows && cCheck.rows.length > 0 && cCheck.rows[0].mess_id) {
              targetMessId = cCheck.rows[0].mess_id as string;
            }
          } catch {}
        }

        let groupName = 'Mess Group';
        let memberRows: any[] = [];
        if (targetMessId) {
          try {
            const [gRes, mRes] = await Promise.all([
              db.execute({ sql: 'SELECT group_name FROM MessGroup WHERE id = ? LIMIT 1', args: [targetMessId] }),
              db.execute({ sql: 'SELECT id, name FROM Customer WHERE mess_id = ? AND (is_active = 1 OR is_active IS NULL)', args: [targetMessId] })
            ]);
            if (gRes.rows && gRes.rows.length > 0) {
              groupName = (gRes.rows[0].group_name as string) || groupName;
            }
            memberRows = mRes.rows || [];
          } catch {}
        }

        if (memberRows.length > 0) {
          const splitAmount = parseFloat((total / memberRows.length).toFixed(3));
          const remainder = parseFloat((total - (splitAmount * memberRows.length)).toFixed(3));
          const shopperTag = sale.shopperName ? ` (Shopper: ${sale.shopperName})` : '';

          for (let i = 0; i < memberRows.length; i++) {
            const member = memberRows[i];
            const memberCharge = parseFloat((i === 0 ? splitAmount + remainder : splitAmount).toFixed(3));
            const ledgerId = `khata_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}_${member.id}`;
            const ledgerRef = `Mess Split: ${groupName} (${memberRows.length} members)${shopperTag} - ${invoiceNo}`;

            batchStatements.push({
              sql: `INSERT INTO KhataLedger (
                      id, tenantId, storeId, customerId, amount, type, reference,
                      running_balance, syncStatus, timestamp, created_at
                    ) VALUES (
                      ?, ?, ?, ?, ?, 'CHARGE', ?,
                      (SELECT ROUND(COALESCE(SUM(amount), 0) + ?, 3) FROM KhataLedger WHERE customerId = ?),
                      'SYNCED', ?, ?
                    )
                    ON CONFLICT(id) DO NOTHING`,
              args: [ledgerId, tenantId, storeId, member.id, memberCharge, ledgerRef, memberCharge, member.id, createdAt, createdAt]
            });

            affectedCustomerIds.add(member.id);
          }
        } else if (customerId) {
          const deterministicLedgerId = `tx_inv_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          batchStatements.push({
            sql: `INSERT INTO KhataLedger (
                    id, tenantId, storeId, customerId, amount, type, reference,
                    running_balance, syncStatus, timestamp, created_at
                  ) VALUES (
                    ?, ?, ?, ?, ?, 'CHARGE', ?,
                    (SELECT ROUND(COALESCE(SUM(amount), 0) + ?, 3) FROM KhataLedger WHERE customerId = ?),
                    'SYNCED', ?, ?
                  )
                  ON CONFLICT(id) DO NOTHING`,
            args: [deterministicLedgerId, tenantId, storeId, customerId, total, invoiceNo, total, customerId, createdAt, createdAt]
          });
          affectedCustomerIds.add(customerId);
        }
      } else if (customerId && isCreditSale) {
        const deterministicLedgerId = `tx_inv_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        batchStatements.push({
          sql: `INSERT INTO KhataLedger (
                  id, tenantId, storeId, customerId, amount, type, reference,
                  running_balance, syncStatus, timestamp, created_at
                ) VALUES (
                  ?, ?, ?, ?, ?, 'CHARGE', ?,
                  (SELECT ROUND(COALESCE(SUM(amount), 0) + ?, 3) FROM KhataLedger WHERE customerId = ?),
                  'SYNCED', ?, ?
                )
                ON CONFLICT(id) DO NOTHING`,
          args: [deterministicLedgerId, tenantId, storeId, customerId, total, invoiceNo, total, customerId, createdAt, createdAt]
        });
        affectedCustomerIds.add(customerId);
      }

      // 3. Queue line items and stock deduction
      for (const item of items) {
        const prodId = item.productId || item.product_id || item.id || `custom_${Date.now()}`;
        const itemId = item.id || `si_${saleId}_${prodId}`;
        const qty = Number(item.qty ?? item.quantity ?? 1);
        const price = Number(item.priceAtSale ?? item.sellingPrice ?? item.price ?? item.unitPrice ?? 0);
        const totalPrice = Number((item.total_price ?? (qty * price)).toFixed(3));
        const vatRate = item.vatRateAtSale !== undefined ? Number(item.vatRateAtSale) : 10.0;
        const vatAmount = Number((item.vatAmount ?? (vatRate === 10 ? (totalPrice - (totalPrice / 1.10)) : 0)).toFixed(3));
        const costPrice = Number(item.costAtSale ?? item.unitCost ?? 0);

        // Auto-provision product record in Product table if it's an ad-hoc, loose produce, or scale item
        // Completely immunizes SaleItem from FOREIGN KEY constraint failures
        batchStatements.push({
          sql: `INSERT INTO Product (id, tenantId, name, sellingPrice, unitCost, purchasePrice, category, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO NOTHING`,
          args: [
            prodId,
            tenantId,
            item.name || item.nameAr || 'Item',
            price,
            costPrice,
            costPrice,
            item.category || 'GROCERY'
          ]
        });

        batchStatements.push({
          sql: `INSERT INTO SaleItem (
                  id, tenantId, saleId, productId, quantity, priceAtSale,
                  costAtSale, vatRateAtSale, vatAmount, total_price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  quantity = excluded.quantity,
                  priceAtSale = excluded.priceAtSale,
                  total_price = excluded.total_price`,
          args: [itemId, tenantId, saleId, prodId, qty, price, costPrice, vatRate, vatAmount, totalPrice]
        });

        // Deduct inventory only if this invoice was NOT already synced (idempotent stock protection)
        const isAlreadySynced = alreadySyncedInvoices.has(invoiceNo);
        if (!isAlreadySynced && prodId) {
          batchStatements.push({
            sql: `UPDATE StoreInventory 
                  SET stockQuantity = MAX(0, stockQuantity - ?), updated_at = CURRENT_TIMESTAMP
                  WHERE storeId = ? AND (productId = ? OR productId IN (SELECT id FROM Product WHERE barcode = ?))`,
            args: [qty, storeId, prodId, prodId]
          });

          batchStatements.push({
            sql: `UPDATE Product 
                  SET stockQuantity = MAX(0, stockQuantity - ?), updatedAt = CURRENT_TIMESTAMP
                  WHERE id = ? OR barcode = ?`,
            args: [qty, prodId, prodId]
          });
        }
      }

      processedCount++;
    }

    // 4. Queue atomic Khata balance reconciliation for affected customers
    for (const custId of affectedCustomerIds) {
      batchStatements.push({
        sql: `UPDATE Customer 
              SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                  updatedAt = CURRENT_TIMESTAMP 
              WHERE id = ?`,
        args: [custId, custId]
      });
    }

    // 5. Execute all queued operations in a single atomic LibSQL batch round-trip
    if (batchStatements.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < batchStatements.length; i += CHUNK_SIZE) {
        const chunk = batchStatements.slice(i, i + CHUNK_SIZE);
        await db.batch(chunk, 'write');
      }
    }

    const firstSale = salesToSync[0];
    const primaryInvoiceNo = firstSale?.invoiceNo || firstSale?.invoice_number;
    const primaryInvoiceSeq = firstSale?.invoiceSeq || firstSale?.sequence || 0;
    const primaryTotal = Number(firstSale?.total || firstSale?.totalAmount || 0);
    const primarySubtotal = Number(firstSale?.subtotal || (primaryTotal > 0 ? (primaryTotal / 1.10) : 0));
    const primaryVat = Number(firstSale?.totalVat ?? firstSale?.vatTotal ?? (primaryTotal - primarySubtotal));

    return c.json({
      success: true,
      processed: processedCount,
      batchedStatements: batchStatements.length,
      invoice: primaryInvoiceNo,
      invoiceNo: primaryInvoiceNo,
      invoiceNumber: primaryInvoiceSeq,
      formattedInvoice: primaryInvoiceNo,
      subtotal: Number(primarySubtotal.toFixed(3)),
      totalVat: Number(primaryVat.toFixed(3)),
      totalAmount: Number(primaryTotal.toFixed(3))
    });
  } catch (err: any) {
    return c.json({ error: 'Sync failed on Cloudflare Edge', details: err?.message }, 500);
  }
});

// Alias for backwards compatibility (Protected)
salesRouter.post('/', requirePosOrManagerAuth, async (c) => {
  return salesRouter.fetch(new Request(new URL('/sync', c.req.url).toString(), c.req.raw), c.env);
});

/**
 * Dedicated Split-Billing Checkout for Mess Groups (Labor Camp Accommodations)
 * Automatically distributes total groceries evenly across all active workers in the Mess Group
 */
salesRouter.post('/mess-checkout', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const terminalId = c.get('terminalId') || 'R01';

  try {
    const body = await c.req.json();
    const {
      cart, items, subtotal, vatTotal, total, totalAmount,
      messId, cardUid, invoiceNo, cashierName, shopperName, shopperId
    } = body || {};

    const rawItems = items || cart || [];
    const finalTotal = Number((totalAmount !== undefined ? totalAmount : (total !== undefined ? total : 0)).toFixed(3));

    if (!messId) {
      return c.json({ success: false, error: 'messId is required for Mess checkout' }, 400);
    }

    // 1. Fetch group & active members
    const gRes = await db.execute({
      sql: `SELECT id, group_name FROM MessGroup WHERE id = ? LIMIT 1`,
      args: [messId]
    });

    if (!gRes.rows || gRes.rows.length === 0) {
      return c.json({ success: false, error: 'Mess group not found' }, 404);
    }
    const group = gRes.rows[0];

    const mRes = await db.execute({
      sql: `SELECT DISTINCT c.id, c.name, c.phone, c.cpr, c.balance
            FROM Customer c
            JOIN MessMember mm ON c.id = mm.customer_id
            WHERE mm.mess_id = ? AND mm.is_active = 1
            UNION
            SELECT c.id, c.name, c.phone, c.cpr, c.balance
            FROM Customer c
            WHERE c.mess_id = ? AND (c.is_active = 1 OR c.is_active IS NULL)
              AND NOT EXISTS (SELECT 1 FROM MessMember WHERE mess_id = ?)`,
      args: [messId, messId, messId]
    });
    const memberRows = mRes.rows || [];

    if (memberRows.length === 0) {
      return c.json({ success: false, error: `Mess Group "${group.group_name}" has no registered members to split bill` }, 400);
    }

    // 2. Mathematical equal split (Bahraini Dinars 3 decimal places)
    const splitAmount = parseFloat((finalTotal / memberRows.length).toFixed(3));
    const remainder = parseFloat((finalTotal - (splitAmount * memberRows.length)).toFixed(3));

    // 3. Sequential invoice numbering
    const verifiedInvoiceNo = invoiceNo || `INV-${storeId.slice(-3).toUpperCase()}-${terminalId}-${Date.now()}`;
    const saleId = `sale_${verifiedInvoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const nowIso = getRegionalIsoString();

    const roundedSubtotal = Number((subtotal !== undefined ? subtotal : (finalTotal / 1.10)).toFixed(3));
    const finalVat = Number((vatTotal !== undefined ? vatTotal : (finalTotal - roundedSubtotal)).toFixed(3));

    const batchStatements: { sql: string; args: any[] }[] = [];

    // Master Sale record
    batchStatements.push({
      sql: `INSERT INTO Sale (
              id, tenantId, storeId, terminalId, invoiceNo,
              total, totalAmount, subtotal, totalVat, vatTotal, paymentType, status, syncStatus,
              customerId, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MESS_KHATA', 'COMPLETED', 'SYNCED', ?, ?)
            ON CONFLICT(invoiceNo) DO UPDATE SET
              total = excluded.total,
              syncStatus = 'SYNCED'`,
      args: [
        saleId, tenantId, storeId, terminalId, verifiedInvoiceNo,
        finalTotal, finalTotal, roundedSubtotal, finalVat, finalVat,
        shopperId || memberRows[0].id, nowIso
      ]
    });

    // Line items
    for (const item of rawItems) {
      const prodId = item.productId || item.product_id || item.id || `custom_${Date.now()}`;
      const itemId = item.id || `si_${saleId}_${prodId}`;
      const qty = Number(item.qty ?? item.quantity ?? 1);
      const price = Number(item.priceAtSale ?? item.sellingPrice ?? item.price ?? 0);
      const totalPrice = Number((item.total_price ?? (qty * price)).toFixed(3));
      const vatRate = item.vatRateAtSale !== undefined ? Number(item.vatRateAtSale) : 10.0;
      const vatAmount = Number((item.vatAmount ?? (vatRate === 10 ? (totalPrice - (totalPrice / 1.10)) : 0)).toFixed(3));
      const costPrice = Number(item.costAtSale ?? item.unitCost ?? 0);

      batchStatements.push({
        sql: `INSERT INTO Product (id, tenantId, name, sellingPrice, unitCost, purchasePrice, category, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO NOTHING`,
        args: [
          prodId,
          tenantId,
          item.name || item.nameAr || 'Item',
          price,
          costPrice,
          costPrice,
          item.category || 'GROCERY'
        ]
      });

      batchStatements.push({
        sql: `INSERT INTO SaleItem (
                id, tenantId, saleId, productId, quantity, priceAtSale,
                costAtSale, vatRateAtSale, vatAmount, total_price
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO NOTHING`,
        args: [itemId, tenantId, saleId, prodId, qty, price, costPrice, vatRate, vatAmount, totalPrice]
      });
    }

    // Split charges across each member
    const memberSplits: { id: string; name: string; amount: number; balance: number }[] = [];
    const shopperTag = shopperName ? ` (Shopper: ${shopperName})` : '';

    for (let i = 0; i < memberRows.length; i++) {
      const member = memberRows[i];
      const memberCharge = parseFloat((i === 0 ? splitAmount + remainder : splitAmount).toFixed(3));
      const ledgerEntryId = `khata_${verifiedInvoiceNo}_${member.id}`;
      const ledgerRef = `Mess Split: ${group.group_name} (${memberRows.length} members)${shopperTag} - ${verifiedInvoiceNo}`;

      batchStatements.push({
        sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, syncStatus, timestamp, tenantId, mess_id, sale_id, group_total, member_count)
              VALUES (?, ?, ?, 'CHARGE', ?, 'SYNCED', ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO NOTHING`,
        args: [ledgerEntryId, member.id, memberCharge, ledgerRef, nowIso, tenantId, messId, saleId, finalTotal, memberRows.length]
      });

      batchStatements.push({
        sql: `UPDATE Customer 
              SET balance = ROUND(COALESCE(balance, 0) + ?, 3), updatedAt = CURRENT_TIMESTAMP 
              WHERE id = ?`,
        args: [memberCharge, member.id]
      });

      const oldBal = Number(member.balance ?? 0);
      memberSplits.push({
        id: member.id as string,
        name: member.name as string,
        amount: memberCharge,
        balance: Number((oldBal + memberCharge).toFixed(3))
      });
    }

    // Execute atomic batch
    await db.batch(batchStatements, 'write');

    return c.json({
      success: true,
      invoiceNo: verifiedInvoiceNo,
      formattedInvoice: verifiedInvoiceNo,
      isMess: true,
      messId,
      groupName: group.group_name,
      shopperName: shopperName || null,
      totalAmount: finalTotal,
      splitAmount,
      memberCount: memberRows.length,
      splits: memberSplits
    });
  } catch (err: any) {
    return c.json({ success: false, error: 'Mess checkout failed', details: err?.message }, 500);
  }
});

/**
 * Process Sale Refund & Credit Note Generation (Protected)
 */
salesRouter.post('/refund', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const invoiceNo = (body.invoiceNo || body.invoice_no || '').trim();
    const items = body.items || [];
    const reason = body.reason || 'MISTAKE';
    const destination = body.destination || 'CASH'; // CASH or KHATA_CREDIT
    const processedBy = body.processedBy || 'Manager';

    if (!invoiceNo || items.length === 0) {
      return c.json({ error: 'Invoice number and items to refund are required' }, 400);
    }

    const saleRes = await db.execute({
      sql: `SELECT * FROM Sale WHERE invoiceNo = ? OR id = ? LIMIT 1`,
      args: [invoiceNo, invoiceNo]
    });

    if (!saleRes.rows || saleRes.rows.length === 0) {
      return c.json({ error: `Invoice #${invoiceNo} not found` }, 404);
    }

    const sale = saleRes.rows[0];
    let totalRefundAmount = 0;
    const processedItems: any[] = [];
    const batchStatements: { sql: string; args: any[] }[] = [];
    const refundId = crypto.randomUUID();
    const creditNoteNo = `CN-${String(sale.invoiceNo).replace(/^INV-?/i, '')}-${Date.now().toString().slice(-4)}`;
    const nowRegionalIso = getRegionalIsoString();

    for (const item of items) {
      const qty = Math.max(1, parseInt(item.quantity || item.qty) || 1);
      const unitPrice = Number(item.unitPrice || item.priceAtSale || item.price || 0);
      const lineTotal = Number((qty * unitPrice).toFixed(3));
      totalRefundAmount += lineTotal;
      const prodId = item.productId || item.id;
      const isDamaged = Boolean(item.isDamaged || reason === 'DAMAGED' || reason === 'EXPIRED');

      processedItems.push({
        saleItemId: item.saleItemId || null,
        productId: prodId,
        productName: item.productName || item.name || 'Returned Item',
        quantity: qty,
        unitPrice,
        totalAmount: lineTotal,
        isDamaged
      });

      // Stock routing: Restock if not damaged, or route to WastageLog
      if (isDamaged) {
        batchStatements.push({
          sql: `INSERT INTO WastageLog (id, tenantId, productId, productName, quantity, unitCost, totalLoss, reason, loggedBy, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            crypto.randomUUID(), tenantId, prodId,
            item.productName || item.name || 'Damaged Return',
            qty, unitPrice, lineTotal, reason, processedBy, nowRegionalIso
          ]
        });
      } else if (prodId) {
        batchStatements.push({
          sql: `UPDATE Product SET stockQuantity = stockQuantity + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? OR barcode = ?`,
          args: [qty, prodId, prodId]
        });
        batchStatements.push({
          sql: `UPDATE StoreInventory SET stockQuantity = stockQuantity + ?, updated_at = CURRENT_TIMESTAMP WHERE storeId = ? AND (productId = ? OR productId IN (SELECT id FROM Product WHERE barcode = ?))`,
          args: [qty, storeId, prodId, prodId]
        });
      }
    }

    totalRefundAmount = Number(totalRefundAmount.toFixed(3));

    // 1. Master Refund Record (Must be inserted BEFORE RefundItems to satisfy FK constraints)
    batchStatements.push({
      sql: `INSERT INTO Refund (id, tenantId, saleId, invoiceNo, refundedAmount, reason, destination, itemsJson, processedBy, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        refundId, tenantId, sale.id, sale.invoiceNo, totalRefundAmount,
        reason, destination, JSON.stringify(processedItems), processedBy, nowRegionalIso
      ]
    });

    // 2. Insert granular RefundItems referencing the parent Refund
    for (const pi of processedItems) {
      batchStatements.push({
        sql: `INSERT INTO RefundItem (id, tenantId, refundId, saleItemId, productId, productName, quantity, unitPrice, totalAmount, isDamaged)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(), tenantId, refundId, pi.saleItemId || null,
          pi.productId, pi.productName, pi.quantity, pi.unitPrice, pi.totalAmount, pi.isDamaged ? 1 : 0
        ]
      });
    }

    if (destination === 'KHATA_CREDIT' && sale.customerId) {
      const ledgerId = `tx_ref_${refundId.slice(0, 8)}`;
      batchStatements.push({
        sql: `INSERT INTO KhataLedger (
                id, tenantId, storeId, customerId, amount, type, reference,
                running_balance, syncStatus, timestamp, created_at
              ) VALUES (
                ?, ?, ?, ?, ?, 'CREDIT', ?,
                (SELECT ROUND(COALESCE(SUM(amount), 0) - ?, 3) FROM KhataLedger WHERE customerId = ?),
                'SYNCED', ?, ?
              )`,
        args: [ledgerId, tenantId, storeId, sale.customerId, -totalRefundAmount, creditNoteNo, totalRefundAmount, sale.customerId, nowRegionalIso, nowRegionalIso]
      });
      batchStatements.push({
        sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?) WHERE id = ?`,
        args: [sale.customerId, sale.customerId]
      });
    } else {
      // Cash refund expense
      batchStatements.push({
        sql: `INSERT INTO Expense (id, type, category, amount, vatPaid, description, recordedBy, createdAt)
              VALUES (?, 'REFUND', 'CASH_REFUND', ?, 0.0, ?, ?, ?)`,
        args: [
          crypto.randomUUID(), totalRefundAmount,
          `Cash Refund for Invoice #${sale.invoiceNo} [${reason}] (Credit Note: ${creditNoteNo})`, processedBy, nowRegionalIso
        ]
      });
    }

    await db.batch(batchStatements, 'write');

    return c.json({
      success: true,
      refund: {
        id: refundId,
        invoiceNo: sale.invoiceNo,
        refundedAmount: totalRefundAmount,
        creditNoteNo,
        reason,
        destination,
        processedBy
      },
      creditNoteNo,
      refundedAmount: totalRefundAmount,
      destination,
      reason
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to process refund', details: err?.message }, 500);
  }
});

/**
 * List Refund History
 */
salesRouter.get('/refunds', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  try {
    const res = await db.execute({
      sql: `SELECT * FROM Refund WHERE tenantId = ? ORDER BY datetime(createdAt) DESC LIMIT 100`,
      args: [tenantId]
    });
    return c.json({ success: true, refunds: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch refunds', details: err?.message }, 500);
  }
});

/**
 * Fetch Today's Transactions for Drawer / Shift Review and Cashier Previous Bills (with optional Date Query)
 */
salesRouter.get('/today', async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const targetDate = c.req.query('date') || null;
  const limit = parseInt(c.req.query('limit') || '100', 10);

  let dateWhereClause;
  let dateArgs: any[];

  if (targetDate) {
    const { startIso, endIso } = getRegionalDayRange(targetDate);
    dateWhereClause = `((s.createdAt >= ? AND s.createdAt <= ?) OR (datetime(s.createdAt) >= datetime(?) AND datetime(s.createdAt) <= datetime(?)) OR (s.createdAt LIKE ?) OR (date(s.createdAt) = ?))`;
    dateArgs = [startIso, endIso, startIso, endIso, `${targetDate}%`, targetDate];
  } else {
    const { startIso } = getRegionalDayRange();
    dateWhereClause = `(s.createdAt >= ? OR datetime(s.createdAt) >= datetime(?))`;
    dateArgs = [startIso, startIso];
  }

  try {
    const res = await db.execute({
      sql: `SELECT s.*, 
                   COALESCE(
                     json_group_array(
                       CASE WHEN i.id IS NOT NULL THEN
                         json_object(
                           'id', i.id,
                           'saleId', i.saleId,
                           'productId', i.productId,
                           'quantity', i.quantity,
                           'qty', i.quantity,
                           'priceAtSale', i.priceAtSale,
                           'price', i.priceAtSale,
                           'sellingPrice', i.priceAtSale,
                           'unitPrice', i.priceAtSale,
                           'total_price', i.total_price,
                           'costAtSale', i.costAtSale,
                           'unitCost', i.costAtSale,
                           'name', COALESCE(p.name, 'Item #' || i.productId),
                           'productName', COALESCE(p.name, 'Item #' || i.productId),
                           'nameAr', p.name_ar,
                           'is_weighed_item', p.is_weighed_item,
                           'barcode', COALESCE(p.barcode, i.productId)
                         )
                       ELSE NULL END
                     ), '[]'
                   ) as items_json
            FROM Sale s
            LEFT JOIN SaleItem i ON s.id = i.saleId
            LEFT JOIN Product p ON i.productId = p.id OR i.productId = p.barcode
            WHERE ${dateWhereClause} 
              AND (s.tenantId = ? OR s.tenantId IS NULL)
              AND (s.storeId = ? OR ? = 'all' OR s.storeId IS NULL)
            GROUP BY s.id
            ORDER BY s.createdAt DESC
            LIMIT ?`,
      args: [...dateArgs, tenantId, storeId, storeId, limit]
    });

    const formattedSales = res.rows.map((row: any) => {
      let items = [];
      try {
        items = typeof row.items_json === 'string'
          ? JSON.parse(row.items_json).filter((it: any) => it && it.id !== null)
          : (Array.isArray(row.items_json) ? row.items_json : []);
      } catch {
        items = [];
      }
      return {
        ...row,
        items
      };
    });

    return c.json({ success: true, sales: formattedSales, count: formattedSales.length });
  } catch (err: any) {
    return c.json({ error: 'Failed to query today sales', details: err?.message }, 500);
  }
});

salesRouter.get('/history', async (c) => {
  return salesRouter.fetch(new Request(new URL(`/today${c.req.url.includes('?') ? c.req.url.substring(c.req.url.indexOf('?')) : ''}`, c.req.url).toString(), c.req.raw), c.env);
});

/**
 * Fetch Full Invoice Details by Invoice Number
 */
salesRouter.get('/invoice/:invoiceNo', async (c) => {
  const db = getDb(c.env);
  const invoiceNo = c.req.param('invoiceNo');

  try {
    const saleRes = await db.execute({
      sql: `SELECT s.*, c.name as customerName, c.phone as customerPhone, c.cpr as customerCpr
            FROM Sale s
            LEFT JOIN Customer c ON s.customerId = c.id
            WHERE s.invoiceNo = ? OR s.id = ? LIMIT 1`,
      args: [invoiceNo, invoiceNo]
    });

    if (!saleRes.rows || saleRes.rows.length === 0) {
      return c.json({ error: 'Invoice not found' }, 404);
    }

    const sale = saleRes.rows[0];
    const itemsRes = await db.execute({
      sql: `SELECT i.*, p.name, p.name as productName, p.barcode
            FROM SaleItem i
            LEFT JOIN Product p ON i.productId = p.id OR i.productId = p.barcode
            WHERE i.saleId = ?`,
      args: [sale.id]
    });

    const items = itemsRes.rows.map((item: any) => ({
      ...item,
      price: item.priceAtSale,
      sellingPrice: item.priceAtSale,
      unitPrice: item.priceAtSale,
      qty: item.quantity,
      total: item.total_price
    }));

    return c.json({ success: true, sale: { ...sale, items } });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch invoice', details: err?.message }, 500);
  }
});

/**
 * Query Highest Sequential Invoice Number for NBR Compliance
 */
salesRouter.get('/max-seq', async (c) => {
  const db = getDb(c.env);
  const storeId = c.req.query('storeId') || c.get('storeId');
  const terminalId = c.req.query('terminalId') || c.get('terminalId');

  try {
    const res = await db.execute({
      sql: `SELECT MAX(invoiceSeq) as maxSeq FROM Sale WHERE storeId = ? AND terminalId = ?`,
      args: [storeId, terminalId]
    });
    const maxSeq = (res.rows && res.rows[0] && typeof res.rows[0].maxSeq === 'number') ? res.rows[0].maxSeq : 0;
    return c.json({ success: true, maxSeq, storeId, terminalId });
  } catch {
    return c.json({ success: true, maxSeq: 0 });
  }
});
