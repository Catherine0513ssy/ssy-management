const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// Normalize all POS values to a clean format
const normalizationMap = {
  'n.': 'noun',
  'noun': 'noun',
  'v.': 'verb',
  'verb': 'verb',
  'adj.': 'adjective',
  'adjective': 'adjective',
  'adv.': 'adverb',
  'adverb': 'adverb',
  'pron.': 'pronoun',
  'pronoun': 'pronoun',
  'prep.': 'preposition',
  'preposition': 'preposition',
  'conj.': 'conjunction',
  'conjunction': 'conjunction',
  'interj.': 'interjection',
  'interjection': 'interjection',
  'num.': 'numeral',
  'numeral': 'numeral',
  'modal v.': 'modal',
  'modal': 'modal',
  'art.': 'article',
  'article': 'article',
};

// Normalize pos column
const updateStmt = db.prepare("UPDATE vocabulary SET pos = ? WHERE id = ?");
const updateMany = db.transaction((rows) => {
  for (const [id, newPos] of rows) {
    updateStmt.run(newPos, id);
  }
});

const allWithPos = db.prepare("SELECT id, pos FROM vocabulary WHERE pos IS NOT NULL").all();
const toUpdate = [];
for (const row of allWithPos) {
  const normalized = normalizationMap[row.pos];
  if (normalized && normalized !== row.pos) {
    toUpdate.push([row.id, normalized]);
  }
}

if (toUpdate.length > 0) {
  updateMany(toUpdate);
  console.log(`Normalized ${toUpdate.length} POS values`);
}

// Now also extract POS from meaning for words where pos is still NULL
const posPatterns = [
  { prefix: 'n.', pos: 'noun' },
  { prefix: 'v.', pos: 'verb' },
  { prefix: 'adj.', pos: 'adjective' },
  { prefix: 'adv.', pos: 'adverb' },
  { prefix: 'pron.', pos: 'pronoun' },
  { prefix: 'prep.', pos: 'preposition' },
  { prefix: 'conj.', pos: 'conjunction' },
  { prefix: 'interj.', pos: 'interjection' },
  { prefix: 'num.', pos: 'numeral' },
  { prefix: 'modal v.', pos: 'modal' },
  { prefix: 'art.', pos: 'article' },
];

const nullPosWords = db.prepare("SELECT id, meaning FROM vocabulary WHERE pos IS NULL").all();
const toExtract = [];
for (const row of nullPosWords) {
  if (!row.meaning) continue;
  for (const { prefix, pos } of posPatterns) {
    if (row.meaning.startsWith(prefix)) {
      toExtract.push([row.id, pos]);
      break;
    }
  }
}

if (toExtract.length > 0) {
  updateMany(toExtract);
  console.log(`Extracted POS for ${toExtract.length} words from meaning`);
}

// Final stats
const finalCounts = db.prepare("SELECT pos, COUNT(*) as c FROM vocabulary GROUP BY pos ORDER BY c DESC").all();
console.log('Final POS distribution:', JSON.stringify(finalCounts, null, 2));
console.log('Total words:', finalCounts.reduce((s, r) => s + r.c, 0));

db.close();
