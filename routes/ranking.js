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
// GET /  — ranking for a class, sorted by total points descending
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { class_id } = req.query;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const classId = Number(class_id);

  // Fetch all students for this class (with their group info)
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

  // Calculate points from checkin records using student_id when available.
  // For legacy records without student_id, fall back to (student_index, group_index).
  const pointRows = db
    .prepare(
      `SELECT
         COALESCE(r.student_id, (
           SELECT s2.id FROM students s2
           JOIN student_groups g2 ON s2.group_id = g2.id
           WHERE s2.class_id = cs.class_id AND s2.active = 1
             AND s2.sort_order = r.student_index
             AND g2.sort_order = r.group_index
           LIMIT 1
         )) AS student_id,
         SUM(CASE WHEN cs.round = 1 THEN 2
                  WHEN cs.round = 2 THEN 1
                  ELSE 0 END) AS points
       FROM checkin_records r
       JOIN checkin_sessions cs ON r.session_id = cs.id
       WHERE cs.class_id = ? AND r.passed = 1
       GROUP BY student_id`
    )
    .all(classId);

  // Build a lookup: student_id -> points
  const pointMap = new Map();
  for (const row of pointRows) {
    if (row.student_id) {
      pointMap.set(row.student_id, row.points);
    }
  }

  // Merge students with their points
  const rankings = students.map((s) => ({
    name: s.name,
    group: s.group_name || '',
    groupIndex: s.group_sort_order || 1,
    points: pointMap.get(s.id) || 0,
  }));

  // 返回原始数据，由前端按组分别排序和赋 rank
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

  // Resolve student_index to a stable student_id if possible
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

  let query = `
    SELECT cs.date, cs.type, cs.round,
           r.student_index, r.group_index, r.passed, r.student_id
    FROM checkin_records r
    JOIN checkin_sessions cs ON r.session_id = cs.id
    WHERE cs.class_id = ? AND r.passed = 1
  `;
  const params = [classId];

  if (student_index !== undefined) {
    if (targetStudentId) {
      query += ' AND (r.student_id = ? OR (r.student_id IS NULL AND r.student_index = ?))';
      params.push(targetStudentId, Number(student_index));
    } else {
      query += ' AND r.student_index = ?';
      params.push(Number(student_index));
    }
  }

  query += ' ORDER BY cs.date DESC, cs.type ASC, cs.round ASC';

  const rows = db.prepare(query).all(...params);

  const details = rows.map((r) => ({
    date: r.date,
    type: r.type,
    round: r.round,
    student_index: r.student_index,
    group_index: r.group_index,
    points: ROUND_POINTS[r.round] || 0,
  }));

  return res.json({ details });
});

module.exports = router;
