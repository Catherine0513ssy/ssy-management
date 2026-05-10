const db = require('better-sqlite3')('/var/www/homework/ssy.db');

const byUnit = db.prepare("SELECT unit, COUNT(*) as c FROM vocabulary WHERE grade IS NULL GROUP BY unit ORDER BY c DESC").all();
console.log('Null年级按单元分布:');
for (const u of byUnit) {
  console.log((u.unit||'无单元') + ': ' + u.c + '个');
}

const existing7b = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b'").get();
const existing9 = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '9'").get();
console.log('\n已有7b: ' + existing7b.c + '个');
console.log('已有9年级: ' + existing9.c + '个');

const samples = db.prepare("SELECT id, word, meaning, unit FROM vocabulary WHERE id >= 3000 ORDER BY id ASC LIMIT 20").all();
console.log('\nID>=3000的词（最新导入的）:');
for (const w of samples) {
  console.log(w.id + ' ' + w.word + ' | ' + w.unit);
}

db.close();
