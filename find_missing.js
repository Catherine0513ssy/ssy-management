const fs = require('fs');
const db = require('better-sqlite3')('/var/www/homework/ssy.db');

const userWords = new Set(
  fs.readFileSync('/tmp/user_words.txt', 'utf8')
    .split('\n')
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0)
);

const all9Words = db.prepare('SELECT word FROM vocabulary WHERE grade = 9').all().map(w => w.word.toLowerCase());
const allWords = new Set(all9Words);

const missing = [...userWords].filter(w => !allWords.has(w));
console.log('Missing words (not found in DB at all): ' + missing.length);
missing.forEach(w => console.log('  ' + w));

db.close();
