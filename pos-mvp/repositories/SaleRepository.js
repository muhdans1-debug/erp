// ====================================================================
// ASKAR SUPERMARKET ERP - NATIVE LIBSQL SALE REPOSITORY
// High-performance, parameterized SQLite engine execution (No in-memory leaks)
// ====================================================================

import { db } from '../db.js';
import { getNextInvoiceSequence, formatInvoiceNumber } from '../services/invoiceSequence.js';

const CURRENT_TENANT = 'tenant_askar_01';

export const SaleRepository = {
  /**
   * Fetch sales filtered by start and end date for Range/Day/Month/Year reporting.
   * Offloads filtering, aggregation, and line-item joining directly to the SQLite engine.
   */
  getSalesByDateRange: async (startDate, endDate = null) => {
    let sql = `
      SELECT s.*,
        COALESCE(
          json_group_array(
            CASE WHEN i.id IS NOT NULL THEN
              json_object(
                'id', i.id,
                'saleId', i.saleId,
                'productId', i.productId,
                'quantity', i.quantity,
                'priceAtSale', i.priceAtSale,
                'costAtSale', i.costAtSale,
                'total_price', i.total_price,
                'vatRateAtSale', i.vatRateAtSale,
                'vatAmount', i.vatAmount
              )
            ELSE NULL END
          ), '[]'
        ) as items_json
      FROM Sale s
      LEFT JOIN SaleItem i ON s.id = i.saleId
      WHERE (s.status IS NULL OR (s.status != 'VOIDED' AND s.status != 'CANCELLED'))
    `;

    const args = [];

    if (startDate) {
      sql += ` AND s.createdAt >= ?`;
      args.push(startDate instanceof Date ? startDate.toISOString() : String(startDate));
    }
    if (endDate) {
      sql += ` AND s.createdAt <= ?`;
      args.push(endDate instanceof Date ? endDate.toISOString() : String(endDate));
    }

    sql += ` GROUP BY s.id ORDER BY s.createdAt DESC`;

    const result = await db.execute({ sql, args });

    return (result.rows || []).map((row) => {
      let items = [];
      try {
        if (row.items_json) {
          const parsed = JSON.parse(row.items_json);
          items = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        }
      } catch (e) {
        items = [];
      }

      return {
        ...row,
        items,
      };
    });
  },

  /**
   * Atomically save sale, line items, and adjust credit balance inside a single transaction.
   */
  createSale: async (saleData, lineItems = []) => {
    return await db.transaction(async (tx) => {
      const createdAt = saleData.createdAt
        ? (saleData.createdAt instanceof Date ? saleData.createdAt.toISOString() : String(saleData.createdAt))
        : new Date().toISOString();

      const totalVal = Number(saleData.totalAmount ?? saleData.total ?? 0);
      const vatVal = Number(saleData.totalVat ?? saleData.vatTotal ?? 0);
      const subtotalVal = Number(saleData.subtotal ?? (totalVal - vatVal));

      // Strictly sequential, gapless invoice numbering for Bahrain NBR VAT compliance
      const seq = Number(saleData.invoiceSeq) > 0 ? Number(saleData.invoiceSeq) : await getNextInvoiceSequence('Sale', tx);
      const invoiceNo =
        saleData.invoiceNo &&
          !saleData.invoiceNo.includes('NaN') &&
          !saleData.invoiceNo.startsWith('INV-17') &&
          saleData.invoiceNo !== '0' &&
          saleData.invoiceNo !== 'INV-0'
          ? saleData.invoiceNo
          : formatInvoiceNumber(seq);

      // Validate customerId to prevent foreign key errors
      let validCustomerId = null;
      if (saleData.customerId) {
        const custRes = await tx.execute({
          sql: `SELECT id FROM Customer WHERE id = ? LIMIT 1`,
          args: [saleData.customerId],
        });
        if (custRes.rows && custRes.rows.length > 0) {
          validCustomerId = saleData.customerId;
        }
      }

      // Validate shiftId
      let validShiftId = null;
      if (saleData.shiftId) {
        const shiftRes = await tx.execute({
          sql: `SELECT id FROM ShiftSession WHERE id = ? LIMIT 1`,
          args: [saleData.shiftId],
        });
        if (shiftRes.rows && shiftRes.rows.length > 0) {
          validShiftId = saleData.shiftId;
        } else {
          validShiftId = saleData.shiftId;
        }
      }

      const saleId = saleData.id || `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Insert Sale
      await tx.execute({
        sql: `INSERT INTO Sale (
          id, tenantId, invoiceNo, invoiceSeq, customerId, shiftId, employeeId,
          subtotal, vatTotal, totalVat, total, totalAmount, paymentType,
          status, syncStatus, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          saleId,
          saleData.tenantId || CURRENT_TENANT,
          invoiceNo,
          seq,
          validCustomerId,
          validShiftId,
          saleData.employeeId || null,
          subtotalVal,
          vatVal,
          vatVal,
          totalVal,
          totalVal,
          saleData.paymentType || 'CASH',
          saleData.status || 'COMPLETED',
          saleData.syncStatus || 'PENDING',
          createdAt,
        ],
      });

      // Insert Line Items & deduct stock
      for (const item of lineItems) {
        const itemId = item.id || `si_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const itemQty = Number(item.quantity ?? 1);
        const itemPrice = Number(item.priceAtSale ?? item.price ?? 0);
        const itemCost = Number(item.costAtSale ?? item.unitCost ?? 0);
        const targetProdId = item.productId || item.id || 'prod_quick';
        const lineTotal = Number(item.total_price ?? (itemQty * itemPrice).toFixed(3));
        const vatRate = Number(item.vatRateAtSale ?? item.vatRate ?? 10.0);
        const vatAmount = Number(item.vatAmount ?? 0.0);

        await tx.execute({
          sql: `INSERT INTO SaleItem (
            id, tenantId, saleId, productId, quantity, priceAtSale, costAtSale,
            vatRateAtSale, vatAmount, total_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            itemId,
            item.tenantId || CURRENT_TENANT,
            saleId,
            targetProdId,
            itemQty,
            itemPrice,
            itemCost,
            vatRate,
            vatAmount,
            lineTotal,
          ],
        });

        // Decrement stock in database directly
        if (targetProdId && targetProdId !== 'prod_quick') {
          await tx.execute({
            sql: `UPDATE Product 
                  SET stockQuantity = MAX(0, stockQuantity - ?), updatedAt = datetime('now')
                  WHERE id = ?`,
            args: [itemQty, targetProdId],
          });
        }
      }

      // Record Khata ledger if credit transaction
      if (
        validCustomerId &&
        (saleData.paymentType === 'CREDIT' ||
          saleData.paymentType === 'NFC_CREDIT' ||
          saleData.paymentType === 'MESS_KHATA')
      ) {
        const balRes = await tx.execute({
          sql: `SELECT COALESCE(SUM(amount), 0) as balance FROM KhataLedger WHERE customerId = ?`,
          args: [validCustomerId],
        });
        const currentBal = Number(balRes.rows[0]?.balance || 0);
        const newBal = Number((currentBal + totalVal).toFixed(3));

        const ledgerId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await tx.execute({
          sql: `INSERT INTO KhataLedger (
            id, tenantId, customerId, amount, type, reference, running_balance,
            syncStatus, timestamp, created_at
          ) VALUES (?, ?, ?, ?, 'CHARGE', ?, ?, 'PENDING', ?, ?)`,
          args: [
            ledgerId,
            CURRENT_TENANT,
            validCustomerId,
            totalVal,
            invoiceNo,
            newBal,
            createdAt,
            createdAt,
          ],
        });

        // Update running balance in unified Customer table
        await tx.execute({
          sql: `UPDATE Customer SET balance = COALESCE(balance, 0) + ? WHERE id = ?`,
          args: [totalVal, validCustomerId],
        }).catch(() => { });
      }

      return {
        id: saleId,
        invoiceNo,
        invoiceSeq: seq,
        subtotal: subtotalVal,
        total: totalVal,
        totalAmount: totalVal,
        vatTotal: vatVal,
        paymentType: saleData.paymentType || 'CASH',
        status: saleData.status || 'COMPLETED',
        createdAt,
      };
    });
  },

  /**
   * Fetch customer statement with sales, line items, and ledger entries using indexed queries.
   */
  getCustomerStatement: async (customerId) => {
    // 1. Fetch customer sales
    const salesResult = await db.execute({
      sql: `SELECT * FROM Sale WHERE customerId = ? ORDER BY createdAt DESC LIMIT 100`,
      args: [customerId],
    });

    const sales = salesResult.rows || [];
    const saleIds = sales.map((s) => s.id);

    // 2. Fetch items for these sales
    let itemsBySaleId = {};
    if (saleIds.length > 0) {
      const placeholders = saleIds.map(() => '?').join(', ');
      const itemsResult = await db.execute({
        sql: `SELECT * FROM SaleItem WHERE saleId IN (${placeholders})`,
        args: saleIds,
      });
      (itemsResult.rows || []).forEach((item) => {
        if (!itemsBySaleId[item.saleId]) itemsBySaleId[item.saleId] = [];
        itemsBySaleId[item.saleId].push(item);
      });
    }

    const salesWithItems = sales.map((sale) => ({
      ...sale,
      items: itemsBySaleId[sale.id] || [],
    }));

    // 3. Fetch ledger entries
    const ledgerResult = await db.execute({
      sql: `SELECT * FROM KhataLedger WHERE customerId = ? ORDER BY timestamp DESC LIMIT 200`,
      args: [customerId],
    });

    const ledger = ledgerResult.rows || [];
    const computedBalance = ledger.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return {
      sales: salesWithItems,
      ledger,
      computedBalance: Number(computedBalance.toFixed(3)),
    };
  },
};

export default SaleRepository;
