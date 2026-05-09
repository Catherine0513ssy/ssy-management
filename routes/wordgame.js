const router = require('express').Router();
const { getDB } = require('../services/db');

// POST /api/wordgame/score
// Body: { name, class_id, score, mode, diff }
// 只保留最高分（新分 > 旧分才更新）
router.post('/score', (req, res) => {
  try {
    const { name, class_id, score, mode, diff } = req.body;
    if (!name || !class_id || score == null || !mode || !diff) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    const scoreNum = parseInt(score, 10);
    if (isNaN(scoreNum) || scoreNum < 0) {
      return res.status(400).json({ error: '分数无效' });
    }

    const db = getDB();
    const existing = db.prepare(
      'SELECT score FROM wordgame_scores WHERE name = ? AND class_id = ? AND mode = ? AND diff = ?'
    ).get(name, String(class_id), mode, diff);

    if (!existing || scoreNum > existing.score) {
      db.prepare(
        `INSERT INTO wordgame_scores (name, class_id, score, mode, diff, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT DO UPDATE SET
         score = excluded.score, updated_at = excluded.updated_at`
      ).run(name, String(class_id), scoreNum, mode, diff);
      return res.json({ updated: true, score: scoreNum, previous: existing ? existing.score : 0 });
    }

    res.json({ updated: false, score: existing.score, newScore: scoreNum });
  } catch (e) {
    console.error('[wordgame score]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wordgame/leaderboard?class_id=xxx&mode=xxx&diff=xxx&limit=10
router.get('/leaderboard', (req, res) => {
  try {
    const { class_id, mode, diff, limit = '10' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 10, 50);

    const db = getDB();
    let rows;
    if (class_id && mode && diff) {
      rows = db.prepare(
        `SELECT name, score, updated_at FROM wordgame_scores
         WHERE class_id = ? AND mode = ? AND diff = ?
         ORDER BY score DESC, updated_at ASC
         LIMIT ?`
      ).all(String(class_id), mode, diff, lim);
    } else if (class_id) {
      rows = db.prepare(
        `SELECT name, score, updated_at FROM wordgame_scores
         WHERE class_id = ?
         ORDER BY score DESC, updated_at ASC
         LIMIT ?`
      ).all(String(class_id), lim);
    } else {
      rows = db.prepare(
        `SELECT name, score, updated_at FROM wordgame_scores
         ORDER BY score DESC, updated_at ASC
         LIMIT ?`
      ).all(lim);
    }

    res.json({ rows });
  } catch (e) {
    console.error('[wordgame leaderboard]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
