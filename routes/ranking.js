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
// GET /  �� ranking for a class, sorted by total points descending
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

  // Calculate points from checkin records:
  // Join checkin_records with checkin_sessions to get round info,
  // then sum points per (student_index, group_index).
  const pointRows = db
    .prepare(
      `SELECT r.student_index, r.group_index,
              SUM(CASE WHEN cs.round = 1 THEN 2
                       WHEN cs.round = 2 THEN 1
                       ELSE 0 END) AS points
       FROM checkin_records r
       JOIN checkin_sessions cs ON r.session_id = cs.id
       WHERE cs.class_id = ? AND r.passed = 1
       GROUP BY r.student_index, r.group_index`
    )
    .all(classId);

  // Build a lookup: (student_index, group_index) -> points
  const pointMap = new Map();
  for (const row of pointRows) {
    const key = row.student_index + ':' + row.group_index;
    pointMap.set(key, (pointMap.get(key) || 0) + row.points);
  }

  // Merge students with their points
  const rankings = students.map((s) => {
    // group_sort_order is the group_index used in checkin_records
    const groupIndex = s.group_sort_order || 1;
    const key = s.sort_order + ':' + groupIndex;
    return {
      name: s.name,
      group: s.group_name || '',
      groupIndex: groupIndex,
      points: pointMap.get(key) || 0,
    };
  });

  // 返回原始数据，由前端按组分别排序和赋 rank
  return res.json({ rankings });
});

// ---------------------------------------------------------------------------
// GET /detail  �� per-date breakdown of scores for a student (or all)
// ---------------------------------------------------------------------------
router.get('/detail', (req, res) => {
  const { class_id, student_index } = req.query;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const classId = Number(class_id);

  let query = `
    SELECT cs.date, cs.type, cs.round,
           r.student_index, r.group_index, r.passed
    FROM checkin_records r
    JOIN checkin_sessions cs ON r.session_id = cs.id
    WHERE cs.class_id = ? AND r.passed = 1
  `;
  const params = [classId];

  if (student_index !== undefined) {
    query += ' AND r.student_index = ?';
    params.push(Number(student_index));
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
