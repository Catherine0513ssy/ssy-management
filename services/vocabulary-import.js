function normalizeWord(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function makeScopeKey(entry) {
  return `${entry.grade || ''}::${entry.unit || ''}`;
}

function normalizeEntry(entry) {
  return {
    word: normalizeWord(entry.word),
    phonetic: normalizeText(entry.phonetic),
    meaning: normalizeWord(entry.meaning),
    unit: normalizeText(entry.unit),
    grade: normalizeText(entry.grade),
    pos: normalizeText(entry.pos),
  };
}

function dedupeIncoming(entries) {
  const seen = new Set();
  const deduped = [];

  for (const entry of entries) {
    const key = `${entry.word.toLowerCase()}::${entry.grade || ''}::${entry.unit || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function replaceByUnitScope(db, entries) {
  const scopes = [...new Set(entries.map(makeScopeKey).filter((scope) => scope !== '::'))];
  const deleteScopeStmt = db.prepare(
    `DELETE FROM vocabulary
     WHERE COALESCE(grade, '') = ? AND COALESCE(unit, '') = ?`
  );

  let deleted = 0;
  for (const scope of scopes) {
    const [grade, unit] = scope.split('::');
    deleted += deleteScopeStmt.run(grade, unit).changes;
  }

  return { deleted, scopes };
}

function importVocabularyBatch(db, words, options = {}) {
  const mode = options.mode === 'replace' ? 'replace' : 'skip';
  const replaceScope = options.replaceScope || 'unit';

  const normalized = words
    .map(normalizeEntry)
    .filter((entry) => entry.word && entry.meaning);

  const incoming = dedupeIncoming(normalized);

  const result = {
    inserted: 0,
    skipped: words.length - normalized.length,
    replaced: 0,
    deleted: 0,
    scopesReplaced: [],
  };

  const runImport = db.transaction((items) => {
    const insertStmt = db.prepare(
      `INSERT INTO vocabulary (word, phonetic, meaning, unit, grade, pos, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const checkStmt = db.prepare('SELECT id FROM vocabulary WHERE word = ?');

    if (mode === 'replace' && replaceScope === 'unit') {
      const { deleted, scopes } = replaceByUnitScope(db, items);
      result.deleted = deleted;
      result.replaced = deleted;
      result.scopesReplaced = scopes;
    }

    for (const item of items) {
      if (mode === 'skip') {
        const existing = checkStmt.get(item.word);
        if (existing) {
          result.skipped += 1;
          continue;
        }
      }

      insertStmt.run(
        item.word,
        item.phonetic,
        item.meaning,
        item.unit,
        item.grade,
        item.pos
      );
      result.inserted += 1;
    }
  });

  runImport(incoming);
  return result;
}

module.exports = { importVocabularyBatch };
