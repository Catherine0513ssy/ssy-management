const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSourceMap,
  buildVolumes,
  extractWordLines,
  parseWordLine,
  parseGoForItUnitPage,
} = require('../services/goforit-import');

test('buildSourceMap returns starter + unit pages for 7a and unit pages for 9', () => {
  const map = buildSourceMap(['7a', '9']);

  assert.equal(map[0].grade, '7a');
  assert.equal(map[0].unit, 'SU1');
  assert.match(map[0].url, /starter1c\.html$/);

  assert.equal(map.at(-1).grade, '9');
  assert.equal(map.at(-1).unit, 'U14');
  assert.match(map.at(-1).url, /unit14c\.html$/);
});

test('extractWordLines keeps only the unit body lines', () => {
  const html = `
    <div id="zoom">
      <p>Unit 1</p>
      <p>name /neim/ n. 名字；名称</p>
      <p>telephone/phone number 电话号码</p>
      <p>Gina&nbsp; 吉娜（女名）</p>
    </div>
  `;

  assert.deepEqual(extractWordLines(html), [
    'Unit 1',
    'name /neim/ n. 名字；名称',
    'telephone/phone number 电话号码',
    'Gina 吉娜（女名）',
  ]);
});

test('parseWordLine parses phonetic, part of speech, and meaning', () => {
  assert.deepEqual(parseWordLine('name /neim/ n. 名字；名称'), {
    word: 'name',
    phonetic: '/neim/',
    pos: 'n.',
    meaning: '名字；名称',
  });
});

test('parseWordLine handles phrases without phonetic and strips Chinese annotations', () => {
  assert.deepEqual(parseWordLine('foot(复数feet) [fu:t] n. 脚'), {
    word: 'foot',
    phonetic: '[fu:t]',
    pos: 'n.',
    meaning: '脚',
  });

  assert.deepEqual(parseWordLine('telephone/phone number 电话号码'), {
    word: 'telephone/phone number',
    phonetic: '',
    pos: '',
    meaning: '电话号码',
  });
});

test('parseGoForItUnitPage builds importable entries with grade and unit', () => {
  const html = `
    <div id="zoom">
      <p>Unit 1</p>
      <p>matter&nbsp; ['maet] v. 重要，要紧，有关系</p>
      <p>What’s the matter?&nbsp; 怎么了？出什么事了？</p>
      <p>take breaks (take a break） 休息</p>
    </div>
  `;

  const result = parseGoForItUnitPage(html, {
    grade: '8b',
    unit: 'U1',
    url: 'https://example.com/unit1c.html',
  });

  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.entries[0], {
    grade: '8b',
    unit: 'U1',
    word: 'matter',
    phonetic: "['maet]",
    meaning: '重要，要紧，有关系',
    pos: 'v.',
    source: 'geilien-goforit',
    source_url: 'https://example.com/unit1c.html',
  });
  assert.equal(result.entries[1].word, 'What’s the matter?');
  assert.equal(result.entries[2].word, 'take breaks (take a break）');
  assert.equal(result.unitHeading, 'Unit 1');
});

test('buildVolumes groups entries by grade and unit in reading order', () => {
  const volumes = buildVolumes([
    { grade: '7a', unit: 'U2', word: 'this' },
    { grade: '7a', unit: 'SU1', word: 'good' },
    { grade: '7a', unit: 'U1', word: 'name' },
    { grade: '8b', unit: 'U1', word: 'matter' },
  ]);

  assert.deepEqual(volumes.map((v) => ({
    grade: v.grade,
    units: v.units.map((u) => `${u.unit}:${u.count}`),
  })), [
    { grade: '7a', units: ['SU1:1', 'U1:1', 'U2:1'] },
    { grade: '8b', units: ['U1:1'] },
  ]);
});
