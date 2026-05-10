const fs = require('fs');
const db = require('better-sqlite3')('/var/www/homework/ssy.db');

const userWords = new Set(
  fs.readFileSync('/tmp/user_words.txt', 'utf8')
    .split('\n')
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0)
);

const allWords = db.prepare('SELECT word FROM vocabulary').all().map(w => w.word.toLowerCase());
const allWordsSet = new Set(allWords);

const missingFromDB = [...userWords].filter(w => !allWordsSet.has(w));
console.log('User words NOT in DB at all: ' + missingFromDB.length);
missingFromDB.slice(0, 20).forEach(w => console.log('  ' + w));
if (missingFromDB.length > 20) console.log('  ... and ' + (missingFromDB.length - 20) + ' more');

const now7b = db.prepare("SELECT word FROM vocabulary WHERE grade = '7b'").all().map(w => w.word.toLowerCase());
const now7bSet = new Set(now7b);
const notMovedTo7b = [...userWords].filter(w => allWordsSet.has(w) && !now7bSet.has(w));
console.log('\nUser words IN DB but NOT in 7b: ' + notMovedTo7b.length);
notMovedTo7b.slice(0, 30).forEach(w => console.log('  ' + w));
if (notMovedTo7b.length > 30) console.log('  ... and ' + (notMovedTo7b.length - 30) + ' more');

db.close();
