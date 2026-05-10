const router = require('express').Router();
const { getDB } = require('../services/db');

// ---------------------------------------------------------------------------
// Scoring rules:
//   Round 1 pass = 2 points
//   Round 2 pass = 1 point
// Points are calculated per student, per date, from checkin records.
// ---------------------------------------------------------------------------
const ROUND_POINTS = { 1: 2, 2: 1 };

// ---------------------------------------------------------------------------
// Build current class roster map: group_sort_order -> [student rows]
// ---------------------------------------------------------------------------
function getStudentsByGroup(db, classId) {
  const groups = db
    .prepare(
      `SELECT id, sort_order FROM student_groups
       WHERE class_id = ? ORDER BY sort_order ASC`
    )
    .all(classId);

  const result = {};
  for (const g of groups) {
    const students = db
      .prepare(
        `SELECT id, name, sort_order FROM students
         WHERE group_id = ? AND active = 1 ORDER BY sort_order ASC`
      )
      .all(g.id);
    result[g.sort_order] = students;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Resolve legacy (student_index, group_index) to current student_id
// ---------------------------------------------------------------------------
function resolveLegacyStudentId(db, classId, groupIndex, studentIndex) {
  const group = db
    .prepare(
      `SELECT id FROM student_groups WHERE class_id = ? AND sort_order = ?`
    )
    .get(classId, groupIndex);
  if (!group) return null;

  const student = db
    .prepare(
      `SELECT id FROM students WHERE group_id = ? AND active = 1 ORDER BY sort_order ASC LIMIT 1 OFFSET ?`
    )
    .get(group.id, studentIndex);
  return student ? student.id : null;
}

// ---------------------------------------------------------------------------
// GET /  — ranking for a class, sorted by total points descending
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { class_id } = req.query;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const classId = Number(class_id);

  const students = db
    .prepare(
      `SELECT s.id, s.name, s.sort_order, s.group_id,
              g.name AS group_name, g.sort_order AS group_sort_order
       FROM students s
       LEFT JOIN student_groups g ON s.group_id = g.id
       WHERE s.class_id = ? AND s.active = 1
       ORDER BY s.sort_order ASC`
    )
    .all(classId);

  const pointMap = new Map();

  // 1) modern records with student_id
  const modernRows = db
    .prepare(
      `SELECT r.student_id,
              SUM(CASE WHEN cs.round = 1 THEN 2
                       WHEN cs.round = 2 THEN 1
                       ELSE 0 END) AS points
       FROM checkin_records r
       JOIN checkin_sessions cs ON r.session_id = cs.id
       WHERE cs.class_id = ? AND r.passed = 1 AND r.student_id IS NOT NULL
       GROUP BY r.student_id`
    )
    .all(classId);
  for (const row of modernRows) {
    pointMap.set(row.student_id, (pointMap.get(row.student_id) || 0) + row.points);
  }

  // 2) legacy records without student_id – resolve dynamically
  const legacyRows = db
    .prepare(
      `SELECT r.student_index, r.group_index,
              CASE WHEN cs.round = 1 THEN 2
                   WHEN cs.round = 2 THEN 1
                   ELSE 0 END AS points
       FROM checkin_records r
       JOIN checkin_sessions cs ON r.session_id = cs.id
       WHERE cs.class_id = ? AND r.passed = 1 AND r.student_id IS NULL`
    )
    .all(classId);
  for (const row of legacyRows) {
    const sid = resolveLegacyStudentId(db, classId, row.group_index, row.student_index);
    if (sid) {
      pointMap.set(sid, (pointMap.get(sid) || 0) + row.points);
    }
  }

  const rankings = students.map((s) => ({
    name: s.name,
    group: s.group_name || '',
    groupIndex: s.group_sort_order || 1,
    points: pointMap.get(s.id) || 0,
  }));

  return res.json({ rankings });
});

// ---------------------------------------------------------------------------
// GET /detail  — per-date breakdown of scores for a student (or all)
// ---------------------------------------------------------------------------
router.get('/detail', (req, res) => {
  const { class_id, student_index } = req.query;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const classId = Number(class_id);

  let targetStudentId = null;
  if (student_index !== undefined) {
    const students = db
      .prepare(
        `SELECT s.id FROM students s
         LEFT JOIN student_groups g ON s.group_id = g.id
         WHERE s.class_id = ? AND s.active = 1
         ORDER BY g.sort_order, s.sort_order, s.id`
      )
      .all(classId);
    const idx = Number(student_index);
    if (students[idx]) {
      targetStudentId = students[idx].id;
    }
  }

  const details = [];

  // Modern records
  if (targetStudentId) {
    const modernRows = db
      .prepare(
        `SELECT cs.date, cs.type, cs.round,
                r.student_index, r.group_index, r.passed
         FROM checkin_records r
         JOIN checkin_sessions cs ON r.session_id = cs.id
         WHERE cs.class_id = ? AND r.passed = 1 AND r.student_id = ?
         ORDER BY cs.date DESC, cs.type ASC, cs.round ASC`
      )
      .all(classId, targetStudentId);
    for (const r of modernRows) {
      details.push({
        date: r.date, type: r.type, round: r.round,
        student_index: r.student_index, group_index: r.group_index,
        points: ROUND_POINTS[r.round] || 0,
      });
    }
  }

  // Legacy records without student_id (resolve dynamically and filter)
  const legacyRows = db
    .prepare(
      `SELECT cs.date, cs.type, cs.round,
              r.student_index, r.group_index, r.passed
       FROM checkin_records r
       JOIN checkin_sessions cs ON r.session_id = cs.id
       WHERE cs.class_id = ? AND r.passed = 1 AND r.student_id IS NULL
       ORDER BY cs.date DESC, cs.type ASC, cs.round ASC`
    )
    .all(classId);
  for (const r of legacyRows) {
    const sid = resolveLegacyStudentId(db, classId, r.group_index, r.student_index);
    if (sid && targetStudentId && sid !== targetStudentId) continue;
    details.push({
      date: r.date, type: r.type, round: r.round,
      student_index: r.student_index, group_index: r.group_index,
      points: ROUND_POINTS[r.round] || 0,
    });
  }

  return res.json({ details });
});

module.exports = router;
