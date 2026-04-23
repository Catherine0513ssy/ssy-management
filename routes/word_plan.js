const router = require('express').Router();
const { getDB } = require('../services/db');

// GET /api/word-plan/days - 30天概览
router.get('/days', (req, res) => {
  const db = getDB();
  const rows = db.prepare(`
    SELECT day, COUNT(*) as count
    FROM word_plan_30d
    GROUP BY day
    ORDER BY day ASC
  `).all();
  res.json({ days: rows, totalDays: 30 });
});

// GET /api/word-plan/day/:day - 某天50词详情
router.get('/day/:day', (req, res) => {
  const day = parseInt(req.params.day, 10);
  if (day < 1 || day > 30) {
    return res.status(400).json({ error: 'Day must be between 1 and 30' });
  }
  const db = getDB();
  const words = db.prepare(`
    SELECT v.id, v.word, v.phonetic, v.meaning, v.pos, v.grade, v.unit, p.sort_order
    FROM word_plan_30d p
    JOIN vocabulary v ON p.word_id = v.id
    WHERE p.day = ?
    ORDER BY p.sort_order ASC
  `).all(day);
  res.json({ day, words, count: words.length });
});

// GET /api/word-plan/day/:day/shuffle - 某天打乱顺序（用于听写）
router.get('/day/:day/shuffle', (req, res) => {
  const day = parseInt(req.params.day, 10);
  if (day < 1 || day > 30) {
    return res.status(400).json({ error: 'Day must be between 1 and 30' });
  }
  const db = getDB();
  const words = db.prepare(`
    SELECT v.id, v.word, v.phonetic, v.meaning, v.pos
    FROM word_plan_30d p
    JOIN vocabulary v ON p.word_id = v.id
    WHERE p.day = ?
  `).all(day);

  // Fisher-Yates shuffle
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }

  res.json({ day, words, count: words.length });
});

// GET /api/word-plan/day/:day/md - 导出Markdown
router.get('/day/:day/md', (req, res) => {
  const day = parseInt(req.params.day, 10);
  if (day < 1 || day > 30) {
    return res.status(400).json({ error: 'Day must be between 1 and 30' });
  }
  const db = getDB();
  const words = db.prepare(`
    SELECT v.word, v.phonetic, v.meaning, v.pos
    FROM word_plan_30d p
    JOIN vocabulary v ON p.word_id = v.id
    WHERE p.day = ?
    ORDER BY p.sort_order ASC
  `).all(day);

  let md = `# Day ${day} 单词背记表（共${words.length}词）\n\n`;
  md += `| 序号 | 英文单词 | 音标 | 词性 | 中文释义 |\n`;
  md += `|:---:|:---|:---|:---|:---|\n`;
  words.forEach((w, i) => {
    md += `| ${i + 1} | **${w.word}** | ${w.phonetic || ''} | ${w.pos || ''} | ${w.meaning || ''} |\n`;
  });
  md += `\n---\n*Generated on ${new Date().toLocaleDateString('zh-CN')}*`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="day${day}_words.md"`);
  res.send(md);
});

module.exports = router;
