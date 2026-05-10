const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// 分析null年级词的单元分布，以及每个单元的样本词
const units = db.prepare("SELECT unit, COUNT(*) as c FROM vocabulary WHERE grade IS NULL GROUP BY unit ORDER BY unit").all();
console.log('各单元词数:');
for (const u of units) {
  const samples = db.prepare("SELECT word, meaning FROM vocabulary WHERE grade IS NULL AND unit = ? LIMIT 3").all(u.unit);
  const sampleStr = samples.map(s => s.word + '(' + s.meaning + ')').join(', ');
  console.log((u.unit||'无单元') + ': ' + u.c + '个 - 示例: ' + sampleStr);
}

// 看一下各年级原本的单元范围
console.log('\n各年级现有单元:');
const gradeUnits = db.prepare("SELECT DISTINCT grade, unit FROM vocabulary WHERE grade IN ('7a','7b','8a','8b','9') ORDER BY grade, unit").all();
for (const gu of gradeUnits) {
  console.log(gu.grade + ': ' + gu.unit);
}

db.close();
