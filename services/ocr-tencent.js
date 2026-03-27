const crypto = require('crypto');
const https = require('https');
const { getSetting } = require('./db');

// ---------------------------------------------------------------------------
// Tencent Cloud OCR — GeneralBasicOCR (v3 signature)
// ---------------------------------------------------------------------------

const SERVICE = 'ocr';
const HOST = 'ocr.tencentcloudapi.com';
const ACTION = 'GeneralBasicOCR';
const VERSION = '2018-11-19';
const REGION = 'ap-beijing';

function sha256(data, encoding) {
  return crypto.createHash('sha256').update(data).digest(encoding || 'hex');
}

function hmacSHA256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * Build TC3-HMAC-SHA256 authorization header for Tencent Cloud API v3.
 */
function sign(secretId, secretKey, timestamp, payload) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  // Step 1: Canonical request
  const canonicalRequest = [
    'POST',
    '/',
    '',
    'content-type:application/json\nhost:' + HOST + '\n',
    'content-type;host',
    sha256(payload),
  ].join('\n');

  // Step 2: String to sign
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  // Step 3: Signing key
  const secretDate = hmacSHA256(Buffer.from('TC3' + secretKey), date);
  const secretService = hmacSHA256(secretDate, SERVICE);
  const secretSigning = hmacSHA256(secretService, 'tc3_request');
  const signature = crypto
    .createHmac('sha256', secretSigning)
    .update(stringToSign)
    .digest('hex');

  return (
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=content-type;host, Signature=${signature}`
  );
}

/**
 * Recognize text from a base64-encoded image using Tencent Cloud OCR.
 * @param {string} base64Image - Base64-encoded image data (no data URI prefix)
 * @returns {Promise<string[]>} Array of recognized text lines
 */
async function recognize(base64Image) {
  const secretId = getSetting('ocr_tencent_secret_id');
  const secretKey = getSetting('ocr_tencent_secret_key');
  if (!secretId || !secretKey) {
    throw new Error('Tencent OCR credentials not configured');
  }

  const payload = JSON.stringify({ ImageBase64: base64Image });
  const timestamp = Math.floor(Date.now() / 1000);
  const authorization = sign(secretId, secretKey, timestamp, payload);

  const options = {
    hostname: HOST,
    method: 'POST',
    path: '/',
    headers: {
      'Content-Type': 'application/json',
      Host: HOST,
      'X-TC-Action': ACTION,
      'X-TC-Version': VERSION,
      'X-TC-Region': REGION,
      'X-TC-Timestamp': String(timestamp),
      Authorization: authorization,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          if (body.Response && body.Response.Error) {
            return reject(new Error(body.Response.Error.Message));
          }
          const lines = (body.Response.TextDetections || []).map(
            (d) => d.DetectedText
          );
          resolve(lines);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

module.exports = { recognize };
