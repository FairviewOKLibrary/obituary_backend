# Fairview City Library · Obituary API

Express API for the Library's existing MySQL `obits` table, plus optional funeral-home XML feeds. Records in the table are **not** changed or migrated.

## Start

Use Node.js **20+** and MySQL with the existing `obits` table.

```bash
cp .env.example .env
# Set database credentials and optional feed URLs in .env
npm ci
npm run dev
```

- Health check: `http://localhost:3001/health`
- Search: `http://localhost:3001/obituary/search?q=smith`
- Individual record: `http://localhost:3001/obituary/archive-123` (also supports `notice-…` IDs while the notice remains in the feed)
- Browse: `http://localhost:3001/obituary/search?limit=12&offset=0`
- Filters: `q`, `name`, `first_name`, `last_name`, `born`, `death`, `description`, `location`
- Source: `source=all|archive|notices` (default `all`)
- Pagination: `limit` (max 48), `offset` (zero-based). Old `page` is accepted as an offset.

`total` counts matching records, and `results` is a paginated list with consistent `birth`, `death`, `maiden_name`, `source` and `id` fields. On a missing feed, the API continues with archive records and supplies a `warnings` array. If MySQL is unavailable, it returns `503` when there are no matching notices.

The home page browser accesses this service through Next.js at `/api/obituaries`; `FRONTEND_ORIGIN` only needs to be set for direct, cross-origin use of the API.

## Checks

```bash
npm test
```

The service caches feed downloads for 10 minutes and search responses for 90 seconds. No personal info is logged from search terms. Do not store secrets in the ZIP or commit `.env` to source control.
