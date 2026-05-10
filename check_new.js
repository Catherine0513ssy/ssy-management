const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// 看最近添加的词（按ID倒序）
const recent = db.prepare('SELECT id, word, meaning, grade, unit, source, created_at FROM vocabulary ORDER BY id DESC LIMIT 30').all();
console.log('最近添加的30个词:');
for (const w of recent) {
  console.log(JSON.stringify(w));
}

// 按年级统计
const byGrade = db.prepare('SELECT grade, COUNT(*) as c FROM vocabulary GROUP BY grade ORDER BY id DESC').all();
console.log('\n按年级统计:');
for (const g of byGrade) {
  console.log(g.grade + ': ' + g.c + '个');
}

// 按source统计
const bySource = db.prepare('SELECT source, COUNT(*) as c FROM vocabulary GROUP BY source').all();
console.log('\n按来源统计:');
for (const s of bySource) {
  console.log((s.source||'null') + ': ' + s.c + '个');
}

db.close();
