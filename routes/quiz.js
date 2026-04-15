const router = require('express').Router();
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');

function buildQuizMeta(allWords) {
  const wordsByGrade = {};
  const grades = [];
  const unitsByGrade = {};
  const countsByGradeUnit = {};

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
    const unitKey = `${g}:${u}`;
    countsByGradeUnit[unitKey] = (countsByGradeUnit[unitKey] || 0) + 1;
  }

  return {
    total: allWords.length,
    grades,
    unitsByGrade,
    countsByGradeUnit,
    wordsByGrade,
  };
}

// ---------------------------------------------------------------------------
// POST /generate  — select random words and store as quiz (auth required)
// ---------------------------------------------------------------------------
router.post('/generate', (req, res) => {
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
// GET /meta  — lightweight metadata for grade/unit selection
// ---------------------------------------------------------------------------
router.get('/meta', (req, res) => {
  const db = getDB();

  const allWords = db
    .prepare(
      `SELECT grade, unit
       FROM vocabulary
       ORDER BY grade ASC, unit ASC, id ASC`
    )
    .all();

  const meta = buildQuizMeta(allWords);
  return res.json({
    total: meta.total,
    grades: meta.grades,
    unitsByGrade: meta.unitsByGrade,
    countsByGradeUnit: meta.countsByGradeUnit,
  });
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

  const meta = buildQuizMeta(allWords);

  return res.json({
    version: new Date().toISOString(),
    total: meta.total,
    grades: meta.grades,
    unitsByGrade: meta.unitsByGrade,
    countsByGradeUnit: meta.countsByGradeUnit,
    words: meta.wordsByGrade,
    flatWords: allWords,
  });
});

// ---------------------------------------------------------------------------
// POST /log-complete - record that a quiz was actually completed on a date
// ---------------------------------------------------------------------------
router.post('/log-complete', (req, res) => {
  const { class_id, date, source, word_ids } = req.body;
  if (!date || !source || !Array.isArray(word_ids)) {
    return res.status(400).json({ error: 'date, source, word_ids required' });
  }
  const classId = Number(class_id || 1);
  const db = getDB();
  db.prepare(`
    INSERT INTO quiz_history_log (class_id, log_date, source, word_ids)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(class_id, log_date, source) DO UPDATE SET
      word_ids = excluded.word_ids,
      created_at = datetime('now')
  `).run(classId, date, source, JSON.stringify(word_ids));
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /history — return quiz words for a specific date (only if completed)
// ---------------------------------------------------------------------------
router.get('/history', (req, res) => {
  const { date, class_id } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }
  const classId = Number(class_id || 1);
  const db = getDB();

  // Only return words for dates that were actually completed
  const logs = db.prepare('SELECT * FROM quiz_history_log WHERE class_id = ? AND log_date = ?').all(classId, date);
  const dailyLog = logs.find(l => l.source === 'daily');
  const generatedLog = logs.find(l => l.source === 'generated');

  let dailyWords = [];
  if (dailyLog && dailyLog.word_ids) {
    const dailyIds = JSON.parse(dailyLog.word_ids);
    if (dailyIds.length > 0) {
      const placeholders = dailyIds.map(() => '?').join(', ');
      dailyWords = db.prepare(`SELECT * FROM vocabulary WHERE id IN (${placeholders})`).all(...dailyIds);
    }
  }

  let generatedWords = [];
  if (generatedLog && generatedLog.word_ids) {
    const genIds = JSON.parse(generatedLog.word_ids);
    if (genIds.length > 0) {
      const placeholders = genIds.map(() => '?').join(', ');
      generatedWords = db.prepare(`SELECT * FROM vocabulary WHERE id IN (${placeholders})`).all(...genIds);
    }
  }

  return res.json({
    date,
    daily: { words: dailyWords, count: dailyWords.length },
    generated: { words: generatedWords, count: generatedWords.length },
  });
});

module.exports = router;

