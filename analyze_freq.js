const db = require('better-sqlite3')('/var/www/homework/ssy.db');

const words = db.prepare('SELECT word, meaning, pos, grade, unit FROM vocabulary').all();

const wordStats = {};
for (const w of words) {
  if (!wordStats[w.word]) {
    wordStats[w.word] = { count: 0, grades: new Set(), units: new Set(), meaning: w.meaning, pos: w.pos };
  }
  wordStats[w.word].count++;
  if (w.grade) wordStats[w.word].grades.add(w.grade);
  if (w.unit) wordStats[w.word].units.add(w.unit);
}

const sorted = Object.entries(wordStats)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 50);

console.log('Top 50 most frequent words:');
for (const [word, stats] of sorted) {
  console.log(word + ' | ' + stats.meaning + ' | pos:' + stats.pos + ' | count:' + stats.count + ' | grades:' + [...stats.grades].join(','));
}

db.close();
