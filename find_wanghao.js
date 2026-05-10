const Database = require('better-sqlite3');
const db = new Database('/var/www/homework/ssy.db');

console.log('=== Tables ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log('-', t.name));

console.log('\n=== Searching for 王昊 ===');
const students = db.prepare("SELECT * FROM students WHERE name LIKE ?").all('%王昊%');
console.log('students:', students);

const records = db.prepare("SELECT * FROM checkin_records WHERE student_id LIKE ?").all('%王昊%');
console.log('checkin_records:', records);
