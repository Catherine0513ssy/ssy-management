#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { initDB } = require('../services/db');
const { importVocabularyBatch } = require('../services/vocabulary-import');

function printHelp() {
  console.log(`Usage: node scripts/import-vocabulary-json.js --input /path/file.json [options]

Options:
  --db /path/ssy.db        Override database path
  --mode replace|skip      Import mode, default: replace
  --replace-scope unit     Replace scope, default: unit
  --dry-run                Print what would be imported, do not write
`);
}

function parseArgs(argv) {
  const options = {
    input: '',
    dbPath: '',
    mode: 'replace',
    replaceScope: 'unit',
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--input' || arg === '-i') && argv[i + 1]) {
      options.input = argv[i + 1];
      i += 1;
    } else if (arg === '--db' && argv[i + 1]) {
      options.dbPath = argv[i + 1];
      i += 1;
    } else if (arg === '--mode' && argv[i + 1]) {
      options.mode = argv[i + 1];
      i += 1;
    } else if (arg === '--replace-scope' && argv[i + 1]) {
      options.replaceScope = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.input) {
    printHelp();
    process.exit(1);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const entries = Array.isArray(payload) ? payload : (payload.entries || []);

  if (!entries.length) {
    throw new Error('No entries found in input JSON');
  }

  if (options.dryRun) {
    const scopes = [...new Set(entries.map((entry) => `${entry.grade || ''}:${entry.unit || ''}`))];
    console.log(JSON.stringify({
      input: inputPath,
      totalEntries: entries.length,
      mode: options.mode,
      replaceScope: options.replaceScope,
      scopes,
    }, null, 2));
    return;
  }

  const db = initDB(options.dbPath || undefined);
  const result = importVocabularyBatch(db, entries, {
    mode: options.mode,
    replaceScope: options.replaceScope,
  });

  console.log(JSON.stringify({
    input: inputPath,
    dbPath: options.dbPath || path.join(__dirname, '..', 'ssy.db'),
    totalEntries: entries.length,
    result,
  }, null, 2));
}

main();
