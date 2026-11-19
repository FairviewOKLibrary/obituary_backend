'use strict';

// This utility returns TEXT, never HTML. It handles the encoded HTML from
// rich-text obituary editors, including double-/triple-encoded entities.
const ENTITIES = require('./htmlEntities.json');

const MAX_INPUT_LENGTH = 250_000;
const MAX_DECODE_PASSES = 6;
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl',
  'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);
const IGNORE_CONTENT_TAGS = new Set([
  'script', 'style', 'template', 'svg', 'iframe', 'object', 'noscript', 'head',
]);

// HTML5 entity names include accented characters, punctuation, &mdash;,
// &rsquo;, and entities that omit a semicolon. Numeric entities are decoded too.
function decodeEntitiesOnce(value) {
  return value.replace(/&(#(?:[xX][0-9a-fA-F]+|\d+);?|[a-zA-Z][a-zA-Z0-9]*;?)/g, (whole, entity) => {
    if (entity[0] !== '#') return Object.hasOwn(ENTITIES, entity) ? ENTITIES[entity] : whole;
    const hex = entity[1]?.toLowerCase() === 'x';
    const digits = entity.slice(hex ? 2 : 1).replace(/;$/, '');
    let codePoint = parseInt(digits, hex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint === 0 || codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '\ufffd';
    // HTML5 maps legacy Windows-1252 numeric references to punctuation.
    const win1252 = {
      128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224,
      135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338,
      142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226,
      150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250,
      156: 339, 158: 382, 159: 376,
    };
    codePoint = win1252[codePoint] || codePoint;
    return String.fromCodePoint(codePoint);
  });
}

function decodeRepeatedEntities(value) {
  let text = value;
  for (let attempt = 0; attempt < MAX_DECODE_PASSES; attempt++) {
    const decoded = decodeEntitiesOnce(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function readTag(input, from) {
  // Treat a literal less-than sign (e.g. "age < 10") as text rather than a tag.
  const candidate = input.slice(from).match(/^<(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)(?=[\s/>])/);
  if (!candidate) return null;
  let quote = null;
  let end = from + candidate[0].length;
  for (; end < input.length; end++) {
    const char = input[end];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return { name: candidate[2].toLowerCase(), closing: Boolean(candidate[1]), end: end + 1 };
    }
  }
  return null;
}

function obituaryToPlainText(value, maxLength = 30000) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const source = decodeRepeatedEntities(String(value).slice(0, MAX_INPUT_LENGTH));
  const result = [];
  let cursor = 0;
  let ignoredDepth = 0;
  while (cursor < source.length) {
    const index = source.indexOf('<', cursor);
    if (index < 0) {
      if (!ignoredDepth) result.push(source.slice(cursor));
      break;
    }
    if (!ignoredDepth) result.push(source.slice(cursor, index));

    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    if (/^<![a-z\[]/i.test(source.slice(index, index + 4)) || source.startsWith('<?', index)) {
      const end = source.indexOf('>', index + 2);
      cursor = end < 0 ? source.length : end + 1;
      continue;
    }
    const tag = readTag(source, index);
    if (!tag) {
      if (!ignoredDepth) result.push('<');
      cursor = index + 1;
      continue;
    }
    cursor = tag.end;
    if (IGNORE_CONTENT_TAGS.has(tag.name)) {
      if (tag.closing) ignoredDepth = Math.max(0, ignoredDepth - 1);
      else if (!source.slice(index, tag.end).endsWith('/>')) ignoredDepth++;
      continue;
    }
    if (ignoredDepth) continue;
    if (tag.name === 'br') {
      result.push('\n');
    } else if (tag.name === 'hr' || BLOCK_TAGS.has(tag.name)) {
      result.push('\n\n');
    }
    // All tags and attributes are discarded, including inline style= and data-pasted=.
  }

  return result.join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, Math.max(0, maxLength));
}

module.exports = { obituaryToPlainText, decodeRepeatedEntities };
