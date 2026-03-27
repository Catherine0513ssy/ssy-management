// ---------------------------------------------------------------------------
// Word Parser — extract & validate vocabulary entries from OCR results
// ---------------------------------------------------------------------------

/**
 * Parse words from OCR output with strict validation.
 * Returns { words: [...], errors: [...] }
 *
 * @param {string|string[]|object[]} rawResult - OCR engine output
 * @returns {{ words: Array<{word, phonetic, meaning, unit}>, errors: string[] }}
 */
function parseWords(rawResult) {
  if (!rawResult) return { words: [], errors: ['OCR 返回为空'] };

  // Handle new structured format from AI: { type: "vocab_list"|"freeform"|"error", words: [...] }
  if (rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
    if (rawResult.error) {
      return { words: [], errors: [rawResult.error], type: rawResult.type || 'error' };
    }
    if (rawResult.type && Array.isArray(rawResult.words)) {
      const result = validateAndClean(rawResult.words);
      result.type = rawResult.type;
      return result;
    }
  }

  // Strategy 1: Already structured array of objects from AI engine
  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === 'object') {
    return validateAndClean(rawResult);
  }

  // Try to parse JSON string
  if (typeof rawResult === 'string') {
    // Extract JSON from possible markdown fences or mixed text
    const jsonMatch = rawResult.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return validateAndClean(parsed);
        }
      } catch (_) {}
    }

    // Check if AI returned an error as JSON
    try {
      const obj = JSON.parse(rawResult);
      if (obj.error) return { words: [], errors: [obj.error] };
    } catch (_) {}

    // Try line-by-line parsing (pipe-delimited format)
    const lines = rawResult.split(/\r?\n/).filter(l => l.trim());
    if (lines.length > 0) {
      return parseDelimitedLines(lines);
    }
  }

  // Array of strings (line-by-line from Tencent OCR)
  if (Array.isArray(rawResult) && rawResult.length > 0 && typeof rawResult[0] === 'string') {
    return parseDelimitedLines(rawResult);
  }

  return { words: [], errors: ['无法解析 OCR 返回的数据格式'] };
}

/**
 * Validate and clean structured word objects from AI.
 * Strict: word must be English, meaning should exist.
 */
function validateAndClean(items) {
  const words = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') {
      errors.push(`第 ${i + 1} 项: 格式无效`);
      continue;
    }

    const word = (item.word || '').trim();
    const phonetic = (item.phonetic || '').trim();
    const meaning = (item.meaning || '').trim();
    const unit = (item.unit || '').trim();

    // Validate: must start with English letter, allow phrases with dots, parens, etc.
    // e.g. "be good at ...", "help (sb.) with sth.", "play chess"
    if (!word || !/[a-zA-Z]{2,}/.test(word)) {
      errors.push(`第 ${i + 1} 项: "${word}" 不是有效的英文单词或词组`);
      continue;
    }

    // Validate: reasonable length
    if (word.length > 80) {
      errors.push(`第 ${i + 1} 项: "${word}" 长度异常`);
      continue;
    }

    words.push({
      word: word.toLowerCase(),
      phonetic: phonetic,
      meaning: meaning,
      unit: unit,
    });
  }

  if (words.length === 0 && errors.length === 0) {
    errors.push('未识别到任何有效的英文单词');
  }

  return { words: dedup(words), errors };
}

/**
 * Parse lines in "word | phonetic | meaning | unit" format.
 */
function parseDelimitedLines(lines) {
  const words = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Skip header-like lines
    if (/^[英单词#\-=]/.test(line) || /^word\s*\|/i.test(line)) continue;

    const parts = line.split(/\s*\|\s*/);

    if (parts.length >= 2) {
      const word = parts[0].trim();
      if (!word || !/[a-zA-Z]{2,}/.test(word)) {
        errors.push(`行 ${i + 1}: "${word}" 不是有效的英文单词或词组`);
        continue;
      }

      words.push({
        word: word.toLowerCase(),
        phonetic: (parts[1] || '').trim(),
        meaning: (parts[2] || '').trim(),
        unit: (parts[3] || '').trim(),
      });
    } else {
      // Try space/tab split
      const spaceParts = line.split(/\t|\s{2,}/);
      if (spaceParts.length >= 2) {
        const word = spaceParts[0].trim();
        if (/^[a-zA-Z][a-zA-Z'-\s]*$/.test(word)) {
          words.push({
            word: word.toLowerCase(),
            phonetic: extractPhonetic(spaceParts.slice(1).join(' ')),
            meaning: extractChinese(spaceParts.slice(1).join(' ')),
            unit: '',
          });
          continue;
        }
      }
      errors.push(`行 ${i + 1}: 无法解析 "${line.slice(0, 40)}"`);
    }
  }

  if (words.length === 0 && errors.length === 0) {
    errors.push('未识别到任何有效的英文单词');
  }

  return { words: dedup(words), errors };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPhonetic(text) {
  const m = text.match(/(\/[^/]+\/|\[[^\]]+\])/);
  return m ? m[1] : '';
}

function extractChinese(text) {
  const m = text.match(/([\u4e00-\u9fff].+)/);
  return m ? m[1].trim() : '';
}

function dedup(entries) {
  const seen = new Set();
  return entries.filter((e) => {
    if (!e.word) return false;
    const key = e.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { parseWords };
