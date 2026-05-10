const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// U3 complete word list from user (36 words)
const u3Words = [
  'ride a bike', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'minute',
  'far', 'kilometer', 'new', 'every', 'every day', 'by', 'by bike', 'drive', 'car',
  'live', 'stop', 'think of', 'cross', 'river', 'many', 'village', 'between',
  'between ... and ...', 'bridge', 'boat', 'ropeway', 'afraid', 'like',
  'villager', 'leave', 'dream', 'true', 'come true'
];

console.log('U3 words from user: ' + u3Words.length);

// Check current state of U3 words in DB
const u3InDb = db.prepare("SELECT word, grade, unit FROM vocabulary WHERE LOWER(word) IN (" + u3Words.map(() => '?').join(',') + ")").all(...u3Words.map(w => w.toLowerCase()));
console.log('\nFound ' + u3InDb.length + ' U3 words in DB:');
u3InDb.forEach(w => console.log('  ' + w.word + ' | grade=' + w.grade + ' | unit=' + w.unit));

// Update all U3 words to grade 7b
const updateStmt = db.prepare("UPDATE vocabulary SET grade = '7b' WHERE LOWER(word) = ?");
let updated = 0;
for (const word of u3Words) {
  const r = updateStmt.run(word.toLowerCase());
  if (r.changes > 0) {
    console.log('Updated: ' + word);
    updated++;
  }
}

console.log('\nTotal updated: ' + updated);

// Show 7b U3 count now
const c = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b' AND unit = 'U3'").get();
console.log('7b U3 now: ' + c.c);

db.close();
