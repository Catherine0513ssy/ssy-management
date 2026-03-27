function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);

  const status = err.status || err.statusCode || 500;
  const response = { error: err.message || '服务器内部错误' };

  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(status).json(response);
}

module.exports = errorHandler;
