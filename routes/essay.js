const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const { ocrEssay, gradeEssay, getRubric, DEFAULT_RUBRIC } = require('../services/essay-grader');

// ---------------------------------------------------------------------------
// Multer configuration — save uploaded images to public/uploads/
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'essay_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// GET /tasks  — list tasks for a class
// ---------------------------------------------------------------------------
router.get('/tasks', (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ error: 'class_id required' });
  const db = getDB();
  const tasks = db.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM essay_submissions WHERE task_id = t.id) AS submission_count,
       (SELECT COUNT(*) FROM essay_submissions WHERE task_id = t.id AND status = 'graded') AS graded_count,
       (SELECT ROUND(AVG(total_score), 1) FROM essay_submissions WHERE task_id = t.id AND total_score IS NOT NULL) AS avg_score
     FROM essay_tasks t WHERE t.class_id = ? AND t.status = 'active'
     ORDER BY t.created_at DESC`
  ).all(Number(class_id));
  return res.json({ tasks });
});

// ---------------------------------------------------------------------------
// POST /tasks  — create task (auth required)
// ---------------------------------------------------------------------------
router.post('/tasks', requireAuth, (req, res) => {
  const { class_id, title, requirements, essay_type, max_score, rubric_config } = req.body;
  if (!class_id || !title) return res.status(400).json({ error: 'class_id and title required' });
  const db = getDB();
  const info = db.prepare(
    `INSERT INTO essay_tasks (class_id, title, requirements, essay_type, max_score, rubric_config)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(Number(class_id), title, requirements || null, essay_type || 'free', max_score || 10, rubric_config || null);
  const task = db.prepare('SELECT * FROM essay_tasks WHERE id = ?').get(info.lastInsertRowid);
  return res.json({ task });
});

// ---------------------------------------------------------------------------
// PUT /tasks/:id  — update task (auth required)
// ---------------------------------------------------------------------------
router.put('/tasks/:id', requireAuth, (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const fields = ['title', 'requirements', 'essay_type', 'max_score', 'rubric_config', 'status'];
  const updates = []; const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  db.prepare(`UPDATE essay_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const task = db.prepare('SELECT * FROM essay_tasks WHERE id = ?').get(id);
  return res.json({ task });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id  — delete task + cascade submissions + clean up files
// ---------------------------------------------------------------------------
router.delete('/tasks/:id', requireAuth, (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  // Get image paths before deleting
  const subs = db.prepare('SELECT image_path FROM essay_submissions WHERE task_id = ?').all(id);
  db.prepare('DELETE FROM essay_submissions WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM essay_tasks WHERE id = ?').run(id);
  // Clean up files
  for (const s of subs) {
    if (s.image_path) {
      try { fs.unlinkSync(path.join(__dirname, '..', 'public', s.image_path)); } catch (_) {}
    }
  }
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /tasks/:id/upload  — upload multiple images with student names
// ---------------------------------------------------------------------------
router.post('/tasks/:id/upload', requireAuth, upload.array('images', 50), (req, res) => {
  const taskId = Number(req.params.id);
  const db = getDB();
  const task = db.prepare('SELECT * FROM essay_tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  let names = [];
  try { names = JSON.parse(req.body.names || '[]'); } catch (_) {}

  const submissions = [];
  const insertStmt = db.prepare(
    `INSERT INTO essay_submissions (task_id, student_name, image_path, status)
     VALUES (?, ?, ?, 'uploaded')`
  );

  for (let i = 0; i < (req.files || []).length; i++) {
    const file = req.files[i];
    const name = (names[i] || '').trim() || `学生${i + 1}`;
    const imagePath = '/uploads/' + file.filename;
    const info = insertStmt.run(taskId, name, imagePath);
    submissions.push(db.prepare('SELECT * FROM essay_submissions WHERE id = ?').get(info.lastInsertRowid));
  }

  return res.json({ submissions });
});

// ---------------------------------------------------------------------------
// GET /tasks/:id/submissions  — list all submissions for a task
// ---------------------------------------------------------------------------
router.get('/tasks/:id/submissions', (req, res) => {
  const db = getDB();
  const submissions = db.prepare(
    'SELECT * FROM essay_submissions WHERE task_id = ? ORDER BY created_at ASC'
  ).all(Number(req.params.id));
  return res.json({ submissions });
});

// ---------------------------------------------------------------------------
// PUT /submissions/:id  — update a submission
// ---------------------------------------------------------------------------
router.put('/submissions/:id', requireAuth, (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const fields = ['student_name', 'ocr_text', 'ocr_confirmed', 'score_detail', 'total_score', 'annotations', 'ai_comment', 'status'];
  const updates = []; const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields' });
  params.push(id);
  db.prepare(`UPDATE essay_submissions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const sub = db.prepare('SELECT * FROM essay_submissions WHERE id = ?').get(id);
  return res.json({ submission: sub });
});

// ---------------------------------------------------------------------------
// DELETE /submissions/:id  — delete one submission + file
// ---------------------------------------------------------------------------
router.delete('/submissions/:id', requireAuth, (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const sub = db.prepare('SELECT image_path FROM essay_submissions WHERE id = ?').get(id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM essay_submissions WHERE id = ?').run(id);
  if (sub.image_path) {
    try { fs.unlinkSync(path.join(__dirname, '..', 'public', sub.image_path)); } catch (_) {}
  }
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /submissions/:id/ocr  — run OCR on one submission
// ---------------------------------------------------------------------------
router.post('/submissions/:id/ocr', requireAuth, async (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const sub = db.prepare('SELECT * FROM essay_submissions WHERE id = ?').get(id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  if (!sub.image_path) return res.status(400).json({ error: 'No image' });

  try {
    const absPath = path.join(__dirname, '..', 'public', sub.image_path);
    const { text, studentInfo } = await ocrEssay(absPath);

    const updates = { ocr_text: text, status: 'ocr_done' };
    if (studentInfo && (!sub.student_name || sub.student_name.startsWith('学生'))) {
      updates.student_name = studentInfo;
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE essay_submissions SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), id);

    const updated = db.prepare('SELECT * FROM essay_submissions WHERE id = ?').get(id);
    return res.json({ submission: updated });
  } catch (err) {
    return res.status(500).json({ error: 'OCR failed: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /submissions/:id/grade  — grade one submission
// ---------------------------------------------------------------------------
router.post('/submissions/:id/grade', requireAuth, async (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const sub = db.prepare('SELECT * FROM essay_submissions WHERE id = ?').get(id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  if (!sub.ocr_text) return res.status(400).json({ error: 'OCR text is empty, run OCR first' });

  const task = db.prepare('SELECT * FROM essay_tasks WHERE id = ?').get(sub.task_id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  try {
    const result = await gradeEssay(sub.ocr_text, {
      title: task.title,
      requirements: task.requirements,
    }, task.rubric_config);

    db.prepare(
      `UPDATE essay_submissions SET score_detail = ?, total_score = ?, annotations = ?, ai_comment = ?, status = 'graded' WHERE id = ?`
    ).run(
      JSON.stringify(result.scores),
      result.total,
      JSON.stringify(result.annotations || []),
      result.comment || '',
      id
    );

    const updated = db.prepare('SELECT * FROM essay_submissions WHERE id = ?').get(id);
    return res.json({ submission: updated, highlights: result.highlights });
  } catch (err) {
    return res.status(500).json({ error: 'Grading failed: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /tasks/:id/ocr-all  — batch OCR all pending submissions
// ---------------------------------------------------------------------------
router.post('/tasks/:id/ocr-all', requireAuth, async (req, res) => {
  const db = getDB();
  const taskId = Number(req.params.id);
  const pending = db.prepare(
    "SELECT * FROM essay_submissions WHERE task_id = ? AND status = 'uploaded' AND image_path IS NOT NULL"
  ).all(taskId);

  let processed = 0, failed = 0;
  const errors = [];

  for (const sub of pending) {
    try {
      const absPath = path.join(__dirname, '..', 'public', sub.image_path);
      const { text, studentInfo } = await ocrEssay(absPath);
      const updates = { ocr_text: text, status: 'ocr_done' };
      if (studentInfo && sub.student_name.startsWith('学生')) updates.student_name = studentInfo;
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE essay_submissions SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), sub.id);
      processed++;
    } catch (err) {
      failed++;
      errors.push({ id: sub.id, name: sub.student_name, error: err.message });
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  return res.json({ processed, failed, total: pending.length, errors });
});

// ---------------------------------------------------------------------------
// POST /tasks/:id/grade-all  — batch grade all OCR'd submissions
// ---------------------------------------------------------------------------
router.post('/tasks/:id/grade-all', requireAuth, async (req, res) => {
  const db = getDB();
  const taskId = Number(req.params.id);
  const task = db.prepare('SELECT * FROM essay_tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const pending = db.prepare(
    "SELECT * FROM essay_submissions WHERE task_id = ? AND ocr_text IS NOT NULL AND status IN ('ocr_done') "
  ).all(taskId);

  let processed = 0, failed = 0;
  const errors = [];

  for (const sub of pending) {
    try {
      const result = await gradeEssay(sub.ocr_text, {
        title: task.title, requirements: task.requirements
      }, task.rubric_config);

      db.prepare(
        `UPDATE essay_submissions SET score_detail = ?, total_score = ?, annotations = ?, ai_comment = ?, status = 'graded' WHERE id = ?`
      ).run(JSON.stringify(result.scores), result.total, JSON.stringify(result.annotations || []), result.comment || '', sub.id);
      processed++;
    } catch (err) {
      failed++;
      errors.push({ id: sub.id, name: sub.student_name, error: err.message });
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return res.json({ processed, failed, total: pending.length, errors });
});

// ---------------------------------------------------------------------------
// GET /rubric  — get default rubric config
// ---------------------------------------------------------------------------
router.get('/rubric', (req, res) => {
  const rubric = getRubric(null);
  return res.json({ rubric });
});

module.exports = router;
