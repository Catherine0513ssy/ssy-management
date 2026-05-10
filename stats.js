const db = require('better-sqlite3')('/var/www/homework/ssy.db');
const verbs = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE pos = 'verb'").get();
const adjNouns = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE pos = 'adjective' OR pos = 'noun'").get();
const others = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE pos NOT IN ('verb','adjective','noun') AND pos IS NOT NULL").get();
const nullPos = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE pos IS NULL").get();
const total = db.prepare('SELECT COUNT(*) as c FROM vocabulary').get();
console.log('Verbs:', verbs.c, 'Adj/Noun:', adjNouns.c, 'Others:', others.c, 'Null pos:', nullPos.c, 'Total:', total.c);
// Show some verb samples
const verbSamples = db.prepare("SELECT word, meaning FROM vocabulary WHERE pos = 'verb' LIMIT 5").all();
console.log('Verb samples:', JSON.stringify(verbSamples, null, 2));
db.close();
