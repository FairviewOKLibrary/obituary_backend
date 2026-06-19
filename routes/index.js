const express = require('express');
const router = express.Router();
const xmlToJson = require('xml-to-json-stream');
const fetch = global.fetch || require('node-fetch'); // Node >=18 has global fetch
const sanitizeHtml = require('sanitize-html');
const { cacheMiddleware } = require('../libs/cache');

async function fetchXmlToJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Upstream ${response.status}: ${response.statusText}`);
  const xmlText = await response.text();

  return new Promise((resolve, reject) => {
    const parser = xmlToJson({ attributeMode: false });
    parser.xmlToJson(xmlText, (err, json) => {
      if (err) return reject(err);
      resolve(json);
    });
  });
}

function extractObits(json) {
  // Adjust this if your parsed shape differs
  const obits = json?.obits?.obit ?? json?.obits ?? [];
  if (Array.isArray(obits)) return obits;
  if (obits) return [obits];
  return [];
}

router.get('/', (req, res) => {
  res.json({ message: 'alive' });
});

router.get(
  '/xml',
  cacheMiddleware({ ttl: 30, useParams: true }),
  async (req, res, next) => {
    try {
      const url = process.env.PIERCE_FUNERAL_HOME;
      console.log(url)
      const json = await fetchXmlToJson(url);

      const html = '<strong>hello world</strong>';

      const data = {
        url: 'www.piecefuneralhomes.com',
        html,
        sanitized: sanitizeHtml(html),
        obits: extractObits(json),
      };

      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
