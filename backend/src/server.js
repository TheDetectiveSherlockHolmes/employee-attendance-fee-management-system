/**
 * Express Application Entry Point (`backend/src/server.js`)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./routes/api');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

app.use('/api', limiter, apiRoutes);

app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = Number(process.env.PORT || 5000);
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[SERVER] Employee Attendance & Automated Payroll API listening on port ${PORT}`);
  });
}

module.exports = app;
