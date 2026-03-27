const BOOKS = {
  '7a': { bookPath: 'book7a', label: '七年级上册', starters: 3, units: 9 },
  '7b': { bookPath: 'book7b', label: '七年级下册', starters: 0, units: 12 },
  '8a': { bookPath: 'book8a', label: '八年级上册', starters: 0, units: 10 },
  '8b': { bookPath: 'book8b', label: '八年级下册', starters: 0, units: 10 },
  '9': { bookPath: 'book9', label: '九年级全一册', starters: 0, units: 14 },
};

const SOURCE_NAME = 'geilien-goforit';
const SOURCE_HOST = 'http://www.geilien.cn/goforit';

function buildSourceMap(grades = Object.keys(BOOKS)) {
  const entries = [];

  for (const grade of grades) {
    const book = BOOKS[grade];
    if (!book) continue;

    for (let i = 1; i <= book.starters; i += 1) {
      entries.push({
        grade,
        unit: `SU${i}`,
        url: `${SOURCE_HOST}/${book.bookPath}/wenben/starter${i}c.html`,
      });
    }

    for (let i = 1; i <= book.units; i += 1) {
      entries.push({
        grade,
        unit: `U${i}`,
        url: `${SOURCE_HOST}/${book.bookPath}/wenben/unit${i}c.html`,
      });
    }
  }

  return entries;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(text) {
  return text.replace(/<[^>]+>/g, '');
}

function normalizeWhitespace(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWordLines(html) {
  const zoomMatch = html.match(/<div[^>]+id="zoom"[^>]*>([\s\S]*?)<\/div>/i);
  if (!zoomMatch) return [];

  const paragraphMatches = zoomMatch[1].match(/<p[\s\S]*?<\/p>/gi) || [];
  return paragraphMatches
    .map((paragraph) => normalizeWhitespace(decodeHtmlEntities(stripTags(paragraph))))
    .filter(Boolean);
}

function stripWordAnnotations(word) {
  return normalizeWhitespace(
    word
      .replace(/[（(][^()（）]*[\u4e00-\u9fff][^()（）]*[)）]/g, '')
      .replace(/\s{2,}/g, ' ')
  );
}

function splitMeaningLine(line) {
  const idx = line.search(/[\u4e00-\u9fff]/);
  if (idx === -1) {
    return { left: line.trim(), meaning: '' };
  }

  return {
    left: line.slice(0, idx).trim(),
    meaning: normalizeWhitespace(line.slice(idx)),
  };
}

function extractPosPrefix(text) {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^(n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|interj\.|num\.|modal v\.|aux\. v\.|art\.|abbr\.)\s*/i
  );

  if (!match) {
    return { pos: '', rest: trimmed };
  }

  return {
    pos: match[1],
    rest: trimmed.slice(match[0].length).trim(),
  };
}

function parseWordLine(line) {
  const cleaned = normalizeWhitespace(line);
  if (!cleaned || /^unit\b/i.test(cleaned)) return null;

  const phoneticMatch = cleaned.match(/(\/[^/]+\/|\[[^\]]+\])/);

  let wordPart = cleaned;
  let phonetic = '';
  let rest = '';

  if (phoneticMatch) {
    phonetic = phoneticMatch[1].trim();
    const start = phoneticMatch.index;
    const end = start + phoneticMatch[0].length;
    wordPart = cleaned.slice(0, start).trim();
    rest = cleaned.slice(end).trim();
  } else {
    const split = splitMeaningLine(cleaned);
    wordPart = split.left;
    rest = split.meaning;
  }

  const word = stripWordAnnotations(wordPart);
  if (!word) return null;

  const { pos, rest: maybeMeaning } = extractPosPrefix(rest);
  const meaning = normalizeWhitespace(maybeMeaning);

  return {
    word,
    phonetic,
    pos,
    meaning,
  };
}

function parseGoForItUnitPage(html, source) {
  const lines = extractWordLines(html);
  if (lines.length === 0) {
    return { unitHeading: '', entries: [] };
  }

  const [unitHeading, ...wordLines] = lines;
  const entries = wordLines
    .map(parseWordLine)
    .filter((entry) => entry && entry.word)
    .map((entry) => ({
      grade: source.grade,
      unit: source.unit,
      word: entry.word,
      phonetic: entry.phonetic,
      meaning: entry.meaning,
      pos: entry.pos,
      source: SOURCE_NAME,
      source_url: source.url,
    }));

  return { unitHeading, entries };
}

function summarizeEntries(entries) {
  const summary = { total: entries.length, byGrade: {}, byUnit: {} };

  for (const entry of entries) {
    summary.byGrade[entry.grade] = (summary.byGrade[entry.grade] || 0) + 1;
    const unitKey = `${entry.grade}:${entry.unit}`;
    summary.byUnit[unitKey] = (summary.byUnit[unitKey] || 0) + 1;
  }

  return summary;
}

function groupEntries(entries) {
  const grouped = {};

  for (const entry of entries) {
    if (!grouped[entry.grade]) {
      grouped[entry.grade] = {};
    }
    if (!grouped[entry.grade][entry.unit]) {
      grouped[entry.grade][entry.unit] = [];
    }
    grouped[entry.grade][entry.unit].push(entry);
  }

  return grouped;
}

function compareUnits(a, b) {
  const parse = (value) => {
    const match = String(value || '').match(/^([A-Z]+)(\d+)$/i);
    if (!match) return { prefix: String(value || ''), num: 0 };
    return { prefix: match[1].toUpperCase(), num: Number(match[2]) };
  };

  const left = parse(a);
  const right = parse(b);
  if (left.prefix !== right.prefix) {
    return left.prefix.localeCompare(right.prefix);
  }
  return left.num - right.num;
}

function buildVolumes(entries) {
  const grouped = groupEntries(entries);

  return Object.keys(grouped)
    .sort()
    .map((grade) => ({
      grade,
      grade_label: BOOKS[grade]?.label || grade,
      units: Object.keys(grouped[grade])
        .sort(compareUnits)
        .map((unit) => ({
          unit,
          count: grouped[grade][unit].length,
          words: grouped[grade][unit],
        })),
    }));
}

module.exports = {
  BOOKS,
  SOURCE_NAME,
  buildSourceMap,
  buildVolumes,
  decodeHtmlEntities,
  extractWordLines,
  groupEntries,
  parseWordLine,
  parseGoForItUnitPage,
  summarizeEntries,
};
