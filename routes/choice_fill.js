/**
 * 选词填空 (Choice Fill-in) Routes
 * 株洲新高考题型：从方框中选择单词填入文章
 */

const router = require('express').Router();
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /daily - 获取今日的选词填空题目
 * 支持 ?date=YYYY-MM-DD 查询指定日期
 */
router.get('/daily', (req, res) => {
  const db = getDB();
  const queryDate = req.query.date;
  const today = new Date().toISOString().split('T')[0];
  const targetDate = queryDate || today;

  try {
    // 查找指定日期的题目
    let question = db.prepare(
      'SELECT * FROM choice_fill_questions WHERE scheduled_date = ? AND is_active = 1'
    ).get(targetDate);

    // 如果没有指定日期的题目，找最近的未来题目
    if (!question && !queryDate) {
      question = db.prepare(
        'SELECT * FROM choice_fill_questions WHERE scheduled_date > ? AND is_active = 1 ORDER BY scheduled_date LIMIT 1'
      ).get(today);
    }

    // 如果还没有，找最新的题目
    if (!question) {
      question = db.prepare(
        'SELECT * FROM choice_fill_questions WHERE is_active = 1 ORDER BY scheduled_date DESC LIMIT 1'
      ).get();
    }

    if (!question) {
      return res.status(404).json({
        error: 'NO_QUESTION_AVAILABLE',
        message: '没有找到选词填空题目。请去后台添加题目。',
        today: today,
        requested_date: targetDate
      });
    }

    // 获取上一篇和下一篇
    const prevQuestion = db.prepare(
      'SELECT scheduled_date FROM choice_fill_questions WHERE scheduled_date < ? AND is_active = 1 ORDER BY scheduled_date DESC LIMIT 1'
    ).get(question.scheduled_date);

    const nextQuestion = db.prepare(
      'SELECT scheduled_date FROM choice_fill_questions WHERE scheduled_date > ? AND is_active = 1 ORDER BY scheduled_date LIMIT 1'
    ).get(question.scheduled_date);

    // 解析选项
    const options = question.options ? question.options.split('|') : [];
    const answers = question.answers ? question.answers.split('|').reduce((acc, item) => {
      const [key, val] = item.split(':');
      acc[key] = val;
      return acc;
    }, {}) : {};

    res.json({
      id: question.id,
      title: question.title,
      passage: question.passage,
      options: options,
      answers: answers,
      explanations: question.explanations,
      difficulty: question.difficulty,
      source: question.source,
      scheduled_date: question.scheduled_date,
      is_today: question.scheduled_date === today,
      prev_date: prevQuestion ? prevQuestion.scheduled_date : null,
      next_date: nextQuestion ? nextQuestion.scheduled_date : null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /dates - 获取所有可用日期列表
 */
router.get('/dates', (req, res) => {
  const db = getDB();
  try {
    const dates = db.prepare(
      'SELECT scheduled_date, title FROM choice_fill_questions WHERE is_active = 1 ORDER BY scheduled_date'
    ).all();

    res.json({
      dates: dates.map(d => ({
        date: d.scheduled_date,
        title: d.title
      })),
      count: dates.length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /all - 获取所有题目（管理员用）
 */
router.get('/all', requireAuth, (req, res) => {
  const db = getDB();
  try {
    const questions = db.prepare(
      'SELECT id, title, scheduled_date, difficulty, is_active, created_at FROM choice_fill_questions ORDER BY scheduled_date DESC'
    ).all();
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /add - 添加新题目（管理员用）
 */
router.post('/add', requireAuth, (req, res) => {
  const { title, passage, options, answers, explanations, difficulty, scheduled_date } = req.body;

  if (!title || !passage || !options || !answers) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = getDB();
  try {
    const result = db.prepare(`
      INSERT INTO choice_fill_questions (title, passage, options, answers, explanations, difficulty, scheduled_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(title, passage, options, answers, explanations || '', difficulty || 'medium', scheduled_date || null);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: '题目添加成功'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /update/:id - 更新题目（管理员用）
 */
router.put('/update/:id', requireAuth, (req, res) => {
  const { title, passage, options, answers, explanations, difficulty, scheduled_date, is_active } = req.body;
  const id = req.params.id;

  const db = getDB();
  try {
    db.prepare(`
      UPDATE choice_fill_questions
      SET title = ?, passage = ?, options = ?, answers = ?, explanations = ?,
          difficulty = ?, scheduled_date = ?, is_active = ?
      WHERE id = ?
    `).run(title, passage, options, answers, explanations, difficulty, scheduled_date, is_active, id);

    res.json({ success: true, message: '题目更新成功' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /delete/:id - 删除题目（管理员用）
 */
router.delete('/delete/:id', requireAuth, (req, res) => {
  const db = getDB();
  try {
    db.prepare('DELETE FROM choice_fill_questions WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '题目删除成功' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /check-today - 检查今天是否有题目
 */
router.get('/check-today', (req, res) => {
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];

  try {
    const count = db.prepare(
      'SELECT COUNT(*) as count FROM choice_fill_questions WHERE scheduled_date = ? AND is_active = 1'
    ).get(today);

    res.json({
      today: today,
      has_question: count.count > 0,
      count: count.count
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
