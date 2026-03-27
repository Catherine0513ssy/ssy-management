const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const Database = require('better-sqlite3');

test('vocabulary and quiz APIs organize words by grade and unit and support unit selection', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssy-grade-unit-'));
  const dbPath = path.join(tempDir, 'ssy.db');
  const serverPath = path.join(__dirname, '..', 'server.js');

  process.env.DB_PATH = dbPath;
  process.env.DISABLE_BACKUPS = 'true';
  process.env.HOST = '127.0.0.1';

  delete require.cache[require.resolve(serverPath)];
  const { startServer } = require(serverPath);
  const server = startServer(0, '127.0.0.1');
  if (!server.listening) {
    await once(server, 'listening');
  }

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const db = new Database(dbPath);

  const request = async (pathname, options = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const text = await response.text();
    return { response, data: JSON.parse(text) };
  };

  try {
    db.prepare(
      `INSERT INTO classes (id, name, display_name)
       VALUES (1, '2313', '2313班')`
    ).run();
    db.prepare(
      `INSERT INTO auth_tokens (token, created_at, expires_at)
       VALUES ('token-1', datetime('now'), datetime('now', '+10 minutes'))`
    ).run();
    db.prepare(
      `INSERT INTO vocabulary (word, meaning, grade, unit, created_at)
       VALUES
       ('name', '名字', '7a', 'U1', datetime('now')),
       ('meet', '遇见', '7a', 'U1', datetime('now')),
       ('sister', '姐姐', '7a', 'U2', datetime('now')),
       ('vacation', '假期', '8a', 'U1', datetime('now'))`
    ).run();

    let result = await request('/api/vocabulary?grade=7a&unit=U1');
    assert.equal(result.response.status, 200);
    assert.equal(result.data.total, 2);
    assert.deepEqual(result.data.words.map((w) => w.word), ['name', 'meet']);

    result = await request('/api/vocabulary/stats');
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data.byGrade, { '7a': 3, '8a': 1 });
    assert.deepEqual(result.data.byUnit, {
      '7a:U1': 2,
      '7a:U2': 1,
      '8a:U1': 1,
    });

    result = await request('/api/quiz/all');
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data.unitsByGrade, {
      '7a': ['U1', 'U2'],
      '8a': ['U1'],
    });
    assert.deepEqual(Object.keys(result.data.words['7a']), ['U1', 'U2']);
    assert.equal(result.data.words['7a']['U1'].length, 2);

    result = await request('/api/quiz/meta');
    assert.equal(result.response.status, 200);
    assert.equal(result.data.total, 4);
    assert.deepEqual(result.data.unitsByGrade, {
      '7a': ['U1', 'U2'],
      '8a': ['U1'],
    });
    assert.deepEqual(result.data.countsByGradeUnit, {
      '7a:U1': 2,
      '7a:U2': 1,
      '8a:U1': 1,
    });

    result = await request('/api/quiz/generate', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        class_id: 1,
        grade: '7a',
        units: ['U2'],
        count: 10,
      }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.words.length, 1);
    assert.equal(result.data.words[0].word, 'sister');
  } finally {
    db.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
