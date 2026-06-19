const NodeCache = require('node-cache');
const cache = new NodeCache(); // pass options like { stdTTL: 60, checkperiod: 120 }

function cacheMiddleware(options = {}) {
  const {
    ttl = 60,                 // seconds
    useQuery = true,
    useParams = false,
    useBody = false,
    keyPrefix = 'cache:',
    skip = null               // fn (req) => true to skip caching for this request
  } = options;

  return (req, res, next) => {
    if (typeof skip === 'function' && skip(req)) return next();

    const parts = [keyPrefix, req.method, req.originalUrl];
    if (useParams) parts.push(JSON.stringify(req.params));
    if (useQuery) parts.push(JSON.stringify(req.query));
    if (useBody && ['POST','PUT','PATCH'].includes(req.method)) parts.push(JSON.stringify(req.body));
    const key = parts.join('|');

    const cached = cache.get(key);
    if (cached) {
      res.set(cached.headers || {});
      return res.status(cached.status || 200).send(cached.body);
    }

    // capture response
    const _send = res.send.bind(res);
    const chunks = [];
    res.send = function (body) {
      // only cache on success (200-299)
      try {
        const status = res.statusCode;
        if (status >= 200 && status < 300) {
          const headers = {};
          // choose which headers to store (content-type, cache-control, etc.)
          ['content-type','cache-control'].forEach(h => {
            if (res.getHeader(h)) headers[h] = res.getHeader(h);
          });
          cache.set(key, { status, headers, body }, ttl);
        }
      } catch (e) {
        // ignore cache errors
      }
      return _send(body);
    };

    next();
  };
}

module.exports = { cacheMiddleware, cache };
