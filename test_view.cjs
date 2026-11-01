const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function testView() {
  const client = createClient({ url: 'file:pos-mvp/local.db' });
  
  await client.execute(`
    CREATE VIEW IF NOT EXISTS Sales AS 
    SELECT 
      id,
      invoiceNo AS invoice_number,
      total,
      paymentType AS payment_type,
      status,
      employeeId AS employee_id,
      shiftId AS shift_id,
      customerId AS khata_id,
      createdAt AS created_at
    FROM Sale;
  `);

  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS sales_insert_trigger
    INSTEAD OF INSERT ON Sales
    BEGIN
      INSERT INTO Sale (id, invoiceNo, total, paymentType, status, shiftId, createdAt)
      VALUES (
        NEW.id,
        NEW.invoice_number,
        NEW.total,
        NEW.payment_type,
        NEW.status,
        NEW.shift_id,
        datetime('now')
      );
    END;
  `);

  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS sales_update_trigger
    INSTEAD OF UPDATE ON Sales
    BEGIN
      UPDATE Sale
      SET status = NEW.status
      WHERE invoiceNo = NEW.invoice_number OR id = NEW.id;
    END;
  `);

  console.log('Testing SELECT on Sales view:');
  const sel = await client.execute('SELECT * FROM Sales LIMIT 3');
  console.log('Rows:', sel.rows);
}

testView().catch(console.error);

