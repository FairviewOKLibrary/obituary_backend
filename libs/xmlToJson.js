'use strict';
const xmlToJson = require('xml-to-json-stream');

async function fetchXmlToJson(url) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Obituary feed URL is not configured correctly');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(7000),
    headers: { Accept: 'application/xml, text/xml, */*' },
  });
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 3_000_000) throw new Error('Feed is larger than allowed');
  const xmlText = await response.text();
  if (xmlText.length > 3_000_000) throw new Error('Feed is larger than allowed');
  return new Promise((resolve, reject) => {
    xmlToJson({ attributeMode: false }).xmlToJson(xmlText, (error, json) => error ? reject(error) : resolve(json));
  });
}

module.exports = fetchXmlToJson;
