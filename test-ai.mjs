const TENANT_ID = '4ad603b6-087a-4388-8883-cfa55d5e64ff';

async function testAi() {
  console.log('Sending AI query request to http://localhost:4000/api/ai/query...');

  const response = await fetch('http://localhost:4000/api/ai/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      prompt: 'Can you check the ledger and unpaid invoices for account number CUST-884?'
    })
  });

  const result = await response.json();
  console.log('Response Status:', response.status);
  console.log('Response Body:', JSON.stringify(result, null, 2));
}

testAi().catch(console.error);