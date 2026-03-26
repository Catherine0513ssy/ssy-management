const express = require('express');
const path = require('path');
const helmet = require('helmet');
const { initDB } = require('./services/db');
const errorHandler = require('./middleware/error');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initDB();

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
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/homework', require('./routes/homework'));
app.use('/api/checkin', require('./routes/checkin'));
app.use('/api/excellent', require('./routes/excellent'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/vocabulary', require('./routes/vocabulary'));
app.use('/api/quiz', require('./routes/quiz'));

// Error handler
app.use(errorHandler);

// Start
app.listen(PORT, () => {
  console.log(`[SSY] Server running on port ${PORT}`);
});

module.exports = app;
