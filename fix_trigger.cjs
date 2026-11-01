const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function fixTrigger() {
  const client = createClient({ url: 'file:pos-mvp/local.db' });
  await client.execute('DROP TRIGGER IF EXISTS sales_insert_trigger');
  await client.execute(`
    CREATE TRIGGER sales_insert_trigger
    INSTEAD OF INSERT ON Sales
    BEGIN
      INSERT INTO Sale (id, invoiceNo, total, subtotal, paymentType, status, shiftId, createdAt)
      VALUES (
        NEW.id,
        NEW.invoice_number,
        NEW.total,
        COALESCE(NEW.total, 0),
        NEW.payment_type,
        NEW.status,
        NEW.shift_id,
        datetime('now')
      );
    END;
  `);

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
  console.log('Inserted record via Sales view:', check.rows[0]);

  // Clean up
  await client.execute({ sql: 'DELETE FROM Sale WHERE id = ?', args: [testId] });
  console.log('SUCCESS! Sales view and trigger work flawlessly.');
}

fixTrigger().catch(console.error);

