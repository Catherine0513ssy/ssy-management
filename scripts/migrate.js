#!/usr/bin/env node
/**
 * SSY Migration Script: JSON files → SQLite database
 * Usage: node scripts/migrate.js [--source /var/www/homework] [--verbose]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initDB, getDB, setSetting, closeDB } = require('../services/db');

// Parse args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const sourceIdx = args.indexOf('--source');
const SOURCE_DIR = sourceIdx >= 0 ? args[sourceIdx + 1] : '/var/www/homework';
const QUIZ_DIR = '/var/www/quiz';

function log(...msg) { console.log('[migrate]', ...msg); }
function vlog(...msg) { if (verbose) console.log('  ', ...msg); }

// ===== Student data (from original server.js) =====
const CLASS_2313_GROUP1 = ['龙欣怡','罗鹏辉','唐冉','王妍熙','裴健平','吴向荣','樊俊熙','万雨彤','袁微茗','张博彦','刘瑞','刘雅萱','向俊涵','罗翔译','段轩禹','朱笑仪','邵善琳','李林颐','易露熙'];
const CLASS_2313_GROUP2 = ['罗俊涛','张莞淇','王紫贤','刘宸熙','曹怀芳','易铭轩','肖涵杰','余熙冉','郭子涵','龙莉','曾诗予','胡芸甄'];
const CLASS_2314_GROUP1 = ['陈思颖','杨思诺','陈思漫','周佳成','朱俊宇','汤思源','陈欣妍','王艺轩','刘志远','周柯宇','谭伊婷','蒋子杰','袁宇杰','袁旭','陈诺涵'];

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    log(`WARNING: Failed to read ${filePath}: ${e.message}`);
    return null;
  }
}

function main() {
  log('=== SSY Migration: JSON → SQLite ===');
  log(`Source: ${SOURCE_DIR}`);

  // 1. Backup source
  const backupDir = path.join(SOURCE_DIR, 'backups', 'pre-migration');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const jsonFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.json'));
  for (const f of jsonFiles) {
    fs.copyFileSync(path.join(SOURCE_DIR, f), path.join(backupDir, f));
  }
  log(`Backed up ${jsonFiles.length} JSON files to ${backupDir}`);

  // 2. Init database
  const dbPath = path.join(__dirname, '..', 'ssy.db');
  if (fs.existsSync(dbPath)) {
    log('Removing existing database...');
    fs.unlinkSync(dbPath);
  }
  const db = initDB(dbPath);
  log('Database created with schema');

  const counts = {};

  // 3. Migrate classes & students
  db.exec('BEGIN');
  try {
    const insertClass = db.prepare('INSERT INTO classes (name, display_name) VALUES (?, ?)');
    const insertGroup = db.prepare('INSERT INTO student_groups (class_id, name, sort_order) VALUES (?, ?, ?)');
    const insertStudent = db.prepare('INSERT INTO students (class_id, group_id, name, sort_order) VALUES (?, ?, ?, ?)');

    // Class 2313
    const c1 = insertClass.run('2313', '2313班');
    const g1 = insertGroup.run(c1.lastInsertRowid, '第一组', 1);
    const g2 = insertGroup.run(c1.lastInsertRowid, '第二组', 2);
    CLASS_2313_GROUP1.forEach((name, i) => insertStudent.run(c1.lastInsertRowid, g1.lastInsertRowid, name, i));
    CLASS_2313_GROUP2.forEach((name, i) => insertStudent.run(c1.lastInsertRowid, g2.lastInsertRowid, name, i));

    // Class 2314
    const c2 = insertClass.run('2314', '2314班');
    const g3 = insertGroup.run(c2.lastInsertRowid, '第一组', 1);
    CLASS_2314_GROUP1.forEach((name, i) => insertStudent.run(c2.lastInsertRowid, g3.lastInsertRowid, name, i));

    db.exec('COMMIT');
    counts.classes = 2;
    counts.students = CLASS_2313_GROUP1.length + CLASS_2313_GROUP2.length + CLASS_2314_GROUP1.length;
    log(`Classes: ${counts.classes} created, Students: ${counts.students} imported`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  // 4. Migrate homework
  const insertHW = db.prepare('INSERT INTO homework_items (class_id, date, text, image, sort_order) VALUES (?, ?, ?, ?, ?)');
  counts.homework = 0;

  for (const [classId, suffix] of [[1, ''], [2, '_2314']]) {
    const data = readJSON(path.join(SOURCE_DIR, `homework${suffix}.json`));
    if (!data) continue;
    db.exec('BEGIN');
    for (const [date, items] of Object.entries(data)) {
      if (!Array.isArray(items)) continue;
      items.forEach((item, i) => {
        if (!item || !item.text) return;
        insertHW.run(classId, date, item.text, item.image || null, i);
        counts.homework++;
      });
    }
    db.exec('COMMIT');
    vlog(`homework class=${classId}: migrated`);
  }
  log(`Homework items: ${counts.homework}`);

  // 5. Migrate checkin data
  const insertSession = db.prepare('INSERT OR IGNORE INTO checkin_sessions (class_id, type, round, date, updated_at) VALUES (?, ?, ?, ?, ?)');
  const insertRecord = db.prepare('INSERT INTO checkin_records (session_id, student_index, group_index, passed) VALUES (?, ?, ?, ?)');
  counts.checkin_sessions = 0;
  counts.checkin_records = 0;

  // Map: [file, classId, type, round]
  const checkinFiles = [
    ['checkin.json', 1, 'word', 1],
    ['checkin2.json', 1, 'word', 2],
    ['checkin_2314.json', 2, 'word', 1],
    ['checkin2_2314.json', 2, 'word', 2],
    ['essay.json', 1, 'essay', 1],
    ['essay2.json', 1, 'essay', 2],
    ['essay_2314.json', 2, 'essay', 1],
    ['essay2_2314.json', 2, 'essay', 2],
  ];

  for (const [file, classId, type, round] of checkinFiles) {
    const data = readJSON(path.join(SOURCE_DIR, file));
    if (!data || typeof data !== 'object') continue;

    db.exec('BEGIN');
    for (const [date, val] of Object.entries(data)) {
      const updatedAt = (val && val.updatedAt) || null;

      // Determine passed indices based on data format
      let passedByGroup = {};

      if (type === 'essay') {
        // Essay format: { "date": [idx, idx, ...] } — flat array, all group 1
        if (Array.isArray(val)) {
          passedByGroup['1'] = val;
        } else if (val && val.passed) {
          passedByGroup['1'] = Array.isArray(val.passed) ? val.passed : [];
        }
      } else if (val && val.passed) {
        if (Array.isArray(val.passed)) {
          // Format: [null, [group1_indices], [group2_indices]]
          if (val.passed[1]) passedByGroup['1'] = val.passed[1];
          if (val.passed[2]) passedByGroup['2'] = val.passed[2];
        } else if (typeof val.passed === 'object') {
          // Format: { "1": [indices], "2": [indices] }
          passedByGroup = val.passed;
        }
      }

      // Skip empty dates
      const totalPassed = Object.values(passedByGroup).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
      if (totalPassed === 0) continue;

      const sess = insertSession.run(classId, type, round, date, updatedAt);
      const sessionId = sess.lastInsertRowid;
      if (!sessionId) continue;
      counts.checkin_sessions++;

      for (const [groupKey, indices] of Object.entries(passedByGroup)) {
        if (!Array.isArray(indices)) continue;
        for (const idx of indices) {
          if (idx === null || idx === undefined) continue;
          insertRecord.run(sessionId, idx, parseInt(groupKey), 1);
          counts.checkin_records++;
        }
      }
    }
    db.exec('COMMIT');
    vlog(`${file}: migrated`);
  }
  log(`Checkin sessions: ${counts.checkin_sessions}, records: ${counts.checkin_records}`);

  // 6. Migrate excellent homework
  const insertExcellent = db.prepare('INSERT INTO excellent_homework (class_id, student_name, image_path, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  counts.excellent = 0;

  for (const [classId, suffix] of [[1, ''], [2, '_2314']]) {
    const data = readJSON(path.join(SOURCE_DIR, `excellent${suffix}.json`));
    if (!Array.isArray(data)) continue;
    db.exec('BEGIN');
    for (const item of data) {
      if (!item) continue;
      insertExcellent.run(
        classId,
        item.name || 'Unknown',
        item.image || null,
        item.date || null,
        item.note || null,
        item.createdAt || null
      );
      counts.excellent++;
    }
    db.exec('COMMIT');
  }
  log(`Excellent homework: ${counts.excellent}`);

  // 7. Migrate vocabulary
  const insertVocab = db.prepare('INSERT INTO vocabulary (word, phonetic, meaning, unit, grade, source) VALUES (?, ?, ?, ?, ?, ?)');
  const vocabData = readJSON(path.join(SOURCE_DIR, 'vocabulary.json'));
  counts.vocabulary = 0;

  if (vocabData && vocabData.words) {
    db.exec('BEGIN');
    for (const [key, w] of Object.entries(vocabData.words)) {
      insertVocab.run(
        w.en || key,
        w.phonetic || null,
        w.meaning || '',
        w.unit || null,
        w.grade || null,
        'textbook'
      );
      counts.vocabulary++;
    }
    db.exec('COMMIT');
  }
  log(`Vocabulary: ${counts.vocabulary} words`);

  // 8. Set default settings
  const passwordHash = crypto.createHash('sha256').update('Ssy2026').digest('hex');
  setSetting('auth_password_hash', passwordHash);
  setSetting('auth_password_plain', 'Ssy2026');
  setSetting('ocr_engine', 'disabled');
  setSetting('ocr_tencent_secret_id', '');
  setSetting('ocr_tencent_secret_key', '');
  setSetting('ocr_ai_api_key', '');
  setSetting('ocr_ai_endpoint', '');
  setSetting('ocr_ai_model', '');
  setSetting('backup_enabled', 'true');
  setSetting('backup_interval_hours', '24');
  setSetting('backup_keep_count', '30');
  log('Default settings configured');

  // 9. Copy uploads
  const srcUploads = path.join(SOURCE_DIR, 'uploads');
  const dstUploads = path.join(__dirname, '..', 'public', 'uploads');
  if (fs.existsSync(srcUploads)) {
    const files = fs.readdirSync(srcUploads);
    for (const f of files) {
      fs.copyFileSync(path.join(srcUploads, f), path.join(dstUploads, f));
    }
    log(`Uploads: ${files.length} files copied`);
    counts.uploads = files.length;
  }

  // 10. Verification
  log('\n=== Verification ===');
  const verify = [
    ['classes', 2],
    ['students', counts.students],
    ['homework_items', counts.homework],
    ['checkin_sessions', counts.checkin_sessions],
    ['checkin_records', counts.checkin_records],
    ['excellent_homework', counts.excellent],
    ['vocabulary', counts.vocabulary],
  ];

  let allPassed = true;
  for (const [table, expected] of verify) {
    const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
    const status = row.c === expected ? '✓' : '✗';
    if (row.c !== expected) allPassed = false;
    log(`  ${status} ${table}: ${row.c} rows (expected ${expected})`);
  }

  closeDB();

  if (allPassed) {
    log('\n✅ Migration complete. ALL COUNTS MATCH.');
  } else {
    log('\n⚠️  Migration complete with MISMATCHES. Please check.');
  }

  log(`Database: ${dbPath} (${(fs.statSync(dbPath).size / 1024).toFixed(1)} KB)`);
}

main();
