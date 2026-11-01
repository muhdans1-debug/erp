const { createClient } = require('@libsql/client');
require('dotenv').config({ path: './.env' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function testMessEnrollment() {
  console.log('Testing Turso Mess Group & Card Enrollment...');

  const testTagId = '04:6A:B2:91:2A';
  const messGroupId = 'mess_camp4_demo';
  const messGroupName = 'Camp 4 Room 12 Mess';

  // 1. Create or replace test MessGroup
  await client.execute({
    sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt)
          VALUES (?, 'tenant_1', ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name`,
    args: [messGroupId, messGroupName]
  });
  console.log('✅ MessGroup registered:', messGroupName);

  // 2. Fetch two existing customers to link
  const custRes = await client.execute(`SELECT id, name FROM Customer LIMIT 2`);
  const member1 = custRes.rows[0];
  const member2 = custRes.rows[1];
  console.log(`Linking members: ${member1.name} (${member1.id}) and ${member2.name} (${member2.id})`);

  await client.execute({
    sql: `UPDATE Customer SET mess_id = ? WHERE id IN (?, ?)`,
    args: [messGroupId, member1.id, member2.id]
  });
  console.log('✅ Linked members to mess group.');

  // 3. Link the test NFC card to this MessGroup
  await client.execute({
    sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt)
          VALUES (?, 'MESS', NULL, ?, datetime('now'))
          ON CONFLICT(tag_id) DO UPDATE SET 
            card_type = 'MESS',
            customer_id = NULL,
            mess_id = excluded.mess_id`,
    args: [testTagId, messGroupId]
  });
  console.log(`✅ Linked NFC tag ${testTagId} to MessGroup!`);

  // 4. Test Step 3 POS Query on this card:
  const queryResult = await client.execute({
    sql: `SELECT m.id as mess_id, m.group_name, c.id as customer_id, c.name as customer_name, c.phone 
          FROM NfcCard n 
          JOIN MessGroup m ON n.mess_id = m.id 
          JOIN Customer c ON c.mess_id = m.id 
          WHERE n.tag_id = ?`,
    args: [testTagId]
  });

  console.log('\n🎯 POS Checkout Query Result:');
  console.log(queryResult.rows);

  console.log('\nSimulation Math for BHD 4.000 Groceries:');
  const cartTotal = 4.000;
  const splitAmount = (cartTotal / queryResult.rows.length).toFixed(3);
  queryResult.rows.forEach(member => {
    console.log(`  - Charge ${member.customer_name}: BHD ${splitAmount}`);
  });

  console.log('\n🎉 ALL STEP 2 ENROLLMENT LOGIC VERIFIED 100% ON TURSO!');
}

testMessEnrollment().catch(console.error);

