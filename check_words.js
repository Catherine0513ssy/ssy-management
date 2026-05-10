const db = require('better-sqlite3')('/var/www/homework/ssy.db');

const words = ['train', 'ride', 'like', 'cook', 'right', 'free', 'may'];
for (const w of words) {
  const rows = db.prepare('SELECT id, word, grade, unit FROM vocabulary WHERE LOWER(word) = ?').all(w);
  console.log(w + ': ' + JSON.stringify(rows));
}

db.close();
