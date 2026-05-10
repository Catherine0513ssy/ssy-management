const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// U2 words from user
const u2Words = [
  'up', 'get up', 'dress', 'get dressed', 'brush', 'tooth', 'shower', 'take a shower',
  'usually', 'forty', 'wow', 'never', 'early', 'fifty', 'job', 'work', 'radio station',
  'funny', 'exercise', 'on weekends', 'best', 'group', 'half', 'past', 'quarter',
  'homework', 'do (one\'s) homework', 'run', 'clean', 'walk', 'take a walk', 'quickly',
  'either ... or ...', 'lots of', 'sometimes', 'taste', 'life', 'station', 'night'
];

console.log('U2 words count: ' + u2Words.length);

// Reset U2 unit for 7b first
const resetStmt = db.prepare("UPDATE vocabulary SET unit = NULL WHERE grade = '7b' AND unit = 'U2'");
const resetR = resetStmt.run();
console.log('Reset ' + resetR.changes + ' words from previous U2 in 7b');

// Set unit=U2 for correct U2 words in grade 7b
const updateStmt = db.prepare("UPDATE vocabulary SET unit = 'U2' WHERE LOWER(word) = ? AND grade = '7b'");
let updated = 0;
for (const word of u2Words) {
  const r = updateStmt.run(word.toLowerCase());
  if (r.changes > 0) {
    console.log('Set U2: ' + word);
    updated++;
  }
}

console.log('\nTotal updated to U2: ' + updated);

// Verify
const u2Count = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b' AND unit = 'U2'").get();
console.log('7b U2 total: ' + u2Count.c);

const u2List = db.prepare("SELECT word FROM vocabulary WHERE grade = '7b' AND unit = 'U2' ORDER BY word").all();
console.log('\nAll 7b U2 words:');
u2List.forEach(w => console.log('  ' + w.word));

db.close();
