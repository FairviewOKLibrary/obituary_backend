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


/*

Weird text error.

	'&lt;p data-pasted="true"&gt;&lt;span style="font-size: 24px;"&gt;Shirley Mae Epps Jones, age 91, of Fairview, Oklahoma, passed away peacefully on June 24, 2026. Shirley was born on November 27, 1934, in Booneville, Arkansas, to Hiram Tatum Epps and Nellie Mae Davis Epps.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style="font-size: 24px;"&gt;Shirley lived a life filled with laughter, friendship, and a genuine love for people. She spent many years as a bartender, where she was in her element&amp;mdash;visiting with customers, making new friends, and making everyone feel welcome. She loved entertaining and had a gift for bringing people together. Her outgoing personality, quick sense of humor, and kind heart left a lasting impression on everyone she met.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style="font-size: 24px;"&gt;Shirley was mother to Teresa Lynn Homesley, LaDonna Kay Dupus, and Shannon Rhenee Brown. She was blessed with 10 grandchildren and 13 great-grandchildren, all of whom brought her immense pride and joy.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style="font-size: 24px;"&gt;In accordance with Shirley&amp;rsquo;s wishes, no services will be held.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style="font-size: 24px;"&gt;Shirley will be remembered for her friendly spirit, her love of visiting with others, and the many happy memories she created with family and friends. Her legacy of kindness, laughter, and love will continue to live on in the hearts of all who knew and loved her.&lt;/span&gt;&lt;/p&gt;'

*/