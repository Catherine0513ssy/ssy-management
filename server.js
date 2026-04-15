const express = require('express');
const path = require('path');
const helmet = require('helmet');
const { initDB } = require('./services/db');
const errorHandler = require('./middleware/error');
const { startBackupSchedule } = require('./services/backup');

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
let serverInstance;

// Initialize database
initDB(process.env.DB_PATH);

// Security & parsing
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Class-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Static files
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/homework', require('./routes/homework'));
app.use('/api/checkin', require('./routes/checkin'));
app.use('/api/excellent', require('./routes/excellent'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/vocabulary', require('./routes/vocabulary'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/quiz-smart', require('./routes/quiz_smart'));
app.use('/api/choice-fill', require('./routes/choice_fill'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ocr', require('./routes/ocr'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/essay', require('./routes/essay'));

// Error handler
app.use(errorHandler);

function startServer(port = PORT, host = HOST) {
  if (serverInstance) return serverInstance;

  serverInstance = app.listen(port, host, () => {
    const address = serverInstance.address();
    const boundPort = address && typeof address === 'object' ? address.port : port;
    console.log(`[SSY] Server running on port ${boundPort}`);
    if (process.env.DISABLE_BACKUPS !== 'true') {
      startBackupSchedule();
    }
  });

  return serverInstance;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
