const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function cleanTest() {
  for (const url of ['file:pos-mvp/dev.db', 'file:pos-mvp/local.db']) {
    const c = createClient({ url });
    await c.execute({ sql: "DELETE FROM ShiftSession WHERE id = 'shift_6c06be3d'", args: [] });
    await c.execute({ sql: "DELETE FROM Shift WHERE id = 'shift_6c06be3d'", args: [] });
  }
  const turso = createClient({
    url: 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTMyMjgwODAsImlkIjoiMDFhMTg0YjgtMjIwMS03YzJhLThlY2EtZDVkNDcyZjkxZGRlIiwia2lkIjoiQ0cxaFB3c3d5VWgwUlE5dzNZRDZRRmxuYk9rWUNCYklfVWJkSEhXS1hNNCIsInJpZCI6Ijk3MzEwYzA5LTMxYjUtNDNkNi1hY2ViLWNmYWY1MTIzZDRkNSJ9.wBeE8WLExcIW_k8NU4RB4RgFYNpE1a73T8e8JemANcvk4kocFOdZe54CJe3azLsG9h-5MtCMx7ArY0kUSYyMBw'
  });
  await turso.execute({ sql: "DELETE FROM ShiftSession WHERE id = 'shift_6c06be3d'", args: [] });
  console.log('Cleaned test shift.');
}

cleanTest().catch(console.error);

