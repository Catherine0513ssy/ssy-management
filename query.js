const db = require('better-sqlite3')('/var/www/homework/ssy.db');
const total = db.prepare('SELECT COUNT(*) as c FROM vocabulary').get();
const withMeaning = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE meaning IS NOT NULL AND meaning != ''").get();
console.log('Total:', total.c, 'With meaning:', withMeaning.c);
const samples = db.prepare('SELECT id, word, meaning FROM vocabulary LIMIT 5').all();
console.log('Samples:', JSON.stringify(samples, null, 2));
db.close();
