const router = require('express').Router();
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the sorted group list for a class.
 * Returns [{ id, sort_order }] ordered by sort_order ASC.
 */
function getGroups(db, classId) {
  return db
    .prepare(
      `SELECT id, sort_order FROM student_groups
       WHERE class_id = ?
       ORDER BY sort_order ASC`
    )
    .all(classId);
}

/**
 * For a given class, return a map: groupSortOrder -> [student rows sorted by sort_order].
 * Each student row includes { id, name, sort_order }.
 */
function getStudentsByGroup(db, classId) {
  const groups = getGroups(db, classId);
  const result = {};

  for (const g of groups) {
    const students = db
      .prepare(
        `SELECT id, name, sort_order FROM students
         WHERE group_id = ? AND active = 1
         ORDER BY sort_order ASC`
      )
      .all(g.id);
    result[g.sort_order] = students;
  }

  return result;
}

/**
 * Get or create a checkin session. Returns the session row.
 */
function getOrCreateSession(db, classId, type, round, date) {
  db.prepare(
    `INSERT OR IGNORE INTO checkin_sessions (class_id, type, round, date, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(classId, type, round, date);

  return db
    .prepare(
      `SELECT * FROM checkin_sessions
       WHERE class_id = ? AND type = ? AND round = ? AND date = ?`
    )
    .get(classId, type, round, date);
}

/**
 * Build the passed map from checkin_records for a given session.
 * Returns { "1": [studentIdx, ...], "2": [studentIdx, ...] }
 * Only records with passed = 1 are included.
 */
function buildPassedMap(db, sessionId, classId) {
  const rows = db
    .prepare(
      `SELECT student_id, student_index, group_index FROM checkin_records
       WHERE session_id = ? AND passed = 1
       ORDER BY group_index ASC, student_index ASC`
    )
    .all(sessionId);

  const studentsByGroup = classId ? getStudentsByGroup(db, classId) : {};
  const passed = {};

  for (const r of rows) {
    const key = String(r.group_index);
    if (!passed[key]) passed[key] = [];

    const students = studentsByGroup[key] || [];
    if (r.student_id) {
      const idx = students.findIndex((s) => s.id === r.student_id);
      if (idx >= 0) {
        passed[key].push(idx);
      } else {
        passed[key].push(r.student_index);
      }
    } else {
      passed[key].push(r.student_index);
    }
  }

  // ensure stable order
  for (const key of Object.keys(passed)) {
    passed[key].sort((a, b) => a - b);
  }

  return passed;
}

/**
 * Validate required query parameters. Returns parsed values or sends 400.
 */
function parseCheckinQuery(req, res) {
  const { class_id, type, round } = req.query;

  if (!class_id) {
    res.status(400).json({ error: 'class_id is required' });
    return null;
  }
  if (!type || !['word', 'essay'].includes(type)) {
    res.status(400).json({ error: 'type must be "word" or "essay"' });
    return null;
  }

  const roundNum = round ? Number(round) : 1;
  if (![1, 2].includes(roundNum)) {
    res.status(400).json({ error: 'round must be 1 or 2' });
    return null;
  }

  return { classId: Number(class_id), type, round: roundNum };
}

// ---------------------------------------------------------------------------
// GET /dates  — list dates that have sessions
// ---------------------------------------------------------------------------
router.get('/dates', (req, res) => {
  const params = parseCheckinQuery(req, res);
  if (!params) return;

  const { classId, type, round } = params;
  const db = getDB();

  const rows = db
    .prepare(
      `SELECT date FROM checkin_sessions
       WHERE class_id = ? AND type = ? AND round = ?
       ORDER BY date DESC`
    )
    .all(classId, type, round);

  return res.json({ dates: rows.map((r) => r.date) });
});

// ---------------------------------------------------------------------------
// GET /missing  — compute who hasn't checked in
// ---------------------------------------------------------------------------
router.get('/missing', (req, res) => {
  const params = parseCheckinQuery(req, res);
  if (!params) return;

  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  const { classId, type, round } = params;
  const db = getDB();

  // Get all students grouped by group sort_order
  const studentsByGroup = getStudentsByGroup(db, classId);

  // Find the session
  const session = db
    .prepare(
      `SELECT id FROM checkin_sessions
       WHERE class_id = ? AND type = ? AND round = ? AND date = ?`
    )
    .get(classId, type, round, date);

  const missing = {};

  for (const [groupSortOrder, students] of Object.entries(studentsByGroup)) {
    // Collect indices of students who passed
    const passedIndices = new Set();
    if (session) {
      const rows = db
        .prepare(
          `SELECT student_id, student_index FROM checkin_records
           WHERE session_id = ? AND group_index = ? AND passed = 1`
        )
        .all(session.id, Number(groupSortOrder));
      for (const r of rows) {
        if (r.student_id) {
          const idx = students.findIndex((s) => s.id === r.student_id);
          if (idx >= 0) passedIndices.add(idx);
          else passedIndices.add(r.student_index);
        } else {
          passedIndices.add(r.student_index);
        }
      }
    }

    // Students NOT in the passed set are missing
    const missingNames = [];
    for (let i = 0; i < students.length; i++) {
      if (!passedIndices.has(i)) {
        missingNames.push(students[i].name);
      }
    }

    if (missingNames.length > 0) {
      missing[groupSortOrder] = missingNames;
    }
  }

  return res.json({ missing });
});

// ---------------------------------------------------------------------------
// GET /:date  — check-in data for a specific date
// ---------------------------------------------------------------------------
router.get('/:date', (req, res) => {
  const params = parseCheckinQuery(req, res);
  if (!params) return;

  const { classId, type, round } = params;
  const date = req.params.date;
  const db = getDB();

  const session = db
    .prepare(
      `SELECT * FROM checkin_sessions
       WHERE class_id = ? AND type = ? AND round = ? AND date = ?`
    )
    .get(classId, type, round, date);

  if (!session) {
    return res.json({ passed: {}, updatedAt: null });
  }

  const passed = buildPassedMap(db, session.id, classId);
  return res.json({ passed, updatedAt: session.updated_at });
});

// ---------------------------------------------------------------------------
// POST /:date  — upsert check-in data (auth required)
// ---------------------------------------------------------------------------
router.post('/:date', requireAuth, (req, res) => {
  const { class_id, type, round, passed } = req.body;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }
  if (!type || !['word', 'essay'].includes(type)) {
    return res.status(400).json({ error: 'type must be "word" or "essay"' });
  }

  const roundNum = round ? Number(round) : 1;
  if (![1, 2].includes(roundNum)) {
    return res.status(400).json({ error: 'round must be 1 or 2' });
  }

  if (!passed || typeof passed !== 'object') {
    return res.status(400).json({ error: 'passed is required and must be an object' });
  }

  const classId = Number(class_id);
  const date = req.params.date;
  const db = getDB();
  const studentsByGroup = getStudentsByGroup(db, classId);

  // Use a transaction for atomicity
  const upsert = db.transaction(() => {
    // Create session if it doesn't exist
    const session = getOrCreateSession(db, classId, type, roundNum, date);

    // Delete old records for this session
    db.prepare('DELETE FROM checkin_records WHERE session_id = ?').run(session.id);

    // Insert new records
    const insertStmt = db.prepare(
      `INSERT INTO checkin_records (session_id, student_index, group_index, student_id, passed, created_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))`
    );

    for (const [groupIndex, indices] of Object.entries(passed)) {
      const gIdx = Number(groupIndex);
      if (!Array.isArray(indices)) continue;
      const groupStudents = studentsByGroup[gIdx] || [];
      for (const studentIndex of indices) {
        const sIdx = Number(studentIndex);
        const student = groupStudents[sIdx];
        const studentId = student ? student.id : null;
        insertStmt.run(session.id, sIdx, gIdx, studentId);
      }
    }

    // Update session timestamp
    db.prepare(
      `UPDATE checkin_sessions SET updated_at = datetime('now') WHERE id = ?`
    ).run(session.id);

    // Re-fetch session to get updated timestamp
    const updated = db
      .prepare('SELECT * FROM checkin_sessions WHERE id = ?')
      .get(session.id);

    return {
      passed: buildPassedMap(db, session.id, classId),
      updatedAt: updated.updated_at,
    };
  });

  const result = upsert();
  return res.json(result);
});

module.exports = router;
