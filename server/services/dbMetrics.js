const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
const context = new AsyncLocalStorage();

function middleware(req, res, next) {
  if (process.env.DB_METRICS !== '1') return next();
  const group = ['/api/admin/events', '/api/admin/gallery', '/api/admin/meet', '/api/admin', '/api/gallery', '/api/events', '/api/registrations', '/api/payments', '/api/certificate', '/api/scanner', '/api/otp', '/api/auth', '/api/user', '/api/email'].find(prefix => req.path === prefix || req.path.startsWith(prefix + '/')) || 'other';
  const stats = { queries: 0, rows: 0, resultBytes: 0, queryMs: 0, errors: 0 };
  context.run(stats, () => {
    res.on('finish', () => {
      if (process.env.DB_METRICS !== '1' || !stats.queries) return;
      // Only a route template fingerprint: never URLs, IDs, SQL, params, errors or rows.
      const template = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
      const endpoint = crypto.createHash('sha256').update(req.method + ':' + group + ':' + template).digest('hex').slice(0, 12);
      console.info(JSON.stringify({ type: 'db_usage', endpoint, group, method: req.method,
        status: res.statusCode, ...stats, queryMs: Math.round(stats.queryMs) }));
    });
    next();
  });
}

async function query(pool, sql, params) {
  const stats = context.getStore();
  const start = performance.now();
  if (stats) stats.queries++;
  try {
    const result = await pool.query(sql, params);
    if (stats) {
      stats.rows += result.rows.length;
      stats.resultBytes += Buffer.byteLength(JSON.stringify(result.rows));
    }
    return result;
  } catch (err) {
    if (stats) stats.errors++;
    throw err;
  } finally {
    if (stats) stats.queryMs += performance.now() - start;
  }
}
module.exports = { middleware, query };
