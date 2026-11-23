async function verifyLiveProduction() {
  const host = 'https://askar-khata-pwa.vercel.app';
  console.log(`🌐 Testing Live Production Deployment at ${host}...\n`);

  // 1. Bad password test
  console.log('[Live Test 1] Testing invalid password rejection...');
  const badRes = await fetch(`${host}/api/dev/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'WrongPassword999!' })
  });
  console.log(`Status: ${badRes.status}`);
  const badJson = await badRes.json();
  console.log(`Response: ${JSON.stringify(badJson)}`);
  if (badRes.status !== 401) throw new Error('Expected 401 for wrong password');

  // 2. Master password test
  console.log('\n[Live Test 2] Testing master password "Anasanas1!"...');
  const goodRes = await fetch(`${host}/api/dev/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'Anasanas1!' })
  });
  console.log(`Status: ${goodRes.status}`);
  const goodJson = await goodRes.json();
  if (goodRes.status !== 200 || !goodJson.token) {
    throw new Error(`Master password auth failed: ${JSON.stringify(goodJson)}`);
  }
  const token = goodJson.token;
  console.log(`✅ Master password authenticated successfully! Token: ${token.slice(0, 25)}...`);

  // 3. Customers roster & KPIs
  console.log('\n[Live Test 3] Testing /api/dev/customers with Developer JWT...');
  const custRes = await fetch(`${host}/api/dev/customers`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  console.log(`Status: ${custRes.status}`);
  const custJson = await custRes.json();
  if (custRes.status !== 200 || !custJson.success) {
    throw new Error(`Failed to fetch customers: ${JSON.stringify(custJson)}`);
  }
  console.log(`✅ Loaded ${custJson.customers.length} customer records from live production!`);
  console.log('Live KPIs:', JSON.stringify(custJson.stats, null, 2));

  // 4. HTML verification for /dev
  console.log('\n[Live Test 4] Testing GET /dev HTML route...');
  const devPageRes = await fetch(`${host}/dev`);
  console.log(`Status: ${devPageRes.status}`);
  const devHtml = await devPageRes.text();
  if (devPageRes.status === 200 && devHtml.includes('index-')) {
    console.log('✅ Live /dev route serves PWA index bundle successfully.');
  } else {
    throw new Error('Failed to load /dev HTML page');
  }

  console.log('\n🎉 ALL LIVE PRODUCTION VERIFICATIONS PASSED!\n');
}

verifyLiveProduction().catch((err) => {
  console.error('\n❌ Live Verification Failed:', err);
  process.exit(1);
});
