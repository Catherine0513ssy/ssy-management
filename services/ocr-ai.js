const https = require('https');
const http = require('http');
const { URL } = require('url');
const { getSetting } = require('./db');

/**
 * Create an HTTP agent that tunnels through a proxy (for environments behind a proxy).
 * Reads proxy from env HTTPS_PROXY / HTTP_PROXY or settings 'http_proxy'.
 */
function getProxyAgent(targetUrl) {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || getSetting('http_proxy') || '';
  if (!proxyUrl) return null;

  const proxy = new URL(proxyUrl);
  const target = new URL(targetUrl);

  // Use HTTP CONNECT tunnel for HTTPS targets
  return new Promise((resolve, reject) => {
    const connectReq = http.request({
      hostname: proxy.hostname,
      port: proxy.port || 7890,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
        return;
      }
      const agent = new https.Agent({ socket, rejectUnauthorized: false });
      resolve(agent);
    });
    connectReq.on('error', reject);
    connectReq.setTimeout(10000, () => { connectReq.destroy(new Error('Proxy connect timeout')); });
    connectReq.end();
  });
}

const PROMPT = `请分析图片中的英语内容。

## 判断规则
1. 如果图片包含标准的单词表（有英文单词、音标、中文释义等结构化排列），按"标准模式"提取
2. 如果图片包含英文内容但不是标准单词表（如句子、段落、手写笔记等），按"自由模式"提取所有独立英文单词

## 标准模式输出
返回 JSON：{"type":"vocab_list","words":[{"word":"apple","phonetic":"/ˈæpəl/","meaning":"n. 苹果","unit":"U1"},...]}
- phonetic 用斜杠 / / 包裹的国际音标，图片中没有则留空字符串
- meaning 必须是中文释义，图片中没有则留空字符串
- unit 是单元信息，图片中没有则留空字符串

## 自由模式输出
返回 JSON：{"type":"freeform","words":[{"word":"beautiful","phonetic":"","meaning":"","unit":""},...]}
- 提取图片中所有有意义的英文单词（忽略冠词 a/an/the、代词 I/you/he/she/it/we/they、be 动词 is/am/are/was/were、介词等常见虚词）
- meaning 和 phonetic 都留空字符串
- 按出现顺序排列，去重

## 通用规则
- 如果图片中没有英语内容或完全无法识别，返回：{"type":"error","error":"无法识别图片中的英语内容"}
- 仅返回 JSON，不要附加任何解释文字`;

/**
 * Detect API format from endpoint URL or explicit setting.
 * Returns 'anthropic' or 'openai'.
 */
function detectFormat(endpoint) {
  const fmt = getSetting('ocr_ai_format');
  if (fmt === 'anthropic' || fmt === 'openai') return fmt;
  // Auto-detect by URL patterns
  if (/anthropic|claude|kimi/i.test(endpoint)) return 'anthropic';
  return 'openai';
}

/**
 * Convert OpenAI-format message content parts to Anthropic format.
 * OpenAI image_url -> Anthropic image source
 */
function convertToAnthropicContent(contentParts) {
  if (typeof contentParts === 'string') return contentParts;
  return contentParts.map(part => {
    if (part.type === 'image_url' && part.image_url) {
      // Parse data URI: data:image/jpeg;base64,AAAA...
      const url = part.image_url.url || '';
      const match = url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        return {
          type: 'image',
          source: { type: 'base64', media_type: match[1], data: match[2] },
        };
      }
      // If not a data URI, pass through as-is (URL-based image)
      return { type: 'image', source: { type: 'url', url } };
    }
    // text parts are the same format
    return part;
  });
}

/**
 * Generic AI call function.
 * Accepts messages in OpenAI format and auto-converts for Anthropic if needed.
 *
 * @param {Array} messages - OpenAI-format messages [{role, content}]
 *   content can be a string or array of {type:'text',text} / {type:'image_url',image_url:{url}}
 * @param {Object} opts - { timeout }
 * @returns {string} Raw text response from the AI
 */
async function callAI(messages, opts = {}) {
  const endpoint = getSetting('ocr_ai_endpoint');
  const apiKey = getSetting('ocr_ai_api_key');
  const model = getSetting('ocr_ai_model') || 'gpt-4o';
  const timeout = opts.timeout || 90000;

  if (!endpoint || !apiKey) {
    throw new Error('AI endpoint or API key not configured');
  }

  const format = detectFormat(endpoint);

  let headers, payload;

  if (format === 'anthropic') {
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(msg => ({
      role: msg.role,
      content: Array.isArray(msg.content)
        ? convertToAnthropicContent(msg.content)
        : msg.content,
    }));
    payload = JSON.stringify({
      model,
      max_tokens: 4096,
      messages: anthropicMessages,
    });
  } else {
    // OpenAI format — messages are already in the right format
    headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    };
    payload = JSON.stringify({
      model,
      messages,
    });
  }

  const url = new URL(endpoint);
  const transport = url.protocol === 'https:' ? https : http;

  // Try to get proxy agent if available
  let proxyAgent = null;
  try { proxyAgent = await getProxyAgent(endpoint); } catch (_) {}

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers,
    ...(proxyAgent ? { agent: proxyAgent } : {}),
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      res.setTimeout(timeout);
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());

          if (body.error) {
            return reject(new Error(body.error.message || JSON.stringify(body.error)));
          }

          const text = extractText(body, format);
          if (!text) {
            return reject(new Error('Empty response from AI API'));
          }
          resolve(text);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(new Error(`AI 请求超时（${Math.round(timeout / 1000)}秒）`)); });
    req.on('error', reject);
    req.end(payload);
  });
}

/**
 * Build request payload + headers based on API format.
 * (Kept for backward compatibility, used internally by recognize)
 */
function buildRequest(base64Image, model, apiKey, format) {
  if (format === 'anthropic') {
    return {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
          ],
        }],
      }),
    };
  }

  // OpenAI format (default)
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64Image } },
        ],
      }],
    }),
  };
}

/**
 * Extract response text based on API format.
 */
function extractText(body, format) {
  if (format === 'anthropic') {
    // Anthropic: { content: [{ type: "text", text: "..." }] }
    if (body.content && body.content[0]) return body.content[0].text;
  } else {
    // OpenAI: { choices: [{ message: { content: "..." } }] }
    if (body.choices && body.choices[0]) return body.choices[0].message.content;
  }
  return null;
}

/**
 * Recognize text/vocabulary from a base64-encoded image using an AI vision API.
 * Now implemented via callAI internally.
 */
async function recognize(base64Image) {
  // Build messages in OpenAI format — callAI handles format conversion
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64Image } },
    ],
  }];

  const text = await callAI(messages, { timeout: 90000 });

  // Try to parse as structured response (new format with type field)
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed.type && parsed.words) {
        return parsed;
      }
      if (parsed.error) {
        return parsed;
      }
    } catch (_) { /* fall through */ }
  }
  // Fallback: try array format (backward compat)
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      return { type: 'vocab_list', words: arr };
    } catch (_) { /* fall through */ }
  }
  return text;
}

module.exports = { recognize, callAI };
