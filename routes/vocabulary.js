const router = require('express').Router();
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const { importVocabularyBatch } = require('../services/vocabulary-import');

// ---------------------------------------------------------------------------
// GET /stats  — vocabulary statistics (count by grade, total)
// ---------------------------------------------------------------------------
router.get('/stats', (req, res) => {
  const db = getDB();

  const total = db
    .prepare('SELECT COUNT(*) AS count FROM vocabulary')
    .get().count;

  const rows = db
    .prepare(
      `SELECT grade, COUNT(*) AS count FROM vocabulary
       GROUP BY grade ORDER BY grade ASC`
    )
    .all();

  const byGrade = {};
  for (const row of rows) {
    byGrade[row.grade || 'unknown'] = row.count;
  }

  const unitRows = db
    .prepare(
      `SELECT COALESCE(grade, 'unknown') AS grade, COALESCE(unit, 'unknown') AS unit, COUNT(*) AS count
       FROM vocabulary
       GROUP BY COALESCE(grade, 'unknown'), COALESCE(unit, 'unknown')
       ORDER BY grade ASC, unit ASC`
    )
    .all();

  const byUnit = {};
  for (const row of unitRows) {
    byUnit[`${row.grade}:${row.unit}`] = row.count;
  }

  return res.json({ total, byGrade, byUnit });
});

// ---------------------------------------------------------------------------
// GET /  — list vocabulary, optionally filtered by grade or search text
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { grade, unit, search } = req.query;
  const db = getDB();

  const conditions = [];
  const params = [];

  if (grade) {
    conditions.push('grade = ?');
    params.push(grade);
  }

  if (unit) {
    conditions.push('unit = ?');
    params.push(unit);
  }

  if (search) {
    conditions.push('(word LIKE ? OR meaning LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const words = db
    .prepare(
      `SELECT * FROM vocabulary ${where}
       ORDER BY grade ASC, unit ASC, id ASC`
    )
    .all(...params);

  return res.json({ words, total: words.length });
});

// ---------------------------------------------------------------------------
// POST /  — insert a single word (auth required)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, (req, res) => {
  const { word, phonetic, meaning, unit, grade, pos } = req.body;

  if (!word || !meaning) {
    return res.status(400).json({ error: 'word and meaning are required' });
  }

  const db = getDB();
  const info = db
    .prepare(
      `INSERT INTO vocabulary (word, phonetic, meaning, unit, grade, pos, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(word, phonetic || null, meaning, unit || null, grade || null, pos || null);

  const inserted = db
    .prepare('SELECT * FROM vocabulary WHERE id = ?')
    .get(info.lastInsertRowid);

  return res.json({ word: inserted });
});

// ---------------------------------------------------------------------------
// POST /batch  — insert multiple words, optionally replace existing unit data
// ---------------------------------------------------------------------------
router.post('/batch', requireAuth, (req, res) => {
  const { words, mode, replace_scope } = req.body;

  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words array is required and must not be empty' });
  }

  const db = getDB();
  const result = importVocabularyBatch(db, words, {
    mode,
    replaceScope: replace_scope || 'unit',
  });

  return res.json(result);
});

// ---------------------------------------------------------------------------
// PUT /:id  — update a word by id (auth required)
// ---------------------------------------------------------------------------
router.put('/:id', requireAuth, (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);

  const existing = db
    .prepare('SELECT * FROM vocabulary WHERE id = ?')
    .get(id);

  if (!existing) {
    return res.status(404).json({ error: 'Word not found' });
  }

  const fields = ['word', 'phonetic', 'meaning', 'unit', 'grade', 'pos'];
  const updates = [];
  const params = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(id);
  db.prepare(
    `UPDATE vocabulary SET ${updates.join(', ')} WHERE id = ?`
  ).run(...params);

  const updated = db
    .prepare('SELECT * FROM vocabulary WHERE id = ?')
    .get(id);

  return res.json({ word: updated });
});

// ---------------------------------------------------------------------------
// DELETE /:id  — delete a word by id (auth required)
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);

  const result = db
    .prepare('DELETE FROM vocabulary WHERE id = ?')
    .run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Word not found' });
  }

  return res.json({ success: true });
});

module.exports = router;
