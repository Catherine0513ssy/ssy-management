const Database = require('better-sqlite3');
const path = require('path');

let db;

const SCHEMA_SQL = `
-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_groups (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  group_id INTEGER REFERENCES student_groups(id),
  name TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- HOMEWORK TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS homework_items (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  image TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS excellent_homework (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  student_name TEXT NOT NULL,
  image_path TEXT,
  date TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- CHECK-IN (DICTATION) TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS checkin_sessions (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  type TEXT NOT NULL CHECK(type IN ('word', 'essay')),
  round INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(class_id, type, round, date)
);

CREATE TABLE IF NOT EXISTS checkin_records (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES checkin_sessions(id),
  student_id INTEGER REFERENCES students(id),
  student_index INTEGER NOT NULL,
  group_index INTEGER DEFAULT 1,
  passed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- VOCABULARY TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS vocabulary (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL,
  phonetic TEXT,
  meaning TEXT NOT NULL,
  unit TEXT,
  grade TEXT,
  pos TEXT,
  source TEXT DEFAULT 'textbook',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_words (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  words_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- QUIZ / SPACED REPETITION TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS quiz_papers (
  id INTEGER PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id),
  title TEXT,
  word_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_results (
  id INTEGER PRIMARY KEY,
  paper_id INTEGER NOT NULL REFERENCES quiz_papers(id),
  student_name TEXT NOT NULL,
  score INTEGER,
  wrong_words TEXT DEFAULT '[]',
  completed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spaced_repetition (
  id INTEGER PRIMARY KEY,
  student_name TEXT NOT NULL,
  word_id INTEGER NOT NULL REFERENCES vocabulary(id),
  ease_factor REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 1,
  repetitions INTEGER DEFAULT 0,
  next_review TEXT,
  last_reviewed TEXT,
  UNIQUE(student_name, word_id)
);

-- ============================================================
-- SCORING / RANKING
-- ============================================================

CREATE TABLE IF NOT EXISTS score_events (
  id INTEGER PRIMARY KEY,
  student_index INTEGER NOT NULL,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  group_index INTEGER DEFAULT 1,
  event_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SYSTEM TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY,
  ip TEXT NOT NULL,
  attempted_at TEXT DEFAULT (datetime('now')),
  success INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ocr_logs (
  id INTEGER PRIMARY KEY,
  engine TEXT NOT NULL,
  image_path TEXT,
  raw_result TEXT,
  parsed_words TEXT,
  word_count INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- ESSAY GRADING
-- ============================================================

CREATE TABLE IF NOT EXISTS essay_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  requirements TEXT,
  essay_type TEXT DEFAULT 'free',
  max_score REAL DEFAULT 10,
  rubric_config TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

CREATE TABLE IF NOT EXISTS essay_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  image_path TEXT,
  ocr_text TEXT,
  ocr_confirmed INTEGER DEFAULT 0,
  score_detail TEXT,
  total_score REAL,
  annotations TEXT,
  ai_comment TEXT,
  status TEXT DEFAULT 'uploaded',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES essay_tasks(id) ON DELETE CASCADE
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_homework_class_date ON homework_items(class_id, date);
CREATE INDEX IF NOT EXISTS idx_checkin_session ON checkin_sessions(class_id, type, round, date);
CREATE INDEX IF NOT EXISTS idx_checkin_records_session ON checkin_records(session_id);
CREATE INDEX IF NOT EXISTS idx_excellent_class ON excellent_homework(class_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_grade ON vocabulary(grade);
CREATE INDEX IF NOT EXISTS idx_vocabulary_word ON vocabulary(word);
CREATE INDEX IF NOT EXISTS idx_score_events_class ON score_events(class_id, date);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, attempted_at);
CREATE INDEX IF NOT EXISTS idx_essay_tasks_class ON essay_tasks(class_id);
CREATE INDEX IF NOT EXISTS idx_essay_subs_task ON essay_submissions(task_id);
`;

function initDB(dbPath) {
  const resolvedPath = dbPath || path.join(__dirname, '..', 'ssy.db');
  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  // Compatibility: add student_id to existing checkin_records
  try {
    db.exec(`ALTER TABLE checkin_records ADD COLUMN student_id INTEGER REFERENCES students(id)`);
  } catch (e) {
    // Column likely already exists; ignore
  }
  // Ensure index exists after column is present
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_checkin_records_student ON checkin_records(student_id)`);
  } catch (e) {
    // Ignore if index already exists or column missing (should not happen now)
  }
  return db;
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

function getSetting(key) {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  getDB().prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, String(value));
}

function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDB, getDB, getSetting, setSetting, closeDB, SCHEMA_SQL };
