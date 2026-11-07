import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { db, dataDir } from '../db.js';

export default async function productRoutes(fastify, options) {
  const uploadsStaticDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsStaticDir)) {
    fs.mkdirSync(uploadsStaticDir, { recursive: true });
  }

  // Persistent Quick Products Configuration
  const QUICK_CONFIG_FILE = path.join(dataDir, 'quick_products_config.json');

  const loadQuickConfig = () => {
    try {
      if (fs.existsSync(QUICK_CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(QUICK_CONFIG_FILE, 'utf-8'));
      }
    } catch (e) {
      // fallback
    }
    return { overrides: {}, removedIds: [] };
  };

  const saveQuickConfig = (config) => {
    try {
      fs.writeFileSync(QUICK_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      fastify.log.error('Error saving quick config:', e);
    }
  };

  // 1. Zero-Heap Hardware Photo Upload Endpoint (Feitian F100 PIM)
  fastify.post('/api/products/upload-photo', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file attached' });
      }

      const barcode = (data.fields?.barcode?.value || request.query?.barcode || '').trim();
      const productUploadsDir = path.join(uploadsStaticDir, 'products');
      if (!fs.existsSync(productUploadsDir)) {
        fs.mkdirSync(productUploadsDir, { recursive: true });
      }

      const ext = path.extname(data.filename) || '.jpg';
      const fileName = `prod_${barcode || 'f100'}_${Date.now()}${ext}`;
      const filePath = path.join(productUploadsDir, fileName);

      await pipeline(data.file, fs.createWriteStream(filePath));
      const publicUrl = `/uploads/products/${fileName}`;

      if (barcode) {
        try {
          await db.execute({
            sql: `UPDATE Product SET image_url = ?, updatedAt = CURRENT_TIMESTAMP WHERE barcode = ? OR id = ?`,
            args: [publicUrl, barcode, barcode]
          });
        } catch {}
      }

      return { success: true, url: publicUrl, fileName };
    } catch (err) {
      fastify.log.error('Photo upload error:', err);
      return reply.status(500).send({ error: 'Upload failed', message: err.message });
    }
  });

  // 2. Catalog listing routes
  fastify.get('/products', async () => {
    return await db.orm.Product.all();
  });

  fastify.get('/api/products', async () => {
    const [products, distributors] = await Promise.all([
      db.orm.Product.all(),
      db.orm.Distributor.all()
    ]);
    const distMap = new Map(distributors.map(d => [d.id, d]));
    return products.map(p => ({
      ...p,
      distributor: p.distributorId ? distMap.get(p.distributorId) || null : null
    }));
  });

  // 3. Quick Products Grid
  fastify.get('/api/quick-products', async () => {
    try {
      const allProducts = await db.orm.Product.all();
      const config = loadQuickConfig();
      const removedSet = new Set((config.removedIds || []).map(String));

      // Tally recent 7-day sales velocity if any
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const salesCountByProduct = {};
      try {
        const recentSales = await db.orm.Sale.all();
        const recentSaleIds = new Set(
          recentSales
            .filter((s) => s.createdAt && new Date(s.createdAt) >= sevenDaysAgo)
            .map((s) => s.id)
        );
        const allSaleItems = await db.orm.SaleItem.all();
        for (const item of allSaleItems) {
          if (recentSaleIds.has(item.saleId)) {
            salesCountByProduct[item.productId] = (salesCountByProduct[item.productId] || 0) + (item.quantity || 1);
          }
        }
      } catch (e) {
        // SaleItem tally fallback
      }

      const categorize = (prod) => {
        const name = (prod.name || '').toLowerCase();
        if (name.includes('mutton') || name.includes('beef') || name.includes('meat') || name.includes('chicken')) {
          return 'MEAT';
        }
        if (name.includes('bread') || name.includes('khubz') || name.includes('samoli') || name.includes('croissant') || name.includes('bun')) {
          return 'BAKERY';
        }
        if (name.includes('milk') || name.includes('laban') || name.includes('feta') || name.includes('cheese') || name.includes('butter') || name.includes('dairy') || name.includes('yogurt')) {
          return 'DAIRY';
        }
        if (name.includes('tomato') || name.includes('cucumber') || name.includes('banana') || name.includes('onion') || name.includes('potato') || name.includes('mint') || name.includes('parsley') || name.includes('lemon') || name.includes('orange') || name.includes('apple')) {
          return 'PRODUCE';
        }
        return 'ESSENTIALS';
      };

      const eligibleProducts = allProducts.filter((p) => {
        if (removedSet.has(String(p.id)) || (p.barcode && removedSet.has(String(p.barcode)))) {
          return false;
        }
        const override = config.overrides ? (config.overrides[p.id] || (p.barcode ? config.overrides[p.barcode] : null)) : null;
        if (override?.isQuickProduct === false) {
          return false;
        }
        return true;
      });

      const scored = eligibleProducts.map((p) => {
        const override = config.overrides ? (config.overrides[p.id] || (p.barcode ? config.overrides[p.barcode] : null)) : null;
        const recentQty = salesCountByProduct[p.id] || 0;
        const isNonBarcoded = !p.barcode || p.barcode.trim() === '';
        const isScale = p.isScaleItem || (p.barcode && (p.barcode.startsWith('20') || p.barcode.startsWith('001')));
        const isExplicitQuick = override?.isQuickProduct === true;
        const priorityBonus = (isExplicitQuick ? 1000 : 0) + (isNonBarcoded ? 60 : (isScale ? 30 : 0));
        return {
          ...p,
          category: override?.category || categorize(p),
          quickColor: override?.quickColor || null,
          isQuickProduct: true,
          score: recentQty * 2 + priorityBonus,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 15);
    } catch (err) {
      fastify.log.error(err);
      return [];
    }
  });

  fastify.post('/api/quick-products/update', async (request, reply) => {
    const { id, barcode, category, quickColor, isQuickProduct } = request.body || {};
    if (!id && !barcode) {
      return reply.status(400).send({ error: 'Missing product id or barcode' });
    }
    const config = loadQuickConfig();
    const targetId = String(id || barcode);
    config.overrides = config.overrides || {};
    config.removedIds = config.removedIds || [];

    if (isQuickProduct === false) {
      config.overrides[targetId] = { ...config.overrides[targetId], isQuickProduct: false };
      if (!config.removedIds.includes(targetId)) config.removedIds.push(targetId);
    } else {
      config.removedIds = config.removedIds.filter((item) => item !== targetId);
      config.overrides[targetId] = {
        ...config.overrides[targetId],
        isQuickProduct: true,
        category: category || config.overrides[targetId]?.category || 'ESSENTIALS',
        quickColor: quickColor !== undefined ? quickColor : config.overrides[targetId]?.quickColor
      };
    }
    saveQuickConfig(config);
    return { success: true, message: 'Quick product updated successfully', config: config.overrides[targetId] };
  });

  fastify.post('/api/quick-products/swap', async (request, reply) => {
    const { oldId, newId, category, quickColor } = request.body || {};
    if (!oldId || !newId) {
      return reply.status(400).send({ error: 'Missing oldId or newId' });
    }
    const config = loadQuickConfig();
    config.overrides = config.overrides || {};
    config.removedIds = config.removedIds || [];

    const oldKey = String(oldId);
    config.overrides[oldKey] = { ...config.overrides[oldKey], isQuickProduct: false };
    if (!config.removedIds.includes(oldKey)) config.removedIds.push(oldKey);

    const newKey = String(newId);
    config.removedIds = config.removedIds.filter((item) => item !== newKey);
    config.overrides[newKey] = {
      isQuickProduct: true,
      category: category || config.overrides[oldKey]?.category || 'ESSENTIALS',
      quickColor: quickColor || config.overrides[oldKey]?.quickColor || null
    };

    saveQuickConfig(config);
    return { success: true, message: `Swapped ${oldId} with ${newId}` };
  });

  fastify.post('/api/quick-products/remove', async (request, reply) => {
    const { id, barcode } = request.body || {};
    const targetId = String(id || barcode || '');
    if (!targetId) {
      return reply.status(400).send({ error: 'Missing id or barcode' });
    }
    const config = loadQuickConfig();
    config.overrides = config.overrides || {};
    config.removedIds = config.removedIds || [];

    config.overrides[targetId] = { ...config.overrides[targetId], isQuickProduct: false };
    if (!config.removedIds.includes(targetId)) config.removedIds.push(targetId);

    saveQuickConfig(config);
    return { success: true, message: `Removed ${targetId} from quick products` };
  });

  const DEFAULT_QUICK_CATEGORIES = [
    { id: 'ALL', label: 'All Items', color: 'slate' },
    { id: 'PRODUCE', label: 'Produce 🥦', color: 'emerald' },
    { id: 'BAKERY', label: 'Bakery 🥖', color: 'amber' },
    { id: 'DAIRY', label: 'Dairy 🥛', color: 'sky' },
    { id: 'MEAT', label: 'Meat / Deli 🥩', color: 'rose' },
    { id: 'ESSENTIALS', label: 'Essentials ⚡', color: 'slate' }
  ];

  fastify.get('/api/quick-categories', async () => {
    const config = loadQuickConfig();
    return {
      success: true,
      categories: config.categories && Array.isArray(config.categories) && config.categories.length > 0
        ? config.categories
        : DEFAULT_QUICK_CATEGORIES
    };
  });

  fastify.post('/api/quick-categories', async (request, reply) => {
    const { categories } = request.body || {};
    if (!categories || !Array.isArray(categories)) {
      return reply.status(400).send({ error: 'Categories array is required' });
    }
    const config = loadQuickConfig();
    config.categories = categories;
    saveQuickConfig(config);
    return { success: true, message: 'Quick categories updated successfully', categories };
  });

  // 4. Product Search & Barcode Lookup
  fastify.get('/api/products/search', async (request) => {
    const { distributorId, q = '' } = request.query || {};
    const query = q.toLowerCase().trim();
    const [allProducts, distributors] = await Promise.all([
      db.orm.Product.all(),
      db.orm.Distributor.all()
    ]);
    const distMap = new Map(distributors.map(d => [d.id, d]));

    const filtered = allProducts.filter((p) => {
      const matchesDist = !distributorId || p.distributorId === distributorId;
      const matchesQuery = !query ||
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.id && String(p.id).toLowerCase().includes(query)) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(query));
      return matchesDist && matchesQuery;
    });

    return filtered.map((p) => ({
      ...p,
      unitCost: Number(p.purchasePrice || p.unitCost || 1.0),
      distributor: p.distributorId ? distMap.get(p.distributorId) || null : null
    }));
  });

  fastify.get('/api/products/barcode/:barcode', async (request, reply) => {
    const { barcode } = request.params;
    const clean = String(barcode || '').trim().toLowerCase();
    if (!clean) return reply.status(400).send({ error: 'Barcode is required' });
    const allProducts = await db.orm.Product.all();
    const found = allProducts.find(p => (p.barcode || '').trim().toLowerCase() === clean || (p.id || '').trim().toLowerCase() === clean);
    if (!found) return reply.status(404).send({ error: 'Product not found' });
    const dist = found.distributorId ? await db.orm.Distributor.where({ id: found.distributorId }).all().first() : null;
    return { ...found, distributor: dist || null };
  });

  // 5. Bulk CSV Upsert
  fastify.post('/api/products/bulk-upsert', async (request, reply) => {
    const { products } = request.body || {};
    if (!Array.isArray(products) || products.length === 0) {
      return reply.status(400).send({ error: 'No products provided' });
    }

    const allDistributors = await db.orm.Distributor.all();
    const distByName = new Map(allDistributors.map(d => [d.name.toLowerCase().trim(), d]));
    const defaultDist = allDistributors[0]?.id || 'dist_local';

    let createdCount = 0;
    let updatedCount = 0;

    await db.transaction(async (tx) => {
      for (const p of products) {
        const pid = String(p.id || p.barcode || crypto.randomUUID()).trim();
        const existing = await tx.orm.Product.where({ id: pid }).all().first();

        let distId = p.distributorId;
        if (!distId && p.supplierName) {
          const matched = distByName.get(String(p.supplierName).toLowerCase().trim());
          if (matched) distId = matched.id;
        }
        if (!distId) distId = defaultDist;

        const cost = Number(p.purchasePrice || p.costPrice || p.unitCost || 0);
        const sell = Number(p.sellingPrice || p.price || 0);
        const finalVat = p.vatRate !== undefined ? Number(p.vatRate) : 10.0;
        const finalTax = p.taxRate !== undefined ? Number(p.taxRate) : finalVat / 100.0;

        const prodRecord = {
          name: p.name || 'Unnamed Product',
          purchasePrice: cost,
          unitCost: cost,
          sellingPrice: sell,
          stockQuantity: Number(p.stockQuantity ?? 0),
          category: p.category ? String(p.category).toUpperCase() : (existing?.category || 'GROCERY'),
          minThreshold: Number(p.minThreshold ?? 20),
          maxThreshold: Number(p.maxThreshold ?? 100),
          distributorId: distId,
          supplierName: p.supplierName || 'Local Distributor',
          supplierEmail: p.supplierEmail || 'supplier@askar.bh',
          barcode: p.barcode ? String(p.barcode).trim() : null,
          vatRate: finalVat,
          taxRate: finalTax,
          is_weighed_item: (p.is_weighed_item === true || p.is_weighed_item === 1 || p.is_weighed_item === 'true') ? 1 : 0,
          tenantId: p.tenantId || 'tenant_askar_01',
          updatedAt: new Date()
        };

        if (existing) {
          await tx.orm.Product.where({ id: pid }).update(prodRecord);
          updatedCount++;
        } else {
          await tx.orm.Product.create({ id: pid, ...prodRecord });
          createdCount++;
        }
      }
    });

    return { success: true, createdCount, updatedCount, total: products.length };
  });

  // 6. Feitian F100 PIM Native Push Sync Endpoint
  fastify.post('/api/sync/pim-push', async (request, reply) => {
  const { batch } = request.body || {};
  if (!Array.isArray(batch) || batch.length === 0) {
    return reply.status(400).send({ error: 'No batch items provided' });
  }

  const allDistributors = await db.orm.Distributor.all();
  const distByName = new Map(allDistributors.map(d => [d.name.toLowerCase().trim(), d]));
  const defaultDist = allDistributors[0]?.id || 'dist_local';

  // Ensure public uploads directory exists for photos
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'products');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const syncedLocalIds = [];
  let processedCount = 0;

  try {
    await db.transaction(async (tx) => {
      for (const item of batch) {
        const localId = item.local_id || item.id;
        const cleanBarcode = item.barcode ? String(item.barcode).trim() : '';
        const data = item.data || item;
        const rawImage = item.image || data.image;

        let imagePath = null;
        if (rawImage && typeof rawImage === 'string') {
          if (rawImage.startsWith('/uploads/') || rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
            imagePath = rawImage;
          } else if (rawImage.startsWith('data:image/')) {
            try {
              const matches = rawImage.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
              if (matches) {
                const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                const fileName = `f100_${cleanBarcode || Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                const filePath = path.join(uploadsDir, fileName);
                fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
                imagePath = `/uploads/products/${fileName}`;
              }
            } catch (imgErr) {
              fastify.log.warn('Could not save F100 product image:', imgErr);
            }
          }
        }

        // Find existing product by barcode first, then by ID
        let existing = null;
        if (cleanBarcode) {
          existing = await tx.orm.Product.where({ barcode: cleanBarcode }).all().first();
        }
        if (!existing && data.id) {
          existing = await tx.orm.Product.where({ id: data.id }).all().first();
        }

        // Resolve distributor
        let distId = data.distributorId;
        if (!distId && data.supplierName) {
          const matched = distByName.get(String(data.supplierName).toLowerCase().trim());
          if (matched) distId = matched.id;
        }
        if (!distId) distId = defaultDist;

        const costVal = Number(data.purchasePrice ?? data.unitCost ?? 0);
        const sellVal = Number(data.sellingPrice ?? data.price ?? (costVal > 0 ? Number((costVal * 1.3).toFixed(3)) : 1.0));
        const intakeQty = Number(data.intakeQty ?? 1);
        const stockMode = data.stockMode || 'ADD'; // ADD = additive, SET = cycle count override

        const finalVatRate = data.vatRate !== undefined ? Number(data.vatRate) : 10.0;
        const finalTaxRate = finalVatRate / 100.0;

        const isWeighedVal = (data.is_weighed_item === true || data.is_weighed_item === 1 || data.is_weighed_item === 'true') ? 1 : 0;

        if (existing) {
          // Calculate updated stock based on intake mode
          const currentStock = Number(existing.stockQuantity) || 0;
          const updatedStock = stockMode === 'ADD' ? currentStock + intakeQty : intakeQty;

          const updateRecord = {
            name: data.name?.trim() || existing.name,
            purchasePrice: costVal > 0 ? costVal : existing.purchasePrice,
            unitCost: costVal > 0 ? costVal : existing.unitCost,
            sellingPrice: sellVal > 0 ? sellVal : existing.sellingPrice,
            stockQuantity: updatedStock,
            category: data.category ? String(data.category).toUpperCase() : (existing.category || 'GROCERY'),
            minThreshold: Number(data.minThreshold ?? existing.minThreshold ?? 20),
            maxThreshold: Number(data.maxThreshold ?? existing.maxThreshold ?? 100),
            distributorId: distId,
            supplierName: data.supplierName || existing.supplierName || 'Local Distributor',
            supplierEmail: data.supplierEmail || existing.supplierEmail || 'supplier@askar.bh',
            vatRate: finalVatRate,
            taxRate: finalTaxRate,
            is_weighed_item: isWeighedVal,
            updatedAt: new Date()
          };
          if (imagePath) updateRecord.image_url = imagePath;

          await db.orm.Product.where({ id: existing.id }).update(updateRecord);

          // Log Stock Intake Audit Movement
          try {
            await db.orm.StockMovement.create({
              id: crypto.randomUUID(),
              productId: existing.id,
              quantityChange: stockMode === 'ADD' ? intakeQty : (intakeQty - currentStock),
              newStockLevel: updatedStock,
              movementType: 'IN_DELIVERY',
              reason: data.reason || 'F100 Handheld Stock Intake',
              changedBy: data.changedBy || 'F100 Warehouse Staff',
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch { }

          // Mirror to Turso if active
          try {
            await db.execute({
              sql: `UPDATE Product SET name = ?, purchasePrice = ?, unitCost = ?, sellingPrice = ?, stockQuantity = ?, minThreshold = ?, maxThreshold = ?, supplierName = ?, supplierEmail = ?, distributorId = ?, vatRate = ?, taxRate = ?, is_weighed_item = ?, updatedAt = ? WHERE id = ?`,
              args: [
                updateRecord.name,
                updateRecord.purchasePrice,
                updateRecord.unitCost,
                updateRecord.sellingPrice,
                updateRecord.stockQuantity,
                updateRecord.minThreshold,
                updateRecord.maxThreshold,
                updateRecord.supplierName,
                updateRecord.supplierEmail,
                updateRecord.distributorId,
                updateRecord.vatRate,
                updateRecord.taxRate,
                isWeighedVal,
                updateRecord.updatedAt.toISOString(),
                existing.id
              ]
            });
          } catch { }

        } else {
          // Brand New Product Creation
          const newId = data.id || `f100_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const initialStock = stockMode === 'ADD' ? intakeQty : intakeQty;

          const createRecord = {
            id: newId,
            name: data.name?.trim() || `Item ${cleanBarcode || 'Bulk'}`,
            purchasePrice: costVal,
            unitCost: costVal,
            sellingPrice: sellVal,
            stockQuantity: initialStock,
            category: data.category ? String(data.category).toUpperCase() : 'GROCERY',
            minThreshold: Number(data.minThreshold ?? 20),
            maxThreshold: Number(data.maxThreshold ?? 100),
            distributorId: distId,
            supplierName: data.supplierName || 'Local Distributor',
            supplierEmail: data.supplierEmail || 'supplier@askar.bh',
            barcode: cleanBarcode || null,
            vatRate: finalVatRate,
            taxRate: finalTaxRate,
            is_weighed_item: isWeighedVal,
            tenantId: 'tenant_askar_01',
            updatedAt: new Date()
          };
          if (imagePath) createRecord.image_url = imagePath;

          await db.orm.Product.create(createRecord);

          // Save category if provided
          if (data.category) {
            try {
              const config = loadQuickConfig();
              config.overrides = config.overrides || {};
              config.overrides[newId] = {
                isQuickProduct: true,
                category: String(data.category).toUpperCase()
              };
              saveQuickConfig(config);
            } catch { }
          }

          // Initial Stock Movement
          try {
            await db.orm.StockMovement.create({
              id: crypto.randomUUID(),
              productId: newId,
              quantityChange: initialStock,
              newStockLevel: initialStock,
              movementType: 'IN_DELIVERY',
              reason: data.reason || 'F100 Initial Catalog Intake',
              changedBy: data.changedBy || 'F100 Warehouse Staff',
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch { }

          // Initial Price History
          try {
            await db.orm.ProductPriceHistory.create({
              id: crypto.randomUUID(),
              productId: newId,
              productName: createRecord.name,
              oldPrice: sellVal,
              newPrice: sellVal,
              oldCost: costVal,
              newCost: costVal,
              changeReason: 'F100 Handheld Onboarding',
              changedBy: data.changedBy || 'F100 Warehouse Staff',
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch { }

          // Mirror to Turso if active
          try {
            await db.execute({
              sql: `INSERT OR REPLACE INTO Product (id, tenantId, name, purchasePrice, unitCost, sellingPrice, stockQuantity, minThreshold, maxThreshold, supplierName, supplierEmail, distributorId, vatRate, taxRate, barcode, is_weighed_item, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                createRecord.id,
                createRecord.tenantId,
                createRecord.name,
                createRecord.purchasePrice,
                createRecord.unitCost,
                createRecord.sellingPrice,
                createRecord.stockQuantity,
                createRecord.minThreshold,
                createRecord.maxThreshold,
                createRecord.supplierName,
                createRecord.supplierEmail,
                createRecord.distributorId,
                createRecord.vatRate,
                createRecord.taxRate,
                createRecord.barcode,
                isWeighedVal,
                createRecord.updatedAt.toISOString()
              ]
            });
          } catch { }
        }

        if (localId !== undefined && localId !== null) {
          syncedLocalIds.push(localId);
        }
        processedCount++;
      }
    });

    fastify.log.info(`[F100 PIM Sync] Successfully ingested ${processedCount} products from F100 terminal.`);
    return {
      success: true,
      processedCount,
      syncedIds: syncedLocalIds
    };
  } catch (error) {
    fastify.log.error('F100 PIM Sync Batch Failed:', error);
    return reply.status(500).send({
      success: false,
      error: 'Sync transaction failed',
      details: error.message
    });
  }
});

  // 7. Thresholds and Supplier Details
  fastify.put('/api/products/:id/thresholds', async (request, reply) => {
    const { id } = request.params;
    const {
      name,
      sellingPrice,
      purchasePrice,
      unitCost,
      stockQuantity,
      minThreshold,
      maxThreshold,
      barcode,
      supplierName,
      supplierEmail,
      distributorId,
      category,
      vatRate,
      is_weighed_item,
      reason,
      changedBy = 'Manager'
    } = request.body || {};

    const existing = await db.orm.Product.where({ id }).all().first();
    if (!existing) {
      return reply.status(404).send({ error: 'Product not found' });
    }

    const updateData = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name.trim();
    if (minThreshold !== undefined) updateData.minThreshold = Number(minThreshold);
    if (maxThreshold !== undefined) updateData.maxThreshold = Number(maxThreshold);
    if (supplierName !== undefined) updateData.supplierName = supplierName;
    if (supplierEmail !== undefined) updateData.supplierEmail = supplierEmail;
    if (distributorId !== undefined) {
      updateData.distributorId = distributorId;
      if (distributorId) {
        const dist = await db.orm.Distributor.where({ id: distributorId }).all().first();
        if (dist) {
          updateData.supplierName = dist.name;
          updateData.supplierEmail = dist.contactEmail;
        }
      }
    }
    if (barcode !== undefined) updateData.barcode = barcode ? String(barcode).trim() : null;
    if (category !== undefined) updateData.category = String(category).toUpperCase();
    if (vatRate !== undefined) updateData.vatRate = Number(vatRate);
    if (is_weighed_item !== undefined) updateData.is_weighed_item = (is_weighed_item === true || is_weighed_item === 1 || is_weighed_item === 'true') ? 1 : 0;
    if (stockQuantity !== undefined) updateData.stockQuantity = Number(stockQuantity);

    const oldPrice = Number(existing.sellingPrice);
    const oldCost = Number(existing.purchasePrice ?? existing.unitCost ?? 0);
    const newPrice = sellingPrice !== undefined ? Number(sellingPrice) : oldPrice;
    const newCost = purchasePrice !== undefined ? Number(purchasePrice) : (unitCost !== undefined ? Number(unitCost) : oldCost);

    if (sellingPrice !== undefined) updateData.sellingPrice = newPrice;
    if (purchasePrice !== undefined || unitCost !== undefined) {
      updateData.purchasePrice = newCost;
      updateData.unitCost = newCost;
    }

    if (Math.abs(oldPrice - newPrice) > 0.0001 || Math.abs(oldCost - newCost) > 0.0001) {
      try {
        await db.orm.ProductPriceHistory.create({
          id: crypto.randomUUID(),
          productId: id,
          productName: updateData.name || existing.name,
          oldPrice,
          newPrice,
          oldCost,
          newCost,
          changeReason: reason || 'Inventory threshold / product configuration adjusted',
          changedBy,
          createdAt: new Date(),
          tenantId: 'tenant_askar_01'
        });
      } catch (err) {
        fastify.log.warn('Could not save price history:', err.message);
      }
    }

    await db.orm.Product.where({ id }).update(updateData);
    const updated = await db.orm.Product.where({ id }).all().first();
    return { success: true, product: updated };
  });

  // 8. Create Product Handler
  const handleCreateProduct = async (request, reply) => {
    try {
      const {
        id,
        name,
        unitCost,
        purchasePrice,
        sellingPrice,
        stockQuantity,
        minThreshold,
        maxThreshold,
        distributorId,
        barcode,
        supplierName,
        supplierEmail,
        vatRate,
        is_weighed_item,
        category
      } = request.body || {};

      if (!name || !name.trim()) {
        return reply.status(400).send({ success: false, error: 'Product name is required' });
      }

      const prodId = (id || barcode || crypto.randomUUID()).trim();
      const cleanBarcode = (barcode || id || prodId).trim();

      let existing = await db.orm.Product.where({ id: prodId }).all().first();
      if (!existing && cleanBarcode) {
        existing = await db.orm.Product.where({ barcode: cleanBarcode }).all().first();
      }
      if (!existing && name && name.trim()) {
        const allProds = await db.orm.Product.all();
        existing = allProds.find(p => (p.name || '').trim().toLowerCase() === name.trim().toLowerCase());
      }
      if (existing) {
        request.params = { id: existing.id };
        return handleUpdateProduct(request, reply);
      }

      let sName = supplierName || 'Local Supplier';
      let sEmail = supplierEmail || 'supplier@askar.bh';
      let validDistId = distributorId || null;

      if (distributorId) {
        const dist = await db.orm.Distributor.where({ id: distributorId }).all().first();
        if (dist) {
          sName = dist.name;
          sEmail = dist.contactEmail;
          validDistId = dist.id;
        }
      }

      const cost = Number(unitCost ?? purchasePrice ?? 0);
      const price = Number(sellingPrice ?? (cost > 0 ? Number((cost * 1.3).toFixed(3)) : 1.0));
      const finalVatRate = vatRate !== undefined ? Number(vatRate) : 10.0;
      const finalTaxRate = finalVatRate / 100.0;

      const newProd = {
        id: prodId,
        name: name.trim(),
        purchasePrice: cost,
        unitCost: cost,
        sellingPrice: price,
        stockQuantity: Number(stockQuantity ?? 1),
        minThreshold: Number(minThreshold ?? 10),
        maxThreshold: Number(maxThreshold ?? 50),
        distributorId: validDistId,
        supplierName: sName,
        supplierEmail: sEmail,
        barcode: cleanBarcode,
        category: category ? String(category).toUpperCase() : 'GROCERY',
        is_weighed_item: (is_weighed_item === true || is_weighed_item === 1 || is_weighed_item === 'true') ? 1 : 0,
        vatRate: finalVatRate,
        taxRate: finalTaxRate,
        tenantId: 'tenant_askar_01',
        updatedAt: new Date()
      };

      await db.orm.Product.create(newProd);

      try {
        await db.execute({
          sql: `INSERT OR REPLACE INTO Product (id, tenantId, name, purchasePrice, unitCost, sellingPrice, stockQuantity, minThreshold, maxThreshold, supplierName, supplierEmail, distributorId, vatRate, taxRate, barcode, is_weighed_item, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            newProd.id,
            newProd.tenantId,
            newProd.name,
            newProd.purchasePrice,
            newProd.unitCost,
            newProd.sellingPrice,
            newProd.stockQuantity,
            newProd.minThreshold,
            newProd.maxThreshold,
            newProd.supplierName,
            newProd.supplierEmail,
            newProd.distributorId,
            newProd.vatRate,
            newProd.taxRate,
            newProd.barcode,
            newProd.is_weighed_item,
            newProd.updatedAt.toISOString()
          ]
        });
      } catch (err) {}

      if (category) {
        try {
          const config = loadQuickConfig();
          config.overrides = config.overrides || {};
          config.overrides[prodId] = {
            isQuickProduct: true,
            category: String(category).toUpperCase()
          };
          saveQuickConfig(config);
        } catch (err) {
          fastify.log.warn('Could not save quick category override:', err);
        }
      }

      try {
        await db.orm.ProductPriceHistory.create({
          id: crypto.randomUUID(),
          productId: prodId,
          productName: name.trim(),
          oldPrice: price,
          newPrice: price,
          oldCost: cost,
          newCost: cost,
          changeReason: 'Initial Catalog Onboarding (Quick Add / PIM)',
          changedBy: 'Cashier / Manager',
          createdAt: new Date(),
          tenantId: 'tenant_askar_01'
        });
      } catch (e) {}

      return {
        success: true,
        message: 'Product added to catalog and inventory!',
        product: {
          ...newProd,
          category: category || 'ESSENTIALS'
        },
        ...newProd,
        category: category || 'ESSENTIALS'
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to create product', details: error.message });
    }
  };

  fastify.post('/api/products', handleCreateProduct);
  fastify.post('/products', handleCreateProduct);

  // 9. Barcode Binding
  fastify.post('/api/products/:id/bind-barcode', async (request, reply) => {
    const { id } = request.params;
    const { barcode } = request.body || {};

    const cleanBarcode = (barcode !== undefined && barcode !== null) ? String(barcode).trim() : '';
    if (!cleanBarcode) {
      await db.orm.Product.where({ id }).update({
        barcode: null,
        updatedAt: new Date()
      });
      const updated = await db.orm.Product.where({ id }).all().first();
      return { success: true, product: updated, unassigned: true };
    }

    const allProds = await db.orm.Product.all();
    const conflict = allProds.find(
      (p) => p.id !== id && (
        (p.barcode || '').trim().toLowerCase() === cleanBarcode.toLowerCase() ||
        p.id.trim().toLowerCase() === cleanBarcode.toLowerCase()
      )
    );

    if (conflict) {
      return reply.status(400).send({
        error: `Barcode [${cleanBarcode}] is already assigned to "${conflict.name}"`
      });
    }

    const target = allProds.find((p) => p.id === id);
    if (!target) {
      return reply.status(404).send({ error: 'Product not found' });
    }

    await db.orm.Product.where({ id }).update({
      barcode: cleanBarcode,
      updatedAt: new Date()
    });

    const updated = await db.orm.Product.where({ id }).all().first();
    return { success: true, product: updated };
  });

  // 10. Update Product Handler
  const handleUpdateProduct = async (request, reply) => {
    const { id } = request.params;
    const {
      name,
      sellingPrice,
      purchasePrice,
      unitCost,
      stockQuantity,
      minThreshold,
      maxThreshold,
      barcode,
      distributorId,
      supplierName,
      supplierEmail,
      vatRate,
      category,
      is_weighed_item,
      reason,
      changedBy = 'Manager'
    } = request.body || {};

    try {
      const existing = await db.orm.Product.where({ id }).all().first();
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Product not found' });
      }

      const updateData = { updatedAt: new Date() };

      if (name !== undefined) updateData.name = String(name).trim();
      if (stockQuantity !== undefined) updateData.stockQuantity = Number(stockQuantity);
      if (minThreshold !== undefined) updateData.minThreshold = Number(minThreshold);
      if (maxThreshold !== undefined) updateData.maxThreshold = Number(maxThreshold);
      if (barcode !== undefined) updateData.barcode = barcode ? String(barcode).trim() : null;
      if (distributorId !== undefined) {
        updateData.distributorId = distributorId || null;
        if (distributorId) {
          const dist = await db.orm.Distributor.where({ id: distributorId }).all().first();
          if (dist) {
            updateData.supplierName = dist.name;
            updateData.supplierEmail = dist.contactEmail;
          }
        }
      } else if (supplierName !== undefined) {
        updateData.supplierName = supplierName || null;
      }
      if (supplierEmail !== undefined) updateData.supplierEmail = supplierEmail || null;
      if (category !== undefined) updateData.category = String(category).toUpperCase();
      if (is_weighed_item !== undefined) updateData.is_weighed_item = (is_weighed_item === true || is_weighed_item === 1 || is_weighed_item === 'true') ? 1 : 0;
      if (vatRate !== undefined) updateData.vatRate = Number(vatRate);

      const oldPrice = Number(existing.sellingPrice);
      const oldCost = Number(existing.purchasePrice ?? existing.unitCost ?? 0);
      const newPrice = sellingPrice !== undefined ? Number(sellingPrice) : oldPrice;
      const newCost = purchasePrice !== undefined ? Number(purchasePrice) : (unitCost !== undefined ? Number(unitCost) : oldCost);

      if (sellingPrice !== undefined) updateData.sellingPrice = newPrice;
      if (purchasePrice !== undefined || unitCost !== undefined) {
        updateData.purchasePrice = newCost;
        updateData.unitCost = newCost;
      }

      const priceChanged = Math.abs(oldPrice - newPrice) > 0.0001;
      const costChanged = Math.abs(oldCost - newCost) > 0.0001;

      if (priceChanged || costChanged) {
        const historyEntry = {
          id: crypto.randomUUID(),
          productId: id,
          productName: updateData.name || existing.name,
          oldPrice,
          newPrice,
          oldCost,
          newCost,
          changeReason: reason || (priceChanged && costChanged ? 'Price & Cost Adjusted' : (priceChanged ? 'Retail Price Adjusted' : 'Supplier Cost Updated')),
          changedBy,
          createdAt: new Date(),
          tenantId: 'tenant_askar_01'
        };
        try {
          await db.orm.ProductPriceHistory.create(historyEntry);
        } catch (err) {
          console.warn('Failed to record price history:', err.message);
        }
      }

      await db.orm.Product.where({ id }).update(updateData);
      const updated = await db.orm.Product.where({ id }).all().first();

      const marginPct = updated.sellingPrice > 0
        ? Number((((updated.sellingPrice - updated.purchasePrice) / updated.sellingPrice) * 100).toFixed(1))
        : 0;

      return {
        success: true,
        message: 'Product updated successfully',
        product: {
          ...updated,
          marginPercent: marginPct,
          profitAmount: Number((updated.sellingPrice - updated.purchasePrice).toFixed(3)),
          isNegativeMargin: marginPct < 0,
          isLowMargin: marginPct >= 0 && marginPct < 5.0
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to update product', details: error.message });
    }
  };

  fastify.put('/api/products/:id', handleUpdateProduct);
  fastify.patch('/api/products/:id', handleUpdateProduct);
  fastify.post('/api/products/:id', handleUpdateProduct);
  fastify.post('/api/products/:id/update', handleUpdateProduct);
  fastify.put('/products/:id', handleUpdateProduct);
  fastify.post('/products/:id', handleUpdateProduct);

  // 10b. Delete Product Handler
  const handleDeleteProduct = async (request, reply) => {
    const { id } = request.params;
    try {
      const existing = await db.orm.Product.where({ id }).all().first();
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Product not found' });
      }

      // 1. Delete from SQLite Product table
      try {
        await db.execute({
          sql: `DELETE FROM Product WHERE id = ?`,
          args: [id]
        });
      } catch (err) {
        fastify.log.warn('Direct SQL delete failed, falling back to ORM:', err.message);
      }

      // 2. Delete via ORM
      try {
        await db.orm.Product.where({ id }).delete();
      } catch (err) {
        fastify.log.warn('ORM delete failed:', err.message);
      }

      // 3. Cleanup quick config and mark removed
      try {
        const config = loadQuickConfig();
        if (config.overrides && config.overrides[id]) {
          delete config.overrides[id];
        }
        if (existing.barcode && config.overrides && config.overrides[existing.barcode]) {
          delete config.overrides[existing.barcode];
        }
        if (!config.removedIds) config.removedIds = [];
        if (!config.removedIds.includes(String(id))) {
          config.removedIds.push(String(id));
        }
        if (existing.barcode && !config.removedIds.includes(String(existing.barcode))) {
          config.removedIds.push(String(existing.barcode));
        }
        saveQuickConfig(config);
      } catch (e) {
        fastify.log.warn('Could not update quick config on delete:', e.message);
      }

      fastify.log.info(`[Catalog] Deleted product ${id} (${existing.name})`);
      return {
        success: true,
        message: `Product "${existing.name}" deleted successfully`,
        deletedId: id
      };
    } catch (error) {
      fastify.log.error('Delete product failed:', error);
      return reply.status(500).send({ success: false, error: 'Failed to delete product', details: error.message });
    }
  };

  const handleBulkDeleteProducts = async (request, reply) => {
    const { productIds = [] } = request.body || {};
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return reply.status(400).send({ success: false, error: 'No products selected for deletion.' });
    }

    try {
      let deletedCount = 0;
      const config = loadQuickConfig();
      if (!config.removedIds) config.removedIds = [];
      config.overrides = config.overrides || {};

      for (const id of productIds) {
        try {
          const existing = await db.orm.Product.where({ id }).all().first();
          await db.execute({
            sql: `DELETE FROM Product WHERE id = ?`,
            args: [id]
          }).catch(() => {});
          await db.orm.Product.where({ id }).delete().catch(() => {});

          delete config.overrides[id];
          if (existing?.barcode) {
            delete config.overrides[existing.barcode];
            if (!config.removedIds.includes(String(existing.barcode))) {
              config.removedIds.push(String(existing.barcode));
            }
          }
          if (!config.removedIds.includes(String(id))) {
            config.removedIds.push(String(id));
          }
          deletedCount++;
        } catch (e) {
          fastify.log.warn(`Failed to delete product ${id}:`, e.message);
        }
      }

      saveQuickConfig(config);

      return {
        success: true,
        message: `Successfully deleted ${deletedCount} products.`,
        deletedCount,
        deletedIds: productIds
      };
    } catch (error) {
      fastify.log.error('Bulk delete failed:', error);
      return reply.status(500).send({ success: false, error: 'Bulk delete failed', details: error.message });
    }
  };

  fastify.delete('/api/products/:id', handleDeleteProduct);
  fastify.delete('/products/:id', handleDeleteProduct);
  fastify.post('/api/products/:id/delete', handleDeleteProduct);
  fastify.post('/products/:id/delete', handleDeleteProduct);
  fastify.post('/api/products/bulk-delete', handleBulkDeleteProducts);
  fastify.post('/products/bulk-delete', handleBulkDeleteProducts);

  // 11. Bulk Update & Price Hike
  fastify.post('/api/products/bulk-update', async (request, reply) => {
    const {
      productIds = [],
      action,
      value,
      roundToFils,
      reason,
      changedBy = 'Manager'
    } = request.body || {};

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return reply.status(400).send({ success: false, error: 'No products selected for bulk update.' });
    }

    try {
      const numVal = parseFloat(value);
      const updatedList = [];

      const applyRounding = (price) => {
        if (!roundToFils || roundToFils <= 0) return Number(price.toFixed(3));
        const step = roundToFils / 1000;
        return Number((Math.ceil(price / step) * step).toFixed(3));
      };

      for (const pid of productIds) {
        const existing = await db.orm.Product.where({ id: pid }).all().first();
        if (!existing) continue;

        const oldPrice = Number(existing.sellingPrice);
        const oldCost = Number(existing.purchasePrice ?? existing.unitCost ?? 0);
        let newPrice = oldPrice;
        let newCost = oldCost;
        const updateData = { updatedAt: new Date() };
        let defaultReason = reason || 'Bulk Price Adjustment';

        if (action === 'PERCENT_INCREASE' && !isNaN(numVal)) {
          newPrice = applyRounding(oldPrice * (1 + numVal / 100));
          updateData.sellingPrice = newPrice;
          defaultReason = reason || `Bulk Price Hike (+${numVal}%)`;
        } else if (action === 'PERCENT_DECREASE' && !isNaN(numVal)) {
          newPrice = applyRounding(Math.max(0.005, oldPrice * (1 - numVal / 100)));
          updateData.sellingPrice = newPrice;
          defaultReason = reason || `Bulk Price Discount (-${numVal}%)`;
        } else if (action === 'FIXED_MARKUP' && !isNaN(numVal)) {
          newPrice = applyRounding(Math.max(0.005, oldPrice + numVal));
          updateData.sellingPrice = newPrice;
          defaultReason = reason || `Bulk Fixed Markup (+BD ${numVal.toFixed(3)})`;
        } else if (action === 'SET_VAT_RATE' && !isNaN(numVal)) {
          updateData.vatRate = numVal;
          updateData.taxRate = numVal / 100;
          defaultReason = reason || `Set VAT Rate to ${numVal}%`;
        } else if (action === 'SET_STOCK' && !isNaN(numVal)) {
          updateData.stockQuantity = Math.max(0, Math.floor(numVal));
          defaultReason = reason || `Bulk Stock Adjustment to ${numVal}`;
        } else if (action === 'ASSIGN_DISTRIBUTOR' && value) {
          updateData.distributorId = String(value);
          defaultReason = reason || `Assigned to Distributor ${value}`;
        }

        if (Math.abs(oldPrice - newPrice) > 0.0001 || Math.abs(oldCost - newCost) > 0.0001) {
          try {
            await db.orm.ProductPriceHistory.create({
              id: crypto.randomUUID(),
              productId: pid,
              productName: existing.name,
              oldPrice,
              newPrice,
              oldCost,
              newCost,
              changeReason: defaultReason,
              changedBy,
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch (e) {
            console.warn('Failed to log bulk price history:', e.message);
          }
        }

        await db.orm.Product.where({ id: pid }).update(updateData);
        const updated = await db.orm.Product.where({ id: pid }).all().first();
        updatedList.push(updated);
      }

      return {
        success: true,
        message: `Successfully executed ${action} on ${updatedList.length} products.`,
        updatedCount: updatedList.length,
        products: updatedList
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Bulk update failed', details: error.message });
    }
  });

  // 12. Price History Audit
  fastify.get('/api/products/:id/price-history', async (request, reply) => {
    const { id } = request.params;
    try {
      const history = await db.orm.ProductPriceHistory.where({ productId: id }).all();
      history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return {
        success: true,
        productId: id,
        count: history.length,
        history
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to fetch price history' });
    }
  });

  // 13. Shelf Tags
  fastify.post('/api/products/shelf-tags', async (request, reply) => {
    const { productIds = [] } = request.body || {};
    try {
      const all = await db.orm.Product.all();
      const distributors = await db.orm.Distributor.all();
      const distMap = new Map(distributors.map(d => [d.id, d.name]));

      const targetProducts = productIds.length > 0
        ? all.filter(p => productIds.includes(p.id))
        : all;

      const tags = targetProducts.map(p => {
        const margin = p.sellingPrice > 0
          ? Number((((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100).toFixed(1))
          : 0;
        return {
          id: p.id,
          name: p.name,
          barcode: p.barcode || p.id,
          sellingPrice: Number(p.sellingPrice || 0).toFixed(3),
          purchasePrice: Number(p.purchasePrice || 0).toFixed(3),
          marginPercent: margin,
          vatRate: p.vatRate ?? 10.0,
          supplierName: p.distributorId ? distMap.get(p.distributorId) || p.supplierName || 'General' : p.supplierName || 'General',
          printedAt: new Date().toLocaleDateString()
        };
      });

      return { success: true, count: tags.length, tags };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to prepare shelf tags' });
    }
  });

  // 14. Delta Sync for Products (Pull-based delta changes)
  fastify.get('/api/sync/products', async (request, reply) => {
    const { lastSyncDate } = request.query || {};

    // NEW: Optimized Delta Sync Query
    try {
      let updatedProducts = [];

      if (!lastSyncDate) {
        // Initial sync: fetch all (Only happens once per terminal install)
        const result = await db.execute('SELECT * FROM Product');
        updatedProducts = result.rows || [];
      } else {
        // Delta sync: fetch strictly what changed since the last poll
        const result = await db.execute({
          sql: 'SELECT * FROM Product WHERE updatedAt > ?',
          args: [new Date(lastSyncDate).toISOString()]
        });
        updatedProducts = result.rows || [];
      }

      return { success: true, products: updatedProducts };
    } catch (err) {
      fastify.log.error('Delta sync products failed:', err);
      return reply.code(500).send({ error: 'Failed to sync products' });
    }
  });
}
