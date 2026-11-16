import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const tursoUrl = process.env.TURSO_DATABASE_URL || 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io';
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || '';

const cloud = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken
});

const local = createClient({
  url: `file:${path.resolve('local.db').replace(/\\/g, '/')}`
});

const sunmiToInsert = JSON.parse(fs.readFileSync(path.resolve('../sunmi_grabbed_db/sunmi_to_insert.json'), 'utf8'));

async function sync() {
  console.log(`Starting sync of ${sunmiToInsert.length} Sunmi products into Turso Cloud & local.db...`);

  const initialCloudCount = (await cloud.execute('SELECT count(*) as cnt FROM Product')).rows[0].cnt;
  const initialLocalCount = (await local.execute('SELECT count(*) as cnt FROM Product')).rows[0].cnt;
  console.log(`Initial Product Count -> Cloud: ${initialCloudCount}, Local: ${initialLocalCount}`);

  let insertedCount = 0;

  for (const item of sunmiToInsert) {
    const id = item.id || `prod_sunmi_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const barcode = item.barcode && item.barcode !== 'N/A' ? item.barcode : id;
    const name = item.name.trim();
    const sellingPrice = Number(item.sellingPrice || 0);
    const purchasePrice = Number(item.purchasePrice || item.unitCost || (sellingPrice * 0.75));
    const unitCost = Number(item.unitCost || purchasePrice);
    const stockQuantity = Number(item.stockQuantity || 10);
    const minThreshold = 10;
    const maxThreshold = 100;
    const category = item.category || 'ESSENTIALS';
    const vatRate = 10.0;
    const isWeighed = item.is_weighed_item ? 1 : 0;
    const tenantId = 'tenant_askar_01';
    const storeId = 'store_askar_01';

    // 1. Insert into Cloud Product
    await cloud.execute({
      sql: `INSERT INTO Product (
              id, tenantId, barcode, name, sellingPrice, purchasePrice,
              unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, is_weighed_item, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              barcode = excluded.barcode,
              name = excluded.name,
              sellingPrice = excluded.sellingPrice,
              unitCost = excluded.unitCost,
              stockQuantity = excluded.stockQuantity,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [id, tenantId, barcode, name, sellingPrice, purchasePrice, unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, isWeighed]
    });

    // 2. Insert into Cloud StoreInventory
    await cloud.execute({
      sql: `INSERT INTO StoreInventory (
              id, tenantId, storeId, productId, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(storeId, productId) DO UPDATE SET
              stockQuantity = excluded.stockQuantity,
              sellingPrice = excluded.sellingPrice,
              unitCost = excluded.unitCost,
              updated_at = CURRENT_TIMESTAMP`,
      args: [`si_${storeId}_${id}`, tenantId, storeId, id, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold]
    });

    // 3. Insert into Local Product
    await local.execute({
      sql: `INSERT INTO Product (
              id, tenantId, barcode, name, sellingPrice, purchasePrice,
              unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, is_weighed_item, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              barcode = excluded.barcode,
              name = excluded.name,
              sellingPrice = excluded.sellingPrice,
              unitCost = excluded.unitCost,
              stockQuantity = excluded.stockQuantity,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [id, tenantId, barcode, name, sellingPrice, purchasePrice, unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, isWeighed]
    });

    // 4. Insert into Local StoreInventory
    await local.execute({
      sql: `INSERT INTO StoreInventory (
              id, tenantId, storeId, productId, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(storeId, productId) DO UPDATE SET
              stockQuantity = excluded.stockQuantity,
              sellingPrice = excluded.sellingPrice,
              unitCost = excluded.unitCost,
              updated_at = CURRENT_TIMESTAMP`,
      args: [`si_${storeId}_${id}`, tenantId, storeId, id, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold]
    });

    insertedCount++;
    console.log(`[${insertedCount}/${sunmiToInsert.length}] Synced "${name}" (Barcode: ${barcode}, Price: ${sellingPrice} BHD, Stock: ${stockQuantity})`);
  }

  const finalCloudCount = (await cloud.execute('SELECT count(*) as cnt FROM Product')).rows[0].cnt;
  const finalLocalCount = (await local.execute('SELECT count(*) as cnt FROM Product')).rows[0].cnt;
  console.log(`\n✅ Finished sync!`);
  console.log(`Final Cloud Product Count: ${finalCloudCount}`);
  console.log(`Final Local Product Count: ${finalLocalCount}`);

  cloud.close();
  local.close();
}

sync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});

