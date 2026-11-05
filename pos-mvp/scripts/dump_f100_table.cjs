const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('pos-mvp/f100_clean.db');
const rows = db.prepare('SELECT id, barcode, name, payload, image_base64, sync_status, created_at FROM local_pim_intake ORDER BY id ASC').all();

console.log('| # | Barcode | Product Name | Cost (BD) | Price (BD) | Qty | Category | Photo |');
console.log('| :---: | :--- | :--- | :---: | :---: | :---: | :--- | :---: |');
rows.forEach(r => {
  let p = {};
  try { p = JSON.parse(r.payload); } catch {}
  const barcode = (r.barcode || p.barcode || 'N/A').replace(/\|/g, '');
  const name = (r.name || p.name || 'Unnamed').replace(/\|/g, '');
  const cost = Number(p.purchasePrice ?? p.unitCost ?? 0).toFixed(3);
  const price = Number(p.sellingPrice ?? p.price ?? 0).toFixed(3);
  const qty = Number(p.intakeQty ?? p.stockQuantity ?? 1);
  const cat = (p.category || 'GROCERY').replace(/\|/g, '');
  const photo = r.image_base64 ? '📸 Yes' : '—';
  console.log(`| ${r.id} | \`${barcode}\` | ${name} | ${cost} | ${price} | ${qty} | ${cat} | ${photo} |`);
});
db.close();

