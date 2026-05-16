const { getDB } = require('./db');

// ============================================================================
// 100-point scoring system (五维总分100分制)
// ============================================================================

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

function getWeekStart(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

// ============================================================================
// Tier System
// ============================================================================

const TIERS = [
  { min: 90, name: '钻石', color: '#E040FB', bg: 'linear-gradient(135deg, #E040FB, #00E5FF)', badge: 'diamond' },
  { min: 80, name: '铂金', color: '#00E5FF', bg: 'linear-gradient(135deg, #00E5FF, #0080FF)', badge: 'platinum' },
  { min: 70, name: '黄金', color: '#FFD700', bg: 'linear-gradient(135deg, #FFD700, #FF6B35)', badge: 'gold' },
  { min: 60, name: '白银', color: '#7FB3D5', bg: 'linear-gradient(135deg, #E8F4F8, #7FB3D5)', badge: 'silver' },
  { min: 0,  name: '青铜', color: '#CD7F32', bg: 'linear-gradient(135deg, #CD7F32, #B87333)', badge: 'bronze' },
];

function getTier(score) {
  for (const t of TIERS) {
    if (score >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
}

// ============================================================================
// Core Scoring: computeStudentScore100
// 五维总和 = 100分
// 词汇力25 + 写作力25 + 纪律性20 + 参与度20 + 进步度10
// ============================================================================

function computeStudentScore100(db, classId, studentName, allSessions) {
  ensureStudentScoresTable(db);
  const cName = classIdToName(classId);

  // --- Raw data queries ---
  const checkinRows = db.prepare(`
    SELECT cr.passed, cs.date, cs.type
    FROM checkin_records cr
    JOIN checkin_sessions cs ON cs.id = cr.session_id
    JOIN students s ON s.id = cr.student_id
    WHERE cs.class_id = ? AND s.name = ?
  `).all(classId, studentName);

  const wordChecks = checkinRows.filter(r => r.type === 'word');
  const essayChecks = checkinRows.filter(r => r.type === 'essay');

  // Class total word checkin days
  const classWordDays = new Set(
    (allSessions || []).filter(s => s.class_id === classId && s.type === 'word').map(s => s.date)
  ).size;
  const studentWordDays = new Set(wordChecks.map(r => r.date)).size;
  const checkinFrequency = classWordDays > 0 ? studentWordDays / classWordDays : 0;

  // Word game best score
  const gameRows = db.prepare(`
    SELECT MAX(score) as best_score FROM wordgame_scores
    WHERE name = ? AND class_id = ?
  `).get(studentName, cName);
  const gameBest = gameRows ? (gameRows.best_score || 0) : 0;
  const gameNormalized = Math.min(gameBest / 300, 1);

  // Essay data
  const essayRows = db.prepare(`
    SELECT es.total_score, et.max_score, es.status
    FROM essay_submissions es
    JOIN essay_tasks et ON et.id = es.task_id
    WHERE et.class_id = ? AND es.student_name = ?
  `).all(classId, studentName);
  const essayScores = essayRows.filter(r => r.total_score != null)
    .map(r => (r.total_score / (r.max_score || 15)) * 100);
  const essayAvg = essayScores.length > 0 ? avg(essayScores) : 0;

  // AI interactions
  const interactions = db.prepare(`
    SELECT COUNT(*) as cnt FROM essay_interactions ei
    JOIN essay_submissions es ON es.id = ei.submission_id
    JOIN essay_tasks et ON et.id = es.task_id
    WHERE et.class_id = ? AND es.student_name = ?
  `).get(classId, studentName);
  const interactionCount = interactions ? interactions.cnt : 0;

  // Excellent homework
  const excellentCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM excellent_homework
    WHERE class_id = ? AND student_name = ?
  `).get(classId, studentName);
  const excCount = excellentCount ? excellentCount.cnt : 0;

  // Word game play days
  const gameCount = db.prepare(`
    SELECT COUNT(DISTINCT date(updated_at)) as cnt FROM wordgame_scores
    WHERE name = ? AND class_id = ?
  `).get(studentName, cName);
  const gamePlayDays = gameCount ? gameCount.cnt : 0;

  // Streak
  const wordStreak = calcStreak(wordChecks.filter(r => r.passed === 1).map(r => r.date));
  const essayStreak = calcStreak(essayChecks.filter(r => r.passed === 1).map(r => r.date));
  const maxStreak = Math.max(wordStreak, essayStreak);

  // --- Vocabulary (25 points) ---
  const wordPassRate = wordChecks.length > 0
    ? wordChecks.filter(r => r.passed === 1).length / wordChecks.length : 0;

  const vocabulary = Math.min(25, Math.round(
    wordPassRate * 10 +
    checkinFrequency * 8 +
    gameNormalized * 7
  ));

  // --- Writing (25 points) ---
  const writing = Math.min(25, Math.round(
    (essayAvg / 100) * 10 +
    Math.min(interactionCount / 2, 1) * 8 +
    Math.min(essayRows.length / 3, 1) * 7
  ));

  // --- Discipline (20 points) ---
  const essayPassRate = essayChecks.length > 0
    ? essayChecks.filter(r => r.passed === 1).length / essayChecks.length : 0;

  const discipline = Math.min(20, Math.round(
    ((wordPassRate + essayPassRate) / 2) * 10 +
    Math.min(maxStreak / 20, 1) * 6 +
    (checkinFrequency >= 0.9 ? 4 : checkinFrequency * 4)
  ));

  // --- Engagement (20 points) ---
  let moduleParticipation = 0;
  if (wordChecks.length > 0 || essayChecks.length > 0) moduleParticipation++;
  if (essayRows.length > 0) moduleParticipation++;
  if (gameBest > 0) moduleParticipation++;

  const activityDays = gamePlayDays + essayRows.length;
  const excRate = essayRows.length > 0 ? excCount / essayRows.length : 0;

  const engagement = Math.min(20, Math.round(
    (moduleParticipation / 3) * 8 +
    Math.min(excRate, 1) * 6 +
    Math.min(activityDays / 10, 1) * 6
  ));

  // --- Progress (10 points) ---
  let progress = 0;
  const lastWeekStart = getWeekStart(-1);
  const lastWeekScore = db.prepare(`
    SELECT total, vocabulary as v, writing as w, discipline as d, engagement as e
    FROM student_scores
    WHERE class_id = ? AND student_name = ? AND week_start = ?
  `).get(classId, studentName, lastWeekStart);

  if (lastWeekScore && lastWeekScore.total > 0) {
    const currentNonProgress = vocabulary + writing + discipline + engagement;
    const lastNonProgress = lastWeekScore.v + lastWeekScore.w + lastWeekScore.d + lastWeekScore.e;
    const improvement = lastNonProgress > 0 ? (currentNonProgress - lastNonProgress) / lastNonProgress : 0;
    progress += Math.min(improvement / 0.20, 1) * 5;

    const dimImprovements = [
      lastWeekScore.v > 0 ? (vocabulary - lastWeekScore.v) / lastWeekScore.v : 0,
      lastWeekScore.w > 0 ? (writing - lastWeekScore.w) / lastWeekScore.w : 0,
      lastWeekScore.d > 0 ? (discipline - lastWeekScore.d) / lastWeekScore.d : 0,
      lastWeekScore.e > 0 ? (engagement - lastWeekScore.e) / lastWeekScore.e : 0,
    ];
    const maxDimImprovement = Math.max(...dimImprovements);
    progress += Math.min(maxDimImprovement / 0.30, 1) * 3;
  } else {
    progress = Math.round(3 + (vocabulary + writing + discipline + engagement) / 100);
  }

  // Rank improvement bonus
  const twoWeeksAgo = getWeekStart(-2);
  const prevRank = db.prepare(`
    SELECT rank FROM student_scores
    WHERE class_id = ? AND student_name = ? AND week_start = ?
  `).get(classId, studentName, twoWeeksAgo);

  if (prevRank && prevRank.rank > 0) {
    const currentTotal = vocabulary + writing + discipline + engagement;
    const surpassed = db.prepare(`
      SELECT COUNT(*) as cnt FROM student_scores
      WHERE class_id = ? AND week_start = ? AND total < ? AND rank < ?
    `).get(classId, lastWeekStart, currentTotal, prevRank.rank);
    const studentCount = db.prepare(`SELECT COUNT(*) as cnt FROM students WHERE class_id = ? AND active = 1`).get(classId).cnt;
    progress += (surpassed ? surpassed.cnt : 0) / Math.max(studentCount, 1) * 2;
  }

  progress = Math.min(10, Math.round(progress));

  const total = vocabulary + writing + discipline + engagement + progress;
  const tier = getTier(total);

  return {
    student_name: studentName,
    vocabulary,
    writing,
    discipline,
    engagement,
    progress,
    total,
    tier,
    raw: {
      word_checks: wordChecks.length,
      word_passed: wordChecks.filter(r => r.passed === 1).length,
      essay_checks: essayChecks.length,
      essay_passed: essayChecks.filter(r => r.passed === 1).length,
      game_best: gameBest,
      essay_count: essayRows.length,
      essay_avg: Math.round(essayAvg),
      interaction_count: interactionCount,
      excellent_count: excCount,
      streak: maxStreak,
      checkin_frequency: Math.round(checkinFrequency * 100),
    }
  };
}

// ============================================================================
// Save / Load Scores
// ============================================================================

function ensureStudentScoresTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      week_start TEXT NOT NULL,
      vocabulary REAL NOT NULL DEFAULT 0,
      writing REAL NOT NULL DEFAULT 0,
      discipline REAL NOT NULL DEFAULT 0,
      engagement REAL NOT NULL DEFAULT 0,
      progress REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      rank INTEGER DEFAULT 0,
      tier TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(class_id, student_name, week_start)
    );
    CREATE INDEX IF NOT EXISTS idx_student_scores_class_week ON student_scores(class_id, week_start);
    CREATE INDEX IF NOT EXISTS idx_student_scores_student ON student_scores(class_id, student_name);
  `);
}

function saveClassScores(db, classId, scores, weekStart) {
  ensureStudentScoresTable(db);

  const sorted = [...scores].sort((a, b) => b.total - a.total);

  const insert = db.prepare(`
    INSERT INTO student_scores
      (class_id, student_name, week_start, vocabulary, writing, discipline, engagement, progress, total, rank, tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(class_id, student_name, week_start)
    DO UPDATE SET
      vocabulary = excluded.vocabulary,
      writing = excluded.writing,
      discipline = excluded.discipline,
      engagement = excluded.engagement,
      progress = excluded.progress,
      total = excluded.total,
      rank = excluded.rank,
      tier = excluded.tier,
      created_at = datetime('now')
  `);

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    insert.run(classId, s.student_name, weekStart,
      s.vocabulary, s.writing, s.discipline, s.engagement, s.progress,
      s.total, i + 1, s.tier.name);
  }

  return sorted;
}

function loadClassScores(db, classId, weekStart) {
  ensureStudentScoresTable(db);
  return db.prepare(`
    SELECT * FROM student_scores
    WHERE class_id = ? AND week_start = ?
    ORDER BY rank ASC
  `).all(classId, weekStart);
}

// ============================================================================
// Leaderboard helpers
// ============================================================================

function getLeaderboard(scores, type = 'total') {
  const sorted = [...scores];

  switch (type) {
    case 'total':
      return sorted.sort((a, b) => b.total - a.total);
    case 'vocabulary':
      return sorted.sort((a, b) => b.vocabulary - a.vocabulary);
    case 'writing':
      return sorted.sort((a, b) => b.writing - a.writing);
    case 'discipline':
      return sorted.sort((a, b) => b.discipline - a.discipline);
    case 'engagement':
      return sorted.sort((a, b) => b.engagement - a.engagement);
    case 'progress':
      return sorted.sort((a, b) => b.progress - a.progress);
    case 'streak':
      return sorted.sort((a, b) => (b.raw?.streak || 0) - (a.raw?.streak || 0));
    default:
      return sorted.sort((a, b) => b.total - a.total);
  }
}

function getProgressLeaderboard(db, classId, currentScores) {
  const lastWeekStart = getWeekStart(-1);
  const lastWeekScores = loadClassScores(db, classId, lastWeekStart);
  const lastWeekMap = {};
  for (const s of lastWeekScores) {
    lastWeekMap[s.student_name] = s;
  }

  const result = [];
  for (const s of currentScores) {
    const last = lastWeekMap[s.student_name];
    let improvement = 0;
    if (last && last.total > 0) {
      improvement = (s.total - last.total) / last.total;
    }
    result.push({
      ...s,
      improvement_pct: Math.round(improvement * 1000) / 10,
      last_week_total: last ? last.total : 0,
    });
  }

  return result.sort((a, b) => b.improvement_pct - a.improvement_pct);
}

// ============================================================================
// AI Insight Generation (rule-based patterns)
// ============================================================================

function findAnomalies(scores, avgScore) {
  const anomalies = [];
  const dims = ['vocabulary', 'writing', 'discipline', 'engagement', 'progress'];
  const dimLabels = {
    vocabulary: '词汇力',
    writing: '写作力',
    discipline: '纪律性',
    engagement: '参与度',
    progress: '进步度'
  };

  // 1. Weakest dimension
  const dimAvgs = {};
  for (const d of dims) {
    dimAvgs[d] = avg(scores.map(s => s[d]));
  }
  const weakestDim = [...dims].sort((a, b) => dimAvgs[a] - dimAvgs[b])[0];
  anomalies.push({
    type: 'weakest_dimension',
    title: `班级薄弱维度：${dimLabels[weakestDim]}`,
    description: `${dimLabels[weakestDim]}平均分仅${Math.round(dimAvgs[weakestDim])}分，是五维中最低的。`,
    suggestion: `建议下周重点加强${dimLabels[weakestDim]}训练。`
  });

  // 2. Dimension decoupling: high vocabulary but low writing
  const vocabWritingGap = scores.filter(s => s.vocabulary >= 18 && s.writing <= 12);
  if (vocabWritingGap.length >= 2) {
    anomalies.push({
      type: 'decoupling',
      title: '词汇→写作转化不足',
      description: `${vocabWritingGap.length}名学生词汇力不错但写作力偏低，存在"背了不会用"的问题。`,
      students: vocabWritingGap.map(s => s.student_name).slice(0, 3),
      suggestion: '建议加强连接词和句型训练，布置"用新词写句子"的作业。'
    });
  }

  // 3. Effort trap: high engagement but low progress
  const effortTrap = scores.filter(s => s.engagement >= 15 && s.progress <= 3);
  if (effortTrap.length >= 1) {
    anomalies.push({
      type: 'effort_trap',
      title: '努力陷阱',
      description: `${effortTrap.length}名学生参与度高但进步度低，可能存在方法问题。`,
      students: effortTrap.map(s => s.student_name).slice(0, 3),
      suggestion: '建议关注这些学生的学习方法，可能需要一对一指导。'
    });
  }

  // 4. At-risk students
  const atRisk = scores.filter(s => s.total < 50);
  if (atRisk.length > 0) {
    anomalies.push({
      type: 'at_risk',
      title: `关注学生：${atRisk.length}人总分低于50`,
      description: `有${atRisk.length}名学生总分低于50分，需要重点关注。`,
      students: atRisk.map(s => s.student_name).slice(0, 5),
      suggestion: '建议与家长沟通，了解是否存在学习困难或其他问题。'
    });
  }

  // 5. Star students
  const stars = scores.filter(s => dims.filter(d => s[d] >= 20).length >= 3);
  if (stars.length > 0) {
    anomalies.push({
      type: 'star',
      title: `全能之星：${stars.length}人多维优秀`,
      description: `${stars.length}名学生在至少3个维度表现突出。`,
      students: stars.map(s => s.student_name).slice(0, 3),
      suggestion: '可以让他们担任学习小组长，带动其他同学。'
    });
  }

  return anomalies;
}

module.exports = {
  computeStudentScore100,
  getTier,
  getWeekStart,
  ensureStudentScoresTable,
  saveClassScores,
  loadClassScores,
  getLeaderboard,
  getProgressLeaderboard,
  findAnomalies,
  avg,
  calcStreak,
  classIdToName,
  TIERS,
};
