const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const { sanitizeText } = require('../middleware/sanitize');

// ---------------------------------------------------------------------------
// Multer configuration — save uploaded images to public/uploads/
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// Helper: fetch all unique dates for a given class (descending)
// ---------------------------------------------------------------------------
function getAllDates(db, classId) {
  return db
    .prepare(
      `SELECT DISTINCT date FROM homework_items
       WHERE class_id = ?
       ORDER BY date DESC`
    )
    .all(classId)
    .map((r) => r.date);
}

// ---------------------------------------------------------------------------
// Helper: fetch homework items for a class + date
// ---------------------------------------------------------------------------
function getItems(db, classId, date) {
  return db
    .prepare(
      `SELECT * FROM homework_items
       WHERE class_id = ? AND date = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(classId, date);
}

// ---------------------------------------------------------------------------
// GET /  — items for a specific date, or all dates for the sidebar
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { class_id, date } = req.query;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const classId = Number(class_id);
  const allDates = getAllDates(db, classId);

  if (date) {
    const items = getItems(db, classId, date);
    return res.json({ items, allDates });
  }

  // No date specified — return empty items with the date list (for sidebar)
  return res.json({ items: [], allDates });
});

// ---------------------------------------------------------------------------
// GET /dates  — unique dates with homework count
// ---------------------------------------------------------------------------
router.get('/dates', (req, res) => {
  const { class_id } = req.query;

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' });
  }

  const db = getDB();
  const dates = db
    .prepare(
      `SELECT date, COUNT(*) AS count
       FROM homework_items
       WHERE class_id = ?
       GROUP BY date
       ORDER BY date DESC`
    )
    .all(Number(class_id));

  return res.json({ dates });
});

// ---------------------------------------------------------------------------
// POST /  — create a homework item (auth required)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, upload.single('image'), (req, res) => {
  const { class_id, date, text } = req.body;

  if (!class_id || !date || !text) {
    return res
      .status(400)
      .json({ error: 'class_id, date, and text are required' });
  }

  const db = getDB();
  const classId = Number(class_id);
  const sanitizedText = sanitizeText(text);
  const imagePath = req.file ? `/uploads/${req.file.filename}` : (req.body.image || null);

  // Determine next sort_order for this class + date
  const maxRow = db
    .prepare(
      `SELECT MAX(sort_order) AS max_sort
       FROM homework_items
       WHERE class_id = ? AND date = ?`
    )
    .get(classId, date);
  const nextSort = (maxRow && maxRow.max_sort != null ? maxRow.max_sort : -1) + 1;

  db.prepare(
    `INSERT INTO homework_items (class_id, date, text, image, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(classId, date, sanitizedText, imagePath, nextSort);

  // Return updated items for that date
  const items = getItems(db, classId, date);
  const allDates = getAllDates(db, classId);

  return res.json({ items, allDates });
});

// ---------------------------------------------------------------------------
// DELETE /:id  — remove a homework item (auth required)
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);

  const result = db
    .prepare('DELETE FROM homework_items WHERE id = ?')
    .run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Homework item not found' });
  }

  return res.json({ success: true });
});

module.exports = router;
