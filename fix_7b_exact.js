const fs = require('fs');
const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// Step 1: Reset ALL 7b words back to 9
const resetResult = db.prepare("UPDATE vocabulary SET grade = '9' WHERE grade = '7b'").run();
console.log('Step 1: Reset ' + resetResult.changes + ' words back to grade 9');

// Step 2: Load user's word list
const userWords = new Set(
  fs.readFileSync('/tmp/user_words.txt', 'utf8')
    .split('\n')
    .map(line => line.trim().toLowerCase())
    .filter(w => w.length > 0)
);
console.log('Step 2: User provided ' + userWords.size + ' unique words');

// Step 3: Find matching words in DB (case-insensitive)
const allWords = db.prepare("SELECT id, word, unit FROM vocabulary WHERE grade = '9'").all();
const matches = allWords.filter(w => userWords.has(w.word.toLowerCase()));

console.log('\nStep 3: Found ' + matches.length + ' matching words in DB:');
const byUnit = {};
for (const w of matches) {
  if (!byUnit[w.unit]) byUnit[w.unit] = [];
  byUnit[w.unit].push(w.word);
}
for (const [unit, words] of Object.entries(byUnit)) {
  console.log('  ' + (unit||'null') + ': ' + words.length + ' words');
}

// Step 4: Update matches to 7b
const updateStmt = db.prepare("UPDATE vocabulary SET grade = '7b' WHERE id = ?");
let updated = 0;
for (const w of matches) {
  updateStmt.run(w.id);
  updated++;
}
console.log('\nStep 4: Updated ' + updated + ' words to grade 7b');

// Final stats
const final7b = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b'").get();
const final9 = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '9'").get();
console.log('\nFinal: 7b=' + final7b.c + ' words, 9=' + final9.c + ' words');

db.close();
