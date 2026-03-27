const router = require('express').Router();
const { getDB, getSetting, setSetting } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// All admin routes require auth
router.use(requireAuth);

const DB_PATH = path.join(__dirname, '..', 'ssy.db');
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

// ============================================================
// CLASSES
// ============================================================

router.get('/classes', (req, res) => {
  const db = getDB();
  const classes = db.prepare(`
    SELECT c.*, COUNT(s.id) AS student_count
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id AND s.active = 1
    GROUP BY c.id
    ORDER BY c.id
  `).all();
  res.json(classes);
});

router.post('/classes', (req, res) => {
  const { name, display_name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const db = getDB();
  const info = db.prepare('INSERT INTO classes (name, display_name) VALUES (?, ?)').run(name, display_name || name);
  res.json({ id: info.lastInsertRowid, name, display_name: display_name || name });
});

router.put('/classes/:id', (req, res) => {
  const { name, display_name } = req.body;
  const db = getDB();
  db.prepare('UPDATE classes SET name = COALESCE(?, name), display_name = COALESCE(?, display_name) WHERE id = ?')
    .run(name || null, display_name || null, req.params.id);
  res.json({ success: true });
});

router.delete('/classes/:id', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE students SET active = 0 WHERE class_id = ?').run(req.params.id);
  res.json({ success: true, message: '班级已停用，所有学生已设为不活跃' });
});

// ============================================================
// GROUPS
// ============================================================

router.get('/groups', (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ error: 'class_id is required' });
  const db = getDB();
  const groups = db.prepare('SELECT * FROM student_groups WHERE class_id = ? ORDER BY sort_order, id').all(class_id);
  res.json(groups);
});

router.post('/groups', (req, res) => {
  const { class_id, name } = req.body;
  if (!class_id || !name) return res.status(400).json({ error: 'class_id and name are required' });
  const db = getDB();
  const info = db.prepare('INSERT INTO student_groups (class_id, name) VALUES (?, ?)').run(class_id, name);
  res.json({ id: info.lastInsertRowid, class_id, name });
});

router.delete('/groups/:id', (req, res) => {
  const db = getDB();
  // Unlink students from this group before deleting
  db.prepare('UPDATE students SET group_id = NULL WHERE group_id = ?').run(req.params.id);
  db.prepare('DELETE FROM student_groups WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============================================================
// STUDENTS
// ============================================================

router.get('/students', (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ error: 'class_id is required' });
  const db = getDB();
  const students = db.prepare(`
    SELECT s.*, g.name AS group_name
    FROM students s
    LEFT JOIN student_groups g ON g.id = s.group_id
    WHERE s.class_id = ?
    ORDER BY g.sort_order, s.sort_order, s.id
  `).all(class_id);

  // Group by group_name for frontend convenience
  const grouped = {};
  for (const s of students) {
    const key = s.group_name || '未分组';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }
  res.json({ students, grouped });
});

router.post('/students', (req, res) => {
  const { class_id, group_id, name } = req.body;
  if (!class_id || !name) return res.status(400).json({ error: 'class_id and name are required' });
  const db = getDB();
  const info = db.prepare('INSERT INTO students (class_id, group_id, name) VALUES (?, ?, ?)').run(class_id, group_id || null, name);
  res.json({ id: info.lastInsertRowid, class_id, group_id, name });
});

router.post('/students/batch', (req, res) => {
  const { class_id, group_id, names } = req.body;
  if (!class_id || !names) return res.status(400).json({ error: 'class_id and names are required' });

  const nameList = names.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
  if (nameList.length === 0) return res.status(400).json({ error: 'names is empty' });

  const db = getDB();
  const stmt = db.prepare('INSERT INTO students (class_id, group_id, name) VALUES (?, ?, ?)');
  const insertAll = db.transaction((list) => {
    const ids = [];
    for (const n of list) {
      const info = stmt.run(class_id, group_id || null, n);
      ids.push(info.lastInsertRowid);
    }
    return ids;
  });

  const ids = insertAll(nameList);
  res.json({ success: true, count: ids.length, ids });
});

router.put('/students/:id', (req, res) => {
  const { name, group_id, active } = req.body;
  const db = getDB();
  db.prepare(`
    UPDATE students
    SET name = COALESCE(?, name), group_id = COALESCE(?, group_id), active = COALESCE(?, active)
    WHERE id = ?
  `).run(name || null, group_id !== undefined ? group_id : null, active !== undefined ? active : null, req.params.id);
  res.json({ success: true });
});

router.delete('/students/:id', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============================================================
// SETTINGS
// ============================================================

const SENSITIVE_KEYS = ['tencent_secret_key', 'ai_api_key', 'admin_password'];

router.get('/settings', (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM settings ORDER BY key').all();
  const settings = {};
  for (const row of rows) {
    const isSensitive = SENSITIVE_KEYS.some(k => row.key.toLowerCase().includes(k));
    settings[row.key] = isSensitive && row.value.length > 4
      ? '****' + row.value.slice(-4)
      : row.value;
  }
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const entries = Object.entries(req.body);
  if (entries.length === 0) return res.status(400).json({ error: 'no settings provided' });
  for (const [key, value] of entries) {
    setSetting(key, value);
  }
  res.json({ success: true, updated: entries.length });
});

// ============================================================
// OCR TEST
// ============================================================

router.post('/test-ocr', (req, res) => {
  const { engine } = req.body;
  if (engine === 'tencent') {
    const secretId = getSetting('ocr_tencent_secret_id');
    const secretKey = getSetting('ocr_tencent_secret_key');
    if (!secretId || !secretKey) {
      return res.json({ success: false, message: '腾讯云 SecretId 或 SecretKey 未设置' });
    }
    return res.json({ success: true, message: '腾讯云 OCR 密钥已配置' });
  }
  if (engine === 'ai') {
    const apiKey = getSetting('ocr_ai_api_key');
    const endpoint = getSetting('ocr_ai_endpoint');
    if (!apiKey || !endpoint) {
      return res.json({ success: false, message: 'AI API Key 或 Endpoint 未设置' });
    }
    return res.json({ success: true, message: 'AI OCR 配置正常（引擎: ' + (getSetting('ocr_ai_model') || 'default') + '）' });
  }
  res.status(400).json({ error: 'engine must be "tencent" or "ai"' });
});

// ============================================================
// SYSTEM INFO
// ============================================================

router.get('/system-info', (req, res) => {
  const db = getDB();
  const studentCount = db.prepare('SELECT COUNT(*) AS c FROM students WHERE active = 1').get().c;
  const vocabCount = db.prepare('SELECT COUNT(*) AS c FROM vocabulary').get().c;
  const classCount = db.prepare('SELECT COUNT(*) AS c FROM classes').get().c;

  let dbSize = 0;
  try { dbSize = fs.statSync(DB_PATH).size; } catch {}

  res.json({
    nodeVersion: process.version,
    uptime: Math.floor(process.uptime()),
    dbSize,
    studentCount,
    vocabCount,
    classCount,
  });
});

// ============================================================
// BACKUPS
// ============================================================

router.get('/backups', (req, res) => {
  if (!fs.existsSync(BACKUPS_DIR)) return res.json([]);
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return { name: f, size: stat.size, created: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
  res.json(files);
});

router.post('/backups', (req, res) => {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(BACKUPS_DIR, `ssy_${ts}.db`);
  fs.copyFileSync(DB_PATH, dest);
  const stat = fs.statSync(dest);
  res.json({ success: true, name: path.basename(dest), size: stat.size });
});

router.delete('/backups/:name', (req, res) => {
  const name = req.params.name;
  if (!/^ssy_[\d-T]+\.db$/.test(name)) return res.status(400).json({ error: 'invalid backup name' });
  const filePath = path.join(BACKUPS_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'backup not found' });
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// ============================================================
// DATA EXPORT
// ============================================================

const EXPORTABLE_TABLES = ['students', 'homework_items', 'vocabulary', 'excellent_homework', 'checkin_sessions', 'checkin_records', 'score_events', 'ocr_logs'];

router.get('/export/:table', (req, res) => {
  const table = req.params.table;
  if (!EXPORTABLE_TABLES.includes(table)) {
    return res.status(400).json({ error: `Table "${table}" is not exportable. Allowed: ${EXPORTABLE_TABLES.join(', ')}` });
  }
  const db = getDB();
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  res.setHeader('Content-Disposition', `attachment; filename="${table}_export.json"`);
  res.json(rows);
});

module.exports = router;
