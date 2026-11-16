import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

const dir = path.resolve('../sunmi_grabbed_db');
const files = fs.readdirSync(dir);

async function inspect() {
  for (const f of files) {
    if (!f.endsWith('.db')) continue;
    const full = path.resolve(dir, f);
    console.log(`\n========================================`);
    console.log(`FILE: ${f} (${fs.statSync(full).size} bytes)`);
    console.log(`========================================`);
    try {
      const client = createClient({ url: `file:${full.replace(/\\/g, '/')}` });
      const tablesRes = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tablesRes.rows.map(r => r.name);
      console.log('Tables:', tableNames.join(', '));
      
      for (const name of tableNames) {
        if (name.startsWith('sqlite_')) continue;
        const countRes = await client.execute(`SELECT count(*) as cnt FROM "${name}"`);
        const cnt = countRes.rows[0].cnt;
        console.log(`  Table "${name}": ${cnt} rows`);
        
        if (name.toLowerCase().includes('product') || name.toLowerCase().includes('item') || name.toLowerCase().includes('pim') || name.toLowerCase().includes('catalog')) {
          const sampleRes = await client.execute(`SELECT * FROM "${name}" LIMIT 3`);
          console.log(`    Columns:`, Object.keys(sampleRes.rows[0] || {}));
          console.log(`    Sample 1:`, JSON.stringify(sampleRes.rows[0], null, 2));
        }
      }
      client.close();
    } catch (err) {
      console.error('Error inspecting', f, err.message);
    }
  }
}

inspect();
