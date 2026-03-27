const { getDB } = require('../services/db');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  const token = header.slice(7);
  const db = getDB();

  // Clean expired tokens
  db.prepare("DELETE FROM auth_tokens WHERE expires_at < datetime('now')").run();

  // Validate token
  const row = db.prepare(
    "SELECT * FROM auth_tokens WHERE token = ? AND expires_at > datetime('now')"
  ).get(token);

  if (!row) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  // Extend token expiry by 30 minutes
  db.prepare(
    "UPDATE auth_tokens SET expires_at = datetime('now', '+30 minutes') WHERE token = ?"
  ).run(token);

  next();
}

module.exports = { requireAuth };
