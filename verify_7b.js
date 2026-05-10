const fs = require('fs');
const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// Read user's word list
const userWords = new Set();

// Parse all words from user's data (U1-U12)
const lines = fs.readFileSync('/tmp/user_words.txt', 'utf8').split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  // Extract word (first field, lowercase)
  const word = trimmed.split('|')[0].trim().toLowerCase();
  if (word) userWords.add(word);
}

console.log('User provided words for 7B (U1-U12): ' + userWords.size);

// Check which 7b words in DB match user's list
const db7bWords = db.prepare("SELECT id, word, meaning, unit FROM vocabulary WHERE grade = '7b'").all();
console.log('\nDatabase 7b words: ' + db7bWords.length);

const inUserList = [];
const notInUserList = [];

for (const w of db7bWords) {
  if (userWords.has(w.word.toLowerCase())) {
    inUserList.push(w);
  } else {
    notInUserList.push(w);
  }
}

console.log('\n=== Words in DB 7b that ARE in user list: ' + inUserList.length + ' ===');
// Show by unit
const byUnit = {};
for (const w of inUserList) {
  if (!byUnit[w.unit]) byUnit[w.unit] = [];
  byUnit[w.unit].push(w.word);
}
for (const [unit, words] of Object.entries(byUnit)) {
  console.log(unit + ': ' + words.length + ' words');
}

console.log('\n=== Words in DB 7b that are NOT in user list (should be moved back to 9): ' + notInUserList.length + ' ===');
for (const w of notInUserList.slice(0, 50)) {
  console.log('  ' + w.word + ' (' + w.unit + ')');
}
if (notInUserList.length > 50) {
  console.log('  ... and ' + (notInUserList.length - 50) + ' more');
}

db.close();
