'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { parseSearch, normalizeFeedRecord, normalizeArchiveRecord, dedupeNotices, matchesNotice, makeArchiveWhere, samePerson } = require('../libs/search');

test('default search allows browsing with capped pagination', () => {
  assert.deepEqual(pick(parseSearch({})), { limit: 12, offset: 0, source: 'all' });
  assert.deepEqual(pick(parseSearch({ limit: '100', page: '24' })), { limit: 48, offset: 24, source: 'all' });
  assert.throws(() => parseSearch({ offset: '-2' }), /Invalid offset/);
  assert.throws(() => parseSearch({ source: 'other' }), /Invalid source/);
});
function pick({ limit, offset, source }) { return { limit, offset, source }; }

test('feed deduplication uses source IDs and preserves namesakes', () => {
  const records = dedupeNotices([
    { pid: 'A', person: 'Taylor Example', death: '2021' },
    { pid: 'A', person: 'Taylor Example', death: '2021' },
    { pid: 'B', person: 'Taylor Example', death: '2023' },
  ]);
  assert.equal(records.length, 2);
});

test('normalization strips unsafe markup and rejects unsafe URLs', () => {
  const item = normalizeFeedRecord({ person: '<b>Alex</b> Example', text: '<script>alert(1)</script>Remembered by family.', link: 'javascript:alert(1)' });
  assert.equal(item.person, 'Alex Example');
  assert.equal(item.link, null);
  assert.equal(item.text.includes('<'), false);
  assert.equal(normalizeArchiveRecord({ id: 3, person: 'Example', born: '1930' }).birth, '1930');
});

test('searches every term and chosen field', () => {
  const item = normalizeFeedRecord({ person: 'Jordan Example', birth: '1941', death: '2021', text: 'Lifelong teacher' });
  assert.ok(matchesNotice(item, { q: 'jordan 2021' }));
  assert.ok(matchesNotice(item, { last_name: 'example', born: '1941' }));
  assert.ok(!matchesNotice(item, { q: 'jordan 2023' }));
});

test('archive where applies AND across fields, escapes wildcard chars', () => {
  const condition = makeArchiveWhere({ last_name: 'Sm_th', death: '2001', q: 'May' }, [3]);
  assert.equal(condition[Op.and].length, 4);
  assert.equal(condition[Op.and][1][Op.or][0].last_name[Op.like], '%Sm\\_th%');
});

test('different namesakes are not merged without matching dates', () => {
  const notice = { person: 'Alex Example', death: 'May 22 2024', birth: null };
  assert.ok(samePerson(notice, { person: 'Alex Example', death: 'May 22 2024' }));
  assert.ok(!samePerson(notice, { person: 'Alex Example', death: '2023' }));
});

test('both archive records and funeral-home notices return cleaned multi-paragraph text', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures/encoded-obituary.txt'), 'utf8');
  const archive = normalizeArchiveRecord({ id: 21, person: 'Shirley Mae Epps Jones', text: raw });
  const notice = normalizeFeedRecord({ pid: '21', person: 'Shirley Mae Epps Jones', text: raw });
  for (const record of [archive, notice]) {
    assert.equal(record.text.split('\n\n').length, 5);
    assert.match(record.text, /element—visiting with customers/);
    assert.match(record.text, /Shirley’s wishes/);
    assert.doesNotMatch(record.text, /style=|<span|&lt;/i);
  }
});
