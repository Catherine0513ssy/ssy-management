const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('backup script creates a timestamped copy of the database', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssy-backup-test-'));
  const dbPath = path.join(tempDir, 'ssy.db');
  const backupDir = path.join(tempDir, 'backups');
  const timestamp = '2026-03-27T00-00-00';
  const scriptPath = path.join(__dirname, '..', 'scripts', 'backup.sh');

  fs.writeFileSync(dbPath, 'test-db-content');

  const result = spawnSync('bash', [scriptPath], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      APP_DIR: tempDir,
      DB_PATH: dbPath,
      BACKUP_DIR: backupDir,
      BACKUP_TIMESTAMP: timestamp,
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const backupPath = path.join(backupDir, `ssy_${timestamp}.db`);
  assert.equal(fs.readFileSync(backupPath, 'utf8'), 'test-db-content');
});
