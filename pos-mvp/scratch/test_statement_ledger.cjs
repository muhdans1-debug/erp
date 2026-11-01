const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('=== STARTING KHATA HISTORICAL STATEMENT TEST ===\n');

  // 1. Get or create a dedicated test customer
  const custRes = await request('POST', '/api/customers', {
    name: 'Statement Ledger Test User ' + Date.now().toString().slice(-4),
    phone: '39991234',
    cpr: '991234567',
  });
  console.log('1. Created Test Customer:', custRes.data.customer?.id, custRes.data.customer?.name);
  const customerId = custRes.data.customer.id;

  // 1b. Fetch valid product
  const prodsRes = await request('GET', '/products');
  const validProduct = prodsRes.data[0];
  console.log('Valid product for cart:', validProduct.id, validProduct.name, validProduct.sellingPrice);

  // 2. Buy groceries on Khata (CHARGE)
  const invoiceNo = 'INV-KHATA-' + Date.now().toString().slice(-5);
  const checkoutRes = await request('POST', '/api/sales', {
    invoiceNo,
    customerId,
    paymentType: 'CREDIT',
    total: 5.500,
    items: [
      {
        productId: validProduct.id,
        name: validProduct.name,
        priceAtSale: 1.100,
        sellingPrice: 1.100,
        quantity: 5,
        vatRate: 0,
      },
    ],
  });
  console.log('2. POS Credit Checkout:', checkoutRes.data.success ? 'SUCCESS' : 'FAILED', 'Invoice:', invoiceNo, 'Total: BHD 5.500');

  // 3. Pay off part of debt via /khata/:id/pay
  const payRes = await request('POST', `/khata/${customerId}/pay`, {
    amountPaid: 2.000,
    paymentMethod: 'CASH',
  });
  console.log('3. Partial Debt Repayment:', payRes.data.success ? 'SUCCESS' : 'FAILED', 'Amount Paid: BHD 2.000', 'New Balance:', payRes.data.newBalance);

  // 4. Fetch statement via /khata/:id/statement
  const stmtRes = await request('GET', `/khata/${customerId}/statement`);
  console.log('4. Fetch Statement (/khata/:id/statement):', stmtRes.data.success ? 'SUCCESS' : 'FAILED');

  const statement = stmtRes.data.statement;
  console.log(`\n=== STATEMENT ENTRIES (${statement.length} records) ===`);
  statement.forEach((row, idx) => {
    console.log(
      `[#${idx + 1}] Date: ${new Date(row.created_at).toLocaleDateString()} | Type: ${row.type.padEnd(7)} | ${row.type === 'PAYMENT' ? '-' : '+'} BHD ${Number(row.amount).toFixed(3)} | Ref: ${row.reference} | Running Bal: BHD ${Number(row.running_balance).toFixed(3)}`
    );
  });

  // Validations
  if (!Array.isArray(statement) || statement.length < 2) {
    throw new Error('Expected at least 2 statement entries (1 CHARGE, 1 PAYMENT)');
  }

  const latest = statement[0];
  if (latest.type !== 'PAYMENT' || latest.amount !== 2.0 || latest.running_balance !== 3.5) {
    throw new Error(`Latest transaction mismatch! Got: ${JSON.stringify(latest)}`);
  }

  const oldest = statement[1];
  if (oldest.type !== 'CHARGE' || oldest.amount !== 5.5 || oldest.running_balance !== 5.5) {
    throw new Error(`Oldest charge mismatch! Got: ${JSON.stringify(oldest)}`);
  }

  // 5. Test compatibility with /api/customers/:id/statement
  const aliasRes = await request('GET', `/api/customers/${customerId}/statement`);
  if (!aliasRes.data.success || aliasRes.data.statement.length !== statement.length) {
    throw new Error('Statement alias endpoint mismatch');
  }
  console.log('5. Compatible with /api/customers/:id/statement: SUCCESS');

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED: Bank-grade historical ledger statement is working 100%!');
}

run().catch((e) => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
