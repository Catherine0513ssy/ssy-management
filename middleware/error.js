/**
 * Centralized Express error handler.
 * Logs the error and returns a JSON response.
 * In production, stack traces are not exposed.
 */
function errorHandler(err, req, res, _next) {
  console.error('[Error]', err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  const payload = { error: message };
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
}

module.exports = errorHandler;
