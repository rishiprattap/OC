const assert = require('node:assert/strict');
process.env.VERCEL = '1';
process.env.VERCEL_ENV = 'preview';
process.env.NODE_ENV = 'test';
process.env.POSTGRES_URL = 'postgres://must-not-be-used.invalid/production';
process.env.DATABASE_URL = process.env.POSTGRES_URL;
delete process.env.PREVIEW_DATABASE_URL;
require.cache[require.resolve('pg')] = { exports: { Pool: class {
  constructor() { throw new Error('Preview attempted to use production connection'); }
} } };
const db = require('../server/db');
const app = require('../server/index');
async function main() {
  assert.equal(db.pool, null);
  await assert.rejects(db.getActiveEvent(), /unavailable/);
  await assert.rejects(db.run('INSERT INTO registrations (id) VALUES (1)'), /unavailable/);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const route of ['/api/events', '/api/admin/registrations', '/api/user/registrations']) {
      const res = await fetch(base + route);
      assert.equal(res.status, 503);
      assert.match((await res.json()).error, /isolated/);
    }
    assert.equal((await fetch(base + '/admin')).status, 200);
    console.log('PASS: preview ignores shared production credentials, rejects DB operations, serves static UI.');
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
