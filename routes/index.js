const express = require('express');
const router = express.Router();
const { cacheMiddleware } = require('../libs/cache');
const extractObits = require('../libs/extractObits');
const fetchXmlToJson = require('../libs/xmlToJson');
const models = require('../models/index');
const { Op } = require('sequelize');

router.get('/', (req, res) => {
  res.status(200).json({ message: 'alive', status: 200 });
});


router.get(
  '/obituary/search',
  cacheMiddleware({ ttl: 600, useParams: true }),
  async (req, res, next) => {
    try {
      const {
        q,
        name,
        first_name,
        last_name,
        death,
        born,
        description,
        location,
        limit = 50,
        offset = 0
      } = req.query;

      const norm = (s) => (s ?? '').toString().trim().toLowerCase();

      const nQ = norm(q);
      const nName = norm(name);
      const nFirstName = norm(first_name);
      const nLastName = norm(last_name);
      const nDeath = norm(death);
      const nBorn = norm(born);
      const nDesc = norm(description);
      const nLoc = norm(location);

      const url1 = process.env.PIERCE_FUNERAL_HOME;
      const url2 = process.env.FAIRVIEW_FUNERAL_HOME;

      const [json1, json2] = await Promise.all([fetchXmlToJson(url1), fetchXmlToJson(url2)]);
      const obits1 = extractObits(json1);
      const obits2 = extractObits(json2);

      // Dedup scrape (pid first, else link)
      const byPid = new Map();
      const byLink = new Map();

      const add = (item) => {
        const pid = item?.pid;
        const link = item?.link;
        if (pid) {
          if (!byPid.has(pid)) byPid.set(pid, item);
        } else if (link) {
          if (!byLink.has(link)) byLink.set(link, item);
        }
      };

      obits1.forEach(add);
      obits2.forEach(add);

      const merged = [...Array.from(byPid.values()), ...Array.from(byLink.values())];

      // Filter ONLY using URL data
      const matchesUrl = (o) => {
        const first = norm(o.first_name);
        const last = norm(o.last_name);
        const person = norm(o.person);
        const birth = norm(o.birth);
        const deathV = norm(o.death);
        const descText = norm(o.text);
        const loc = norm(o.location);

        if (nQ) {
          const hay = `${person} ${first} ${last} ${birth} ${deathV} ${descText} ${loc}`.trim();
          if (!hay.includes(nQ)) return false;
        }

        if (nFirstName && !person.includes(nFirstName) && !(first + ' ' + last).includes(nFirstName)) return false;

        if (nLastName) {
          const full = `${first} ${last}`.trim();
          if (!person.includes(nLastName) && !last.includes(nLastName) && !full.includes(nLastName)) return false;
        }

        if (nBorn && !birth.includes(nBorn)) return false;
        if (nDeath && !deathV.includes(nDeath)) return false;
        if (nDesc && !descText.includes(nDesc)) return false;
        if (nLoc && !loc.includes(nLoc)) return false;

        return true;
      };

      const filtered = merged.filter(matchesUrl);

      // Score URL row against a DB row
      const score = (o, db) => {
        const oPerson = norm(o.person);
        const oFirst = norm(o.first_name);
        const oLast = norm(o.last_name);
        const oDeath = norm(o.death);
        const oBorn = norm(o.birth);

        const dbPerson = norm(db.person);
        const dbFirst = norm(db.first_name);
        const dbLast = norm(db.last_name);
        const dbDeath = norm(db.death);
        const dbBorn = norm(db.born);

        let s = 0;

        if (oPerson && dbPerson && oPerson === dbPerson) s += 6;
        if (oPerson && dbPerson && (oPerson.includes(dbPerson) || dbPerson.includes(oPerson))) s += 2;

        if (oFirst && dbFirst && oFirst === dbFirst) s += 4;
        if (oLast && dbLast && oLast === dbLast) s += 4;

        if (oFirst && dbFirst && (oFirst.includes(dbFirst) || dbFirst.includes(oFirst))) s += 1;
        if (oLast && dbLast && (oLast.includes(dbLast) || dbLast.includes(oLast))) s += 1;

        if (oDeath && dbDeath && oDeath === dbDeath) s += 4;
        if (oDeath && dbDeath && (oDeath.includes(dbDeath) || dbDeath.includes(oDeath))) s += 2;

        if (oBorn && dbBorn && oBorn === dbBorn) s += 3;
        if (oBorn && dbBorn && (oBorn.includes(dbBorn) || dbBorn.includes(oBorn))) s += 1;

        return s;
      };

      const wantsDb =
        (nDeath || nBorn || nDesc || nName || nFirstName || nLastName || nQ);

      // 1) DB rows for URL items (URL-first enrichment)
      let dbRows = [];
      if (wantsDb) {
        const MAX_DB_LOOKUP_CANDIDATES = 200;
        const urlCandidates = filtered.slice(0, MAX_DB_LOOKUP_CANDIDATES);

        const or = [];
        const seen = new Set();

        for (const c of urlCandidates) {
          const nm = c?.person || null;
          const b = c?.birth || null;
          const d = c?.death || null;

          if (nm) {
            const v = norm(nm);
            if (v && !seen.has(`person:${v}`)) {
              seen.add(`person:${v}`);
              or.push({ person: { [Op.like]: `%${nm}%` } });
            }
          }

          if (b) {
            const v = norm(b);
            if (v && !seen.has(`born:${v}`)) {
              seen.add(`born:${v}`);
              or.push({ born: { [Op.like]: `%${b}%` } });
            }
          }

          if (d) {
            const v = norm(d);
            if (v && !seen.has(`death:${v}`)) {
              seen.add(`death:${v}`);
              or.push({ death: { [Op.like]: `%${d}%` } });
            }
          }
        }

        if (or.length > 0) {
          dbRows = await models.obits.findAll({
            where: { [Op.or]: or },
            raw: true,
            limit: 800
          });
        }

        const MAX_DB_ROWS = 500;
        if (dbRows.length > MAX_DB_ROWS) dbRows = dbRows.slice(0, MAX_DB_ROWS);
      }

      // 2) DB-only rows (so DB matches show even when URL scrape doesn't match)
      let dbOnlyRows = [];
      if (wantsDb) {
        const or = [];

        if (nLastName) {
          or.push(
            { last_name: { [Op.like]: `%${last_name}%` } },
            { person: { [Op.like]: `%${last_name}%` } }
          );
        }

        if (nFirstName) {
          or.push(
            { first_name: { [Op.like]: `%${first_name}%` } },
            { person: { [Op.like]: `%${first_name}%` } }
          );
        }

        if (nBorn) or.push({ born: { [Op.like]: `%${born}%` } });
        if (nDeath) or.push({ death: { [Op.like]: `%${death}%` } });

        if (nDesc) or.push({ text: { [Op.like]: `%${description}%` } });

        if (nName) or.push({ person: { [Op.like]: `%${name}%` } });

        if (nQ) {
          or.push(
            { person: { [Op.like]: `%${q}%` } },
            { text: { [Op.like]: `%${q}%` } },
            { born: { [Op.like]: `%${q}%` } },
            { death: { [Op.like]: `%${q}%` } }
          );
        }

        if (or.length > 0) {
          dbOnlyRows = await models.obits.findAll({
            where: { [Op.or]: or },
            raw: true,
            limit: 200
          });
        }
      }

      const MAX_DB_CANDIDATES = 5;

      // URL results with appended db_matches under each URL item
      const enrichedUrl = filtered.map((o) => {
        const scored = dbRows
          .map((db) => ({ db, s: score(o, db) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, MAX_DB_CANDIDATES);

        return {
          ...o,
          db_appends: scored.map((x) => ({
            match_score: x.s,
            id: x.db.id,
            person: x.db.person,
            born: x.db.born,
            death: x.db.death,
            maiden_name: x.db.maiden_name,
            first_name: x.db.first_name,
            last_name: x.db.last_name,
            text: x.db.text,
            subbmitter: x.db.subbmitter,
            active: x.db.active
          })),
          source: 'url'
        };
      });

      // Append DB-only results as additional items in the same results list
      const urlPersonKeys = new Set(enrichedUrl.map((x) => norm(x.person)).filter(Boolean));

      const dbOnlyEnriched = (dbOnlyRows || [])
        .map((db) => {
          const key = norm(db.person);
          if (urlPersonKeys.has(key)) return null;

          return {
            pid: null,
            person: db.person,
            first_name: db.first_name,
            last_name: db.last_name,
            age: null,
            birth: db.born,      // map DB born->birth to match UI keys
            death: db.death,
            text: db.text,
            thumbnail: null,
            link: null,
            location: null,
            service_date: null,
            upgrade_type: null,
            created_at: null,

            db_appends: [
              {
                match_score: 1,
                id: db.id,
                person: db.person,
                born: db.born,
                death: db.death,
                maiden_name: db.maiden_name,
                first_name: db.first_name,
                last_name: db.last_name,
                text: db.text,
                subbmitter: db.subbmitter,
                active: db.active
              }
            ],
            source: 'db'
          };
        })
        .filter(Boolean);

      const finalResults = [...enrichedUrl, ...dbOnlyEnriched];

      const total = finalResults.length;
      const items = finalResults.slice(Number(offset), Number(offset) + Number(limit));

      res.json({
        total,
        count: items.length,
        offset: Number(offset),
        limit: Number(limit),
        results: items
      });
    } catch (err) {
      next(err);
      console.log('Error');
    }
  }
);

module.exports = router;

/*
/obituary/search?q=edward wilcox
/obituary/search?last_name=wilcox&born=dec+28+1943
/obituary/search?death=jun+19+2026
`/obituary/search?description=body+text&limit=25
*/