const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getDB, getSetting } = require('./db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

function startBackupSchedule() {
  const enabled = getSetting('backup_enabled');
  if (enabled !== 'true') {
    console.log('[backup] Auto-backup disabled');
    return;
  }

  const hours = parseInt(getSetting('backup_interval_hours') || '24');
  const cronExpr = `0 */${Math.max(1, hours)} * * *`;

  cron.schedule(cronExpr, () => {
    console.log('[backup] Running scheduled backup...');
    createBackup();
  });

  console.log(`[backup] Scheduled every ${hours} hours`);
}

function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(BACKUP_DIR, `ssy_${timestamp}.db`);

  try {
    getDB().backup(backupPath);
    console.log(`[backup] Created: ${backupPath}`);
    pruneOldBackups();
    return backupPath;
  } catch (e) {
    console.error('[backup] Failed:', e.message);
    return null;
  }
}

function pruneOldBackups() {
  const keepCount = parseInt(getSetting('backup_keep_count') || '30');
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('ssy_') && f.endsWith('.db'))
    .sort()
    .reverse();

  for (let i = keepCount; i < files.length; i++) {
    const filePath = path.join(BACKUP_DIR, files[i]);
    fs.unlinkSync(filePath);
    console.log(`[backup] Pruned old backup: ${files[i]}`);
  }
}

module.exports = { startBackupSchedule, createBackup };
