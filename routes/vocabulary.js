const router = require('express').Router();
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');

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

  return res.json({ total, byGrade });
});

// ---------------------------------------------------------------------------
// GET /  — list vocabulary, optionally filtered by grade or search text
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { grade, search } = req.query;
  const db = getDB();

  const conditions = [];
  const params = [];

  if (grade) {
    conditions.push('grade = ?');
    params.push(grade);
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
// POST /batch  — insert multiple words, skip duplicates (auth required)
// ---------------------------------------------------------------------------
router.post('/batch', requireAuth, (req, res) => {
  const { words } = req.body;

  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words array is required and must not be empty' });
  }

  const db = getDB();

  const insertStmt = db.prepare(
    `INSERT INTO vocabulary (word, phonetic, meaning, unit, grade, pos, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  const checkStmt = db.prepare(
    'SELECT id FROM vocabulary WHERE word = ?'
  );

  let inserted = 0;
  let skipped = 0;

  const batchInsert = db.transaction((items) => {
    for (const item of items) {
      if (!item.word || !item.meaning) {
        skipped++;
        continue;
      }

      const existing = checkStmt.get(item.word);
      if (existing) {
        skipped++;
        continue;
      }

      insertStmt.run(
        item.word,
        item.phonetic || null,
        item.meaning,
        item.unit || null,
        item.grade || null,
        item.pos || null
      );
      inserted++;
    }
  });

  batchInsert(words);

  return res.json({ inserted, skipped });
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
// DELETE /batch  — delete multiple words by ids (auth required)
// ---------------------------------------------------------------------------
router.delete('/batch', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }
  const db = getDB();
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(`DELETE FROM vocabulary WHERE id IN (${placeholders})`).run(...ids);
  return res.json({ deleted: result.changes });
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
