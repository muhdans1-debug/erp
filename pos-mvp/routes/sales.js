import { SaleRepository } from '../repositories/SaleRepository.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../db.js';
import { managerAuth } from '../middleware/auth.js';
import { generateNextInvoiceNumber } from '../services/invoiceSequence.js';
import { ensureRegionalIso, getRegionalIsoString, getRegionalDayRange } from '../utils/time.js';
import { mirrorSaleToCloud } from '../services/cloudSync.js';

export default async function salesRoutes(fastify, options) {

  // 1. Sync Ingestion Route (Master Windows PC catches incoming sales & actively decrements inventory)
  const handleSyncSales = async (request, reply) => {
    const incoming = request.body;
    let sales = [];
    if (Array.isArray(incoming)) {
      sales = incoming;
    } else if (incoming?.sales && Array.isArray(incoming.sales)) {
      sales = incoming.sales;
    } else if (incoming && typeof incoming === 'object' && (incoming.id || incoming.invoiceNo)) {
      sales = [incoming];
    }

    if (!sales || !Array.isArray(sales) || sales.length === 0) {
      return { success: true, processed: 0 };
    }

    // Strict chronological ordering to eliminate running-balance inversion
    sales.sort((a, b) => new Date(a.createdAt || a.created_at || a.offlineTimestamp || 0).getTime() - new Date(b.createdAt || b.created_at || b.offlineTimestamp || 0).getTime());

    // 0ms Fast-Path: Quick check to filter out sales that were already ingested
    const salesToSync = [];
    for (const sale of sales) {
      if (!sale || !sale.id) continue;
      const providedInvoiceNo = sale.invoiceNo || sale.invoice_number;
      try {
        const existing = await db.execute({
          sql: 'SELECT id FROM Sale WHERE id = ? OR invoiceNo = ? LIMIT 1',
          args: [sale.id, providedInvoiceNo || '']
        });
        if (!existing.rows || existing.rows.length === 0) {
          salesToSync.push(sale);
        }
      } catch {
        salesToSync.push(sale); // If check fails, keep in queue to be safe
      }
    }

    if (salesToSync.length === 0) {
      return { success: true, processed: 0, message: 'All sales already synced' };
    }

    // Open a secure transaction so partial failures roll back completely
    const transaction = await db.transaction();
    const affectedCustomerIds = new Set();

    try {
      let processedCount = 0;
      for (const sale of salesToSync) {
        if (!sale || !sale.id) continue;

        const providedInvoiceNo = sale.invoiceNo || sale.invoice_number;

        // Strictly preserve and enforce the terminal's sequential NBR Article 53 invoice number
        const invoiceNo = providedInvoiceNo || `INV-${Date.now()}`;
        const total = Number(sale.total || sale.totalAmount || 0);
        const subtotal = Number(sale.subtotal || total);

        // Process line items AND deduct master inventory
        const items = (Array.isArray(sale.items) && sale.items.length > 0)
          ? sale.items
          : (Array.isArray(sale.cart) && sale.cart.length > 0 ? sale.cart : []);

        // Guard against corrupted mock / zero-price dummy records
        if (total <= 0 && items.length === 0) {
          fastify.log.warn(`[Sync Sales] Skipping empty phantom sale: ${sale.id} (${invoiceNo})`);
          continue;
        }

        const paymentType = sale.paymentType || sale.payment_type || 'CASH';
        const status = sale.status || 'COMPLETED';
        let rawTimestamp = sale.createdAt || sale.created_at || sale.offlineTimestamp;
        const serverNow = Date.now();
        const incomingEpoch = rawTimestamp ? new Date(rawTimestamp).getTime() : serverNow;
        if (!isNaN(incomingEpoch)) {
          // If sale timestamp is in the future (> 2 minutes) or from a dead CMOS battery (> 30 days old):
          if (incomingEpoch > serverNow + 120000) {
            fastify.log.warn(`⚠️ [Clock Skew Guard] Sale ${sale.id} (${invoiceNo}) timestamp is in the future (${rawTimestamp}). Clamping to server time.`);
            rawTimestamp = getRegionalIsoString(serverNow);
          } else if (serverNow - incomingEpoch > 30 * 86400000) {
            fastify.log.warn(`⚠️ [Clock Skew Guard] Sale ${sale.id} (${invoiceNo}) timestamp has ancient clock drift (${rawTimestamp}). Re-anchoring to server time.`);
            rawTimestamp = getRegionalIsoString(serverNow);
          }
        }
        const createdAt = ensureRegionalIso(rawTimestamp);
        const customerId = sale.customerId || sale.khata_id || null;
        const employeeId = sale.employeeId || sale.employee_id || null;
        const shiftId = sale.shiftId || sale.shift_id || null;
        const terminalId = sale.terminalId || sale.terminal_id || 'T1';
        const storeId = sale.storeId || sale.store_id || 'store_askar_01';

        // Insert the main receipt header
        await transaction.execute({
          sql: `INSERT INTO Sale (id, invoiceNo, total, subtotal, paymentType, status, syncStatus, customerId, employeeId, shiftId, createdAt, terminalId, storeId) 
                VALUES (?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING`,
          args: [sale.id, invoiceNo, total, subtotal, paymentType, status, customerId, employeeId, shiftId, createdAt, terminalId, storeId]
        });

        // Record Khata ledger and update customer balance if offline credit transaction
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
          // Resolve Mess Group and split across registered members
          let targetMessId = sale.messId || sale.mess_id;
          if (!targetMessId && customerId) {
            try {
              const cCheck = await transaction.execute({
                sql: 'SELECT mess_id FROM Customer WHERE id = ? LIMIT 1',
                args: [customerId]
              });
              if (cCheck.rows && cCheck.rows.length > 0 && cCheck.rows[0].mess_id) {
                targetMessId = cCheck.rows[0].mess_id;
              }
            } catch {}
          }

          let groupName = 'Mess Group';
          let memberRows = [];
          if (targetMessId) {
            try {
              const gRes = await transaction.execute({
                sql: 'SELECT group_name FROM MessGroup WHERE id = ? LIMIT 1',
                args: [targetMessId]
              });
              if (gRes.rows && gRes.rows.length > 0) {
                groupName = gRes.rows[0].group_name || groupName;
              }
              const mRes = await transaction.execute({
                sql: 'SELECT id, name FROM Customer WHERE mess_id = ? AND (is_active = 1 OR is_active IS NULL)',
                args: [targetMessId]
              });
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

              await transaction.execute({
                sql: `INSERT INTO KhataLedger (
                  id, tenantId, customerId, amount, type, reference, running_balance,
                  syncStatus, timestamp, created_at
                ) VALUES (?, 'tenant_askar_01', ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?)
                ON CONFLICT(id) DO NOTHING`,
                args: [ledgerId, member.id, memberCharge, ledgerRef, createdAt, createdAt],
              });

              affectedCustomerIds.add(member.id);
            }
          } else if (customerId) {
            // Fallback to single customer if group has no registered members
            const deterministicLedgerId = `tx_inv_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            await transaction.execute({
              sql: `INSERT INTO KhataLedger (
                id, tenantId, customerId, amount, type, reference, running_balance,
                syncStatus, timestamp, created_at
              ) VALUES (?, 'tenant_askar_01', ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?)
              ON CONFLICT(id) DO NOTHING`,
              args: [deterministicLedgerId, customerId, total, invoiceNo, createdAt, createdAt],
            });
            affectedCustomerIds.add(customerId);
          }
        } else if (customerId && isCreditSale) {
          const deterministicLedgerId = `tx_inv_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

          await transaction.execute({
            sql: `INSERT INTO KhataLedger (
              id, tenantId, customerId, amount, type, reference, running_balance,
              syncStatus, timestamp, created_at
            ) VALUES (?, 'tenant_askar_01', ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?)
            ON CONFLICT(id) DO NOTHING`,
            args: [deterministicLedgerId, customerId, total, invoiceNo, createdAt, createdAt],
          });

          affectedCustomerIds.add(customerId);
        }

        for (const item of items) {
          const itemId = item.id || crypto.randomUUID();
          const prodId = item.productId || item.product_id || item.id;
          const qty = Number(item.qty ?? item.quantity ?? 1);
          let price = Number(item.priceAtSale ?? item.sellingPrice ?? item.price ?? item.unitPrice ?? 0);

          // If price was omitted from client payload, recover catalog price from Product table
          if (price <= 0 && prodId) {
            try {
              const pLookup = await transaction.execute({
                sql: 'SELECT sellingPrice, purchasePrice, unitCost, vatRate, taxRate FROM Product WHERE id = ? OR barcode = ? LIMIT 1',
                args: [prodId, prodId]
              });
              if (pLookup.rows && pLookup.rows.length > 0 && pLookup.rows[0].sellingPrice) {
                price = Number(pLookup.rows[0].sellingPrice);
              }
            } catch {}
          }

          const totalPrice = Number((item.total_price ?? (qty * price)).toFixed(3));
          const vatRate = item.vatRateAtSale !== undefined ? Number(item.vatRateAtSale) : (item.vatRate !== undefined ? Number(item.vatRate) : 10.0);
          const vatAmount = Number((item.vatAmount ?? (vatRate === 10 ? (totalPrice - (totalPrice / 1.10)) : 0)).toFixed(3));
          const costPrice = Number(item.costAtSale ?? item.unitCost ?? item.purchasePrice ?? 0);

          // Auto-register missing product from offline sales to satisfy Foreign Key constraint
          if (prodId) {
            const prodExists = await transaction.execute({
              sql: 'SELECT id FROM Product WHERE id = ? LIMIT 1',
              args: [prodId]
            });
            if (!prodExists.rows || prodExists.rows.length === 0) {
              const cartList = Array.isArray(sale.cart) ? sale.cart : [];
              const cartItem = cartList.find((c) => c && (c.id === prodId || c.productId === prodId)) || item;
              const prodName = cartItem.name || item.name || 'Quick / Produce Item';
              const prodPrice = Number(cartItem.price ?? cartItem.sellingPrice ?? price ?? 0);
              const isWeighed = cartItem.is_weighed_item ? 1 : 0;
              const cat = cartItem.category || 'PRODUCE';

              await transaction.execute({
                sql: `INSERT INTO Product (id, tenantId, name, purchasePrice, unitCost, sellingPrice, stockQuantity, taxRate, vatRate, category, is_weighed_item)
                      VALUES (?, 'tenant_askar_01', ?, ?, 0, ?, 0, 0.1, 10.0, ?, ?)
                      ON CONFLICT(id) DO NOTHING`,
                args: [prodId, prodName, Number((prodPrice * 0.7).toFixed(3)), prodPrice, cat, isWeighed]
              });
              fastify.log.info(`[Sync Sales] Auto-registered missing product from offline sale: ${prodId} (${prodName})`);
            }
          }

          // Insert or update the line item with complete normalized financial columns
          await transaction.execute({
            sql: `INSERT INTO SaleItem (id, saleId, productId, quantity, priceAtSale, costAtSale, vatRateAtSale, vatAmount, total_price, tenantId) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'tenant_askar_01')
                  ON CONFLICT(id) DO UPDATE SET 
                    quantity = excluded.quantity,
                    priceAtSale = excluded.priceAtSale,
                    costAtSale = excluded.costAtSale,
                    vatRateAtSale = excluded.vatRateAtSale,
                    vatAmount = excluded.vatAmount,
                    total_price = excluded.total_price`,
            args: [itemId, sale.id, prodId, qty, price, costPrice, vatRate, vatAmount, totalPrice]
          });

          // Actively deduct stock from the Master database
          if (prodId) {
            await transaction.execute({
              sql: `UPDATE Product 
                    SET stockQuantity = MAX(0, stockQuantity - ?) 
                    WHERE id = ? OR barcode = ?`,
              args: [qty, prodId, prodId]
            });
          }
        }
        processedCount++;
      }

      // Reconcile chronological running balances for all affected Khata customers
      for (const custId of affectedCustomerIds) {
        const ledgerRes = await transaction.execute({
          sql: `SELECT id, amount FROM KhataLedger 
                WHERE customerId = ? 
                ORDER BY datetime(COALESCE(created_at, timestamp, '1970-01-01')) ASC, rowid ASC`,
          args: [custId]
        });

        let running = 0;
        for (const entry of (ledgerRes.rows || [])) {
          running += Number(entry.amount || 0);
          await transaction.execute({
            sql: `UPDATE KhataLedger SET running_balance = ? WHERE id = ?`,
            args: [Number(running.toFixed(3)), entry.id]
          });
        }

        const finalBalance = Number(running.toFixed(3));
        await transaction.execute({
          sql: `UPDATE Customer SET balance = ? WHERE id = ?`,
          args: [finalBalance, custId]
        });

        if (fastify.websocketServer?.clients) {
          fastify.websocketServer.clients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'KHATA_BALANCE_UPDATED',
                customerId: custId,
                balance: finalBalance
              }));
            }
          });
        }
      }

      await transaction.commit();
      console.log(`✅ Synced ${processedCount} sales and reconciled running balances.`);

      // Asynchronously mirror synced sales to Turso Cloud (Zero-SPOF)
      for (const s of salesToSync) {
        if (s?.id) mirrorSaleToCloud(s.id).catch(() => {});
      }

      // Broadcast to active Fastify WebSocket clients
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) { // 1 = OPEN
            client.send(JSON.stringify({ 
              type: 'SALE_COMPLETED', 
              payload: { processed: processedCount }, 
              timestamp: new Date().toISOString() 
            }));
          }
        });
      }

      return { success: true, processed: processedCount };
    } catch (error) {
      await transaction.rollback();
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Sync failed, rolled back changes', details: error.message });
    }
  };

  fastify.post('/api/sync/sales', handleSyncSales);
  fastify.post('/api/sales/sync', handleSyncSales);

  // 2. Manager Secured Sales Reporting Endpoint (Supports Date-to-Date Filtering)
  fastify.get('/api/reports/sales', { preHandler: managerAuth }, async (request, reply) => {
    try {
      const { limit = 200, offset = 0, from, startDate, to, endDate } = request.query || {};
      const fromParam = from || startDate;
      const toParam = to || endDate;

      let sql = `SELECT s.*, c.name as customerName 
                 FROM Sale s 
                 LEFT JOIN Customer c ON s.customerId = c.id 
                 WHERE 1=1`;
      const args = [];

      if (fromParam) {
        const fromIso = fromParam.length === 10 ? `${fromParam}T00:00:00.000+03:00` : fromParam;
        sql += ` AND (s.createdAt >= ? OR datetime(s.createdAt) >= datetime(?))`;
        args.push(fromIso, fromIso);
      }
      if (toParam) {
        const toIso = toParam.length === 10 ? `${toParam}T23:59:59.999+03:00` : toParam;
        sql += ` AND (s.createdAt <= ? OR datetime(s.createdAt) <= datetime(?))`;
        args.push(toIso, toIso);
      }

      sql += ` ORDER BY s.createdAt DESC LIMIT ? OFFSET ?`;
      args.push(Number(limit), Number(offset));

      const salesResult = await db.execute({ sql, args });
      const rows = salesResult.rows || [];

      return { success: true, count: rows.length, sales: rows };
    } catch (err) {
      fastify.log.error('Failed to query sales report:', err);
      return reply.status(500).send({ error: 'Failed to retrieve sales report', message: err.message });
    }
  });

  // 2b. Query durable highest invoice sequence for gapless NBR Article 53 compliance
  fastify.get('/api/sales/max-seq', async (request, reply) => {
    try {
      const result = await db.execute("SELECT MAX(invoiceSeq) as maxSeq FROM Sale");
      const maxSeq = result.rows[0]?.maxSeq ? Number(result.rows[0].maxSeq) : 0;
      return { success: true, maxSeq };
    } catch (e) {
      return { success: false, maxSeq: 0 };
    }
  });

  // 3. Invoice Lookup by Invoice Number or ID
  fastify.get('/api/sales/invoice/:invoiceNo', async (request, reply) => {
    const { invoiceNo } = request.params;
    const cleanInv = String(invoiceNo || '').trim();

    try {
      let sale = await db.orm.Sale.where({ invoiceNo: cleanInv }).all().first();
      if (!sale) {
        const allSales = await db.orm.Sale.all();
        sale = allSales.find(
          (s) => (s.invoiceNo && s.invoiceNo.toLowerCase() === cleanInv.toLowerCase()) || s.id === cleanInv
        );
      }

      if (!sale) {
        return reply.status(404).send({ success: false, error: `Invoice #${cleanInv} not found.` });
      }

      // Fetch line items for this sale
      const allSaleItems = await db.orm.SaleItem.where({ saleId: sale.id }).all();
      const allProducts = await db.orm.Product.all();
      const prodMap = new Map(allProducts.map((p) => [p.id, p]));

      const items = allSaleItems.map((item) => {
        const prod = prodMap.get(item.productId);
        const price = Number(item.priceAtSale ?? item.unitPrice ?? item.price ?? item.sellingPrice ?? prod?.sellingPrice ?? 0);
        const qty = Number(item.quantity ?? item.qty ?? 1);
        const lineTotal = Number(item.total_price ?? (price * qty));
        return {
          ...item,
          price,
          unitPrice: price,
          sellingPrice: price,
          priceAtSale: price,
          quantity: qty,
          qty,
          total_price: lineTotal,
          total: lineTotal,
          productName: prod?.name || item.name || `Item #${item.productId}`,
          name: prod?.name || item.name || `Item #${item.productId}`,
          barcode: prod?.barcode || prod?.id,
          unitCost: Number(item.costAtSale ?? prod?.purchasePrice ?? prod?.unitCost ?? 0),
        };
      });

      // Customer details if Khata
      let customer = null;
      if (sale.customerId) {
        customer = await db.orm.Customer.where({ id: sale.customerId }).all().first();
      }

      // Prior refunds on this sale
      let priorRefunds = [];
      try {
        priorRefunds = await db.orm.Refund.where({ saleId: sale.id }).all();
      } catch {
        priorRefunds = [];
      }

      return {
        success: true,
        sale: {
          ...sale,
          items,
          customer,
          priorRefunds,
        },
      };
    } catch (error) {
      fastify.log.error('Failed to lookup invoice', error);
      return reply.status(500).send({ success: false, error: 'Failed to lookup invoice' });
    }
  });

  // --- Dedicated Mess Group Checkout ---
// Dedicated Split-Billing Checkout for Mess Groups
fastify.post('/api/sales/mess-checkout', async (request, reply) => {
  const { cart, items, subtotal, vat, vatTotal, totalVat, total, totalAmount, messId, cardUid, invoiceNo, cashierName, shopperName, shopperId } = request.body || {};

  try {
    const rawItems = items || cart || [];
    const finalTotal = Number((totalAmount !== undefined ? totalAmount : (total !== undefined ? total : 0)).toFixed(3));

    if (!messId) {
      return reply.status(400).send({ success: false, error: 'messId is required for Mess checkout' });
    }

    // 1. Fetch group & members
    let group = null;
    let memberRows = [];

    try {
      const gRes = await db.execute({ sql: `SELECT id, group_name FROM MessGroup WHERE id = ? LIMIT 1`, args: [messId] });
      group = (gRes.rows && gRes.rows.length > 0) ? gRes.rows[0] : null;
      if (group) {
        const mRes = await db.execute({
          sql: `SELECT DISTINCT c.id, c.name, c.phone, c.batchNo
                FROM Customer c
                JOIN MessMember mm ON c.id = mm.customer_id
                WHERE mm.mess_id = ? AND mm.is_active = 1
                UNION
                SELECT c.id, c.name, c.phone, c.batchNo
                FROM Customer c
                WHERE c.mess_id = ? AND NOT EXISTS (SELECT 1 FROM MessMember WHERE mess_id = ?)`,
          args: [messId, messId, messId]
        });
        memberRows = mRes.rows || [];
      }
    } catch { }

    if (!group || memberRows.length === 0) {
      return reply.status(400).send({ success: false, error: 'Mess group not found or has no active members' });
    }

    // 2. Mathematical equal split (formatted to 3 decimal places for Bahraini Dinars)
    const splitAmount = parseFloat((finalTotal / memberRows.length).toFixed(3));
    const remainder = parseFloat((finalTotal - (splitAmount * memberRows.length)).toFixed(3));

    // 3. Create Master Sale Record
    const saleId = crypto.randomUUID();
    const storeId = request.body?.storeId || '001';
    let finalInv = invoiceNo;
    let finalInvoiceSeq = undefined;
    if (!finalInv || finalInv.startsWith('INV-17')) {
      const { invoiceNo: genNo, invoiceSeq: genSeq } = await generateNextInvoiceNumber(storeId);
      finalInv = genNo;
      finalInvoiceSeq = genSeq;
    }

    let computedSubtotal = 0;
    let computedTotalVat = 0;
    const lineItems = rawItems.map((item) => {
      const safePrice = Math.max(0, Number(item.priceAtSale ?? item.sellingPrice ?? item.price ?? 0));
      const safeQty = Math.max(0.001, Number(item.quantity || item.qty || 1));
      const lineTotal = safePrice * safeQty;
      const rate = item.vatRateAtSale !== undefined ? Number(item.vatRateAtSale) : 10.0;
      let lineTax = 0;
      if (rate === 10) {
        lineTax = lineTotal - (lineTotal / 1.10);
        computedTotalVat += lineTax;
        computedSubtotal += (lineTotal - lineTax);
      } else {
        computedSubtotal += lineTotal;
      }
      return {
        id: crypto.randomUUID(),
        productId: item.productId || item.id,
        quantity: safeQty,
        priceAtSale: safePrice,
        costAtSale: Math.max(0, Number(item.costAtSale ?? item.purchasePrice ?? 0)),
        total_price: Number((safeQty * safePrice).toFixed(3)),
        vatRateAtSale: rate,
        vatAmount: Number(lineTax.toFixed(3))
      };
    });

    const finalSub = Number((subtotal !== undefined ? subtotal : computedSubtotal).toFixed(3));
    const finalVat = Number((totalVat !== undefined ? totalVat : computedTotalVat).toFixed(3));

    // 4. Atomically Create Master Sale AND Post Split Charges inside a Single Transaction
    const memberSplits = [];
    let verifiedInvoiceNo = finalInv;

    await db.transaction(async (tx) => {
      const saleResult = await SaleRepository.createSale({
        id: saleId,
        invoiceNo: finalInv,
        invoiceSeq: finalInvoiceSeq,
        customerId: null,
        subtotal: finalSub,
        vatTotal: finalVat,
        totalVat: finalVat,
        total: finalTotal,
        totalAmount: finalTotal,
        paymentType: 'MESS_KHATA',
        createdAt: getRegionalIsoString()
      }, lineItems);

      verifiedInvoiceNo = saleResult.invoiceNo || finalInv;
      const shopperTag = shopperName ? ` (Shopper: ${shopperName})` : '';

      for (let i = 0; i < memberRows.length; i++) {
        const member = memberRows[i];
        const memberCharge = parseFloat((i === 0 ? splitAmount + remainder : splitAmount).toFixed(3));
        const ledgerRef = `Mess Split: ${group.group_name} (${memberRows.length} members)${shopperTag} - ${verifiedInvoiceNo}`;

        const ledgerEntryId = crypto.randomUUID();
        try {
          await tx.execute({
            sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, syncStatus, timestamp, tenantId, mess_id, sale_id, group_total, member_count)
                  VALUES (?, ?, ?, 'CHARGE', ?, 'SYNCED', ?, 'tenant_1', ?, ?, ?, ?)`,
            args: [ledgerEntryId, member.id, memberCharge, ledgerRef, getRegionalIsoString(), messId, saleId, finalTotal, memberRows.length]
          });
        } catch {
          await tx.orm.KhataLedger.create({
            id: ledgerEntryId,
            customerId: member.id,
            amount: memberCharge,
            type: 'CHARGE',
            reference: ledgerRef,
            syncStatus: 'SYNCED',
            timestamp: getRegionalIsoString(),
            tenantId: 'tenant_1'
          });
        }

        await tx.execute({
          sql: `UPDATE Customer SET balance = COALESCE(balance, 0) + ?, updatedAt = datetime('now') WHERE id = ?`,
          args: [memberCharge, member.id]
        });

        memberSplits.push({
          id: member.id,
          name: member.name,
          amount: memberCharge
        });
      }
    });

    return {
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
    };
  } catch (err) {
    fastify.log.error(err);
    reply.status(500).send({ success: false, error: err.message || 'Mess checkout failed' });
  }
});

// (Note: Customer card binding & Khata settlement are now served modularly via routes/khata.js)
// 3. Updated Checkout & Sales Routes (Bahrain VAT Compliant Per-Item Calculation)
const handleCheckout = async (request, reply) => {
  const { cart, items, subtotal, vat, vatTotal, totalVat, total, totalAmount, customerId, paymentType, invoiceNo, id, employeeId, shiftId } = request.body || {};

  try {
    const saleId = id || crypto.randomUUID();
    const rawItems = items || cart || [];

    // 1. Fetch catalog data to verify prices server-side
    const productLookupIds = rawItems
      .map(item => item.productId || item.id)
      .filter(Boolean);

    let productMap = new Map();
    if (productLookupIds.length > 0) {
      try {
        const placeholders = productLookupIds.map(() => '?').join(',');
        const dbProducts = await db.execute({
          sql: `SELECT id, barcode, name, sellingPrice, vatRate, taxRate, purchasePrice, unitCost 
                FROM Product 
                WHERE id IN (${placeholders}) OR barcode IN (${placeholders})`,
          args: [...productLookupIds, ...productLookupIds]
        });
        if (dbProducts.rows) {
          for (const p of dbProducts.rows) {
            productMap.set(String(p.id), p);
            if (p.barcode) {
              productMap.set(String(p.barcode), p);
            }
          }
        }
      } catch (err) {
        fastify.log.warn(`[handleCheckout] Catalog lookup warning: ${err.message}`);
      }
    }

    // Check manager authorization if price overrides or custom discounts are present
    const managerPin = request.headers['x-manager-pin'] || request.body?.managerPin || request.body?.pin;
    let isManagerAuthorized = false;
    if (managerPin && process.env.MANAGER_PIN_HASH) {
      isManagerAuthorized = await bcrypt.compare(String(managerPin).trim(), process.env.MANAGER_PIN_HASH.trim()).catch(() => false);
    }

    // Calculate line-item VAT and extract inclusive 10% VAT vs 0% zero-rated
    let computedSubtotal = 0;
    let computedTotalVat = 0;
    let computedFinalTotal = 0;

    const lineItems = rawItems.map((item) => {
      // Strict validation to prevent negative injection tampering
      const safeQty = Math.max(0.001, Number(item.quantity || item.qty || 1));
      let safePrice = Math.max(0, Number(item.priceAtSale ?? item.sellingPrice ?? item.price ?? 0));

      const rawPid = item.productId || item.id;
      const dbProd = rawPid ? productMap.get(String(rawPid)) : null;

      // Price cross-reference against catalog to prevent price tampering
      if (dbProd && dbProd.sellingPrice !== undefined && dbProd.sellingPrice !== null) {
        const catalogPrice = Number(dbProd.sellingPrice);
        if (Math.abs(safePrice - catalogPrice) > 0.001) {
          if (!isManagerAuthorized) {
            fastify.log.warn(`[handleCheckout] Price tampering prevented for ${rawPid}: client requested BD ${safePrice}, enforced catalog BD ${catalogPrice}`);
            safePrice = catalogPrice;
          }
        }
      } else if (!dbProd && !isManagerAuthorized) {
        if (safePrice <= 0) {
          throw new Error(`Custom line item "${item.name || 'Custom Item'}" requires manager PIN authorization.`);
        }
      }

      const lineTotal = safePrice * safeQty;
      computedFinalTotal += lineTotal;

      // Determine VAT rate (0% for basic food items, 10% standard rate)
      let rate = 10.0;
      if (dbProd && (dbProd.vatRate !== null && dbProd.vatRate !== undefined)) {
        rate = Number(dbProd.vatRate);
      } else if (dbProd && (dbProd.taxRate !== null && dbProd.taxRate !== undefined)) {
        rate = dbProd.taxRate === 0 ? 0.0 : 10.0;
      } else if (item.vatRateAtSale !== undefined) {
        rate = Number(item.vatRateAtSale);
      } else if (item.vatRate !== undefined) {
        rate = Number(item.vatRate);
      } else if (item.taxRate !== undefined && item.taxRate === 0) {
        rate = 0.0;
      }

      let lineTax = 0;
      if (rate === 10) {
        // Shelf prices in Bahrain retail are Tax-Inclusive: Price - (Price / 1.10)
        lineTax = lineTotal - (lineTotal / 1.10);
        computedTotalVat += lineTax;
        computedSubtotal += (lineTotal - lineTax);
      } else {
        // Zero-Rated 0% (Basic food items: milk, bread, produce, meat)
        computedSubtotal += lineTotal;
      }

      const costPrice = dbProd
        ? Math.max(0, Number(dbProd.purchasePrice ?? dbProd.unitCost ?? 0))
        : Math.max(0, Number(item.costAtSale ?? item.purchasePrice ?? 0));

      return {
        id: crypto.randomUUID(),
        productId: rawPid || null,
        quantity: safeQty,
        priceAtSale: safePrice,
        costAtSale: costPrice,
        total_price: Number((safeQty * safePrice).toFixed(3)),
        vatRateAtSale: rate,
        vatAmount: Number(lineTax.toFixed(3)),
      };
    });

    const finalSubtotal = Number(computedSubtotal.toFixed(3));
    const finalTotalVat = Number(computedTotalVat.toFixed(3));
    const finalTotal = Number(computedFinalTotal.toFixed(3));

    // Resolve effective shift ID: always bind to active OPEN shift
    let effectiveShiftId = shiftId;
    try {
      const activeShift = await db.orm.Shift.where({ status: 'OPEN' }).all().first();
      if (activeShift) {
        effectiveShiftId = activeShift.id;
      } else {
        const openSession = await queryLocalDevDb(`SELECT id FROM ShiftSession WHERE status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`);
        if (openSession && openSession.length > 0) {
          effectiveShiftId = openSession[0].id;
        }
      }
    } catch (err) { }

    const storeId = request.body?.storeId || '001';
    let assignedInvoiceNo = invoiceNo;
    let assignedInvoiceSeq = undefined;
    // If no valid client-assigned invoice, let SaleRepository.createSale atomically assign gapless sequence inside transaction (NBR Article 53)
    if (assignedInvoiceNo && (assignedInvoiceNo.startsWith('INV-17') || assignedInvoiceNo.includes('NaN') || assignedInvoiceNo === '0')) {
      assignedInvoiceNo = undefined;
    }

    const saleData = {
      id: saleId,
      invoiceNo: assignedInvoiceNo,
      invoiceSeq: assignedInvoiceSeq,
      customerId: customerId || null,
      subtotal: finalSubtotal,
      vatTotal: finalTotalVat,
      totalVat: finalTotalVat,
      total: finalTotal,
      totalAmount: finalTotal,
      paymentType: paymentType || 'CASH',
      employeeId: employeeId || null,
      shiftId: effectiveShiftId || shiftId || null,
      terminalId: request.body?.terminalId || request.body?.terminal_id || 'T1',
      storeId: request.body?.storeId || request.body?.store_id || 'store_askar_01',
      createdAt: getRegionalIsoString(),
    };

    const result = await SaleRepository.createSale(saleData, lineItems);

    // 1. Broadcast SALE_COMPLETED to all active Fastify WebSocket clients (Manager Dashboard, secondary POS)
    if (fastify.websocketServer?.clients) {
      fastify.websocketServer.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'SALE_COMPLETED',
            payload: {
              id: result.id,
              invoiceNo: result.invoiceNo,
              total: finalTotal,
              paymentType: saleData.paymentType || 'CASH',
              customerId: saleData.customerId || null
            },
            timestamp: new Date().toISOString()
          }));
        }
      });
    }

    // 2. Broadcast atomic Khata balance delta to all connected POS registers
    if (saleData.customerId && ['CREDIT', 'NFC_CREDIT', 'MESS_KHATA'].includes(saleData.paymentType)) {
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'KHATA_BALANCE_UPDATED',
              customerId: saleData.customerId,
              delta: finalTotal
            }));
          }
        });
      }
    }

    // 3. Asynchronous background mirror to Turso Cloud (Zero-SPOF, non-blocking)
    mirrorSaleToCloud(result.id).catch((err) => {
      fastify.log.warn(`[CloudSync] Mirror sale deferred: ${err.message}`);
    });

    return {
      success: true,
      invoice: result.invoiceNo,
      invoiceNo: result.invoiceNo,
      invoiceNumber: result.invoiceSeq || 0,
      formattedInvoice: result.invoiceNo,
      subtotal: finalSubtotal,
      totalVat: finalTotalVat,
      totalAmount: finalTotal
    };
  } catch (error) {
    fastify.log.error(error);
    reply.status(500).send({ success: false, error: `Database write failed: ${error?.message || error}` });
  }
};

fastify.post('/checkout', handleCheckout);
fastify.post('/api/sales', handleCheckout);

  // --- Refunds, Voiding & Today Sales ---
// 2. Process Item Return & Refund Transaction (Protected by Manager Auth)
const handleRefundSale = async (request, reply) => {
  const { invoiceNo, items, reason, destination, processedBy } = request.body || {};

  if (!invoiceNo) {
    return reply.status(400).send({ success: false, error: 'Invoice number is required.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return reply.status(400).send({ success: false, error: 'At least one item must be selected for return.' });
  }

  const cleanInv = String(invoiceNo).trim();

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Locate the original sale via atomic, indexed seek
      let sale = null;
      const exactRes = await tx.execute({
        sql: `SELECT * FROM Sale WHERE UPPER(invoiceNo) = UPPER(?) OR id = ? LIMIT 1`,
        args: [cleanInv, cleanInv]
      });

      if (exactRes.rows && exactRes.rows.length > 0) {
        sale = exactRes.rows[0];
      }

      if (!sale) {
        throw new Error(`Invoice #${cleanInv} not found in database.`);
      }

      // 2. Calculate refund amount & validate items
      let totalRefundAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const qty = Math.max(1, parseInt(item.quantity) || 1);
        const unitPrice = Number(item.unitPrice || item.priceAtSale || 0);
        const lineTotal = Number((qty * unitPrice).toFixed(3));
        totalRefundAmount += lineTotal;

        const isDamaged = Boolean(item.isDamaged || reason === 'DAMAGED' || reason === 'EXPIRED');

        processedItems.push({
          saleItemId: item.saleItemId || null,
          productId: item.productId,
          productName: item.productName || 'Returned Item',
          quantity: qty,
          unitPrice,
          totalAmount: lineTotal,
          isDamaged,
        });

        // 3. Stock routing: Restock OR route to WastageLog
        const prod = await tx.orm.Product.where({ id: item.productId }).all().first();
        const wholesaleCost = Number(prod?.purchasePrice || prod?.unitCost || 0);

        if (isDamaged) {
          // Routed to WastageLog (spoilage loss registered, not added to shelf stock)
          await tx.orm.WastageLog.create({
            id: crypto.randomUUID(),
            tenantId: sale.tenantId || 'tenant_1',
            productId: item.productId,
            productName: item.productName || prod?.name || 'Damaged Return',
            quantity: qty,
            unitCost: wholesaleCost,
            totalLoss: Number((wholesaleCost * qty).toFixed(3)),
            reason: reason || 'DAMAGED',
            loggedBy: processedBy || 'Cashier Return',
            createdAt: new Date(),
          });
        } else {
          // Routed back to physical stock (Atomic relative update)
          if (prod) {
            await tx.execute({
              sql: `UPDATE Product SET stockQuantity = stockQuantity + ?, updatedAt = datetime('now') WHERE id = ?`,
              args: [qty, prod.id]
            });
          }
        }
      }

      totalRefundAmount = Number(totalRefundAmount.toFixed(3));
      const refundId = crypto.randomUUID();
      const creditNoteNo = `CN-${String(sale.invoiceNo).replace(/^INV-?/i, '')}-${Date.now().toString().slice(-4)}`;
      const refundReason = reason || 'MISTAKE';
      const refundDest = destination || (sale.paymentType === 'CREDIT' ? 'KHATA_CREDIT' : 'CASH');

      // 4. Create master Refund record
      const refundRecord = await tx.orm.Refund.create({
        id: refundId,
        tenantId: sale.tenantId || 'tenant_1',
        saleId: sale.id,
        invoiceNo: sale.invoiceNo,
        refundedAmount: totalRefundAmount,
        reason: refundReason,
        destination: refundDest,
        itemsJson: JSON.stringify(processedItems),
        processedBy: processedBy || 'Cashier',
        createdAt: new Date(),
      });

      // 5. Create granular RefundItem records
      for (const pi of processedItems) {
        await tx.orm.RefundItem.create({
          id: crypto.randomUUID(),
          tenantId: sale.tenantId || 'tenant_1',
          refundId,
          saleItemId: pi.saleItemId,
          productId: pi.productId,
          productName: pi.productName,
          quantity: pi.quantity,
          unitPrice: pi.unitPrice,
          totalAmount: pi.totalAmount,
          isDamaged: pi.isDamaged ? 1 : 0,
        });
      }

      // 6. Handle financial destination: Deduct from Day's Cash OR credit Khata account
      if (refundDest === 'KHATA_CREDIT' && sale.customerId) {
        // Customer account credit: append negative ledger entry to reduce debt
        await tx.orm.KhataLedger.create({
          id: crypto.randomUUID(),
          tenantId: sale.tenantId || 'tenant_1',
          customerId: sale.customerId,
          amount: -totalRefundAmount,
          type: 'PAYMENT_IN',
          syncStatus: 'PENDING',
          timestamp: new Date(),
        });
        await tx.execute({
          sql: `UPDATE Customer SET balance = MAX(0, balance - ?), updatedAt = datetime('now') WHERE id = ?`,
          args: [totalRefundAmount, sale.customerId]
        });
      } else {
        // Cash refund: deduct from drawer by logging cash payout expense
        await tx.orm.Expense.create({
          id: crypto.randomUUID(),
          type: 'BUSINESS',
          category: 'REFUND_PAYOUT',
          amount: totalRefundAmount,
          description: `Cash Refund for Invoice #${sale.invoiceNo} [${refundReason}] (Credit Note: ${creditNoteNo})`,
          recordedBy: processedBy || 'Cashier',
          createdAt: new Date(),
        });
      }

      return {
        refund: refundRecord,
        creditNoteNo,
        refundedAmount: totalRefundAmount,
        items: processedItems,
        sale,
        destination: refundDest,
        reason: refundReason,
      };
    });

    console.log(
      `↩️ Refund Processed: Invoice #${invoiceNo} -> Credit Note ${result.creditNoteNo} (BD ${result.refundedAmount}) via ${result.destination}`
    );
    return {
      success: true,
      message: 'Refund processed, stock adjusted, and financial ledger updated.',
      ...result,
    };
  } catch (error) {
    fastify.log.error('Refund transaction failed', error);
    return reply.status(500).send({ success: false, error: error.message || 'Refund processing failed.' });
  }
};

fastify.post('/api/sales/refund', { preHandler: managerAuth }, handleRefundSale);
fastify.post('/api/refund', { preHandler: managerAuth }, handleRefundSale);

// 3. Fetch all refund history
fastify.get('/api/sales/refunds', async () => {
  try {
    const allRefunds = await db.orm.Refund.all();
    allRefunds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { success: true, refunds: allRefunds };
  } catch (error) {
    return { success: false, refunds: [] };
  }
});

// --- BAHRAIN NBR VAT COMPLIANT VOID & CREDIT NOTE ENGINE ---

// 1. Fetch Today's Completed & Voided Transactions for the Manager's Order History Drawer and Cashier Previous Bills (Optimized Single SQL Query with Date Filtering)
const handleGetTodaySales = async (req, reply) => {
  try {
    const targetDate = req.query?.date || null;
    const limit = parseInt(req.query?.limit, 10) || 100;

    let dateWhereClause;
    let queryArgs;

    if (targetDate) {
      const { startIso, endIso } = getRegionalDayRange(targetDate);
      dateWhereClause = `WHERE (
        (s.createdAt >= ? AND s.createdAt <= ?)
        OR (datetime(s.createdAt) >= datetime(?) AND datetime(s.createdAt) <= datetime(?))
        OR (s.createdAt LIKE ?)
        OR (date(s.createdAt) = ?)
      )`;
      queryArgs = [startIso, endIso, startIso, endIso, `${targetDate}%`, targetDate];
    } else {
      const { startIso } = getRegionalDayRange();
      dateWhereClause = `WHERE (s.createdAt >= ? OR datetime(s.createdAt) >= datetime(?))`;
      queryArgs = [startIso, startIso];
    }

    const salesRes = await db.execute({
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
            ${dateWhereClause}
            GROUP BY s.id
            ORDER BY s.createdAt DESC
            LIMIT ?`,
      args: [...queryArgs, limit]
    });

    const populated = (salesRes.rows || []).map((sale) => {
      let items = [];
      try {
        if (sale.items_json) {
          const parsed = JSON.parse(sale.items_json);
          items = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        }
      } catch {
        items = [];
      }
      return {
        ...sale,
        status: sale.status || 'COMPLETED',
        items
      };
    });

    return { success: true, sales: populated, count: populated.length, targetDate: targetDate || 'today' };
  } catch (err) {
    req.log.error(err, 'Failed to fetch sales by date');
    return reply.status(500).send({ success: false, error: err.message });
  }
};

fastify.get('/sales/today', handleGetTodaySales);
fastify.get('/api/sales/today', handleGetTodaySales);
fastify.get('/api/sales/history', handleGetTodaySales);

// 2. Void & Re-ring / Credit Note Reversal Endpoint
const handleVoidSale = async (req, reply) => {
  const { id } = req.params;
  const cleanId = String(id || '').trim();

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Find the original sale via atomic, indexed seek (<5ms without locking DB)
      let sale = null;
      const exactRes = await tx.execute({
        sql: `SELECT * FROM Sale WHERE UPPER(invoiceNo) = UPPER(?) OR id = ? OR CAST(invoiceSeq AS TEXT) = ? LIMIT 1`,
        args: [cleanId, cleanId, cleanId]
      });

      if (exactRes.rows && exactRes.rows.length > 0) {
        sale = exactRes.rows[0];
      }

      if (!sale) {
        throw new Error(`Sale with ID/Invoice #${cleanId} not found`);
      }

      if (sale.status === 'VOIDED') {
        throw new Error(`Invoice #${sale.invoiceNo} has already been voided.`);
      }

      // 2. Mark the sale as VOIDED (soft-update preserves gapless sequential audit trail for NBR)
      const voidedSale = await tx.orm.Sale.where({ id: sale.id }).update({
        status: 'VOIDED',
      });

      // 3. Fetch sale items and restore physical stock without dumping all products
      const saleItems = await tx.orm.SaleItem.where({ saleId: sale.id }).all();

      const restoredProducts = [];
      for (const item of saleItems) {
        const qty = Number(item.quantity) || 1;
        const prodRes = await tx.execute({
          sql: `SELECT id, name, barcode, stockQuantity FROM Product WHERE id = ? OR barcode = ? LIMIT 1`,
          args: [item.productId, item.productId]
        });
        const prod = prodRes.rows?.[0];

        if (prod) {
          await tx.execute({
            sql: `UPDATE Product SET stockQuantity = stockQuantity + ?, updatedAt = datetime('now') WHERE id = ?`,
            args: [qty, prod.id]
          });
          const newStock = (Number(prod.stockQuantity) || 0) + qty;
          restoredProducts.push({
            id: prod.id,
            name: prod.name,
            barcode: prod.barcode,
            restoredQty: qty,
            newStock,
          });
        }
      }

      // 4. Reverse Customer Khata debt if charged to credit
      if (sale.customerId && (sale.paymentType === 'CREDIT' || sale.paymentType === 'NFC_CREDIT')) {
        const debtReversal = Number(sale.total) || 0;
        await tx.orm.KhataLedger.create({
          id: crypto.randomUUID(),
          tenantId: sale.tenantId || 'tenant_1',
          customerId: sale.customerId,
          amount: -debtReversal,
          type: 'PAYMENT_IN',
          syncStatus: 'PENDING',
          timestamp: new Date(),
        });
        await tx.execute({
          sql: `UPDATE Customer SET balance = MAX(0, balance - ?), updatedAt = datetime('now') WHERE id = ?`,
          args: [debtReversal, sale.customerId]
        });
      }

      // 5. Generate and record official Bahrain NBR Credit Note
      const creditNoteNo = `CN-${String(sale.invoiceNo).replace(/^INV-?/i, '')}-${Date.now().toString().slice(-4)}`;
      const creditNote = await tx.orm.Refund.create({
        id: crypto.randomUUID(),
        tenantId: sale.tenantId || 'tenant_1',
        saleId: sale.id,
        invoiceNo: sale.invoiceNo,
        refundedAmount: Number(sale.totalAmount || sale.total || 0),
        reason: 'VOID_AND_RE_RING',
        destination: sale.paymentType || 'CASH',
        itemsJson: JSON.stringify(saleItems),
        processedBy: 'Authorized Manager (Void & Re-ring)',
        createdAt: new Date(),
      });

      return {
        voidedSale: {
          ...voidedSale,
          status: 'VOIDED',
          invoiceNo: sale.invoiceNo,
          totalAmount: sale.totalAmount || sale.total,
          vatAmount: sale.totalVat || sale.vatTotal || 0,
          items: saleItems,
        },
        creditNote: {
          id: creditNote.id,
          creditNoteNo,
          invoiceNo: sale.invoiceNo,
          totalRefunded: Number(sale.totalAmount || sale.total || 0),
          vatReversed: Number(sale.totalVat || sale.vatTotal || 0),
          date: new Date().toISOString(),
        },
        restoredProducts,
      };
    });

    return reply.send({
      success: true,
      message: `Sale #${result.voidedSale.invoiceNo} successfully voided and inventory restored.`,
      result: result.voidedSale,
      creditNote: result.creditNote,
      restoredProducts: result.restoredProducts,
    });
  } catch (err) {
    req.log.error(err, 'Failed to void sale');
    return reply.status(500).send({ success: false, error: err.message });
  }
};

fastify.post('/sales/:id/void', { preHandler: managerAuth }, handleVoidSale);
fastify.post('/api/sales/:id/void', { preHandler: managerAuth }, handleVoidSale);
}
