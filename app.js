'use strict';
const express = require('express');
const logger = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const router = require('./routes');
const app = express();

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
if (process.env.FRONTEND_ORIGIN) {
  const origins = process.env.FRONTEND_ORIGIN.split(',').map(value => value.trim());
  app.use(cors({ origin: origins }));
}
app.use(logger(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
});
app.use('/obituary', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}));
app.use(router);
app.use((_req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use((error, _req, res, _next) => {
  const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error('API error:', error);
  res.status(status).json({ message: status === 500 ? 'An unexpected error occurred.' : error.message });
});
module.exports = app;
