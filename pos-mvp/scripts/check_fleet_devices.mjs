import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config({ path: 'pos-mvp/.env' });

async function checkFleet() {
  console.log('====================================================');
  console.log('📡 1. CLOUDFLARE EDGE LIVE REGISTER SPY (FLEET MATRIX)');
  console.log('====================================================');
  try {
    const res = await fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/register/cart/live');
    const data = await res.json();
    if (data.registers) {
      for (const reg of data.registers) {
        const lastSeenStr = reg.lastSeen ? new Date(reg.lastSeen).toISOString() : 'Never';
        console.log(`• [${reg.terminalId}] ${reg.terminalName}:`);
        console.log(`    Status: ${reg.status} | Online: ${reg.isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'} (${reg.secondsSinceLastSeen}s ago)`);
        console.log(`    Cashier: ${reg.cashierName} | Customer: ${reg.customerName} | Cart Total: BHD ${reg.total} (${reg.itemCount} items)`);
        console.log(`    Last Seen: ${lastSeenStr}`);
        if (reg.items && reg.items.length > 0) {
          console.log(`    Active Cart Items:`, reg.items.map(i => `${i.name || i.id} x${i.quantity}`).join(', '));
        }
      }
    }
  } catch (err) {
    console.error('Edge query error:', err.message);
  }

  console.log('\n====================================================');
  console.log('💾 2. RECENT SALES ACROSS TERMINALS (TURSO CLOUD DB)');
  console.log('====================================================');
  try {
    const turso = createClient({
      url: process.env.TURSO_DATABASE_URL || 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io',
      authToken: process.env.TURSO_AUTH_TOKEN
    });

    const salesRes = await turso.execute(`
      SELECT id, invoiceNo, total, paymentType, terminalId, createdAt 
      FROM Sale 
      ORDER BY createdAt DESC 
      LIMIT 10
    `);
    for (const r of salesRes.rows) {
      console.log(`• Inv #${r.invoiceNo || r.id} | BHD ${r.total} | Method: ${r.paymentType} | Term: ${r.terminalId || 'N/A'} | Date: ${r.createdAt}`);
    }

    console.log('\n====================================================');
    console.log('🏢 3. TERMINALS REGISTERED IN SALES HISTORY');
    console.log('====================================================');
    const termRes = await turso.execute(`
      SELECT COALESCE(terminalId, 'UNKNOWN') as term, count(*) as saleCount, max(createdAt) as lastSale
      FROM Sale
      GROUP BY terminalId
      ORDER BY lastSale DESC
    `);
    for (const r of termRes.rows) {
      console.log(`• Terminal [${r.term}]: ${r.saleCount} sales recorded (Last Sale: ${r.lastSale})`);
    }

  } catch (err) {
    console.error('Turso query error:', err.message);
  }
}

checkFleet();
