'use strict';

const fetchXmlToJson = require('./xmlToJson');
const extractObits = require('./extractObits');
const { dedupeNotices } = require('./search');

const TTL_MS = 10 * 60 * 1000;
let current = { records: [], refreshedAt: 0, warning: null };
let inflight = null;

async function getNotices() {
  if (Date.now() - current.refreshedAt < TTL_MS) return current;
  if (inflight) return inflight;
  const sources = [process.env.PIERCE_FUNERAL_HOME, process.env.FAIRVIEW_FUNERAL_HOME].filter(Boolean);
  if (!sources.length) {
    current = { records: [], refreshedAt: Date.now(), warning: null };
    return current;
  }
  inflight = (async () => {
    const settled = await Promise.allSettled(sources.map(url => fetchXmlToJson(url)));
    const results = settled.flatMap((result) => result.status === 'fulfilled' ? extractObits(result.value) : []);
    const failures = settled.filter(result => result.status === 'rejected');
    if (failures.length) console.warn('One or more obituary feeds could not be refreshed:', failures.map(x => x.reason?.message).join('; '));
    current = {
      records: results.length ? dedupeNotices(results) : (failures.length ? current.records : []),
      refreshedAt: Date.now(),
      warning: failures.length ? 'Some funeral home notices are temporarily unavailable.' : null,
    };
    return current;
  })();
  try { return await inflight; } finally { inflight = null; }
}

module.exports = { getNotices };
