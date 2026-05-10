const db = require('better-sqlite3')('/var/www/homework/ssy.db');
// Get distinct pos values and counts
const posCounts = db.prepare("SELECT pos, COUNT(*) as c FROM vocabulary GROUP BY pos ORDER BY c DESC").all();
console.log('POS distribution:', JSON.stringify(posCounts, null, 2));
// Get sample words with pos
const samples = db.prepare("SELECT word, meaning, pos FROM vocabulary LIMIT 10").all();
console.log('Samples:', JSON.stringify(samples, null, 2));
db.close();
