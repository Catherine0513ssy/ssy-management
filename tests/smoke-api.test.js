const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const Database = require('better-sqlite3');

test('smoke: homepage, homework, upload, and essay task flows work against a temp DB', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssy-smoke-'));
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

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const db = new Database(dbPath);
  const createdFiles = [];

  const request = async (pathname, options = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { response, data };
  };

  try {
    db.prepare(
      `INSERT INTO classes (id, name, display_name)
       VALUES (1, '2313', '2313班')`
    ).run();
    db.prepare(
      `INSERT INTO settings (key, value)
       VALUES ('auth_password_plain', 'secret123')`
    ).run();
    db.prepare(
      `INSERT INTO student_groups (id, class_id, name, sort_order)
       VALUES
       (1, 1, '第一组', 1),
       (2, 1, '第二组', 2)`
    ).run();
    db.prepare(
      `INSERT INTO students (class_id, group_id, name, sort_order, active)
       VALUES
       (1, 1, '张三', 0, 1),
       (1, 1, '李四', 1, 1),
       (1, 2, '王五', 0, 1)`
    ).run();
    db.prepare(
      `INSERT INTO vocabulary (word, phonetic, meaning, unit, grade, pos, created_at)
       VALUES
       ('apple', '/ˈæpəl/', '苹果', 'Unit 1', '7a', 'n.', datetime('now')),
       ('banana', '/bəˈnænə/', '香蕉', 'Unit 1', '7a', 'n.', datetime('now'))`
    ).run();

    let result = await request('/');
    assert.equal(result.response.status, 200);
    assert.match(result.data, /SSY|作文|作业|词汇/);

    result = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret123' }),
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.data.token);
    const token = result.data.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    result = await request('/api/auth/status', { headers: authHeaders });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.loggedIn, true);

    result = await request('/api/admin/classes', { headers: authHeaders });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].student_count, 3);

    result = await request('/api/vocabulary', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: 'cat', meaning: '猫', grade: '7a', unit: 'Unit 1', pos: 'n.' }),
    });
    assert.equal(result.response.status, 200);
    const catId = result.data.word.id;

    result = await request('/api/vocabulary/batch', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        words: [
          { word: 'dog', meaning: '狗', grade: '7a', unit: 'Unit 1', pos: 'n.' },
          { word: 'apple', meaning: '苹果', grade: '7a', unit: 'Unit 1', pos: 'n.' },
        ],
      }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.inserted, 1);
    assert.equal(result.data.skipped, 1);

    result = await request('/api/vocabulary?grade=7a&search=a');
    assert.equal(result.response.status, 200);
    assert.ok(result.data.total >= 3);

    result = await request(`/api/vocabulary/${catId}`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ meaning: '小猫' }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.word.meaning, '小猫');

    result = await request('/api/checkin/2026-03-27', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: 1,
        type: 'word',
        round: 1,
        passed: { '1': [0], '2': [0] },
      }),
    });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data.passed, { '1': [0], '2': [0] });

    result = await request('/api/checkin/2026-03-27?class_id=1&type=word&round=1');
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data.passed, { '1': [0], '2': [0] });

    result = await request('/api/checkin/missing?class_id=1&type=word&round=1&date=2026-03-27');
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data.missing, { '1': ['李四'] });

    result = await request('/api/quiz/generate', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: 1, grade: '7a', count: 2 }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.words.length, 2);

    result = await request('/api/quiz/words?class_id=1');
    assert.equal(result.response.status, 200);
    assert.equal(result.data.words.length, 2);

    result = await request('/api/homework?class_id=1');
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data.items, []);

    result = await request('/api/homework', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: 1, date: '2026-03-27', text: 'SMOKE_TEXT' }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.items.at(-1).text, 'SMOKE_TEXT');
    const jsonHomeworkId = result.data.items.at(-1).id;

    const form = new FormData();
    form.append('class_id', '1');
    form.append('date', '2026-03-27');
    form.append('text', 'UPLOAD_TEXT');
    form.append('image', new Blob(['fake-image'], { type: 'image/png' }), 'smoke.png');

    result = await request('/api/homework', {
      method: 'POST',
      headers: authHeaders,
      body: form,
    });
    assert.equal(result.response.status, 200);
    const uploadedItem = result.data.items.find((item) => item.text === 'UPLOAD_TEXT');
    assert.ok(uploadedItem);
    assert.match(uploadedItem.image, /^\/uploads\//);

    const uploadPath = path.join(__dirname, '..', 'public', uploadedItem.image.replace(/^\//, ''));
    createdFiles.push(uploadPath);
    assert.equal(fs.existsSync(uploadPath), true);

    result = await request('/api/essay/tasks', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: 1, title: 'Smoke Essay Task', max_score: 10 }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.task.title, 'Smoke Essay Task');

    result = await request('/api/essay/tasks?class_id=1');
    assert.equal(result.response.status, 200);
    assert.equal(result.data.tasks.length, 1);
    assert.equal(result.data.tasks[0].title, 'Smoke Essay Task');
    const essayTaskId = result.data.tasks[0].id;

    const dbHomeworkCount = db.prepare('SELECT COUNT(*) AS c FROM homework_items').get().c;
    const dbEssayTaskCount = db.prepare('SELECT COUNT(*) AS c FROM essay_tasks').get().c;
    const dbCheckinCount = db.prepare('SELECT COUNT(*) AS c FROM checkin_records').get().c;
    const dbQuizWordsCount = db.prepare('SELECT COUNT(*) AS c FROM quiz_words').get().c;
    assert.equal(dbHomeworkCount, 2);
    assert.equal(dbEssayTaskCount, 1);
    assert.equal(dbCheckinCount, 2);
    assert.equal(dbQuizWordsCount, 1);

    await request(`/api/homework/${jsonHomeworkId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    await request(`/api/homework/${uploadedItem.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    await request(`/api/essay/tasks/${result.data.tasks[0].id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });

    await request(`/api/vocabulary/${catId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });

    result = await request('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.success, true);

    result = await request('/api/auth/status', { headers: authHeaders });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.loggedIn, false);
  } finally {
    for (const filePath of createdFiles) {
      fs.rmSync(filePath, { force: true });
    }
    db.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
