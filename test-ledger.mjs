const TENANT_ID = '4ad603b6-087a-4388-8883-cfa55d5e64ff';

async function testLedger() {
  console.log('Fetching client ledger directly...');

  const response = await fetch('http://localhost:4000/api/ledger/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      accountNumber: 'CUST-884'
    })
  });

  const result = await response.json();
  console.log('Response Status:', response.status);
  console.log('Response Body:', JSON.stringify(result, null, 2));
}

testLedger().catch(console.error);