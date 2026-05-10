const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// U1-U12 units for Grade 7B (七年级下册)
const units7b = [
  'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12'
];

// First, find all words currently grade='9' that have units U1-U12
// These are the ones that should be changed to '7b'
const toUpdate = db.prepare(`
  SELECT id, word, meaning, unit, grade 
  FROM vocabulary 
  WHERE grade = '9' AND unit IN (${units7b.map(u => '?').join(',')})
`).all(...units7b);

console.log('Words to update from 9 -> 7b: ' + toUpdate.length);
toUpdate.forEach(w => console.log('  ' + w.word + ' | ' + w.unit));

// Update them
const updateStmt = db.prepare("UPDATE vocabulary SET grade = '7b' WHERE id = ?");
let updated = 0;
for (const w of toUpdate) {
  updateStmt.run(w.id);
  updated++;
}
console.log('\nUpdated: ' + updated + ' words');

// Show remaining 9th grade words
const remaining9 = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '9'").get();
console.log('Remaining 9th grade words: ' + remaining9.c);

// Show new 7b count
const new7b = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b'").get();
console.log('Total 7b words now: ' + new7b.c);

// Show 9th grade units after update
const nineUnits = db.prepare("SELECT unit, COUNT(*) as c FROM vocabulary WHERE grade = '9' GROUP BY unit ORDER BY unit").all();
console.log('\n9th grade remaining units:');
nineUnits.forEach(u => console.log('  ' + (u.unit||'null') + ': ' + u.c));

db.close();
