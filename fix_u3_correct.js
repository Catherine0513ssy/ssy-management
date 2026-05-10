const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// Correct U3 words from user's latest message
const correctU3Words = [
  'get to', 'train', 'bus', 'subway', 'take the subway', 'ride', 'bike', 'ride a bike',
  'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'minute', 'far', 'kilometer',
  'new', 'every', 'every day', 'by', 'by bike', 'drive', 'car', 'live', 'stop',
  'think of', 'cross', 'river', 'many', 'village', 'between', 'between ... and ...',
  'bridge', 'boat', 'ropeway', 'afraid', 'like', 'villager', 'leave', 'dream',
  'true', 'come true'
];

console.log('Correct U3 word count: ' + correctU3Words.length);

// Step 1: Clear unit=U3 from all 7b words (reset)
const resetStmt = db.prepare("UPDATE vocabulary SET unit = NULL WHERE grade = '7b' AND unit = 'U3'");
const resetR = resetStmt.run();
console.log('Reset ' + resetR.changes + ' words from previous U3 in 7b');

// Step 2: Set unit=U3 for correct U3 words that are in grade 7b
const updateStmt = db.prepare("UPDATE vocabulary SET unit = 'U3' WHERE LOWER(word) = ? AND grade = '7b'");
let updated = 0;
for (const word of correctU3Words) {
  const r = updateStmt.run(word.toLowerCase());
  if (r.changes > 0) {
    console.log('Set U3: ' + word);
    updated++;
  }
}

console.log('\nTotal updated to U3: ' + updated);

// Verify
const u3Count = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b' AND unit = 'U3'").get();
console.log('7b U3 total: ' + u3Count.c);

// Show all U3 words in 7b
const u3List = db.prepare("SELECT word FROM vocabulary WHERE grade = '7b' AND unit = 'U3' ORDER BY word").all();
console.log('\nAll 7b U3 words:');
u3List.forEach(w => console.log('  ' + w.word));

db.close();
