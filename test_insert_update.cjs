const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function testInsertUpdate() {
  const client = createClient({ url: 'file:pos-mvp/local.db' });
  const testId = 'test_refund_' + Date.now();
  await client.execute({
    sql: `INSERT INTO Sales (id, invoice_number, total, payment_type, status, shift_id) 
          VALUES (?, ?, ?, 'CASH', 'REFUNDED', ?)`,
    args: [testId, 'REF-TEST-001', -5.500, 'shift_123']
  });

  const check = await client.execute({
    sql: 'SELECT * FROM Sales WHERE id = ?',
    args: [testId]
  });
  console.log('Inserted record:', check.rows[0]);

  await client.execute({
    sql: "UPDATE Sales SET status = 'REFUNDED' WHERE invoice_number = ?",
    args: ['REF-TEST-001']
  });

  // Clean up test
  await client.execute({ sql: 'DELETE FROM Sale WHERE id = ?', args: [testId] });
  console.log('Test completed and cleaned up successfully!');
}

testInsertUpdate().catch(console.error);

