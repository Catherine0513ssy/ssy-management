const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'ssy.db');
const db = new Database(dbPath);

// 1. Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS word_plan_30d (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day INTEGER NOT NULL,
    word_id INTEGER NOT NULL REFERENCES vocabulary(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_word_plan_day_word ON word_plan_30d(day, word_id);
`);

// 2. Clear old data
db.exec('DELETE FROM word_plan_30d;');

// 3. Get all unique words, prioritize core words
const allRows = db.prepare(`
  SELECT v.id, v.word, v.phonetic, v.meaning, v.pos, v.grade,
         CASE WHEN w.is_core = 1 THEN 1 ELSE 0 END AS is_core,
         COALESCE(w.frequency_rank, 999999) AS freq_rank
  FROM vocabulary v
  LEFT JOIN zhongkao_weights w ON v.id = w.word_id
  ORDER BY is_core DESC, v.id ASC
`).all();

// Deduplicate by word string, keep first (core-prioritized)
const wordMap = new Map();
for (const row of allRows) {
  const key = row.word.toLowerCase().trim();
  if (!wordMap.has(key)) {
    wordMap.set(key, row);
  }
}

let allWords = Array.from(wordMap.values());

// 4. Split into core and extra
const coreWords = allWords.filter(w => w.is_core === 1);
const extraWords = allWords.filter(w => w.is_core === 0);

// 5. Build final list: all core + extra until 1500
// Prioritize extra words: noun/verb/adjective first
function priority(w) {
  if (w.pos === 'noun' || w.pos === 'verb' || w.pos === 'adjective') return 2;
  if (w.pos === 'adverb') return 1;
  return 0;
}
extraWords.sort((a, b) => priority(b) - priority(a));

let selected = [...coreWords];
let needed = 1500 - selected.length;
if (needed > 0) {
  selected = selected.concat(extraWords.slice(0, needed));
}

// 6. Sort by grade (difficulty), then by frequency rank within same grade
// Grade order: 7a < 7b < 8a < 8b < 9 (null last)
function gradeOrder(g) {
  const order = { '7a': 1, '7b': 2, '8a': 3, '8b': 4, '9': 5 };
  return order[g] || 99;
}

selected.sort((a, b) => {
  const ga = gradeOrder(a.grade);
  const gb = gradeOrder(b.grade);
  if (ga !== gb) return ga - gb;
  return a.freq_rank - b.freq_rank;
});

// 7. Round-robin distribute to 30 days
// Day 1 gets words[0], words[30], words[60]...
// Day 2 gets words[1], words[31], words[61]...
const days = Array.from({ length: 30 }, () => []);
for (let i = 0; i < selected.length; i++) {
  const dayIndex = i % 30;
  days[dayIndex].push(selected[i]);
}

// 8. Flatten with day info
const flatList = [];
for (let d = 0; d < 30; d++) {
  const dayWords = days[d];
  // Shuffle within each day to avoid all 7a words at beginning of each day
  for (let i = dayWords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dayWords[i], dayWords[j]] = [dayWords[j], dayWords[i]];
  }
  dayWords.forEach((w, idx) => {
    flatList.push({ day: d + 1, word_id: w.id, sort_order: idx });
  });
}

// 9. Insert
const insert = db.prepare('INSERT INTO word_plan_30d (day, word_id, sort_order) VALUES (?, ?, ?)');
const insertMany = db.transaction((items) => {
  for (const item of items) {
    insert.run(item.day, item.word_id, item.sort_order);
  }
});
insertMany(flatList);

// 10. Verify: check grade distribution per day
console.log('\nVerifying grade distribution per day (sample Days 1, 15, 30):');
for (const day of [1, 15, 30]) {
  const rows = db.prepare(`
    SELECT COALESCE(v.grade, 'unknown') as g, COUNT(*) as cnt
    FROM word_plan_30d p
    JOIN vocabulary v ON p.word_id = v.id
    WHERE p.day = ?
    GROUP BY v.grade
    ORDER BY cnt DESC
  `).all(day);
  console.log(`Day ${day}:`, rows.map(r => `${r.g}=${r.cnt}`).join(', '));
}

const total = db.prepare('SELECT COUNT(*) as cnt FROM word_plan_30d').get();
console.log(`\nTotal: ${total.cnt} words`);

// No duplicates check
const dupCheck = db.prepare(`
  SELECT day, COUNT(DISTINCT word_id) as unique_ids, COUNT(*) as total
  FROM word_plan_30d GROUP BY day HAVING unique_ids != total
`).all();
if (dupCheck.length > 0) {
  console.log('WARNING: Duplicates found:', dupCheck);
} else {
  console.log('No duplicates within any day.');
}

db.close();
console.log('Done.');
