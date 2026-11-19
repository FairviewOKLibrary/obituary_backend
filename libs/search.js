'use strict';

const crypto = require('node:crypto');
const { obituaryToPlainText } = require('./plainText');
const { Op } = require('sequelize');

const TEXT_FIELDS = ['q', 'name', 'first_name', 'last_name', 'born', 'death', 'description', 'location'];
const MAX_QUERY_LENGTH = 120;
const MAX_LIMIT = 48;
const clean = (value, maxLength = 2000) => {
  if (value === undefined || value === null) return '';
  return obituaryToPlainText(value, maxLength * 4)
    .replace(/\s+/g, ' ').trim().slice(0, maxLength);
};
const norm = (value) => String(value ?? '').trim().toLocaleLowerCase('en-US');
const validExternalUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
};

function parseSearch(query = {}) {
  const filters = {};
  for (const key of TEXT_FIELDS) {
    if (Array.isArray(query[key]) || (query[key] && typeof query[key] === 'object')) {
      const error = new Error(`Invalid ${key} filter`); error.status = 400; throw error;
    }
    filters[key] = clean(query[key], MAX_QUERY_LENGTH);
  }
  const numberParam = (value, defaultValue, maximum, field) => {
    if (value === undefined || value === '') return defaultValue;
    if (Array.isArray(value) || !/^\d+$/.test(String(value))) {
      const error = new Error(`Invalid ${field}`); error.status = 400; throw error;
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number)) { const error = new Error(`Invalid ${field}`); error.status = 400; throw error; }
    return Math.min(number, maximum);
  };
  const source = query.source || 'all';
  if (!['all', 'archive', 'notices'].includes(source)) {
    const error = new Error('Invalid source'); error.status = 400; throw error;
  }
  // Backwards compatible: the old API's `page` parameter was an absolute row offset.
  const offsetValue = query.offset ?? query.page;
  return {
    filters,
    source,
    limit: Math.max(1, numberParam(query.limit, 12, MAX_LIMIT, 'limit')),
    offset: numberParam(offsetValue, 0, 1000000, 'offset'),
  };
}

function normalizeFeedRecord(record) {
  const first_name = clean(record.first_name, 140);
  const last_name = clean(record.last_name, 140);
  const person = clean(record.person, 300) || [first_name, last_name].filter(Boolean).join(' ');
  if (!person) return null;
  const birth = clean(record.birth ?? record.born, 100);
  const death = clean(record.death, 100);
  const pid = clean(record.pid, 140);
  const link = validExternalUrl(record.link);
  const identifier = pid ? `${pid}|${person}|${death}` : link || `${person}|${birth}|${death}`;
  return {
    id: `notice-${crypto.createHash('sha256').update(identifier).digest('hex').slice(0, 16)}`,
    pid: pid || null, person, first_name, last_name,
    birth: birth || null, death: death || null,
    maiden_name: clean(record.maiden_name ?? record.maidenName, 140) || null,
    text: obituaryToPlainText(record.text ?? record.description, 30000) || null,
    location: clean(record.location, 300) || null,
    thumbnail: validExternalUrl(record.thumbnail),
    link,
    source: 'url',
  };
}

function normalizeArchiveRecord(record) {
  return {
    id: `archive-${record.id}`,
    person: clean(record.person, 300) || [clean(record.first_name, 140), clean(record.last_name, 140)].filter(Boolean).join(' ') || 'Name unavailable',
    first_name: clean(record.first_name, 140),
    last_name: clean(record.last_name, 140),
    birth: clean(record.born, 100) || null,
    death: clean(record.death, 100) || null,
    maiden_name: clean(record.maiden_name, 140) || null,
    text: obituaryToPlainText(record.text, 30000) || null,
    location: null,
    thumbnail: null,
    link: null,
    source: 'db',
  };
}

function recordKey(record) {
  return `${norm(record.person)}|${norm(record.death)}|${norm(record.birth)}`;
}

function dedupeNotices(records) {
  const seen = new Set();
  const seenPeople = new Set();
  const result = [];
  for (const raw of records) {
    const item = normalizeFeedRecord(raw);
    if (!item) continue;
    // Only regard identical names as the same person when dates also agree,
    // unless the provider supplies an identifier or canonical URL.
    const key = item.pid ? `pid:${item.pid}:${norm(item.person)}` : item.link ? `link:${item.link}` : `record:${recordKey(item)}`;
    const personDate = item.birth || item.death ? recordKey(item) : null;
    if (seen.has(key) || (personDate && seenPeople.has(personDate))) continue;
    seen.add(key);
    if (personDate) seenPeople.add(personDate);
    result.push(item);
  }
  return result;
}

function matchesNotice(item, filters) {
  const values = {
    q: [item.person, item.first_name, item.last_name, item.birth, item.death, item.text, item.location, item.maiden_name].join(' '),
    name: item.person,
    first_name: `${item.first_name} ${item.person}`,
    last_name: `${item.last_name} ${item.person}`,
    born: item.birth,
    death: item.death,
    description: item.text,
    location: item.location,
  };
  return Object.entries(filters).every(([key, value]) => {
    if (!value) return true;
    if (key === 'q') {
      const haystack = norm(values.q);
      return norm(value).split(/\s+/).every(token => haystack.includes(token));
    }
    return norm(values[key]).includes(norm(value));
  });
}

const sqlContains = (value) => ({ [Op.like]: `%${String(value).replace(/[\\%_]/g, '\\$&')}%` });
function makeArchiveWhere(filters, excludedIds = []) {
  // Archive schema has no gravestone location column.
  if (filters.location) return { id: { [Op.eq]: -1 } };
  const terms = [];
  if (filters.q) {
    for (const token of filters.q.split(/\s+/).slice(0, 8)) {
      terms.push({ [Op.or]: ['person', 'first_name', 'last_name', 'maiden_name', 'text', 'born', 'death'].map(field => ({ [field]: sqlContains(token) })) });
    }
  }
  if (filters.name) terms.push({ person: sqlContains(filters.name) });
  if (filters.first_name) terms.push({ [Op.or]: [{ first_name: sqlContains(filters.first_name) }, { person: sqlContains(filters.first_name) }] });
  if (filters.last_name) terms.push({ [Op.or]: [{ last_name: sqlContains(filters.last_name) }, { person: sqlContains(filters.last_name) }] });
  if (filters.born) terms.push({ born: sqlContains(filters.born) });
  if (filters.death) terms.push({ death: sqlContains(filters.death) });
  if (filters.description) terms.push({ text: sqlContains(filters.description) });
  if (excludedIds.length) terms.push({ id: { [Op.notIn]: excludedIds } });
  return terms.length ? { [Op.and]: terms } : {};
}

function samePerson(notice, archive) {
  if (norm(notice.person) !== norm(archive.person)) return false;
  const birthMatches = notice.birth && archive.born && norm(notice.birth) === norm(archive.born);
  const deathMatches = notice.death && archive.death && norm(notice.death) === norm(archive.death);
  // Do not collapse namesakes without a matching date.
  return Boolean(birthMatches || deathMatches);
}

module.exports = {
  clean, norm, parseSearch, normalizeFeedRecord, normalizeArchiveRecord,
  dedupeNotices, matchesNotice, makeArchiveWhere, samePerson,
};
