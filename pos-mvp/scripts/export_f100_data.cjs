const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'f100_clean.db');
const db = new DatabaseSync(dbPath);

const rows = db.prepare('SELECT id, barcode, name, payload, image_base64, sync_status, created_at, synced_at FROM local_pim_intake ORDER BY id ASC').all();

console.log(`Processing ${rows.length} rows from F100 database...`);

const parsedProducts = rows.map(r => {
  let p = {};
  try {
    p = JSON.parse(r.payload);
  } catch {}

  return {
    f100_record_id: r.id,
    barcode: (r.barcode || p.barcode || '').trim(),
    name: (r.name || p.name || 'Unnamed Item').trim(),
    purchase_price: Number(p.purchasePrice ?? p.unitCost ?? 0),
    selling_price: Number(p.sellingPrice ?? p.price ?? 0),
    intake_quantity: Number(p.intakeQty ?? p.stockQuantity ?? 1),
    stock_mode: p.stockMode || 'ADD',
    category: p.category || 'GROCERY',
    distributor: p.supplierName || 'Local Distributor',
    vat_rate: Number(p.vatRate ?? 10),
    min_threshold: Number(p.minThreshold ?? 20),
    max_threshold: Number(p.maxThreshold ?? 100),
    sync_status: r.sync_status === 1 ? 'SYNCED' : 'PENDING',
    has_photo: Boolean(r.image_base64),
    created_at: r.created_at,
    synced_at: r.synced_at
  };
});

// Save to JSON
const jsonPath = path.resolve(__dirname, '..', 'f100_retrieved_database.json');
fs.writeFileSync(jsonPath, JSON.stringify(parsedProducts, null, 2), 'utf8');

// Save to CSV
const csvHeaders = [
  'ID',
  'Barcode',
  'Product Name',
  'Cost (BD)',
  'Selling Price (BD)',
  'Intake Qty',
  'Category',
  'Distributor',
  'VAT Rate (%)',
  'Sync Status',
  'Created At'
];
const csvRows = parsedProducts.map(p => [
  p.f100_record_id,
  `"${p.barcode}"`,
  `"${p.name.replace(/"/g, '""')}"`,
  p.purchase_price.toFixed(3),
  p.selling_price.toFixed(3),
  p.intake_quantity,
  `"${p.category}"`,
  `"${p.distributor.replace(/"/g, '""')}"`,
  p.vat_rate,
  p.sync_status,
  `"${p.created_at}"`
]);
const csvContent = [csvHeaders.join(','), ...csvRows.map(r => r.join(','))].join('\n');
const csvPath = path.resolve(__dirname, '..', 'f100_retrieved_database.csv');
fs.writeFileSync(csvPath, csvContent, 'utf8');

console.log(`✅ Saved ${parsedProducts.length} items to:`);
console.log(`   - JSON: ${jsonPath}`);
console.log(`   - CSV:  ${csvPath}`);

db.close();

