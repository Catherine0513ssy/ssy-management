const router = require('express').Router();
const { getDB } = require('../services/db');

function n(v, max = 100) {
  return Math.min(100, Math.max(0, Math.round((v / max) * 100)));
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calcStreak(dates) {
  if (!dates || dates.length === 0) return 0;
  const sorted = [...new Set(dates)].sort();
  let maxStreak = 1, curr = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const currD = new Date(sorted[i]);
    const diff = (currD - prev) / 86400000;
    if (diff <= 2) { curr++; maxStreak = Math.max(maxStreak, curr); }
    else { curr = 1; }
  }
  return maxStreak;
}

function classIdToName(classId) {
  const map = { 1: '2313', 2: '2314' };
  return map[classId] || String(classId);
}

function computeStudentRadar(db, classId, studentName, allSessions) {
  const cName = classIdToName(classId);

  const checkinRows = db.prepare(`
    SELECT cr.passed, cs.date, cs.type
    FROM checkin_records cr
    JOIN checkin_sessions cs ON cs.id = cr.session_id
    WHERE cs.class_id = ? AND cr.student_id IN (
      SELECT id FROM students WHERE class_id = ? AND name = ?
    )
  `).all(classId, classId, studentName);

  const wordChecks = checkinRows.filter(r => r.type === 'word');
  const essayChecks = checkinRows.filter(r => r.type === 'essay');

  const wordPassRate = wordChecks.length > 0
    ? wordChecks.filter(r => r.passed === 1).length / wordChecks.length : 0;
  const essayPassRate = essayChecks.length > 0
    ? essayChecks.filter(r => r.passed === 1).length / essayChecks.length : 0;

  const wordStreak = calcStreak(wordChecks.filter(r => r.passed === 1).map(r => r.date));
  const essayStreak = calcStreak(essayChecks.filter(r => r.passed === 1).map(r => r.date));
  const maxStreak = Math.max(wordStreak, essayStreak);

  const gameRows = db.prepare(`
    SELECT MAX(score) as best_score FROM wordgame_scores
    WHERE name = ? AND class_id = ?
  `).get(studentName, cName);
  const gameBest = gameRows ? (gameRows.best_score || 0) : 0;
  const gameScore = n(gameBest, 300);

  const vocabulary = Math.round(
    wordPassRate * 40 + essayPassRate * 20 + n(maxStreak, 20) * 0.2 + gameScore * 0.2
  );

  const essayRows = db.prepare(`
    SELECT es.total_score, et.max_score, es.status
    FROM essay_submissions es
    JOIN essay_tasks et ON et.id = es.task_id
    WHERE et.class_id = ? AND es.student_name = ?
  `).all(classId, studentName);

  const essayScores = essayRows.filter(r => r.total_score != null)
    .map(r => (r.total_score / (r.max_score || 15)) * 100);
  const essayAvg = essayScores.length > 0 ? avg(essayScores) : 0;

  const interactions = db.prepare(`
    SELECT COUNT(*) as cnt FROM essay_interactions ei
    JOIN essay_submissions es ON es.id = ei.submission_id
    JOIN essay_tasks et ON et.id = es.task_id
    WHERE et.class_id = ? AND es.student_name = ?
  `).get(classId, studentName);
  const interactionCount = interactions ? interactions.cnt : 0;

  const writing = Math.round(
    n(essayAvg, 100) * 0.5 + (essayRows.length > 0 ? 25 : 0) + n(interactionCount, 10) * 0.25
  );

  const discipline = Math.round(
    (wordChecks.length > 0 ? wordPassRate * 50 : 0) +
    (essayChecks.length > 0 ? essayPassRate * 30 : 0) +
    n(maxStreak, 20) * 0.2
  );

  const gameCount = db.prepare(`
    SELECT COUNT(DISTINCT date(updated_at)) as cnt FROM wordgame_scores
    WHERE name = ? AND class_id = ?
  `).get(studentName, cName);
  const activityCount = checkinRows.length + (gameCount ? gameCount.cnt : 0) + essayRows.length;

  const excellentCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM excellent_homework
    WHERE class_id = ? AND student_name = ?
  `).get(classId, studentName);
  const excCount = excellentCount ? excellentCount.cnt : 0;

  const studentCount = db.prepare(`SELECT COUNT(*) as cnt FROM students WHERE class_id = ? AND active = 1`).get(classId).cnt;
  const classExcTotal = db.prepare(`SELECT COUNT(*) as cnt FROM excellent_homework WHERE class_id = ?`).get(classId);
  const classExc = classExcTotal ? classExcTotal.cnt : 1;
  const excRate = classExc > 0 ? excCount / Math.max(1, classExc / Math.max(1, studentCount)) : 0;

  const engagement = Math.round(
    n(activityCount, 50) * 0.6 + n(excRate, 3) * 0.4
  );

  let progress = 50;
  if (wordChecks.length >= 4) {
    const mid = Math.floor(wordChecks.length / 2);
    const early = wordChecks.slice(0, mid);
    const late = wordChecks.slice(mid);
    const earlyRate = early.filter(r => r.passed === 1).length / early.length;
    const lateRate = late.filter(r => r.passed === 1).length / late.length;
    progress = Math.round(50 + (lateRate - earlyRate) * 100);
    progress = Math.min(100, Math.max(0, progress));
  }

  return {
    student_name: studentName,
    vocabulary, writing, discipline, engagement, progress,
    raw: {
      word_checks: wordChecks.length,
      word_passed: wordChecks.filter(r => r.passed === 1).length,
      essay_checks: essayChecks.length,
      essay_passed: essayChecks.filter(r => r.passed === 1).length,
      game_best: gameBest,
      essay_count: essayRows.length,
      interaction_count: interactionCount,
      excellent_count: excCount,
      streak: maxStreak,
    }
  };
}

router.get('/radar', (req, res) => {
  try {
    const { class_id, student_name } = req.query;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });
    const cid = Number(class_id);
    const db = getDB();
    const allSessions = db.prepare(`SELECT class_id, type, date FROM checkin_sessions`).all();
    if (student_name) {
      return res.json({ radar: computeStudentRadar(db, cid, student_name, allSessions) });
    }
    const students = db.prepare(`SELECT name FROM students WHERE class_id = ? AND active = 1 ORDER BY sort_order`).all(cid);
    const radars = students.map(s => computeStudentRadar(db, cid, s.name, allSessions));
    return res.json({ radars });
  } catch (e) {
    console.error('[analysis/radar]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/class-overview', (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });
    const cid = Number(class_id);
    const db = getDB();
    const allSessions = db.prepare(`SELECT class_id, type, date FROM checkin_sessions`).all();
    const students = db.prepare(`SELECT name FROM students WHERE class_id = ? AND active = 1 ORDER BY sort_order`).all(cid);
    const radars = students.map(s => computeStudentRadar(db, cid, s.name, allSessions));
    const avgRadar = {
      vocabulary: Math.round(avg(radars.map(r => r.vocabulary))),
      writing: Math.round(avg(radars.map(r => r.writing))),
      discipline: Math.round(avg(radars.map(r => r.discipline))),
      engagement: Math.round(avg(radars.map(r => r.engagement))),
      progress: Math.round(avg(radars.map(r => r.progress))),
    };
    const topStudents = [...radars]
      .map(r => ({ ...r, total: r.vocabulary + r.writing + r.discipline + r.engagement + r.progress }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const totalCheckins = db.prepare(`SELECT COUNT(*) as cnt FROM checkin_records cr JOIN checkin_sessions cs ON cs.id = cr.session_id WHERE cs.class_id = ?`).get(cid);
    const totalEssays = db.prepare(`SELECT COUNT(*) as cnt FROM essay_submissions es JOIN essay_tasks et ON et.id = es.task_id WHERE et.class_id = ?`).get(cid);
    const totalGames = db.prepare(`SELECT COUNT(*) as cnt FROM wordgame_scores WHERE class_id = ?`).get(classIdToName(cid));
    res.json({
      class_id: cid, student_count: students.length,
      avg_radar: avgRadar,
      top_students: topStudents.map(s => ({ name: s.student_name, total: s.total, vocabulary: s.vocabulary, writing: s.writing, discipline: s.discipline, engagement: s.engagement, progress: s.progress })),
      stats: { total_checkins: totalCheckins ? totalCheckins.cnt : 0, total_essays: totalEssays ? totalEssays.cnt : 0, total_games: totalGames ? totalGames.cnt : 0 }
    });
  } catch (e) {
    console.error('[analysis/class-overview]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/students', (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });
    const cid = Number(class_id);
    const db = getDB();
    const allSessions = db.prepare(`SELECT class_id, type, date FROM checkin_sessions`).all();
    const students = db.prepare(`SELECT name FROM students WHERE class_id = ? AND active = 1 ORDER BY sort_order`).all(cid);
    const radars = students.map(s => computeStudentRadar(db, cid, s.name, allSessions));
    const list = radars.map(r => ({ name: r.student_name, total: r.vocabulary + r.writing + r.discipline + r.engagement + r.progress, ...r }))
      .sort((a, b) => b.total - a.total);
    res.json({ students: list });
  } catch (e) {
    console.error('[analysis/students]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/weakness', (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });
    const cid = Number(class_id);
    const db = getDB();
    const allSessions = db.prepare(`SELECT class_id, type, date FROM checkin_sessions`).all();
    const students = db.prepare(`SELECT name FROM students WHERE class_id = ? AND active = 1 ORDER BY sort_order`).all(cid);
    const radars = students.map(s => computeStudentRadar(db, cid, s.name, allSessions));
    const dims = ['vocabulary', 'writing', 'discipline', 'engagement', 'progress'];
    const dimNames = { vocabulary: '词汇力', writing: '写作力', discipline: '纪律性', engagement: '参与度', progress: '进步度' };
    const avgs = {};
    dims.forEach(d => avgs[d] = avg(radars.map(r => r[d])));
    const weakStudents = {};
    dims.forEach(d => {
      weakStudents[d] = radars.filter(r => r[d] < avgs[d] * 0.8)
        .map(r => ({ name: r.student_name, score: r[d], avg: Math.round(avgs[d]) }))
        .sort((a, b) => a.score - b.score);
    });
    const dimRank = dims.map(d => ({ dim: d, name: dimNames[d], avg: avgs[d] })).sort((a, b) => a.avg - b.avg);
    res.json({
      class_id: cid,
      dimension_avg: dims.reduce((o, d) => { o[dimNames[d]] = Math.round(avgs[d]); return o; }, {}),
      weakest_dimension: dimRank[0],
      at_risk_students: weakStudents,
    });
  } catch (e) {
    console.error('[analysis/weakness]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/student/:name', (req, res) => {
  try {
    const { class_id } = req.query;
    const { name } = req.params;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });
    const cid = Number(class_id);
    const db = getDB();
    const allSessions = db.prepare(`SELECT class_id, type, date FROM checkin_sessions`).all();
    const radar = computeStudentRadar(db, cid, name, allSessions);
    const checks = db.prepare(`
      SELECT cs.date, cr.passed FROM checkin_records cr
      JOIN checkin_sessions cs ON cs.id = cr.session_id
      JOIN students s ON s.id = cr.student_id
      WHERE cs.class_id = ? AND s.name = ? AND cs.type = 'word'
      ORDER BY cs.date
    `).all(cid, name);
    const weeklyTrend = [];
    if (checks.length > 0) {
      const byWeek = {};
      checks.forEach(c => {
        const d = new Date(c.date);
        const key = `${d.getFullYear()}-W${Math.ceil((d.getDate() + d.getDay()) / 7)}`;
        if (!byWeek[key]) byWeek[key] = { total: 0, passed: 0 };
        byWeek[key].total++;
        if (c.passed === 1) byWeek[key].passed++;
      });
      Object.entries(byWeek).forEach(([week, data]) => {
        weeklyTrend.push({ week, rate: Math.round((data.passed / data.total) * 100) });
      });
    }
    res.json({ student_name: name, radar, weekly_trend: weeklyTrend });
  } catch (e) {
    console.error('[analysis/student]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
