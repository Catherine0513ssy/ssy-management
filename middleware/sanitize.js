const xss = require('xss');

function sanitizeText(value) {
  return typeof value === 'string' ? xss(value) : value;
}

function deepSanitize(obj) {
  if (typeof obj === 'string') return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepSanitize(value);
    }
    return result;
  }
  return obj;
}

function sanitize(req, res, next) {
  if (req.body) {
    req.body = deepSanitize(req.body);
  }
  next();
}

module.exports = { sanitize, sanitizeText, deepSanitize };
