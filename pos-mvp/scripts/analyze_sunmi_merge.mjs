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

const sunmiRaw = JSON.parse(fs.readFileSync(path.resolve('../sunmi_grabbed_db/all_sunmi_extracted_products.json'), 'utf8'));

// Filter out non-products (e.g. employee entries like emp_cashier_1)
const sunmiProducts = sunmiRaw.filter(p => {
  if (!p || !p.name) return false;
  if (p.id && p.id.startsWith('emp_')) return false;
  if (p.name.toLowerCase().includes('cashier') || p.name.toLowerCase().includes('store manager')) return false;
  return true;
});

async function analyze() {
  const currentRes = await cloud.execute('SELECT id, barcode, name, sellingPrice, unitCost, stockQuantity, category FROM Product');
  const currentMapById = new Map();
  const currentMapByBarcode = new Map();
  const currentMapByName = new Map();

  for (const r of currentRes.rows) {
    if (r.id) currentMapById.set(String(r.id), r);
    if (r.barcode) currentMapByBarcode.set(String(r.barcode).trim(), r);
    if (r.name) currentMapByName.set(String(r.name).trim().toLowerCase(), r);
  }

  console.log(`Current Turso Cloud Catalog count: ${currentRes.rows.length}`);
  console.log(`Sunmi Grabbed Products count: ${sunmiProducts.length}`);

  const toInsert = [];
  const toEnrich = [];

  for (const sp of sunmiProducts) {
    const sId = sp.id ? String(sp.id) : null;
    const sBarcode = sp.barcode ? String(sp.barcode).trim() : null;
    const sName = sp.name ? String(sp.name).trim() : '';
    const sPrice = Number(sp.sellingPrice !== undefined ? sp.sellingPrice : (sp.price || 0));
    const sCost = Number(sp.unitCost !== undefined ? sp.unitCost : (sp.purchasePrice || 0));
    const sStock = Number(sp.stockQuantity !== undefined ? sp.stockQuantity : (sp.stock || 0));
    const sCat = sp.category || 'GROCERY';

    // Match by ID, Barcode, or exact normalized Name
    const matched = (sId && currentMapById.get(sId)) ||
                    (sBarcode && currentMapByBarcode.get(sBarcode)) ||
                    (sName && currentMapByName.get(sName.toLowerCase()));

    if (matched) {
      // Check if Sunmi has richer data (e.g. valid barcode where current is null, or updated price/cost/stock)
      let needsUpdate = false;
      const updates = {};
      if (sBarcode && !matched.barcode) {
        updates.barcode = sBarcode;
        needsUpdate = true;
      }
      if (sCost > 0 && (!matched.unitCost || Number(matched.unitCost) === 0)) {
        updates.unitCost = sCost;
        needsUpdate = true;
      }
      if (sStock > 0 && Number(matched.stockQuantity) === 0) {
        updates.stockQuantity = sStock;
        needsUpdate = true;
      }
      if (needsUpdate) {
        toEnrich.push({ current: matched, updates });
      }
    } else {
      toInsert.push({
        id: sId || `prod_sunmi_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        barcode: sBarcode,
        name: sName,
        sellingPrice: sPrice,
        purchasePrice: sCost,
        unitCost: sCost,
        stockQuantity: sStock,
        category: sCat,
        is_weighed_item: sp.is_weighed_item ? 1 : 0
      });
    }
  }

  console.log(`\nNew Unique Products to Insert from Sunmi: ${toInsert.length}`);
  for (const p of toInsert.slice(0, 15)) {
    console.log(` + [NEW] ${p.name} | Barcode: ${p.barcode || 'N/A'} | Price: ${p.sellingPrice} | Cost: ${p.unitCost} | Stock: ${p.stockQuantity} | Cat: ${p.category}`);
  }

  console.log(`\nExisting Products to Enrich with Sunmi Barcodes/Costs: ${toEnrich.length}`);
  for (const e of toEnrich.slice(0, 10)) {
    console.log(` ~ [ENRICH] ${e.current.name}: ${JSON.stringify(e.updates)}`);
  }

  fs.writeFileSync(path.resolve('../sunmi_grabbed_db/sunmi_to_insert.json'), JSON.stringify(toInsert, null, 2));
  fs.writeFileSync(path.resolve('../sunmi_grabbed_db/sunmi_to_enrich.json'), JSON.stringify(toEnrich, null, 2));
}

analyze();
