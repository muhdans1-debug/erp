import sqlite from '@prisma/orm-sqlite/runtime';
import contractJson from '../prisma/contract.json' with { type: 'json' };

import { getNextInvoiceSequence, formatInvoiceNumber } from '../services/invoiceSequence.js';

// Initialize SQLite runtime with your contract
const db = sqlite({
  contractJson,
  path: './dev.db',
});

// Anchor tenant ID for multi-tenant isolation
const CURRENT_TENANT = 'tenant_askar_01';

export const SaleRepository = {
  // Fetch sales filtered by start and end date for Range/Day/Month/Year reporting
  getSalesByDateRange: async (startDate, endDate = null) => {
    const allSales = await db.orm.Sale.all();

    // Filter by tenant, active status, and timestamp (exclude VOIDED sales from revenue totals)
    const filteredSales = allSales.filter((sale) => {
      const saleDate = new Date(sale.createdAt);
      const isNotVoided = sale.status !== 'VOIDED' && sale.status !== 'CANCELLED';
      const matchesTenant = sale.tenantId === CURRENT_TENANT || sale.tenantId === 'tenant_1';
      const afterStart = startDate ? saleDate >= startDate : true;
      const beforeEnd = endDate ? saleDate <= endDate : true;
      return isNotVoided && matchesTenant && afterStart && beforeEnd;
    });

    // Populate line items for profit calculation
    const allItems = await db.orm.SaleItem.all();
    return filteredSales.map((sale) => ({
      ...sale,
      items: allItems.filter((item) => item.saleId === sale.id),
    }));
  },

  // Save sale, create line items, and adjust credit balance if needed
  createSale: async (saleData, lineItems) => {
    return await db.transaction(async (tx) => {
      const createdAt = saleData.createdAt ? new Date(saleData.createdAt) : new Date();

      const totalVal = Number(saleData.totalAmount ?? saleData.total ?? 0);
      const vatVal = Number(saleData.totalVat ?? saleData.vatTotal ?? 0);
      const subtotalVal = Number(saleData.subtotal ?? (totalVal - vatVal));

      // Strictly sequential, gapless invoice numbering for Bahrain NBR VAT compliance
      const seq = Number(saleData.invoiceSeq) > 0 ? Number(saleData.invoiceSeq) : getNextInvoiceSequence('Sale');
      const invoiceNo = saleData.invoiceNo && !saleData.invoiceNo.includes('NaN') && !saleData.invoiceNo.startsWith('INV-17') && saleData.invoiceNo !== '0' && saleData.invoiceNo !== 'INV-0'
        ? saleData.invoiceNo
        : formatInvoiceNumber(seq);

      const createdSale = await tx.orm.Sale.create({
        ...saleData,
        invoiceNo,
        invoiceSeq: seq,
        subtotal: subtotalVal,
        vatTotal: vatVal,
        totalVat: vatVal,
        total: totalVal,
        totalAmount: totalVal,
        status: saleData.status || 'COMPLETED',
        syncStatus: saleData.syncStatus || 'PENDING',
        createdAt,
        tenantId: CURRENT_TENANT,
      });


      for (const item of lineItems) {
        const itemQty = Number(item.quantity ?? 1);
        const itemPrice = Number(item.priceAtSale ?? item.price ?? 0);
        await tx.orm.SaleItem.create({
          ...item,
          quantity: itemQty,
          priceAtSale: itemPrice,
          total_price: Number(item.total_price ?? (itemQty * itemPrice).toFixed(3)),
          vatRateAtSale: Number(item.vatRateAtSale ?? 10.0),
          vatAmount: Number(item.vatAmount ?? 0.0),
          saleId: createdSale.id,
          tenantId: CURRENT_TENANT,
        });

        // Deduct inventory stock quantity (or replenish if refund/return with negative quantity)
        const targetProdId = item.productId || item.id;
        if (targetProdId) {
          try {
            const product = await tx.orm.Product.where({ id: targetProdId }).all().first();
            if (product) {
              const currentStock = Number(product.stockQuantity ?? 0);
              const updatedStock = Math.max(0, currentStock - itemQty);
              await tx.orm.Product.where({ id: targetProdId }).update({
                stockQuantity: updatedStock,
                updatedAt: new Date()
              });
            }
          } catch (stockErr) {
            console.warn('Inventory deduction notice for product', targetProdId, stockErr?.message);
          }
        }
      }

      // If charged to credit (Khata), record an append-only ledger transaction (+total, type: CHARGE)
      if (saleData.customerId && (saleData.paymentType === 'CREDIT' || saleData.paymentType === 'NFC_CREDIT')) {
        const customerLedger = await tx.orm.KhataLedger.where({ customerId: saleData.customerId }).all();
        const prevBal = customerLedger.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const newBal = prevBal + (Number(saleData.total) || 0);

        await tx.orm.KhataLedger.create({
          id: crypto.randomUUID(),
          customerId: saleData.customerId,
          amount: Number(saleData.total) || 0, // Positive for debt charge
          type: 'CHARGE',
          reference: invoiceNo || `INV-${Date.now()}`,
          running_balance: Number(newBal.toFixed(3)),
          syncStatus: 'PENDING',
          timestamp: createdAt,
          created_at: createdAt,
          tenantId: CURRENT_TENANT,
        });
      }

      return createdSale;
    });
  },

  // Fetch all transactions, items, and append-only ledger entries for customer statement
  getCustomerStatement: async (customerId) => {
    const allSales = await db.orm.Sale.all();
    const customerSales = allSales
      .filter((sale) => sale.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const allItems = await db.orm.SaleItem.all();
    const salesWithItems = customerSales.map((sale) => ({
      ...sale,
      items: allItems.filter((item) => item.saleId === sale.id),
    }));

    const allLedger = await db.orm.KhataLedger.all();
    const customerLedger = allLedger
      .filter((l) => l.customerId === customerId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const computedBalance = customerLedger.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return {
      sales: salesWithItems,
      ledger: customerLedger,
      computedBalance: Math.max(0, computedBalance),
    };
  },
};

