const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// 看9年级的单元分布和样本词
const units9 = db.prepare("SELECT unit, COUNT(*) as c FROM vocabulary WHERE grade = '9' GROUP BY unit ORDER BY unit").all();
console.log('9年级各单元:');
for (const u of units9) {
  const samples = db.prepare("SELECT word, meaning FROM vocabulary WHERE grade = '9' AND unit = ? LIMIT 2").all(u.unit);
  const sampleStr = samples.map(s => s.word).join(', ');
  console.log((u.unit||'无单元') + ': ' + u.c + ' - ' + sampleStr);
}

db.close();
