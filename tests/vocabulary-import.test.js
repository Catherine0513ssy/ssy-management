const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initDB } = require('../services/db');
const { importVocabularyBatch } = require('../services/vocabulary-import');

function makeTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssy-vocab-import-'));
  const dbPath = path.join(tempDir, 'ssy.db');
  const db = initDB(dbPath);
  return { db, tempDir };
}

test('importVocabularyBatch in replace mode replaces existing rows in the same grade and unit', () => {
  const { db, tempDir } = makeTempDb();

  try {
    db.prepare(
      `INSERT INTO vocabulary (word, meaning, grade, unit, created_at)
       VALUES
       ('name', '旧释义', '7a', 'U1', datetime('now')),
       ('nice', '旧的 nice', '7a', 'U1', datetime('now')),
       ('banana', '不应删除', '7a', 'U2', datetime('now'))`
    ).run();

    const result = importVocabularyBatch(db, [
      { word: 'name', meaning: '名字；名称', grade: '7a', unit: 'U1', phonetic: '/neim/', pos: 'n.' },
      { word: 'meet', meaning: '遇见；相逢', grade: '7a', unit: 'U1', phonetic: '/mi:t/', pos: 'v.' },
      { word: 'meet', meaning: '重复项应折叠', grade: '7a', unit: 'U1' },
    ], { mode: 'replace', replaceScope: 'unit' });

    assert.deepEqual(result, {
      inserted: 2,
      skipped: 0,
      replaced: 2,
      deleted: 2,
      scopesReplaced: ['7a::U1'],
    });

    const rows = db.prepare(
      `SELECT word, meaning, grade, unit
       FROM vocabulary
       ORDER BY unit, word`
    ).all();

    assert.deepEqual(rows, [
      { word: 'meet', meaning: '遇见；相逢', grade: '7a', unit: 'U1' },
      { word: 'name', meaning: '名字；名称', grade: '7a', unit: 'U1' },
      { word: 'banana', meaning: '不应删除', grade: '7a', unit: 'U2' },
    ]);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('importVocabularyBatch in skip mode keeps existing words and skips duplicates', () => {
  const { db, tempDir } = makeTempDb();

  try {
    db.prepare(
      `INSERT INTO vocabulary (word, meaning, grade, unit, created_at)
       VALUES ('name', '已有释义', '7a', 'U1', datetime('now'))`
    ).run();

    const result = importVocabularyBatch(db, [
      { word: 'name', meaning: '新释义', grade: '7a', unit: 'U1' },
      { word: 'meet', meaning: '遇见；相逢', grade: '7a', unit: 'U1' },
    ], { mode: 'skip' });

    assert.deepEqual(result, {
      inserted: 1,
      skipped: 1,
      replaced: 0,
      deleted: 0,
      scopesReplaced: [],
    });

    const rows = db.prepare(
      `SELECT word, meaning FROM vocabulary ORDER BY word`
    ).all();

    assert.deepEqual(rows, [
      { word: 'meet', meaning: '遇见；相逢' },
      { word: 'name', meaning: '已有释义' },
    ]);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
