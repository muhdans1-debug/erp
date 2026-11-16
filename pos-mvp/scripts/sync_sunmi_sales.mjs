import { createClient } from '@libsql/client';
import path from 'path';

const local = createClient({ url: 'file:../sunmi_grabbed_db/askar_internal_app.db' });

async function syncSales() {
  const localSales = await local.execute('SELECT * FROM offline_sales');
  console.log(`Found ${localSales.rows.length} sales in Sunmi offline DB`);

  const payloads = [];
  for (const s of localSales.rows) {
    try {
      const p = typeof s.payload === 'string' ? JSON.parse(s.payload) : s.payload;
      if (p) payloads.push(p);
    } catch (e) {
      console.error('Failed to parse sale', s.id);
    }
  }

  for (let i = 0; i < payloads.length; i++) {
    const sale = payloads[i];
    console.log(`Sending sale [${i + 1}/${payloads.length}] (${sale.id})...`);
    try {
      const res = await fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/sales/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([sale])
      });
      const data = await res.json();
      console.log(`Sale ${sale.id} sync result:`, data);
    } catch (e) {
      console.error(`Sale ${sale.id} error:`, e.message);
    }
  }
  local.close();
}

syncSales().catch(console.error);
