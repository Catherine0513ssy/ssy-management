const xss = require('xss');

/**
 * Recursively sanitize all string values in a value (object, array, or primitive).
 */
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return xss(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const cleaned = {};
    for (const key of Object.keys(value)) {
      cleaned[key] = sanitizeValue(value[key]);
    }
    return cleaned;
  }
  return value;
}

/**
 * Middleware that sanitizes all string values in req.body using the xss package.
 */
function sanitize(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
}

module.exports = { sanitize };
