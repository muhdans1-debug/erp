import cron from 'node-cron';
import sqlite from '@prisma/orm-sqlite/runtime';
import contractJson from '../../prisma/contract.json' with { type: 'json' };

const db = sqlite({ contractJson, path: './dev.db' });

// In-memory distributor snooze registry (distributorId -> expiration Date)
export const snoozedDistributors = new Map();

/**
 * Smart Auto-Restock Engine
 * Evaluates inventory grouped by Distributor entity.
 * Enforces Distributor Minimum Order Value (MOV) rules to eliminate micro-orders and PO fragmentation.
 */
export const runReorderCheck = async (options = {}) => {
  const { bypassMov = false, targetDistributorId = null } = options;
  console.log(`🕒 [Auto-Restock Engine] Evaluating inventory by Distributor (bypassMov: ${bypassMov})...`);

  try {
    // 1. Fetch all registered distributors and catalog products
    const [distributors, allProducts] = await Promise.all([
      db.orm.Distributor.all(),
      db.orm.Product.all(),
    ]);

    const drafts = [];
    const skipped = [];

    // Fallback distributor lookup map
    const distributorMap = new Map(distributors.map((d) => [d.id, d]));

    // 2. Group products by distributorId (including fallback for unassigned items)
    const productsByDistributor = new Map();
    for (const prod of allProducts) {
      const distId = prod.distributorId || 'UNASSIGNED';
      if (!productsByDistributor.has(distId)) {
        productsByDistributor.set(distId, []);
      }
      productsByDistributor.get(distId).push(prod);
    }

    // Filter distributors if targeting a specific one
    const distributorsToProcess = targetDistributorId 
      ? distributors.filter(d => d.id === targetDistributorId)
      : distributors;

    // 3. Process each Distributor catalog
    for (const distributor of distributorsToProcess) {
      // Check if this distributor was snoozed by the store manager (skip snooze if user explicitly bypassed)
      const snoozedUntil = snoozedDistributors.get(distributor.id);
      if (!bypassMov && snoozedUntil && new Date() < snoozedUntil) {
        console.log(`⏳ [Auto-Restock Skipped] Distributor "${distributor.name}" is snoozed until ${snoozedUntil.toISOString()}`);
        continue;
      }

      const distProducts = productsByDistributor.get(distributor.id) || [];
      if (distProducts.length === 0) continue;

      // Filter products at or below danger threshold (stock <= minThreshold)
      const lowStockProducts = distProducts.filter(
        (p) => (p.stockQuantity ?? 0) <= (p.minThreshold ?? 20)
      );

      if (lowStockProducts.length === 0) continue;

      let totalOrderCost = 0;
      const orderItems = [];

      for (const product of lowStockProducts) {
        const minThresh = product.minThreshold ?? 20;
        const maxThresh = product.maxThreshold ?? 100;
        const currentStock = product.stockQuantity ?? 0;
        const orderQty = Math.max(1, maxThresh - currentStock);
        const unitCost = Number(product.purchasePrice ?? 0);
        const lineTotal = orderQty * unitCost;

        totalOrderCost += lineTotal;
        orderItems.push({
          id: product.id,
          name: product.name,
          currentStock,
          minThreshold: minThresh,
          maxThreshold: maxThresh,
          reorderQuantity: orderQty,
          unitCost,
          totalLineCost: Number(lineTotal.toFixed(3)),
          barcode: product.barcode || null,
        });
      }

      const mov = Number(distributor.minimumOrderValue ?? 0);

      // 4. The Enterprise MOQ Check: Meets distributor Minimum Order Value rule or explicitly bypassed?
      if (totalOrderCost >= mov || bypassMov) {
        // Check if an existing draft already exists for this distributor
        const existingDraft = await db.orm.PurchaseOrder.where({
          distributorId: distributor.id,
          status: 'DRAFT',
        }).all().first();

        if (existingDraft) {
          // Update the existing draft with latest quantities and pricing
          await db.orm.PurchaseOrder.where({ id: existingDraft.id }).update({
            supplierName: distributor.name,
            whatsappNumber: distributor.whatsappNumber || existingDraft.whatsappNumber || '97339000000',
            supplierEmail: distributor.contactEmail || existingDraft.supplierEmail || 'supplier@askar.bh',
            estimatedCost: Number(totalOrderCost.toFixed(3)),
            itemsJson: JSON.stringify(orderItems),
            updatedAt: new Date(),
          });

          drafts.push({
            ...existingDraft,
            estimatedCost: Number(totalOrderCost.toFixed(3)),
            itemsJson: JSON.stringify(orderItems),
          });

          console.log(
            `🔄 [PO Updated] Refreshed draft #${existingDraft.id.slice(0, 8)} for ${distributor.name} (Total: BD ${totalOrderCost.toFixed(3)})`
          );
        } else {
          // Bundle low-stock items into a new Purchase Order
          const draftRecord = {
            id: crypto.randomUUID(),
            distributorId: distributor.id,
            supplierName: distributor.name,
            whatsappNumber: distributor.whatsappNumber || '97339000000',
            supplierEmail: distributor.contactEmail || 'supplier@askar.bh',
            status: 'DRAFT',
            estimatedCost: Number(totalOrderCost.toFixed(3)),
            itemsJson: JSON.stringify(orderItems),
            createdAt: new Date(),
          };

          await db.orm.PurchaseOrder.create(draftRecord);
          drafts.push(draftRecord);

          console.log(
            `📦 [PO Generated] Bundled ${orderItems.length} items for ${distributor.name} (Total: BD ${totalOrderCost.toFixed(3)} >= MOV: BD ${mov.toFixed(3)})`
          );
        }
      } else {
        const skippedInfo = {
          distributorId: distributor.id,
          distributorName: distributor.name,
          contactEmail: distributor.contactEmail,
          totalOrderCost: Number(totalOrderCost.toFixed(3)),
          minimumOrderValue: mov,
          deficit: Number((mov - totalOrderCost).toFixed(3)),
          lowStockCount: orderItems.length,
          items: orderItems,
        };
        skipped.push(skippedInfo);

        console.warn(
          `⚠️ [PO Skipped - Below MOV] Skipped PO for ${distributor.name}. Order total (BD ${totalOrderCost.toFixed(3)}) is below minimum (BD ${mov.toFixed(3)}). Deficit: BD ${(mov - totalOrderCost).toFixed(3)}.`
        );
      }
    }

    // Handle any unassigned items (if any exist without a distributorId)
    const unassignedItems = productsByDistributor.get('UNASSIGNED') || [];
    const unassignedLowStock = unassignedItems.filter(
      (p) => (p.stockQuantity ?? 0) <= (p.minThreshold ?? 20)
    );

    if (unassignedLowStock.length > 0) {
      console.warn(
        `⚠️ Found ${unassignedLowStock.length} low-stock products without an assigned distributor. Grouping into Unassigned PO draft.`
      );
      let unassignedTotal = 0;
      const unassignedOrderItems = unassignedLowStock.map((p) => {
        const orderQty = Math.max(1, (p.maxThreshold ?? 100) - (p.stockQuantity ?? 0));
        const unitCost = Number(p.purchasePrice ?? 0);
        const lineTotal = orderQty * unitCost;
        unassignedTotal += lineTotal;
        return {
          id: p.id,
          name: p.name,
          currentStock: p.stockQuantity ?? 0,
          minThreshold: p.minThreshold ?? 20,
          maxThreshold: p.maxThreshold ?? 100,
          reorderQuantity: orderQty,
          unitCost,
          totalLineCost: Number(lineTotal.toFixed(3)),
          barcode: p.barcode || null,
        };
      });

      const unassignedDraft = {
        id: crypto.randomUUID(),
        distributorId: null,
        supplierName: 'Unassigned Supplier',
        whatsappNumber: '97339000000',
        supplierEmail: 'supplier@askar.bh',
        status: 'DRAFT',
        estimatedCost: Number(unassignedTotal.toFixed(3)),
        itemsJson: JSON.stringify(unassignedOrderItems),
        createdAt: new Date(),
      };
      await db.orm.PurchaseOrder.create(unassignedDraft);
      drafts.push(unassignedDraft);
    }

    console.log(
      `✅ [Auto-Restock Complete] Created ${drafts.length} PO drafts. Skipped ${skipped.length} distributors below MOV.`
    );

    return {
      success: true,
      draftCount: drafts.length,
      drafts,
      skippedCount: skipped.length,
      skipped,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Failed to run distributor-based reorder check:', error);
    throw error;
  }
};

export const startReorderCron = () => {
  // Schedule to run at 11:00 PM every night: '0 23 * * *'
  cron.schedule('0 23 * * *', async () => {
    try {
      await runReorderCheck();
    } catch (err) {
      console.error('Error in scheduled 11:00 PM reorder cron:', err);
    }
  });

  console.log('✅ Automated Distributor-Based Reorder Cron Job Registered (Runs at 11:00 PM)');
};
