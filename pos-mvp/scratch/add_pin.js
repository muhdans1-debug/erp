import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./dev.db');
try {
  db.exec("ALTER TABLE Customer ADD COLUMN khata_pin TEXT DEFAULT '0000'");
  console.log('khata_pin column added successfully');
} catch (e) {
  console.log('Notice:', e.message);
}

// Set a default pin for demo customers
try {
  db.prepare("UPDATE Customer SET khata_pin = '8822' WHERE id = 'cust_nfc_demo_01'").run();
  console.log('Set PIN 8822 for cust_nfc_demo_01');
} catch (e) {
  console.log('Update notice:', e.message);
}

db.close();

