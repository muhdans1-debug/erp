// scratch/test_khata_engine.cjs
// Comprehensive Integration Test for Khata Cash-Recovery Engine

async function runTests() {
  const baseUrl = 'http://localhost:3000';
  console.log('====================================================');
  console.log('🧪 TESTING KHATA CASH-RECOVERY ENGINE ARCHITECTURE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: Highest Debt Sorting
  try {
    const res = await fetch(`${baseUrl}/khata/ledger?sort=highest`);
    const data = await res.json();
    assert(res.ok && data.success, 'GET /khata/ledger?sort=highest returns 200 OK');
    assert(Array.isArray(data.customers), 'Returns customers array');
    assert(data.totalMarketCredit > 0, `Total market credit calculated: BD ${data.totalMarketCredit}`);
    assert(data.debtorCount >= 1, `Debtor count calculated: ${data.debtorCount}`);

    // Verify descending order
    let isDescending = true;
    for (let i = 0; i < data.customers.length - 1; i++) {
      if (data.customers[i].currentBalance < data.customers[i + 1].currentBalance) {
        isDescending = false;
        break;
      }
    }
    assert(isDescending, 'Customers are strictly ordered by descending remaining balance');
    console.log(`   Top debtor: ${data.customers[0]?.name} (BD ${data.customers[0]?.currentBalance})`);
  } catch (e) {
    assert(false, `Test 1 failed with error: ${e.message}`);
  }

  // TEST 2: Stale Debt Sorting & Aging Calculation
  try {
    const res = await fetch(`${baseUrl}/khata/ledger?sort=stale`);
    const data = await res.json();
    assert(res.ok && data.success, 'GET /khata/ledger?sort=stale returns 200 OK');
    assert(data.customers.every(c => c.daysSinceLastPayment !== undefined), 'Every customer has calculated daysSinceLastPayment');
    
    let isStaleOrder = true;
    for (let i = 0; i < data.customers.length - 1; i++) {
      if ((data.customers[i].daysSinceLastPayment || 0) < (data.customers[i + 1].daysSinceLastPayment || 0)) {
        isStaleOrder = false;
        break;
      }
    }
    assert(isStaleOrder, 'Customers ordered by oldest inactive tab first');
  } catch (e) {
    assert(false, `Test 2 failed with error: ${e.message}`);
  }

  // TEST 3: Credit Limit Update via PUT
  let testCustomerId = null;
  try {
    const custRes = await fetch(`${baseUrl}/api/customers`);
    const customers = await custRes.json();
    if (customers.length > 0) {
      testCustomerId = customers[0].id;
      const updateRes = await fetch(`${baseUrl}/api/customers/${testCustomerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditLimit: 25.500
        })
      });
      const updateData = await updateRes.json();
      assert(updateRes.ok && updateData.success, `Successfully updated customer ${customers[0].name} credit limit to BD 25.500`);
      
      // Verify persistence in /khata/ledger
      const checkRes = await fetch(`${baseUrl}/khata/ledger?sort=highest`);
      const checkData = await checkRes.json();
      const updatedCust = checkData.customers.find(c => c.id === testCustomerId);
      assert(updatedCust && updatedCust.creditLimit === 25.5, `Persistent credit limit verified: BD ${updatedCust?.creditLimit}`);
    }
  } catch (e) {
    assert(false, `Test 3 failed with error: ${e.message}`);
  }

  // TEST 4: Manager PIN Security on Bad Debt Write-Off
  try {
    // 4A: Wrong PIN test
    const failRes = await fetch(`${baseUrl}/api/khata/write-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: testCustomerId,
        managerPin: '0000',
        reason: 'Unauthorized test'
      })
    });
    assert(failRes.status === 401, 'POST /api/khata/write-off rejects wrong PIN (401 Unauthorized)');

    // 4B: Missing customer test
    const missingRes = await fetch(`${baseUrl}/api/khata/write-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: 'non_existent_id',
        managerPin: '9999',
        reason: 'Test non existent'
      })
    });
    assert(missingRes.status === 404, 'POST /api/khata/write-off returns 404 for unknown customer');
  } catch (e) {
    assert(false, `Test 4 failed with error: ${e.message}`);
  }

  // TEST 5: Create a Test Customer with Balance and Perform Legitimate Write-Off
  try {
    const createRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Khata Party ' + Date.now().toString().slice(-4),
        phone: '39999888'
      })
    });
    const createData = await createRes.json();
    const newCust = createData.customer || createData;
    assert(newCust && newCust.id, `Created temporary debtor "${newCust.name}"`);

    // Add a credit sale to give them a balance
    const saleRes = await fetch(`${baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        invoiceNo: `INV-TEST-${Date.now()}`,
        cart: [{ id: '1', name: 'Arabian Perfume', sellingPrice: 12.000, quantity: 1 }],
        subtotal: 10.909,
        totalVat: 1.091,
        vatTotal: 1.091,
        total: 12.000,
        totalAmount: 12.000,
        paymentType: 'CREDIT',
        customerId: newCust.id,
        items: [{ productId: '1', quantity: 1, priceAtSale: 12.000, vatRateAtSale: 10, vatAmount: 1.091 }]
      })
    });
    const saleData = await saleRes.json();
    assert(saleRes.ok && saleData.success, 'Recorded BD 12.000 credit sale for new customer');

    // Verify balance is now 12.000
    const balRes = await fetch(`${baseUrl}/khata/ledger?sort=highest`);
    const balData = await balRes.json();
    const debtorCheck = balData.customers.find(c => c.id === newCust.id);
    assert(debtorCheck && Math.abs(debtorCheck.currentBalance - 12.000) < 0.01, `Customer balance verified: BD ${debtorCheck?.currentBalance}`);

    // Now execute legitimate Write-Off with Manager PIN 9999
    const writeOffRes = await fetch(`${baseUrl}/api/khata/write-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: newCust.id,
        managerPin: '9999',
        reason: 'Customer left country (stale uncollectible)'
      })
    });
    const writeOffData = await writeOffRes.json();
    assert(writeOffRes.ok && writeOffData.success, `Manager authorized write-off of BD ${writeOffData.writtenOffAmount} with PIN 9999`);
    assert(writeOffData.newBalance === 0, 'New customer balance is strictly BD 0.000');

    // Clean up: soft delete the test customer
    await fetch(`${baseUrl}/api/customers/${newCust.id}`, { method: 'DELETE' });
    console.log('   Temporary test customer deleted and cleaned up.');
  } catch (e) {
    assert(false, `Test 5 failed with error: ${e.message}`);
  }

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');
}

runTests();
