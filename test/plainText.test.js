'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { obituaryToPlainText } = require('../libs/plainText');

test('cleans the exact encoded obituary example and keeps five readable paragraphs', () => {
  const encoded = fs.readFileSync(path.join(__dirname, 'fixtures/encoded-obituary.txt'), 'utf8');
  const clean = obituaryToPlainText(encoded);
  const paragraphs = clean.split('\n\n');
  assert.equal(paragraphs.length, 5);
  assert.match(paragraphs[0], /^Shirley Mae Epps Jones, age 91/);
  assert.match(paragraphs[1], /element—visiting with customers/);
  assert.match(paragraphs[3], /Shirley’s wishes/);
  assert.match(paragraphs[4], /Shirley will be remembered/);
  assert.doesNotMatch(clean, /&(?:lt|gt|amp|mdash|rsquo|nbsp);|<\/?[a-z]|style=|data-pasted=/i);
});

test('cleans nested encodings, removes styling and scripts rather than leaving code', () => {
  const encoded = '&amp;lt;p style=&quot;color: red&quot;&amp;gt;Hello&amp;lt;/p&amp;gt;' +
    '&amp;lt;style&amp;gt;.notice {color: red}&amp;lt;/style&amp;gt;' +
    '&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;';
  assert.equal(obituaryToPlainText(encoded), 'Hello');
});

test('preserves plain text punctuation, accent entities and line breaks', () => {
  assert.equal(obituaryToPlainText('Life &amp;amp; love&lt;br&gt;O&amp;rsquo;Neil &amp;mdash; 2026'),
    'Life & love\nO’Neil — 2026');
  assert.equal(obituaryToPlainText('Age &lt; 100 and 5 &gt; 3. José &eacute;lan.'),
    'Age < 100 and 5 > 3. José élan.');
  assert.equal(obituaryToPlainText('<p>One</p><p>Two</p>'), 'One\n\nTwo');
  assert.equal(obituaryToPlainText('Tom<br>Jane'), 'Tom\nJane');
});

test('ignores comments, SVG and quoted angle brackets inside style attributes', () => {
  const input = '<!-- old --> <p style="content: > not markup">A</p>' +
    '<svg><text>unwanted SVG</text></svg><p>B</p>';
  assert.equal(obituaryToPlainText(input), 'A\n\nB');
});

test('protects against invalid inputs and truncates the final cleaned text', () => {
  assert.equal(obituaryToPlainText(null), '');
  assert.equal(obituaryToPlainText({ a: 1 }), '');
  assert.equal(obituaryToPlainText('<p>Hello</p>', 3), 'Hel');
  assert.equal(obituaryToPlainText('&#8217; &#x2014;'), '’ —');
});
