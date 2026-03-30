const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Multer configuration — save uploaded images to public/uploads/
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// Helper: fetch all excellent homework items for a class, newest first
// ---------------------------------------------------------------------------
function getAllItems(db, classId) {
  return db
    .prepare(
      `SELECT * FROM excellent_homework
       WHERE class_id = ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(classId);
}

// ---------------------------------------------------------------------------
// GET /  — list excellent homework for a class
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { class_id } = req.query;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const items = getAllItems(db, Number(class_id));

  return res.json({ items });
});

// ---------------------------------------------------------------------------
// POST /  — add excellent homework (auth required, multipart form)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, upload.single('image'), (req, res) => {
  const { class_id, name, note } = req.body;

  if (!class_id || !name) {
    return res.status(400).json({ error: 'class_id and name are required' });
  }

  const db = getDB();
  const classId = Number(class_id);
  const imagePath = req.file ? '/uploads/' + req.file.filename : null;
  const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }).replace(/\//g, '-');

  db.prepare(
    `INSERT INTO excellent_homework (class_id, student_name, image_path, date, note, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(classId, name, imagePath, today, note || null);

  const items = getAllItems(db, classId);
  const item = items[0]; // the just-inserted item (newest first)

  return res.json({ item, items });
});

// ---------------------------------------------------------------------------
// DELETE /:id  — remove excellent homework (auth required)
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);

  // Fetch the item first so we can clean up the image file
  const row = db
    .prepare('SELECT * FROM excellent_homework WHERE id = ?')
    .get(id);

  if (!row) {
    return res.status(404).json({ error: 'Item not found' });
  }

  db.prepare('DELETE FROM excellent_homework WHERE id = ?').run(id);

  // Try to delete the associated image file
  if (row.image_path) {
    const filePath = path.join(__dirname, '..', 'public', row.image_path);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error('Failed to delete image file:', filePath, err.message);
      }
    });
  }

  return res.json({ success: true });
});

module.exports = router;
