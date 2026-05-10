const db = require('better-sqlite3')('/var/www/homework/ssy.db');

console.log('=== Final grade stats ===');
const byGrade = db.prepare('SELECT grade, COUNT(*) as c FROM vocabulary GROUP BY grade ORDER BY grade').all();
byGrade.forEach(r => console.log('Grade ' + (r.grade||'null') + ': ' + r.c + ' words'));

console.log('\n=== 7b units ===');
const byUnit = db.prepare("SELECT unit, COUNT(*) as c FROM vocabulary WHERE grade = '7b' GROUP BY unit ORDER BY unit").all();
byUnit.forEach(r => console.log('  ' + (r.unit||'null') + ': ' + r.c));

console.log('\n=== 9 units ===');
const byUnit9 = db.prepare("SELECT unit, COUNT(*) as c FROM vocabulary WHERE grade = '9' GROUP BY unit ORDER BY unit").all();
byUnit9.forEach(r => console.log('  ' + (r.unit||'null') + ': ' + r.c));

console.log('\nTotal 7b: ' + db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b'").get().c);
console.log('Total 9: ' + db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '9'").get().c);

db.close();
