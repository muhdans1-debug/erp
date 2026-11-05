const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const dbPath = path.resolve(__dirname, '..', 'f100_clean.db');
const db = new DatabaseSync(dbPath);
const res = db.prepare("UPDATE local_pim_intake SET sync_status = 1, synced_at = datetime('now') WHERE sync_status = 0").run();
console.log('Updated rows in clean db:', res);
db.close();

// Now push the updated database back into the F100 app sandbox
const adbPath = process.env.LOCALAPPDATA + '\\Android\\Sdk\\platform-tools\\adb.exe';

const proc = spawn(adbPath, ['-s', 'cf8e6100', 'shell', 'run-as com.retail.pos sh -c "cat > databases/f100_offline_dbSQLite.db"'], {
  stdio: ['pipe', 'inherit', 'inherit']
});

const inStream = fs.createReadStream(dbPath);
inStream.pipe(proc.stdin);
proc.on('close', code => {
  console.log('Pushed updated database to F100 terminal, exit code:', code);
});

