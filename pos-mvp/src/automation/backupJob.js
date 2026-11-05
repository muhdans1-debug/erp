import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { db } from '../../db.js';

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
 * Executes a native WAL-safe online backup using SQLite's VACUUM INTO.
 * Safely flushes the WAL and creates an unfragmented, 100% structurally sound snapshot
 * without locking POS cashiers or disrupting active transactions.
 */
export const performDailyBackup = async (dbInstance = db) => {
  ensureArchivesDir();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

  const baseName = `backup_${year}-${month}-${day}`;
  let targetFilename = `${baseName}.db`;
  let targetPath = path.join(ARCHIVES_DIR, targetFilename);

  // If a backup for today already exists, append hours-minutes-seconds to prevent collision
  if (fs.existsSync(targetPath)) {
    targetFilename = `${baseName}_${time}.db`;
    targetPath = path.join(ARCHIVES_DIR, targetFilename);
  }

  // Ensure file does not exist before VACUUM INTO (SQLite requirement)
  if (fs.existsSync(targetPath)) {
    try {
      fs.unlinkSync(targetPath);
    } catch {}
  }

  // SQLite requires single-quoted path with forward slashes on Windows & POSIX
  const normalizedPath = targetPath.replace(/\\/g, '/');

  try {
    console.log('🔄 Initiating safe SQLite online backup (VACUUM INTO)...');

    const activeDb = dbInstance || db;
    if (!activeDb || typeof activeDb.execute !== 'function') {
      throw new Error('Database client instance is not available or missing .execute() method.');
    }

    // ✅ EXECUTE NATIVE WAL-SAFE BACKUP
    // Flushes the WAL and creates a perfect, zero-downtime point-in-time snapshot
    await activeDb.execute(`VACUUM INTO '${normalizedPath}'`);

    // Touch mtime to now so file stat reflects the exact creation time
    try {
      fs.utimesSync(targetPath, now, now);
    } catch {}

    const stats = fs.statSync(targetPath);
    console.log(
      `🛡️ [Database Backup] Safe WAL snapshot created successfully: ${targetFilename} (${(stats.size / 1024).toFixed(1)} KB)`
    );

    return {
      filename: targetFilename,
      fullPath: targetPath,
      sizeBytes: stats.size,
      createdAt: now.toISOString(),
    };
  } catch (error) {
    console.error('❌ Critical Backup Failure:', error);
    throw error;
  }
};

// Backwards compatibility alias
export const createDatabaseBackup = performDailyBackup;

/**
 * Retrieves the latest available backup in /archives (or generates one if empty)
 */
export const getLatestBackup = async () => {
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
  return await performDailyBackup();
};

/**
 * Initializes the node-cron automated schedule to run daily at 3:00 AM (0 3 * * *)
 */
export const startBackupCron = () => {
  console.log('⏰ [Database Backup] Initializing automated daily backup schedule (3:00 AM)...');

  const job = cron.schedule(
    '0 3 * * *',
    async () => {
      console.log('🕒 [Database Backup Cron] Running scheduled 3:00 AM database snapshot...');
      try {
        await performDailyBackup();
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
