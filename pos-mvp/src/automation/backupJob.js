import cron from 'node-cron';
import fs from 'fs';
import path from 'path';

const DB_FILENAME = 'dev.db';
const ARCHIVES_DIR = path.resolve(process.cwd(), 'archives');

/**
 * Ensures the /archives directory exists
 */
export const ensureArchivesDir = () => {
  if (!fs.existsSync(ARCHIVES_DIR)) {
    fs.mkdirSync(ARCHIVES_DIR, { recursive: true });
    console.log(`📁 [Database Backup] Created archives directory at: ${ARCHIVES_DIR}`);
  }
  return ARCHIVES_DIR;
};

/**
 * Performs a secure snapshot copy of dev.db with timestamping
 */
export const createDatabaseBackup = () => {
  ensureArchivesDir();

  // Target local.db as the single source of truth
  const sourceDbPath = path.resolve(process.cwd(), 'local.db');

  if (!fs.existsSync(sourceDbPath)) {
    console.warn(`⚠️ [Database Backup] Source database "${sourceDbPath}" not found.`);
    return null;
  }

  // Generate ISO timestamp string for filename (e.g., backup_2026-10-21.db)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

  // Format: backup_YYYY-MM-DD.db (or with time if multiple created same day)
  const baseName = `backup_${year}-${month}-${day}`;
  let targetFilename = `${baseName}.db`;
  let targetPath = path.join(ARCHIVES_DIR, targetFilename);

  // If a backup for today already exists, append hours-minutes to prevent overwriting
  if (fs.existsSync(targetPath)) {
    targetFilename = `${baseName}_${time}.db`;
    targetPath = path.join(ARCHIVES_DIR, targetFilename);
  }

  try {
    // Copy the database file securely
    fs.copyFileSync(sourceDbPath, targetPath);
    // Touch mtime to now so file stat reflects the exact creation time
    try {
      fs.utimesSync(targetPath, now, now);
    } catch { }

    const stats = fs.statSync(targetPath);
    console.log(
      `🛡️ [Database Backup] Snapshot created successfully: ${targetFilename} (${(stats.size / 1024).toFixed(1)} KB)`
    );

    return {
      filename: targetFilename,
      fullPath: targetPath,
      sizeBytes: stats.size,
      createdAt: now.toISOString(),
    };
  } catch (err) {
    console.error('❌ [Database Backup] Failed to create database snapshot:', err);
    throw err;
  }
};

/**
 * Retrieves the latest available backup in /archives (or generates one if empty)
 */
export const getLatestBackup = () => {
  ensureArchivesDir();

  const files = fs
    .readdirSync(ARCHIVES_DIR)
    .filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    .map((f) => {
      const fullPath = path.join(ARCHIVES_DIR, f);
      const stat = fs.statSync(fullPath);
      return {
        filename: f,
        fullPath,
        sizeBytes: stat.size,
        birthtime: stat.birthtimeMs || stat.mtimeMs,
      };
    })
    .sort((a, b) => b.birthtime - a.birthtime || (b.filename > a.filename ? 1 : -1));

  if (files.length > 0) {
    return files[0];
  }

  // If no backup exists yet, create an immediate snapshot
  console.log('ℹ️ [Database Backup] No previous backup found. Generating initial snapshot...');
  return createDatabaseBackup();
};

/**
 * Initializes the node-cron automated schedule to run daily at 3:00 AM (0 3 * * *)
 */
export const startBackupCron = () => {
  console.log('⏰ [Database Backup] Initializing automated daily backup schedule (3:00 AM)...');

  // Schedule for 3:00 AM daily: minute 0, hour 3, any day of month, any month, any day of week
  const job = cron.schedule(
    '0 3 * * *',
    async () => {
      console.log('🕒 [Database Backup Cron] Running scheduled 3:00 AM database snapshot...');
      try {
        createDatabaseBackup();
      } catch (err) {
        console.error('❌ [Database Backup Cron] Daily scheduled backup encountered an error:', err);
      }
    },
    {
      timezone: 'Asia/Bahrain',
    }
  );

  return job;
};
