const router = require('express').Router();
const crypto = require('crypto');
const { getDB, getSetting } = require('../services/db');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for may contain a comma-separated list; take the first
    return forwarded.split(',')[0].trim();
  }
  return req.ip;
}

const MAX_ATTEMPTS = 3;
const LOCKOUT_WINDOW_SEC = 5 * 60;   // 5 minutes
const TOKEN_TTL_SEC = 30 * 60;       // 30 minutes

/**
 * Count recent failed login attempts for the given IP within the lockout window.
 */
function getRecentFailedAttempts(ip) {
  const db = getDB();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM login_attempts
     WHERE ip = ? AND success = 0
       AND attempted_at > datetime('now', ?)`,
  ).get(ip, `-${LOCKOUT_WINDOW_SEC} seconds`);
  return row ? row.cnt : 0;
}

/**
 * Record a login attempt (success or failure).
 */
function recordAttempt(ip, success) {
  const db = getDB();
  db.prepare(
    `INSERT INTO login_attempts (ip, attempted_at, success) VALUES (?, datetime('now'), ?)`,
  ).run(ip, success ? 1 : 0);
}

/**
 * Clean up expired auth tokens (older than TOKEN_TTL_SEC).
 * Called opportunistically on every auth-related request.
 */
function purgeExpiredTokens() {
  const db = getDB();
  db.prepare(`DELETE FROM auth_tokens WHERE expires_at <= datetime('now')`).run();
}

/**
 * Validate a bearer token. Returns true if the token exists and has not expired.
 */
function isTokenValid(token) {
  if (!token) return false;
  const db = getDB();
  const row = db.prepare(
    `SELECT 1 FROM auth_tokens WHERE token = ? AND expires_at > datetime('now')`,
  ).get(token);
  return !!row;
}

/**
 * Extract the bearer token from the Authorization header.
 * Accepts both "Bearer <token>" and a raw token string.
 */
function extractToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return header.trim();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /login
 * Body: { password: string }
 * Returns: { token } on success, 401 on failure.
 */
router.post('/login', (req, res) => {
  purgeExpiredTokens();

  const ip = getClientIP(req);
  const failedCount = getRecentFailedAttempts(ip);

  if (failedCount >= MAX_ATTEMPTS) {
    return res.status(429).json({
      error: '登录尝试过多，请5分钟后再试',
      attemptsLeft: 0,
    });
  }

  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: '请输入密码' });
  }

  const correctPassword = getSetting('auth_password_plain');
  if (!correctPassword) {
    // No password configured in settings – deny all logins for safety.
    return res.status(500).json({ error: '服务器未配置登录密码' });
  }

  if (password !== correctPassword) {
    recordAttempt(ip, false);
    const attemptsLeft = MAX_ATTEMPTS - (failedCount + 1);
    return res.status(401).json({
      error: '密码错误',
      attemptsLeft: Math.max(attemptsLeft, 0),
    });
  }

  // Successful login
  recordAttempt(ip, true);

  const token = crypto.randomUUID();
  const db = getDB();
  db.prepare(
    `INSERT INTO auth_tokens (token, created_at, expires_at) VALUES (?, datetime('now'), datetime('now', ?))`,
  ).run(token, `+${TOKEN_TTL_SEC} seconds`);

  return res.json({ token });
});

/**
 * POST /logout
 * Requires Authorization header with a valid token.
 */
router.post('/logout', (req, res) => {
  purgeExpiredTokens();

  const token = extractToken(req);
  if (!token || !isTokenValid(token)) {
    return res.status(401).json({ error: '未登录或令牌无效' });
  }

  const db = getDB();
  db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);

  return res.json({ success: true });
});

/**
 * GET /status
 * Returns { loggedIn: true } if the caller presents a valid, non-expired token,
 * otherwise { loggedIn: false }.
 */
router.get('/status', (req, res) => {
  purgeExpiredTokens();

  const token = extractToken(req);
  const loggedIn = isTokenValid(token);

  return res.json({ loggedIn });
});

module.exports = router;
