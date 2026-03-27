const path = require('path');

// ---------------------------------------------------------------------------
// Strategy 1 — Markdown table
// ---------------------------------------------------------------------------
function parseTable(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  // Find header row: must contain | and be followed by a separator (|---|)
  let headerIdx = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes('|') && /\|[\s-:]+\|/.test(lines[i + 1])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const splitRow = (row) =>
    row.split('|').map(c => c.trim()).filter(Boolean);

  const headers = splitRow(lines[headerIdx]).map(h => h.toLowerCase());

  // Map header names to indices
  const wordIdx = headers.findIndex(h => /^(word|单词|英文)/.test(h));
  const phoneticIdx = headers.findIndex(h => /^(phonetic|音标|发音)/.test(h));
  const meaningIdx = headers.findIndex(h => /^(meaning|中文|释义|意思|含义)/.test(h));

  if (wordIdx === -1 && meaningIdx === -1) return null;

  const words = [];
  const errors = [];

  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) continue;
    const cols = splitRow(line);

    const word = (wordIdx >= 0 ? cols[wordIdx] : cols[0]) || '';
    const phonetic = phoneticIdx >= 0 ? (cols[phoneticIdx] || '') : '';
    const meaning = (meaningIdx >= 0 ? cols[meaningIdx] : cols[cols.length - 1]) || '';

    if (!word) {
      errors.push(`Line ${i + 1}: empty word, skipped`);
      continue;
    }
    words.push({ word: word.trim(), phonetic: phonetic.trim(), meaning: meaning.trim() });
  }

  return words.length > 0 ? { words, format: 'table', errors } : null;
}

// ---------------------------------------------------------------------------
// Strategy 2 — List format (- / * / 1.)
// ---------------------------------------------------------------------------
function parseList(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const listLines = lines.filter(l => /^[-*]\s|^\d+\.\s/.test(l));
  if (listLines.length < 2) return null;

  const words = [];
  const errors = [];

  for (const line of listLines) {
    const text = line.replace(/^[-*]\s+|^\d+\.\s+/, '');
    const extracted = extractParts(text);
    if (extracted.word) {
      words.push(extracted);
    } else {
      errors.push(`Cannot parse list item: "${line}"`);
    }
  }

  return words.length > 0 ? { words, format: 'list', errors } : null;
}

// ---------------------------------------------------------------------------
// Strategy 3 — Delimiter-separated (tab, pipe, comma)
// ---------------------------------------------------------------------------
function parseDelimited(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  // Detect delimiter: try tab, pipe, comma
  const delimiters = ['\t', '|', ','];
  let bestDelim = null;
  let bestCount = 0;

  for (const d of delimiters) {
    const counts = lines.map(l => l.split(d).length);
    const consistent = counts.filter(c => c >= 2);
    if (consistent.length > bestCount) {
      bestCount = consistent.length;
      bestDelim = d;
    }
  }

  if (!bestDelim || bestCount < 2) return null;

  // Skip lines that look like table separators
  const dataLines = lines.filter(l => !/^[\s|:-]+$/.test(l));

  const words = [];
  const errors = [];

  for (const line of dataLines) {
    const parts = line.split(bestDelim).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const word = parts[0] || '';
    const phonetic = parts.length >= 3 ? (parts[1] || '') : '';
    const meaning = parts.length >= 3 ? parts.slice(2).join(', ') : (parts[1] || '');

    if (!word || !/[a-zA-Z]/.test(word)) continue;

    words.push({ word, phonetic, meaning });
  }

  return words.length > 0 ? { words, format: 'delimited', errors } : null;
}

// ---------------------------------------------------------------------------
// Strategy 4 — Plain text extraction via regex
// ---------------------------------------------------------------------------
function parsePlain(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const words = [];
  const errors = [];

  for (const line of lines) {
    const extracted = extractParts(line);
    if (extracted.word) {
      words.push(extracted);
    }
  }

  return words.length > 0 ? { words, format: 'plain', errors } : null;
}

// ---------------------------------------------------------------------------
// Shared: extract word / phonetic / meaning from a single text string
// ---------------------------------------------------------------------------
function extractParts(text) {
  const wordMatch = text.match(/[a-zA-Z][a-zA-Z\s'-]+/);
  const phoneticMatch = text.match(/[/\[].+?[/\]]/);
  const meaningMatch = text.match(/[\u4e00-\u9fff].+/);

  return {
    word: wordMatch ? wordMatch[0].trim() : '',
    phonetic: phoneticMatch ? phoneticMatch[0].trim() : '',
    meaning: meaningMatch ? meaningMatch[0].trim() : '',
  };
}

// ---------------------------------------------------------------------------
// Main entry — try strategies in order, return first successful result
// ---------------------------------------------------------------------------
function parseDocument(content, filename) {
  if (!content || typeof content !== 'string') {
    return { words: [], format: 'unknown', errors: ['Empty or invalid content'] };
  }

  const strategies = [parseTable, parseList, parseDelimited, parsePlain];

  for (const strategy of strategies) {
    const result = strategy(content);
    if (result && result.words.length > 0) {
      return result;
    }
  }

  return {
    words: [],
    format: 'unknown',
    errors: [`Could not parse any vocabulary from "${filename || 'unknown'}"`],
  };
}

module.exports = { parseDocument };
