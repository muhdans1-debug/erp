const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function inspectSales() {
  for (const [name, path] of [['dev.db', 'file:pos-mvp/dev.db'], ['local.db', 'file:pos-mvp/local.db']]) {
    console.log(`\n=== Checking ${name} ===`);
    try {
      const c = createClient({ url: path });
      const sales = await c.execute("SELECT id, invoiceNo, total, paymentType, status, shiftId, createdAt FROM Sale ORDER BY createdAt DESC LIMIT 20");
      console.log(`Sale rows count: ${sales.rows.length}`);
      console.log(sales.rows);

      const shiftSummary = await c.execute(`
        SELECT 
          shiftId, 
          paymentType, 
          COUNT(*) as tx_count, 
          SUM(total) as total_sum 
        FROM Sale 
        GROUP BY shiftId, paymentType
      `);
      console.log('Sales grouped by shiftId and paymentType:');
      console.log(shiftSummary.rows);
    } catch (e) {
      console.error(`Error checking ${name}:`, e.message);
    }
  }
}

inspectSales().catch(console.error);

