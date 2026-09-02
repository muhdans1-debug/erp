const TENANT_ID = '4ad603b6-087a-4388-8883-cfa55d5e64ff';
const CLIENT_ID = '609914dc-50d0-4938-bf10-5d5df9c5d0a4';

async function testApi() {
  console.log('Sending POS sale request to http://localhost:4000/api/sales...');

  const response = await fetch('http://localhost:4000/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      clientId: CLIENT_ID,
      paymentMethod: 'CASH',
      items: [
        { sku: 'BEV-001', quantity: 1 },
        { sku: 'HME-012', quantity: 2 }
      ]
    })
  });

  const result = await response.json();
  console.log('Response Status:', response.status);
  console.log('Response Body:', JSON.stringify(result, null, 2));
}

testApi().catch(console.error);