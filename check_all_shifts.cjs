const { createClient } = require('./pos-mvp/node_modules/@libsql/client');
const fs = require('fs');

async function inspectShifts() {
  console.log('=== Checking pos-mvp/local.db ===');
  try {
    const localClient = createClient({ url: 'file:pos-mvp/local.db' });
    const localShifts = await localClient.execute("SELECT id, employee_id, status, opened_at, closed_at, starting_cash, actual_cash FROM ShiftSession ORDER BY opened_at DESC LIMIT 15");
    console.log(`local.db ShiftSession count returned: ${localShifts.rows.length}`);
    console.log(localShifts.rows);
  } catch (e) {
    console.error('Error reading local.db:', e.message);
  }

  console.log('\n=== Checking pos-mvp/dev.db ===');
  try {
    const devClient = createClient({ url: 'file:pos-mvp/dev.db' });
    const devShifts = await devClient.execute("SELECT id, employee_id, status, opened_at, closed_at, starting_cash, actual_cash FROM ShiftSession ORDER BY opened_at DESC LIMIT 15");
    console.log(`dev.db ShiftSession count returned: ${devShifts.rows.length}`);
    console.log(devShifts.rows);
  } catch (e) {
    console.error('Error reading dev.db:', e.message);
  }

  console.log('\n=== Checking Turso Cloud ===');
  try {
    const cloudClient = createClient({
      url: 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io',
      authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTMyMjgwODAsImlkIjoiMDFhMTg0YjgtMjIwMS03YzJhLThlY2EtZDVkNDcyZjkxZGRlIiwia2lkIjoiQ0cxaFB3c3d5VWgwUlE5dzNZRDZRRmxuYk9rWUNCYklfVWJkSEhXS1hNNCIsInJpZCI6Ijk3MzEwYzA5LTMxYjUtNDNkNi1hY2ViLWNmYWY1MTIzZDRkNSJ9.wBeE8WLExcIW_k8NU4RB4RgFYNpE1a73T8e8JemANcvk4kocFOdZe54CJe3azLsG9h-5MtCMx7ArY0kUSYyMBw'
    });
    const cloudShifts = await cloudClient.execute("SELECT id, employee_id, status, opened_at, closed_at, starting_cash, actual_cash FROM ShiftSession ORDER BY opened_at DESC LIMIT 15");
    console.log(`Turso cloud ShiftSession count returned: ${cloudShifts.rows.length}`);
    console.log(cloudShifts.rows);
  } catch (e) {
    console.error('Error reading Turso cloud:', e.message);
  }
}

inspectShifts().catch(console.error);

