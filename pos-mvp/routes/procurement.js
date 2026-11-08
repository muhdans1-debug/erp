import crypto from 'crypto';
import { db } from '../db.js';
import { managerAuth } from '../middleware/auth.js';
import { runReorderCheck, snoozedDistributors } from '../src/automation/reorderJob.js';

export default async function procurementRoutes(fastify, options) {
  // --- Distributors Management & Minimum Order Value (MOV) Rules ---
  // 1. Fetch all distributors with real-time inventory metrics (High-Performance SQLite Aggregation)
  const handleGetDistributorMetrics = async (request, reply) => {
    try {
      // 1. Fetch distributors normally
      const distributorsRes = await db.execute('SELECT * FROM Distributor');
      const distributors = distributorsRes.rows || [];

      // NEW: 2. Offload the heavy low-stock and reorder calculations entirely to SQLite
      const metricsRes = await db.execute(`
        SELECT 
          distributorId, 
          COUNT(id) as productCount,
          SUM(CASE WHEN stockQuantity <= COALESCE(minThreshold, 20) THEN 1 ELSE 0 END) as lowStockCount,
          SUM(CASE WHEN stockQuantity <= COALESCE(minThreshold, 20) 
                   THEN MAX(1, COALESCE(maxThreshold, 100) - stockQuantity) * COALESCE(purchasePrice, 0) 
                   ELSE 0 END) as pendingReorderTotal
        FROM Product
        WHERE distributorId IS NOT NULL
        GROUP BY distributorId
      `);

      // 3. Map the optimized SQL results back to the distributor objects
      const metricsMap = new Map();
      (metricsRes.rows || []).forEach((row) => {
        metricsMap.set(row.distributorId, {
          productCount: Number(row.productCount || 0),
          lowStockCount: Number(row.lowStockCount || 0),
          pendingReorderTotal: Number(Number(row.pendingReorderTotal || 0).toFixed(3))
        });
      });

      const enrichedDistributors = distributors.map((d) => {
        const m = metricsMap.get(d.id) || { productCount: 0, lowStockCount: 0, pendingReorderTotal: 0 };
        const mov = Number(d.minimumOrderValue || 0);
        const meetsMov = m.pendingReorderTotal >= mov;
        return {
          ...d,
          productCount: m.productCount,
          lowStockCount: m.lowStockCount,
          pendingReorderTotal: m.pendingReorderTotal,
          meetsMov,
          deficit: meetsMov ? 0 : Number((mov - m.pendingReorderTotal).toFixed(3)),
          metrics: m
        };
      });

      return reply.send({ success: true, distributors: enrichedDistributors });
    } catch (err) {
      request.log.error(err, 'Failed to fetch distributor metrics');
      return reply.code(500).send({ error: 'Database error' });
    }
  };

  fastify.get('/api/distributors', handleGetDistributorMetrics);
  fastify.get('/api/distributors/metrics', handleGetDistributorMetrics);

  // 2. Register new distributor
  fastify.post('/api/distributors', async (request, reply) => {
    const { name, whatsappNumber, contactEmail, minimumOrderValue, deliveryDays } = request.body || {};
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Distributor name is required' });
    }

    const cleanName = name.trim();
    const existing = await db.orm.Distributor.where({ name: cleanName }).all().first();
    if (existing) {
      return reply.status(400).send({ error: `Distributor "${cleanName}" already exists` });
    }

    const newDist = {
      id: `dist_${crypto.randomUUID().slice(0, 8)}`,
      name: cleanName,
      whatsappNumber: (whatsappNumber || '97339000000').trim(),
      contactEmail: (contactEmail || 'supplier@askar.bh').trim(),
      minimumOrderValue: Number(minimumOrderValue ?? 0),
      deliveryDays: deliveryDays ? String(deliveryDays).trim() : null,
      tenantId: 'tenant_1',
      createdAt: new Date()
    };

    await db.orm.Distributor.create(newDist);
    return { success: true, distributor: newDist };
  });

  // 3. Update distributor details & Minimum Order Value (MOV)
  fastify.put('/api/distributors/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, whatsappNumber, contactEmail, minimumOrderValue, deliveryDays } = request.body || {};

    const existing = await db.orm.Distributor.where({ id }).all().first();
    if (!existing) {
      return reply.status(404).send({ error: 'Distributor not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (whatsappNumber !== undefined) updateData.whatsappNumber = whatsappNumber.trim();
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail.trim();
    if (minimumOrderValue !== undefined) updateData.minimumOrderValue = Number(minimumOrderValue);
    if (deliveryDays !== undefined) updateData.deliveryDays = deliveryDays ? String(deliveryDays).trim() : null;

    await db.orm.Distributor.where({ id }).update(updateData);
    const updated = await db.orm.Distributor.where({ id }).all().first();
    return { success: true, distributor: updated };
  });

  // 4. Delete distributor
  fastify.delete('/api/distributors/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = await db.orm.Distributor.where({ id }).all().first();
    if (!existing) {
      return reply.status(404).send({ error: 'Distributor not found' });
    }

    const allProds = await db.orm.Product.all();
    const assigned = allProds.filter(p => p.distributorId === id);
    if (assigned.length > 0) {
      return reply.status(400).send({
        error: `Cannot delete "${existing.name}" because ${assigned.length} product(s) are assigned to it. Reassign products first.`
      });
    }

    await db.orm.Distributor.where({ id }).delete();
    return { success: true, message: `Distributor "${existing.name}" removed.` };
  });


  // --- Inventory Wastage, Purchase Orders, and Automated Restock ---
// 5b. Wastage & Spoilage Write-Off Engine
fastify.post('/api/inventory/wastage', async (request, reply) => {
  const { barcode, quantity, reason, loggedBy } = request.body || {};

  try {
    if (!barcode) {
      return reply.status(400).send({ error: 'Barcode or product ID is required' });
    }

    const cleanBarcode = String(barcode).trim();

    // 1. Find product to get its current wholesale cost
    let product = await db.orm.Product.where({ id: cleanBarcode }).all().first();
    if (!product) {
      product = await db.orm.Product.where({ barcode: cleanBarcode }).all().first();
    }
    if (!product) {
      const all = await db.orm.Product.all();
      product = all.find(
        (p) => p.id === cleanBarcode || p.barcode === cleanBarcode || (p.name && p.name.toLowerCase() === cleanBarcode.toLowerCase())
      );
    }

    if (!product) {
      return reply.status(404).send({ error: 'Product not found' });
    }

    const qty = Math.max(1, parseInt(quantity) || 1);
    const unitCost = Number(product.purchasePrice ?? product.unitCost ?? 0.0);
    const totalLoss = unitCost * qty;

    // 2. Execute transaction (Deduct stock and log financial loss)
    await db.transaction(async (tx) => {
      const currentStock = Number(product.stockQuantity || 0);
      const newStock = Math.max(0, currentStock - qty);

      await tx.orm.Product.where({ id: product.id }).update({
        stockQuantity: newStock,
        updatedAt: new Date(),
      });

      await tx.orm.WastageLog.create({
        id: crypto.randomUUID(),
        tenantId: product.tenantId || 'tenant_1',
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitCost: unitCost,
        totalLoss: totalLoss,
        reason: reason || 'EXPIRED',
        loggedBy: loggedBy || 'Admin',
        createdAt: new Date(),
      });
    });

    console.log(`🗑️ Wastage Logged: ${qty}x ${product.name} (Wholesale Loss: BD ${totalLoss.toFixed(3)}) [Reason: ${reason || 'EXPIRED'}]`);
    return {
      success: true,
      message: 'Stock deducted and loss recorded.',
      productName: product.name,
      totalLoss,
      remainingStock: Math.max(0, (product.stockQuantity || 0) - qty),
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Wastage logging failed', details: error.message });
  }
});

// Fetch all wastage logs
fastify.get('/api/inventory/wastage', async () => {
  try {
    const logs = await db.orm.WastageLog.all();
    logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const totalLoss = logs.reduce((sum, l) => sum + Number(l.totalLoss || 0), 0);
    return { success: true, logs, totalLoss: Number(totalLoss.toFixed(3)) };
  } catch (error) {
    return { success: false, logs: [], totalLoss: 0 };
  }
});

// Step 2: The Smart Auto-Restock Engine (Nightly 11:00 PM Fastify cron route & on-demand scan)
const handleAutoRestock = async (request, reply) => {
  const query = request.query || {};
  const body = request.body || {};
  const bypassMov = query.bypassMov === 'true' || query.bypassMov === true || body.bypassMov === true;
  const targetDistributorId = query.distributorId || body.distributorId || null;

  try {
    const result = await runReorderCheck({ bypassMov, targetDistributorId });
    return {
      success: true,
      message: `Generated ${result.draftCount} grouped Purchase Orders.`,
      draftCount: result.draftCount,
      drafts: result.drafts,
      skippedCount: result.skippedCount,
      skipped: result.skipped,
      timestamp: result.timestamp,
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Auto-restock engine failed', details: error.message });
  }
};

fastify.get('/api/cron/auto-restock', handleAutoRestock);
fastify.post('/api/cron/auto-restock', handleAutoRestock);
fastify.post('/api/purchase-orders/force-draft', handleAutoRestock);

// 6. Automated Inventory Reorder Check Route (Manual Trigger)
fastify.post('/api/automation/trigger-reorder', handleAutoRestock);
fastify.get('/api/automation/trigger-reorder', handleAutoRestock);

// 7. Purchase Order Approval Routes
// Fetch all pending drafts (enriched with distributor WhatsApp numbers)
fastify.get('/api/purchase-orders/drafts', async () => {
  const [drafts, distributors] = await Promise.all([
    db.orm.PurchaseOrder.where({ status: 'DRAFT' }).all(),
    db.orm.Distributor.all()
  ]);
  const distMap = new Map(distributors.map(d => [d.id, d]));
  const enriched = drafts.map(po => {
    let dist = po.distributorId ? distMap.get(po.distributorId) : null;
    if (!dist && po.supplierName) {
      const sName = po.supplierName.toLowerCase();
      dist = distributors.find(d => sName.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(sName) || (sName.includes('almarai') && d.id === 'dist_almarai') || (sName.includes('arla') && d.id === 'dist_arla')) || null;
    }
    const resolvedNumber = (po.whatsappNumber && po.whatsappNumber !== '97339000000')
      ? po.whatsappNumber
      : (dist?.whatsappNumber || po.whatsappNumber || '97339000000');

    return {
      ...po,
      whatsappNumber: resolvedNumber,
      distributor: dist || null
    };
  });
  enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { success: true, drafts: enriched };
});

// Fetch all purchase orders (including history)
fastify.get('/api/purchase-orders', async () => {
  const allOrders = await db.orm.PurchaseOrder.all();
  allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { success: true, orders: allOrders };
});

// Approve and Dispatch the PO via WhatsApp (Protected by managerAuth)
fastify.post('/api/purchase-orders/:id/approve', { preHandler: managerAuth }, async (request, reply) => {
  const { id } = request.params;
  const { itemsJson: customItemsJson, estimatedCost: customEstimatedCost } = request.body || {};

  try {
    const po = await db.orm.PurchaseOrder.where({ id }).all().first();
    if (!po) {
      return reply.code(404).send({ error: 'Purchase Order not found' });
    }

    // Idempotent guard: if already approved, return success cleanly
    if (po.status === 'APPROVED' || po.status === 'SENT') {
      return { success: true, message: 'PO already approved', poId: po.id };
    }

    let items;
    let finalEstimatedCost = Number(po.estimatedCost || 0);

    if (customItemsJson) {
      items = typeof customItemsJson === 'string' ? JSON.parse(customItemsJson) : customItemsJson;
      finalEstimatedCost = customEstimatedCost !== undefined
        ? Number(customEstimatedCost)
        : items.reduce((sum, i) => sum + (Number(i.reorderQuantity || 0) * Number(i.unitCost || 0)), 0);
    } else {
      items = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : (po.itemsJson || []);
    }

    // Mark as APPROVED in the database (ready for WhatsApp dispatch)
    await db.orm.PurchaseOrder.where({ id }).update({
      status: 'APPROVED',
      itemsJson: typeof customItemsJson === 'string' ? customItemsJson : JSON.stringify(items),
      estimatedCost: finalEstimatedCost
    });

    console.log(`📱 [WhatsApp Protocol] PO #${po.id.slice(0, 6).toUpperCase()} approved for supplier "${po.supplierName}" (WhatsApp: ${po.whatsappNumber || '97339000000'})`);

    return {
      success: true,
      message: 'PO Approved and Prepared for WhatsApp Dispatch',
      poId: po.id
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to approve PO', details: error.message });
  }
});

// Discard / Remove a specific Purchase Order (Draft, Pending, or In-Transit)
const handleDiscardPO = async (request, reply) => {
  const { id } = request.params;
  const body = request.body || {};
  const query = request.query || {};
  const reason = body.reason || query.reason || 'Manager manual discard';
  const snoozeHours = Number(body.snoozeHours || query.snoozeHours || 0);

  try {
    const po = await db.orm.PurchaseOrder.where({ id }).all().first();
    if (!po) {
      return reply.code(404).send({ error: 'Purchase Order not found.' });
    }

    const supplierName = po.supplierName || 'Distributor';
    const distId = po.distributorId;

    // Remove PO record from SQLite database
    await db.orm.PurchaseOrder.where({ id }).delete();

    // If snooze was selected, hold back this distributor from auto-restock drafts
    if (distId && snoozeHours > 0) {
      const snoozeUntil = new Date(Date.now() + snoozeHours * 3600 * 1000);
      snoozedDistributors.set(distId, snoozeUntil);
      console.log(`⏳ [PO Snooze] Distributor "${supplierName}" (${distId}) snoozed for ${snoozeHours}h (until ${snoozeUntil.toLocaleTimeString()})`);
    }

    console.log(`🗑️ [PO Discarded] Successfully removed PO #${id.slice(0, 8)} for "${supplierName}". Reason: ${reason}`);
    return {
      success: true,
      message: `Purchase order for "${supplierName}" removed successfully.`,
      poId: id,
      supplierName,
      snoozedHours: snoozeHours > 0 ? snoozeHours : undefined
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to discard purchase order', details: error.message });
  }
};

fastify.delete('/api/purchase-orders/:id', handleDiscardPO);
fastify.post('/api/purchase-orders/:id/discard', handleDiscardPO);
fastify.post('/api/purchase-orders/:id/cancel', handleDiscardPO);

// Clear All Draft Purchase Orders at once (Batch Dismissal)
const handleClearAllDrafts = async (request, reply) => {
  try {
    const drafts = await db.orm.PurchaseOrder.where({ status: 'DRAFT' }).all();
    const count = drafts.length;
    for (const d of drafts) {
      await db.orm.PurchaseOrder.where({ id: d.id }).delete();
    }
    console.log(`🧹 [PO Batch Discard] Cleared all ${count} draft purchase orders.`);
    return {
      success: true,
      count,
      message: count > 0 ? `Cleared ${count} draft purchase order(s).` : 'No pending drafts to clear.'
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to clear draft orders', details: error.message });
  }
};

fastify.delete('/api/purchase-orders/drafts/clear-all', handleClearAllDrafts);
fastify.post('/api/purchase-orders/drafts/clear-all', handleClearAllDrafts);
fastify.delete('/api/purchase-orders/drafts', handleClearAllDrafts);

// Fetch all orders in transit (IN_TRANSIT, APPROVED or SENT, awaiting delivery)
const handleGetTransitOrders = async () => {
  const allOrders = await db.orm.PurchaseOrder.all();
  const transitOrders = allOrders.filter(o => o.status === 'IN_TRANSIT' || o.status === 'SENT' || o.status === 'APPROVED');
  transitOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { success: true, orders: transitOrders };
};
fastify.get('/api/purchase-orders/transit', handleGetTransitOrders);
fastify.get('/po/transit', handleGetTransitOrders);

// Mark a Purchase Order as Received and restock the shelves with barcode auditing
const handleReceivePO = async (request, reply) => {
  const { id } = request.params;
  const { receivedItems } = request.body || {};

  try {
    // 1. Fetch the in-transit purchase order
    const po = await db.orm.PurchaseOrder.where({ id }).all().first();
    if (!po || (po.status !== 'SENT' && po.status !== 'APPROVED' && po.status !== 'IN_TRANSIT')) {
      return reply.code(400).send({ error: 'Order is not in transit or invalid.' });
    }

    const itemsToProcess = Array.isArray(receivedItems) && receivedItems.length > 0
      ? receivedItems
      : (typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : (po.itemsJson || []));

    // 2. Perform the restock inside a SQLite transaction
    await db.transaction(async (tx) => {
      for (const item of itemsToProcess) {
        let liveProduct = null;
        if (item.id) {
          liveProduct = await tx.orm.Product.where({ id: String(item.id) }).all().first();
        }
        if (!liveProduct && item.barcode) {
          liveProduct = await tx.orm.Product.where({ barcode: String(item.barcode) }).all().first();
        }

        if (liveProduct) {
          const qtyToAdd = Number(item.qty !== undefined ? item.qty : (item.received_qty !== undefined ? item.received_qty : (item.reorderQuantity || 0)));
          if (qtyToAdd > 0) {
            const newQty = (liveProduct.stockQuantity || 0) + qtyToAdd;
            await tx.orm.Product.where({ id: liveProduct.id }).update({
              stockQuantity: newQty,
              updatedAt: new Date(),
            });
            console.log(`📦 Restocked ${liveProduct.name} (${liveProduct.id}): ${liveProduct.stockQuantity} -> ${newQty} (+${qtyToAdd})`);
          }
        }
      }

      // 3. Mark the PO as officially Received
      await tx.orm.PurchaseOrder.where({ id }).update({
        status: 'RECEIVED',
        itemsJson: typeof itemsToProcess === 'string' ? itemsToProcess : JSON.stringify(itemsToProcess)
      });
    });

    console.log(`✅ Purchase Order ${id} received and marked as RECEIVED.`);
    return { success: true, message: 'Inventory updated successfully.' };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to receive delivery', details: error.message });
  }
};
fastify.post('/api/purchase-orders/:id/receive', handleReceivePO);
fastify.post('/po/:id/receive', handleReceivePO);

// Seed helper for instant front-counter receiving testing
fastify.post('/api/purchase-orders/seed-transit', async (request, reply) => {
  try {
    const demoPO = {
      id: `po_transit_${Date.now().toString().slice(-6)}`,
      distributorId: 'dist_almarai',
      supplierName: 'Almarai Dairy Co.',
      whatsappNumber: '97339123456',
      supplierEmail: 'orders@almarai.bh',
      status: 'IN_TRANSIT',
      estimatedCost: 26.400,
      vatPaid: 0.0,
      itemsJson: JSON.stringify([
        { id: '104', name: 'Almarai Fresh Milk 2L', barcode: '00104', unitCost: 0.850, reorderQuantity: 24, received_qty: 0 },
        { id: '114', name: 'Almarai Fresh Laban 500ml', barcode: '114', unitCost: 0.200, reorderQuantity: 30, received_qty: 0 }
      ]),
      createdAt: new Date()
    };
    await db.orm.PurchaseOrder.create(demoPO);
    return { success: true, po: demoPO };
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
});

  // 6. Predictive Auto-Replenishment Engine (7-Day Sales Velocity + Lead Time + ROP)
  fastify.get('/api/procurement/auto-reorder', async (request, reply) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch all products, distributors, and 7-day sales velocities
      const [distributors, allProducts, salesVelocityRows] = await Promise.all([
        db.orm.Distributor.all(),
        db.orm.Product.all(),
        db.execute({
          sql: `
            SELECT si.productId, SUM(si.quantity) as unitsSold7d
            FROM SaleItem si
            JOIN Sale s ON si.saleId = s.id
            WHERE s.createdAt >= ?
            GROUP BY si.productId
          `,
          args: [sevenDaysAgo]
        })
      ]);

      const velocityMap = new Map();
      for (const row of salesVelocityRows.rows || []) {
        velocityMap.set(String(row.productId), Number(row.unitsSold7d || 0));
      }

      const distributorMap = new Map(distributors.map(d => [d.id, d]));

      const reorderList = [];
      const supplierDraftsMap = new Map();

      for (const prod of allProducts) {
        const unitsSold7d = velocityMap.get(String(prod.id)) || 0;
        const dailyVelocity = parseFloat((unitsSold7d / 7.0).toFixed(2));

        const dist = prod.distributorId ? distributorMap.get(prod.distributorId) : null;
        // Lead Time Days: parse from distributor (e.g., Almarai is 1 day, default 2 days)
        let leadTimeDays = 2;
        if (dist && dist.id === 'dist_almarai') leadTimeDays = 1;
        else if (dist && dist.id === 'dist_local') leadTimeDays = 3;
        else if (dist && dist.deliveryDays) {
          const daysList = dist.deliveryDays.split(',');
          leadTimeDays = Math.max(1, Math.round(7 / Math.max(1, daysList.length)));
        }

        const safetyStock = Number(prod.minThreshold ?? 3);
        const currentStock = Number(prod.stockQuantity ?? 0);

        // Standard Supply Chain Reorder Point (ROP) = ceil((Daily Velocity * Lead Time Days) + Safety Stock)
        const rop = Math.ceil((dailyVelocity * leadTimeDays) + safetyStock);

        // If current stock is at or below ROP, auto-replenishment is triggered
        if (currentStock <= rop) {
          const suggestedOrderQty = Math.max(
            1,
            Math.ceil(rop - currentStock + (dailyVelocity * 7)),
            (Number(prod.maxThreshold || 0) > currentStock ? Number(prod.maxThreshold) - currentStock : 1)
          );

          const unitCost = Number(prod.purchasePrice ?? prod.unitCost ?? 0.0);
          const lineTotal = parseFloat((suggestedOrderQty * unitCost).toFixed(3));

          const itemData = {
            productId: prod.id,
            id: prod.id,
            name: prod.name,
            barcode: prod.barcode || '',
            category: prod.category || 'General',
            currentStock,
            stockQuantity: currentStock,
            unitsSold7d,
            dailyVelocity,
            leadTimeDays,
            safetyStock,
            rop,
            reorderPoint: rop,
            suggestedOrder: suggestedOrderQty,
            suggestedOrderQty,
            unitCost,
            unitPrice: unitCost,
            lineTotal,
            estimatedCost: lineTotal,
            distributorId: prod.distributorId || 'UNASSIGNED',
            distributorName: dist ? dist.name : 'Unassigned Distributor',
            supplierName: dist ? dist.name : 'Unassigned Distributor',
            distributorPhone: dist ? (dist.whatsappNumber || '') : '',
            supplierPhone: dist ? (dist.whatsappNumber || '') : ''
          };

          reorderList.push(itemData);

          const draftKey = prod.distributorId || 'UNASSIGNED';
          if (!supplierDraftsMap.has(draftKey)) {
            supplierDraftsMap.set(draftKey, {
              distributorId: draftKey,
              distributorName: dist ? dist.name : 'Unassigned Distributor',
              whatsappNumber: dist ? (dist.whatsappNumber || '') : '',
              contactEmail: dist ? (dist.contactEmail || '') : '',
              minimumOrderValue: dist ? Number(dist.minimumOrderValue || 0) : 0,
              items: [],
              totalCost: 0
            });
          }

          const draft = supplierDraftsMap.get(draftKey);
          draft.items.push(itemData);
          draft.totalCost = parseFloat((draft.totalCost + lineTotal).toFixed(3));
        }
      }

      // Format WhatsApp messages and action links for each supplier draft
      const supplierDrafts = Array.from(supplierDraftsMap.values()).map(draft => {
        const meetsMov = draft.totalCost >= draft.minimumOrderValue;
        const cleanPhone = draft.whatsappNumber ? draft.whatsappNumber.replace(/[^0-9]/g, '') : '';
        const phoneWithCountry = cleanPhone.startsWith('973') ? cleanPhone : (cleanPhone ? `973${cleanPhone}` : '');

        let message = `🛒 *PURCHASE ORDER - ASKAR SUPERMARKET*\n`;
        message += `Distributor: ${draft.distributorName}\n`;
        message += `Date: ${new Date().toLocaleDateString('en-GB')}\n\n`;
        message += `*Items Required:*\n`;
        draft.items.forEach((item, idx) => {
          message += `${idx + 1}. ${item.name} (${item.barcode || 'N/A'})\n`;
          message += `   Qty: *${item.suggestedOrderQty}* | Cost: BD ${item.unitCost.toFixed(3)}\n`;
        });
        message += `\n*Total Order Estimate:* BD ${draft.totalCost.toFixed(3)}\n`;
        message += `Please confirm delivery date. Thank you!`;

        const whatsappUrl = phoneWithCountry
          ? `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`
          : null;

        return {
          ...draft,
          phone: draft.whatsappNumber || '',
          meetsMov,
          itemCount: draft.items.length,
          whatsappUrl,
          messagePreview: message
        };
      });

      // Dictionary format keyed by supplierName for exact match with user specification: { [supplierName]: { phone, items } }
      const supplierDraftsDict = {};
      for (const draft of supplierDrafts) {
        const sKey = draft.distributorName || draft.distributorId || 'Local Distributor';
        supplierDraftsDict[sKey] = {
          phone: draft.whatsappNumber || '',
          supplierPhone: draft.whatsappNumber || '',
          distributorId: draft.distributorId,
          distributorName: draft.distributorName,
          minimumOrderValue: draft.minimumOrderValue,
          meetsMov: draft.meetsMov,
          totalCost: draft.totalCost,
          whatsappUrl: draft.whatsappUrl,
          messagePreview: draft.messagePreview,
          items: draft.items
        };
      }

      return {
        success: true,
        calculatedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        totalItemsNeedingReorder: reorderList.length,
        totalSuppliersAffected: supplierDrafts.length,
        supplierDrafts: supplierDraftsDict,
        supplierDraftsList: supplierDrafts,
        supplierDraftsMap: supplierDraftsDict,
        reorderList
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to calculate predictive replenishment', details: error.message });
    }
  });

  // Convert auto-reorder supplier draft into official PurchaseOrder in DB
  fastify.post('/api/procurement/auto-reorder/create-po', async (request, reply) => {
    const { distributorId } = request.body || {};
    try {
      const autoRes = await fastify.inject({
        method: 'GET',
        url: '/api/procurement/auto-reorder'
      });
      const data = JSON.parse(autoRes.body);
      if (!data.success) {
        return reply.status(500).send({ error: 'Failed to generate auto-reorder data' });
      }

      const allDrafts = data.supplierDraftsList || (Array.isArray(data.supplierDrafts) ? data.supplierDrafts : Object.values(data.supplierDrafts || {}));
      const targetDraft = allDrafts.find(d => d.distributorId === distributorId || d.distributorName === distributorId);
      if (!targetDraft || targetDraft.items.length === 0) {
        return reply.status(404).send({ error: 'No replenishment items for this distributor' });
      }

      const existing = await db.orm.PurchaseOrder.where({
        distributorId: targetDraft.distributorId,
        status: 'DRAFT'
      }).all().first();

      const itemsJson = JSON.stringify(targetDraft.items.map(it => ({
        id: it.productId,
        name: it.name,
        barcode: it.barcode,
        reorderQuantity: it.suggestedOrderQty,
        unitCost: it.unitCost,
        totalLineCost: it.lineTotal
      })));

      let poId;
      if (existing) {
        await db.orm.PurchaseOrder.where({ id: existing.id }).update({
          itemsJson,
          estimatedCost: targetDraft.totalCost,
          updatedAt: new Date()
        });
        poId = existing.id;
      } else {
        poId = `po_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await db.orm.PurchaseOrder.create({
          id: poId,
          distributorId: targetDraft.distributorId,
          supplierName: targetDraft.distributorName,
          whatsappNumber: targetDraft.whatsappNumber,
          supplierEmail: targetDraft.contactEmail,
          status: 'DRAFT',
          estimatedCost: targetDraft.totalCost,
          vatPaid: 0.0,
          itemsJson,
          createdAt: new Date()
        });
      }

      return {
        success: true,
        poId,
        message: `Draft Purchase Order created for ${targetDraft.distributorName}`,
        supplierDraft: targetDraft
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to create PO from auto-reorder', details: err.message });
    }
  });

}
