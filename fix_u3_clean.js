const db = require('better-sqlite3')('/var/www/homework/ssy.db');

const u3Words = ['ride a bike', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'minute',
  'far', 'kilometer', 'new', 'every', 'every day', 'by', 'by bike', 'drive', 'car',
  'live', 'stop', 'think of', 'cross', 'river', 'many', 'village', 'between',
  'between ... and ...', 'bridge', 'boat', 'ropeway', 'afraid', 'like',
  'villager', 'leave', 'dream', 'true', 'come true'];

// Only update unit for words that are already in grade 7b (leave 7a, 8a, 8b, 9 untouched)
const updateStmt = db.prepare("UPDATE vocabulary SET unit = 'U3' WHERE LOWER(word) = ? AND grade = '7b'");

let updated = 0;
for (const word of u3Words) {
  const r = updateStmt.run(word.toLowerCase());
  if (r.changes > 0) {
    console.log('Updated U3 (7b): ' + word);
    updated++;
  }
}

console.log('\nTotal 7b words set to U3: ' + updated);

// Show all 7b words with unit = U3
console.log('\nAll 7b words in U3:');
const u3_7b = db.prepare("SELECT word FROM vocabulary WHERE grade = '7b' AND unit = 'U3' ORDER BY word").all();
console.log('Count: ' + u3_7b.length);
u3_7b.forEach(w => console.log('  ' + w.word));

db.close();
