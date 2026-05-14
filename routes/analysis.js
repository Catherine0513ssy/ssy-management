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

// ============================================================================
// AI Analysis Engine
// ============================================================================

const { callAI } = require('../services/ocr-ai');

const DIM_NAMES = { vocabulary: '词汇力', writing: '写作力', discipline: '纪律性', engagement: '参与度', progress: '进步度' };
const DIM_COLORS = { vocabulary: '#a78bfa', writing: '#fb923c', discipline: '#22c55e', engagement: '#60a5fa', progress: '#f472b6' };

function getDimLevel(score) {
  if (score >= 80) return { level: '优秀', color: '#22c55e' };
  if (score >= 60) return { level: '良好', color: '#60a5fa' };
  if (score >= 40) return { level: '一般', color: '#f59e0b' };
  return { level: '薄弱', color: '#ef4444' };
}

function buildClassDiagnosis(radars, avgRadar, weakness) {
  // 80% rule-based diagnosis
  const dims = ['vocabulary', 'writing', 'discipline', 'engagement', 'progress'];
  const dimAnalysis = dims.map(d => {
    const avg = avgRadar[d] || 0;
    const values = radars.map(r => r[d]).sort((a, b) => a - b);
    const lowCount = values.filter(v => v < 40).length;
    const midCount = values.filter(v => v >= 40 && v < 60).length;
    return {
      dim: d, name: DIM_NAMES[d],
      avg, level: getDimLevel(avg).level,
      low_count: lowCount, mid_count: midCount, total: radars.length,
      max: values[values.length - 1] || 0, min: values[0] || 0,
      spread: (values[values.length - 1] || 0) - (values[0] || 0),
    };
  });

  const weakest = dimAnalysis.sort((a, b) => a.avg - b.avg)[0];
  const strongest = dimAnalysis.sort((a, b) => b.avg - a.avg)[0];

  // Identify at-risk students (< 40 in any dim or total < 200)
  const atRisk = radars.filter(r => {
    const total = r.vocabulary + r.writing + r.discipline + r.engagement + r.progress;
    return total < 200 || dims.some(d => r[d] < 30);
  }).map(r => ({
    name: r.student_name,
    total: r.vocabulary + r.writing + r.discipline + r.engagement + r.progress,
    weak_dims: dims.filter(d => r[d] < 40).map(d => DIM_NAMES[d]),
  })).sort((a, b) => a.total - b.total);

  return {
    dimensions: dimAnalysis,
    weakest: { dim: weakest.dim, name: weakest.name, avg: weakest.avg },
    strongest: { dim: strongest.dim, name: strongest.name, avg: strongest.avg },
    at_risk_count: atRisk.length,
    at_risk_students: atRisk.slice(0, 5),
    class_level: avgRadar.vocabulary + avgRadar.writing + avgRadar.discipline + avgRadar.engagement + avgRadar.progress >= 300 ? '良好' : '需加强',
  };
}

async function generateAIDiagnosis(diagnosis, className) {
  // 20% AI-generated highlight
  const prompt = `你是一位初中英语教学专家。请基于以下班级学情数据，生成一段简洁有力的诊断摘要（100字以内）。

班级：${className}
五维平均分：词汇力${diagnosis.dimensions.find(d=>d.dim==='vocabulary').avg}、写作力${diagnosis.dimensions.find(d=>d.dim==='writing').avg}、纪律性${diagnosis.dimensions.find(d=>d.dim==='discipline').avg}、参与度${diagnosis.dimensions.find(d=>d.dim==='engagement').avg}、进步度${diagnosis.dimensions.find(d=>d.dim==='progress').avg}
最弱维度：${diagnosis.weakest.name}（${diagnosis.weakest.avg}分）
最强维度：${diagnosis.strongest.name}（${diagnosis.strongest.avg}分）
需关注学生：${diagnosis.at_risk_count}人

要求：
1. 用教师口吻，简洁有力
2. 指出亮点和隐患
3. 给出一句行动建议
4. 只输出纯文本，不要JSON、不要markdown`;

  try {
    const text = await callAI([{ role: 'user', content: prompt }], { timeout: 30000 });
    return text.trim();
  } catch (e) {
    console.error('[AI diagnose]', e);
    return `${className}整体${diagnosis.class_level}。${diagnosis.weakest.name}是最薄弱环节，建议加强训练。`;
  }
}

async function generateAISuggestions(diagnosis, targetDim, className) {
  const dimData = diagnosis.dimensions.find(d => d.dim === targetDim);
  const prompt = `你是一位初中英语教学专家。针对"${DIM_NAMES[targetDim]}"薄弱（班级均分${dimData?.avg || 0}分），给出3条具体可操作的教学改进建议。

要求：
1. 每条建议包含：标题（10字内）+ 具体行动（30字内）+ 预期效果（20字内）
2. 输出严格JSON格式：{"suggestions":[{"title":"...","action":"...","expected":"..."}]}
3. 仅返回JSON，不要附加解释`;

  try {
    const text = await callAI([{ role: 'user', content: prompt }], { timeout: 30000 });
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]).suggestions || [];
    }
  } catch (e) {
    console.error('[AI suggest]', e);
  }

  // Fallback suggestions
  const fallbacks = {
    vocabulary: [
      { title: '分层听写', action: '按能力分组，不同学生布置不同难度词汇', expected: '两周内听写通过率提升20%' },
      { title: '游戏化记词', action: '每周安排单词消消乐PK赛', expected: '激发兴趣，主动复习' },
      { title: '词汇墙展示', action: '将高频错词做成班级词汇墙', expected: '利用碎片时间反复记忆' },
    ],
    writing: [
      { title: '范文仿写', action: '提供满分范文，逐句拆解后仿写', expected: '掌握基本句式结构' },
      { title: 'AI精批', action: '学生拍照上传作文，AI自动批改', expected: '及时反馈，精准定位错误' },
      { title: '每周一练', action: '固定每周一篇作文，形成写作习惯', expected: '量变引起质变' },
    ],
    discipline: [
      { title: '小组竞赛', action: '以小组为单位进行签到PK', expected: '同伴压力转化为动力' },
      { title: '连续奖励', action: '连续全勤3次给予积分奖励', expected: '培养坚持习惯' },
      { title: '家长通报', action: '每周向家长推送签到报告', expected: '家校协同督学' },
    ],
    engagement: [
      { title: '优秀展示', action: '每周评选优秀作业并在课堂展示', expected: '树立榜样，激发参与' },
      { title: '积分兑换', action: '参与活动积累积分兑换小奖品', expected: '正向激励持续参与' },
      { title: '角色轮换', action: '让不同学生担任小组活动主持人', expected: '人人都有表现机会' },
    ],
    progress: [
      { title: '错题重测', action: '针对错题定期安排二次测试', expected: '巩固薄弱点' },
      { title: '个人档案', action: '为每个学生建立学情跟踪档案', expected: '可视化进步轨迹' },
      { title: '目标设定', action: '与学生共同制定短期可达目标', expected: '增强成就感和方向感' },
    ],
  };
  return fallbacks[targetDim] || fallbacks.vocabulary;
}

// ============================================================================
// POST /api/analysis/ai-diagnose
// Body: { class_id, student_names? }
// ============================================================================
router.post('/ai-diagnose', async (req, res) => {
  try {
    const { class_id, student_names } = req.body;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });
    const cid = Number(class_id);
    const db = getDB();
    const allSessions = db.prepare(`SELECT class_id, type, date FROM checkin_sessions`).all();

    let targetRadars;
    if (student_names && Array.isArray(student_names) && student_names.length > 0) {
      targetRadars = student_names.map(n => computeStudentRadar(db, cid, n, allSessions));
    } else {
      const students = db.prepare(`SELECT name FROM students WHERE class_id = ? AND active = 1 ORDER BY sort_order`).all(cid);
      targetRadars = students.map(s => computeStudentRadar(db, cid, s.name, allSessions));
    }

    const avgRadar = {
      vocabulary: Math.round(avg(targetRadars.map(r => r.vocabulary))),
      writing: Math.round(avg(targetRadars.map(r => r.writing))),
      discipline: Math.round(avg(targetRadars.map(r => r.discipline))),
      engagement: Math.round(avg(targetRadars.map(r => r.engagement))),
      progress: Math.round(avg(targetRadars.map(r => r.progress))),
    };

    const diagnosis = buildClassDiagnosis(targetRadars, avgRadar);
    const aiSummary = await generateAIDiagnosis(diagnosis, classIdToName(cid) + '班');

    res.json({
      class_id: cid,
      diagnosis: { ...diagnosis, ai_summary: aiSummary },
      avg_radar: avgRadar,
    });
  } catch (e) {
    console.error('[analysis/ai-diagnose]', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// POST /api/analysis/ai-suggest
// Body: { class_id, dimension }
// dimension: vocabulary|writing|discipline|engagement|progress
// ============================================================================
router.post('/ai-suggest', async (req, res) => {
  try {
    const { class_id, dimension } = req.body;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });
    if (!dimension || !DIM_NAMES[dimension]) return res.status(400).json({ error: 'invalid dimension' });
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

    const diagnosis = buildClassDiagnosis(radars, avgRadar);
    const suggestions = await generateAISuggestions(diagnosis, dimension, classIdToName(cid) + '班');

    res.json({
      class_id: cid,
      dimension,
      dimension_name: DIM_NAMES[dimension],
      avg_score: avgRadar[dimension],
      suggestions,
    });
  } catch (e) {
    console.error('[analysis/ai-suggest]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
