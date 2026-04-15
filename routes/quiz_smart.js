/**
 * 中考冲刺智能默写系统
 * 结合艾宾浩斯曲线 + 中考高频词权重 + 错误标记
 */

const router = require('express').Router();
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');

// 艾宾浩斯复习间隔（天）：1, 2, 4, 7, 15, 30
const SPACED_REPETITION_INTERVALS = [1, 2, 4, 7, 15, 30];

/**
 * 计算单词优先级分数
 */
function calculateWordPriority(word, reviewLog, today) {
  const weight = word.weight || 1.0;
  const isCore = word.is_core || 0;
  let priority = weight;

  if (isCore) priority *= 1.3;
  if (!reviewLog) return priority * 1.5;

  const wrongCount = reviewLog.wrong_count || 0;
  if (wrongCount > 0) priority *= (1 + wrongCount * 0.3);
  if (reviewLog.marked_difficult) priority *= 2.0;

  if (reviewLog.next_review) {
    const nextReview = new Date(reviewLog.next_review);
    const todayDate = new Date(today);
    const daysDiff = Math.floor((todayDate - nextReview) / (1000 * 60 * 60 * 24));
    if (daysDiff >= 0) priority *= (1 + daysDiff * 0.1);
    else if (daysDiff >= -1) priority *= 1.1;
    else priority *= 0.5;
  }

  const reviewCount = reviewLog.review_count || 0;
  if (reviewCount === 0) priority *= 1.5;
  else if (reviewCount < 3) priority *= 1.2;

  return priority;
}

/**
 * GET /smart/daily - 生成今日50个单词
 */
router.get('/daily', async (req, res) => {
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. 检查今天是否已生成
    const existingQuiz = db.prepare('SELECT * FROM daily_quiz WHERE quiz_date = ?').get(today);
    if (existingQuiz) {
      const wordIds = JSON.parse(existingQuiz.word_ids);
      const words = db.prepare(`SELECT v.*, w.weight, w.is_core FROM vocabulary v LEFT JOIN zhongkao_weights w ON v.id = w.word_id WHERE v.id IN (${wordIds.map(() => '?').join(',')})`).all(...wordIds);
      return res.json({ date: today, words, count: words.length, cached: true });
    }

    // 2. 只获取核心词（1009个中考高频词）
    const allWords = db.prepare(`
      SELECT v.id, v.word, v.meaning, v.phonetic, v.pos, v.grade, v.unit,
             w.weight,
             w.is_core
      FROM vocabulary v
      INNER JOIN zhongkao_weights w ON v.id = w.word_id
      WHERE w.is_core = 1
    `).all();

    // 3. 获取所有复习记录
    const reviewLogs = db.prepare('SELECT * FROM word_review_log').all();
    const reviewLogMap = {};
    reviewLogs.forEach(log => {
      if (!reviewLogMap[log.word_id] || new Date(log.created_at) > new Date(reviewLogMap[log.word_id].created_at)) {
        reviewLogMap[log.word_id] = log;
      }
    });

    // 4. 计算每个单词的优先级
    const wordScores = allWords.map(word => ({
      ...word,
      priority: calculateWordPriority(word, reviewLogMap[word.id], today)
    }));

    // 5. 按优先级排序
    wordScores.sort((a, b) => b.priority - a.priority);

    // 6. 取前50个
    const selectedWords = wordScores.slice(0, 50);
    const wordIds = selectedWords.map(w => w.id);

    // 7. 保存到daily_quiz
    db.prepare('INSERT INTO daily_quiz (quiz_date, word_ids, class_id) VALUES (?, ?, 1)')
      .run(today, JSON.stringify(wordIds));

    res.json({ date: today, words: selectedWords, count: selectedWords.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /smart/mark-wrong - 标记错误单词（老师手动录入）
 */
router.post('/mark-wrong', requireAuth, (req, res) => {
  const { word_ids } = req.body; // array of word ids
  if (!Array.isArray(word_ids) || word_ids.length === 0) {
    return res.status(400).json({ error: 'word_ids is required' });
  }

  const db = getDB();
  const today = new Date().toISOString().split('T')[0];

  try {
    word_ids.forEach(wordId => {
      // 获取现有记录
      const existing = db.prepare('SELECT * FROM word_review_log WHERE word_id = ? ORDER BY created_at DESC LIMIT 1').get(wordId);

      if (existing) {
        // 更新记录
        const newWrongCount = (existing.wrong_count || 0) + 1;
        const newReviewCount = (existing.review_count || 0) + 1;
        const intervalIndex = Math.min(newReviewCount - 1, SPACED_REPETITION_INTERVALS.length - 1);
        const nextInterval = SPACED_REPETITION_INTERVALS[intervalIndex];

        // 计算下次复习时间（错得越多，间隔越短）
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + Math.max(1, nextInterval - newWrongCount));

        db.prepare(`
          INSERT INTO word_review_log (word_id, review_date, review_count, next_review, marked_difficult, wrong_count)
          VALUES (?, ?, ?, ?, 1, ?)
        `).run(wordId, today, newReviewCount, nextReview.toISOString().split('T')[0], newWrongCount);
      } else {
        // 新记录
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + 1); // 明天复习

        db.prepare(`
          INSERT INTO word_review_log (word_id, review_date, review_count, next_review, marked_difficult, wrong_count)
          VALUES (?, ?, 1, ?, 1, 1)
        `).run(wordId, today, nextReview.toISOString().split('T')[0]);
      }
    });

    res.json({ success: true, marked_count: word_ids.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /smart/mark-correct - 标记正确（完成复习）
 */
router.post('/mark-correct', requireAuth, (req, res) => {
  const { word_ids } = req.body;
  if (!Array.isArray(word_ids) || word_ids.length === 0) {
    return res.status(400).json({ error: 'word_ids is required' });
  }

  const db = getDB();
  const today = new Date().toISOString().split('T')[0];

  try {
    word_ids.forEach(wordId => {
      const existing = db.prepare('SELECT * FROM word_review_log WHERE word_id = ? ORDER BY created_at DESC LIMIT 1').get(wordId);

      if (existing) {
        const newReviewCount = (existing.review_count || 0) + 1;
        const intervalIndex = Math.min(newReviewCount - 1, SPACED_REPETITION_INTERVALS.length - 1);
        const nextInterval = SPACED_REPETITION_INTERVALS[intervalIndex];

        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + nextInterval);

        db.prepare(`
          INSERT INTO word_review_log (word_id, review_date, review_count, next_review, marked_difficult, wrong_count)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(wordId, today, newReviewCount, nextReview.toISOString().split('T')[0],
               existing.marked_difficult || 0, existing.wrong_count || 0);
      } else {
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + 1);

        db.prepare(`
          INSERT INTO word_review_log (word_id, review_date, review_count, next_review, marked_difficult, wrong_count)
          VALUES (?, ?, 1, ?, 0, 0)
        `).run(wordId, today, nextReview.toISOString().split('T')[0]);
      }
    });

    res.json({ success: true, marked_count: word_ids.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /smart/stats - 查看统计数据
 */
router.get('/stats', (req, res) => {
  const db = getDB();

  try {
    const totalWords = db.prepare('SELECT COUNT(*) as count FROM zhongkao_weights WHERE is_core = 1').get();
    const coreWords = db.prepare('SELECT COUNT(*) as count FROM zhongkao_weights WHERE is_core = 1').get();
    const reviewedWords = db.prepare('SELECT COUNT(DISTINCT word_id) as count FROM word_review_log').get();
    const difficultWords = db.prepare('SELECT COUNT(DISTINCT word_id) as count FROM word_review_log WHERE marked_difficult = 1').get();

    // 今日应该复习的单词
    const today = new Date().toISOString().split('T')[0];
    const dueToday = db.prepare('SELECT COUNT(DISTINCT word_id) as count FROM word_review_log WHERE next_review <= ?').get(today);

    res.json({
      total: totalWords.count,
      core: coreWords.count,
      reviewed: reviewedWords.count,
      difficult: difficultWords.count,
      due_today: dueToday.count
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
