const router = require('express').Router();
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// POST /generate  — select random words and store as quiz (auth required)
// ---------------------------------------------------------------------------
router.post('/generate', requireAuth, (req, res) => {
  const { class_id, grade, units, count } = req.body;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const classId = Number(class_id);
  const limit = Number(count) || 20;

  // Build query to select random words, optionally filtered by grade
  const conditions = [];
  const params = [];

  if (grade) {
    conditions.push('grade = ?');
    params.push(grade);
  }

  if (Array.isArray(units) && units.length > 0) {
    const cleanUnits = units.map((unit) => String(unit).trim()).filter(Boolean);
    if (cleanUnits.length > 0) {
      conditions.push(`unit IN (${cleanUnits.map(() => '?').join(', ')})`);
      params.push(...cleanUnits);
    }
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const words = db
    .prepare(
      `SELECT * FROM vocabulary ${where}
       ORDER BY RANDOM() LIMIT ?`
    )
    .all(...params, limit);

  if (words.length === 0) {
    return res.status(404).json({ error: 'No vocabulary words found for the given criteria' });
  }

  // Store selected word IDs in quiz_words table
  const wordIds = words.map((w) => w.id);
  const wordsJson = JSON.stringify(wordIds);

  db.prepare(
    `INSERT INTO quiz_words (class_id, words_json, created_at)
     VALUES (?, ?, datetime('now'))`
  ).run(classId, wordsJson);

  return res.json({ words });
});

// ---------------------------------------------------------------------------
// GET /words  — return current quiz words for a class
// ---------------------------------------------------------------------------
router.get('/words', (req, res) => {
  const { class_id } = req.query;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const classId = Number(class_id);

  // Get the most recent quiz_words entry for this class
  const quizRow = db
    .prepare(
      `SELECT * FROM quiz_words
       WHERE class_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(classId);

  if (!quizRow) {
    return res.json({ words: [] });
  }

  const wordIds = JSON.parse(quizRow.words_json);
  if (wordIds.length === 0) {
    return res.json({ words: [] });
  }

  // Fetch full word data for the stored IDs
  const placeholders = wordIds.map(() => '?').join(', ');
  const words = db
    .prepare(
      `SELECT * FROM vocabulary WHERE id IN (${placeholders})`
    )
    .all(...wordIds);

  return res.json({ words });
});

// ---------------------------------------------------------------------------
// GET /all  — return full vocabulary organized by grade (for quiz-display.html)
// ---------------------------------------------------------------------------
router.get('/all', (req, res) => {
  const db = getDB();

  const allWords = db
    .prepare(
      `SELECT * FROM vocabulary
       ORDER BY grade ASC, unit ASC, id ASC`
    )
    .all();

  // Organize words by grade and unit
  const wordsByGrade = {};
  const grades = [];
  const unitsByGrade = {};

  for (const word of allWords) {
    const g = word.grade || 'unknown';
    const u = word.unit || 'unknown';
    if (!wordsByGrade[g]) {
      wordsByGrade[g] = {};
      grades.push(g);
    }
    if (!wordsByGrade[g][u]) {
      wordsByGrade[g][u] = [];
    }
    wordsByGrade[g][u].push(word);
    if (!unitsByGrade[g]) {
      unitsByGrade[g] = [];
    }
    if (!unitsByGrade[g].includes(u)) {
      unitsByGrade[g].push(u);
    }
  }

  return res.json({
    version: new Date().toISOString(),
    total: allWords.length,
    grades,
    unitsByGrade,
    words: wordsByGrade,
    flatWords: allWords,
  });
});

module.exports = router;
