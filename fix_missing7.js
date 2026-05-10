const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// Fix the 7 missing words - move them from 9 to 7b
const missing = ['train', 'ride', 'like', 'cook', 'right', 'free', 'may'];
const placeholders = missing.map(() => '?').join(',');
const fixStmt = db.prepare("UPDATE vocabulary SET grade = '7b' WHERE word = ? AND grade = '9'");

let fixed = 0;
for (const word of missing) {
  const r = fixStmt.run(word);
  if (r.changes > 0) {
    console.log('Fixed: ' + word + ' (' + r.changes + ' rows)');
    fixed++;
  } else {
    // Try case-insensitive
    const r2 = db.prepare("UPDATE vocabulary SET grade = '7b' WHERE LOWER(word) = ? AND grade = '9'").run(word);
    if (r2.changes > 0) {
      console.log('Fixed (case): ' + word + ' (' + r2.changes + ' rows)');
      fixed++;
    } else {
      console.log('NOT FOUND: ' + word);
    }
  }
}

console.log('\nFixed ' + fixed + ' words');

// Final counts
const c7b = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b'").get();
const c9 = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '9'").get();
console.log('Final: 7b=' + c7b.c + ', 9=' + c9.c);

// Show 7b by unit
console.log('\n7b by unit:');
const byUnit = db.prepare("SELECT unit, COUNT(*) as c FROM vocabulary WHERE grade = '7b' GROUP BY unit ORDER BY unit").all();
byUnit.forEach(r => console.log('  ' + (r.unit||'null') + ': ' + r.c));

db.close();
