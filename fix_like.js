const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// Fix: move 'like' back to 7a (it was wrongly changed from 7a to 7b)
const r = db.prepare("UPDATE vocabulary SET grade = '7a' WHERE LOWER(word) = 'like' AND grade = '7b'").run();
console.log('Restored like to 7a: ' + r.changes + ' rows');

// Now set unit to U3 for all U3 words (but keep their original grades)
const u3Words = ['ride a bike', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'minute',
  'far', 'kilometer', 'new', 'every', 'every day', 'by', 'by bike', 'drive', 'car',
  'live', 'stop', 'think of', 'cross', 'river', 'many', 'village', 'between',
  'between ... and ...', 'bridge', 'boat', 'ropeway', 'afraid', 'like',
  'villager', 'leave', 'dream', 'true', 'come true'];

const updateUnit = db.prepare("UPDATE vocabulary SET unit = 'U3' WHERE LOWER(word) = ?");
let updated = 0;
for (const word of u3Words) {
  const r2 = updateUnit.run(word.toLowerCase());
  if (r2.changes > 0) updated++;
}
console.log('Set unit to U3: ' + updated + ' words');

// Verify U3 state
console.log('\nU3 words by grade:');
const byGrade = db.prepare("SELECT grade, COUNT(*) as c FROM vocabulary WHERE unit = 'U3' GROUP BY grade").all();
byGrade.forEach(g => console.log('  grade ' + g.grade + ': ' + g.c));

console.log('\nlike current state:');
const like = db.prepare("SELECT word, grade, unit FROM vocabulary WHERE LOWER(word) = 'like'").all();
console.log(JSON.stringify(like));

db.close();
