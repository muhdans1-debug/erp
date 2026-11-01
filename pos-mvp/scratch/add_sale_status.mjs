import sqlite from '@prisma/orm-sqlite/runtime';
import contractJson from '../prisma/contract.json' with { type: 'json' };

const db = sqlite({ contractJson, path: './dev.db' });

async function run() {
  try {
    const stmt = db.prepare("ALTER TABLE Sale ADD COLUMN status TEXT DEFAULT 'COMPLETED'");
    const res = await stmt.run();
    console.log("Successfully ran ALTER TABLE:", res);
  } catch (err) {
    console.log("ALTER TABLE err:", err.message);
  }

  try {
    const stmt2 = db.prepare("UPDATE Sale SET status = 'COMPLETED' WHERE status IS NULL");
    const res2 = await stmt2.run();
    console.log("Successfully updated null statuses:", res2);
  } catch (err) {
    console.log("UPDATE err:", err.message);
  }
}

run();
