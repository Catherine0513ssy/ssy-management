
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = '/var/www/homework/ssy.db';
const db = new sqlite3.Database(dbPath);

function normalizeDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
}

const tables = [
  'homework_items',
  'essay_tasks',
  'choice_fill_questions',
  'checkin_records',
  'excellent_homework',
  'quiz_papers',
  'daily_quiz'
];

db.serialize(() => {
  tables.forEach(table => {
    db.all(`SELECT DISTINCT date FROM ${table} WHERE length(date) != 10 OR date NOT LIKE '____-__-__'`, (err, rows) => {
      if (err) {
        console.error(`Error reading ${table}:`, err.message);
        return;
      }
      if (!rows || rows.length === 0) {
        console.log(`${table}: OK`);
        return;
      }
      rows.forEach(row => {
        const oldDate = row.date;
        const newDate = normalizeDate(oldDate);
        if (oldDate !== newDate) {
          db.run(`UPDATE ${table} SET date = ? WHERE date = ?`, [newDate, oldDate], function(err) {
            if (err) {
              console.error(`Error updating ${table}:`, err.message);
            } else {
              console.log(`${table}: ${oldDate} -> ${newDate} (${this.changes} rows)`);
            }
          });
        }
      });
    });
  });
});

setTimeout(() => {
  db.close();
  console.log('Done');
}, 3000);

