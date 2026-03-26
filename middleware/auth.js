const { getDB } = require('../services/db');

/**
 * Require a valid Bearer token in the Authorization header.
 * On success, refreshes the token expiry by 30 minutes and calls next().
 * On failure, returns 401 JSON error.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);
  if (!token) {
    return res.status(401).json({ error: 'Token is empty' });
  }

  try {
    const db = getDB();
    const row = db.prepare(
      "SELECT token, expires_at FROM auth_tokens WHERE token = ?"
    ).get(token);

    if (!row) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check expiry — expires_at is stored as ISO-8601 datetime string
    const now = new Date().toISOString();
    if (row.expires_at < now) {
      // Clean up expired token
      db.prepare("DELETE FROM auth_tokens WHERE token = ?").run(token);
      return res.status(401).json({ error: 'Token expired' });
    }

    // Refresh expiry: extend by 30 minutes from now
    const newExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare("UPDATE auth_tokens SET expires_at = ? WHERE token = ?").run(newExpiry, token);

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = { requireAuth };
