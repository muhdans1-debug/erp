// scratch/check_db_schema.cjs
async function check() {
  const { DatabaseSync } = await import('node:sqlite');
  const rawDb = new DatabaseSync('./dev.db');
  const cols = rawDb.prepare('PRAGMA table_info("KhataLedger")').all();
  console.log('KhataLedger table columns in dev.db:', cols.map(c => c.name));

  // Check if reference column exists, if not add it
  const hasRef = cols.some(c => c.name === 'reference');
  if (!hasRef) {
    console.log('Adding "reference" column to KhataLedger...');
    rawDb.exec('ALTER TABLE "KhataLedger" ADD COLUMN "reference" TEXT;');
    console.log('Added reference column successfully!');
  }

  const hasRunningBal = cols.some(c => c.name === 'running_balance');
  if (!hasRunningBal) {
    console.log('Adding "running_balance" column to KhataLedger...');
    rawDb.exec('ALTER TABLE "KhataLedger" ADD COLUMN "running_balance" REAL;');
    console.log('Added running_balance column successfully!');
  }

  const updatedCols = rawDb.prepare('PRAGMA table_info("KhataLedger")').all();
  console.log('Updated columns:', updatedCols.map(c => c.name));
}

check().catch(console.error);
