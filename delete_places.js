const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// Place names and person names to delete from 7b grade
const placeNames = [
  // Countries
  'Australia', 'south africa', 'Canada', 'Europe', 'india', 'Thailand', 'thailand', 'Thai',
  'Korea', 'Switzerland', 'France', 'Germany', 'Italy', 'Italian',
  // Nationalities/adjectives
  'African', 'South African', 'Canadian', 'European', 'Indian', 'Thai', 'Russian',
  'Asian', 'British', 'American', 'Australian', 'Northern', 'Eastern', 'Western',
  // Cities, places
  'Dragon Boat Festival', 'Mid-autumn Festival', 'high school',
  // Person names
  'Becky', 'becky', 'Claire', 'claire', 'Sue', 'sue',
  'Midsummer', 'midsummer',
  // Other geographic
  'Italy', 'italian',
];

const deleteNames = db.prepare(`DELETE FROM vocabulary WHERE grade = '7b' AND (${placeNames.map(n => "word = ?").join(' OR ')})`);
const r = deleteNames.run(...placeNames);
console.log('Deleted ' + r.changes + ' place/person name entries from 7b');

// Verify current 7b count
const c = db.prepare("SELECT COUNT(*) as c FROM vocabulary WHERE grade = '7b'").get();
console.log('7b words remaining: ' + c.c);

// Show remaining 7b words that might be places (sample)
const possiblePlaces = db.prepare("SELECT word, meaning FROM vocabulary WHERE grade = '7b' AND (word LIKE '%China%' OR word LIKE '%china%' OR word LIKE '%York%' OR word LIKE '%york%' OR word LIKE '%land%' OR word LIKE '%land%') LIMIT 20").all();
if (possiblePlaces.length > 0) {
  console.log('\nPossible remaining place names:');
  possiblePlaces.forEach(w => console.log('  ' + w.word + ': ' + w.meaning));
}

db.close();
