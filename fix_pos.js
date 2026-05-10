const db = require('better-sqlite3')('/var/www/homework/ssy.db');

// Extract POS from meaning field and update the pos column
// meaning format examples: "n.蛋；鸡蛋", "v.吃", "adj.好看的", "adv.很", "pron.他"

// First, let's see what POS values exist in meaning
const samples = db.prepare("SELECT word, meaning FROM vocabulary WHERE meaning LIKE 'n.%' LIMIT 5").all();
console.log('Samples with n.:', JSON.stringify(samples, null, 2));

// Map of meaning prefixes to normalized pos values
const posMap = {
  'n.': 'noun',
  'v.': 'verb',
  'adj.': 'adjective',
  'adv.': 'adverb',
  'pron.': 'pronoun',
  'prep.': 'preposition',
  'conj.': 'conjunction',
  'interj.': 'interjection',
  'num.': 'numeral',
  'modal v.': 'modal',
  'art.': 'article',
};

let updated = 0;
let skipped = 0;

const all = db.prepare("SELECT id, meaning FROM vocabulary WHERE pos IS NULL").all();
console.log(`Found ${all.length} words with NULL pos`);

for (const row of all) {
  if (!row.meaning) {
    skipped++;
    continue;
  }
  
  // Try to extract POS from beginning of meaning
  let found = false;
  for (const [prefix, normalized] of Object.entries(posMap)) {
    if (row.meaning.startsWith(prefix)) {
      db.prepare("UPDATE vocabulary SET pos = ? WHERE id = ?").run(normalized, row.id);
      updated++;
      found = true;
      break;
    }
  }
  if (!found) {
    skipped++;
  }
}

console.log(`Updated: ${updated} words, Skipped: ${skipped}`);

// Verify
const newPosCounts = db.prepare("SELECT pos, COUNT(*) as c FROM vocabulary GROUP BY pos ORDER BY c DESC").all();
console.log('New POS distribution:', JSON.stringify(newPosCounts, null, 2));

db.close();
