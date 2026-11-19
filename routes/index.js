'use strict';
const express = require('express');
const { cacheMiddleware } = require('../libs/cache');
const { getNotices } = require('../libs/feedService');
const models = require('../models');
const { Op } = require('sequelize');
const sanitizeHtml = require('sanitize-html');
const { norm, parseSearch, matchesNotice, makeArchiveWhere, samePerson, normalizeArchiveRecord } = require('../libs/search');
const router = express.Router();

router.get('/', (_req, res) => res.json({ status: 'ok', service: 'Fairview City Library Obituary API' }));
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.get('/obituary/search', cacheMiddleware({ ttl: 90 }), async (req, res, next) => {
  try {
    const { filters, source, limit, offset } = parseSearch(req.query);
    const warnings = [];
    let notices = [];
    if (source !== 'archive') {
      const feed = await getNotices();
      if (feed.warning) warnings.push(feed.warning);
      notices = feed.records.filter(item => matchesNotice(item, filters)).map(item => ({ ...item }));
    }

    let archiveCount = 0;
    let archiveRecords = [];
    if (source !== 'notices') {
      let excludedIds = [];
      if (source === 'all' && notices.length) {
        // Load only same-name candidates so duplicate notices are not counted twice.
        const distinctNames = [...new Set(notices.map(x => x.person).filter(Boolean))].slice(0, 300);
        try {
          const collisions = await models.obits.findAll({
            attributes: ['id', 'person', 'born', 'death', 'first_name', 'last_name', 'maiden_name', 'text'],
            where: { person: { [Op.in]: distinctNames } },
            raw: true,
          });
          const byName = new Map();
          for (const notice of notices) {
            const key = norm(notice.person);
            if (!byName.has(key)) byName.set(key, []);
            byName.get(key).push(notice);
          }
          excludedIds = collisions.filter(db => {
            const matchingNotice = sanitizeHtml((byName.get(norm(db.person)) || []).find(notice => samePerson(notice, db)));
            if (!matchingNotice) return false;
            const archive = normalizeArchiveRecord(db);
            // Keep unique notices, but retain useful archival details if the notice is incomplete.
            matchingNotice.birth ||= archive.birth;
            matchingNotice.death ||= archive.death;
            matchingNotice.maiden_name ||= archive.maiden_name;
            matchingNotice.text ||= archive.text;
            return true;
          }).map(x => x.id);
        } catch (error) {
          warnings.push('Library archive records are temporarily unavailable.');
          console.error('Archive duplicate check failed:', error.message);
        }
      }
      try {
        const where = makeArchiveWhere(filters, excludedIds);
        archiveCount = await models.obits.count({ where });
        const archiveStart = Math.max(0, offset - notices.length);
        const archiveSlots = Math.max(0, limit - Math.max(0, Math.min(limit, notices.length - offset)));
        if (archiveSlots > 0 && archiveStart < archiveCount) {
          const rows = await models.obits.findAll({
            where,
            order: [['id', 'DESC']],
            offset: archiveStart,
            limit: archiveSlots,
            raw: true,
          });
          archiveRecords = rows.map(normalizeArchiveRecord);
        }
      } catch (error) {
        warnings.push('Library archive records are temporarily unavailable.');
        console.error('Archive query failed:', error.message);
        if (!notices.length) return res.status(503).json({ message: 'The archive is temporarily unavailable. Please try again.' });
      }
    }

    const feedPage = notices.slice(offset, offset + limit);
    const results = [...feedPage, ...archiveRecords].slice(0, limit);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({
      total: notices.length + archiveCount,
      count: results.length,
      limit,
      offset,
      results,
      warnings,
    });
  } catch (error) { next(error); }
});

router.get('/obituary/:id', cacheMiddleware({ ttl: 120 }), async (req, res, next) => {
  try {
    const { id } = req.params;
    let record = null;
    if (/^archive-\d{1,12}$/.test(id)) {
      const row = await models.obits.findByPk(Number(id.slice(8)), { raw: true });
      if (row) record = normalizeArchiveRecord(row);
    } else if (/^notice-[a-f0-9]{16}$/.test(id)) {
      const feed = await getNotices();
      record = feed.records.find(item => item.id === id) || null;
    } else {
      return res.status(400).json({ message: 'Invalid record identifier.' });
    }
    if (!record) return res.status(404).json({ message: 'Record not found.' });
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res.json({ record });
  } catch (error) { next(error); }
});

module.exports = router;
