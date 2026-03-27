const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { getDB, getSetting } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const ocrManager = require('../services/ocr-manager');
const { parseWords } = require('../services/word-parser');

// ---------------------------------------------------------------------------
// Multer configuration
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// POST /recognize — Upload image, run OCR, extract words
// ---------------------------------------------------------------------------
router.post('/recognize', requireAuth, upload.single('image'), async (req, res) => {
  const db = getDB();
  const engine = getSetting('ocr_engine') || 'disabled';

  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  const imagePath = '/uploads/' + req.file.filename;
  const absolutePath = path.join(__dirname, '..', 'public', imagePath);

  try {
    const imageBuffer = fs.readFileSync(absolutePath);
    const base64Image = imageBuffer.toString('base64');
    const rawResult = await ocrManager.recognize(base64Image);
    const { words, errors, type } = parseWords(rawResult);

    const rawText =
      typeof rawResult === 'string'
        ? rawResult
        : JSON.stringify(rawResult);

    const success = words.length > 0 ? 1 : 0;

    db.prepare(
      `INSERT INTO ocr_logs (engine, image_path, raw_result, parsed_words, word_count, success, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(engine, imagePath, rawText, JSON.stringify(words), words.length, success, errors.length > 0 ? errors.join('; ') : null);

    if (words.length === 0 && errors.length > 0) {
      return res.status(422).json({ error: '识别失败: ' + errors.join('; '), errors, words: [], rawText, type: type || 'error' });
    }

    return res.json({ words, errors, rawText, type: type || 'vocab_list' });
  } catch (err) {
    db.prepare(
      `INSERT INTO ocr_logs (engine, image_path, raw_result, parsed_words, word_count, success, error_message, created_at)
       VALUES (?, ?, NULL, NULL, 0, 0, ?, datetime('now'))`
    ).run(engine, imagePath, err.message);

    return res.status(500).json({ error: 'OCR recognition failed: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /enrich — AI-powered meaning/phonetic enrichment for word list
// ---------------------------------------------------------------------------
router.post('/enrich', requireAuth, async (req, res) => {
  const { words } = req.body;

  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words array is required' });
  }

  const endpoint = getSetting('ocr_ai_endpoint');
  const apiKey = getSetting('ocr_ai_api_key');
  const model = getSetting('ocr_ai_model') || 'gpt-4o';

  if (!endpoint || !apiKey) {
    return res.status(400).json({ error: 'AI endpoint not configured' });
  }

  const prompt = `请为以下英文单词补充音标和中文释义。

单词列表：${words.join(', ')}

要求：
1. 返回 JSON 数组，每个元素格式：{"word":"apple","phonetic":"/ˈæpəl/","meaning":"n. 苹果"}
2. phonetic 用国际音标，斜杠包裹
3. meaning 包含词性缩写和中文释义（如 "n. 苹果"、"v. 跑步"、"adj. 美丽的"）
4. 如果是词组（如 "look after"），词性可以省略
5. 仅返回 JSON 数组，不要附加任何解释`;

  try {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');

    // Detect format
    const fmt = getSetting('ocr_ai_format');
    const isAnthropic = fmt === 'anthropic' || (!fmt && /anthropic|claude/i.test(endpoint));

    const url = new URL(endpoint);
    const transport = url.protocol === 'https:' ? https : http;

    let headers, body;
    if (isAnthropic) {
      headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
      body = JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] });
    } else {
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
      body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] });
    }

    const result = await new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
      }, (res) => {
        res.setTimeout(60000);
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            let text;
            if (isAnthropic && data.content && data.content[0]) {
              text = data.content[0].text;
            } else if (data.choices && data.choices[0]) {
              text = data.choices[0].message.content;
            }
            if (!text) return reject(new Error('Empty AI response'));
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
              resolve(JSON.parse(match[0]));
            } else {
              reject(new Error('Could not parse AI response'));
            }
          } catch (e) { reject(e); }
        });
      });
      req.setTimeout(60000, () => req.destroy(new Error('AI request timeout')));
      req.on('error', reject);
      req.end(body);
    });

    return res.json({ words: result });
  } catch (err) {
    return res.status(500).json({ error: 'AI enrichment failed: ' + err.message });
  }
});

module.exports = router;
