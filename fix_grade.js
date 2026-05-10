const db = require('better-sqlite3')('/var/www/homework/ssy.db');

const nullCount = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade IS NULL").get();
console.log('待更新: ' + nullCount.c + '个词');

const result = db.prepare("UPDATE vocabulary SET grade = '9' WHERE grade IS NULL").run();
console.log('已更新: ' + result.changes + '个词');

const newStats = db.prepare("SELECT grade, COUNT(*) as c FROM vocabulary GROUP BY grade ORDER BY grade").all();
console.log('\n更新后按年级统计:');
for (const g of newStats) {
  console.log((g.grade||'null') + ': ' + g.c);
}

db.close();
