// Offline PostgreSQL tests. Supply PGLITE_MODULE pointing to a separately installed
// @electric-sql/pglite. No Neon connection, browser, email or production secrets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const engine = new PGlite();
const queries = [];
let fail = false;
class Pool {
  on() {}
  async query(sql, params) {
    queries.push(sql);
    if (fail) throw new Error('synthetic failure containing private data');
    const r = await engine.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  }
}
require.cache[require.resolve('pg')] = { exports: { Pool } };
process.env.VERCEL_ENV = 'production';
process.env.VERCEL = '1';
process.env.POSTGRES_URL = 'postgres://synthetic.invalid/offline';
process.env.NODE_ENV = 'test';
process.env.ADMIN_SECRET = 'synthetic-test-only';
process.env.DB_METRICS = '1';
const logs = [];
const info = console.info;
console.info = x => logs.push(x);

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../server/db.js'), 'utf8');
  for (const m of source.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+) \(([\s\S]*?)\n      \)/g)) {
    await engine.exec(`CREATE TABLE ${m[1]} (${m[2]})`);
  }
  for (const m of source.matchAll(/addColumnIfNotExists\('([a-z_]+)', ['"]([^'"\n]+)['"]\)/g)) {
    await engine.exec(`ALTER TABLE ${m[1]} ADD COLUMN IF NOT EXISTS ${m[2]}`);
  }
  for (const m of source.matchAll(/ALTER TABLE events ADD COLUMN ([^`]+)`/g)) {
    await engine.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ${m[1]}`);
  }
  const db = require('../server/db');
  assert.equal(queries.length, 0, 'no cold-start migration queries');
  const media = 'data:image/png;base64,' + Buffer.alloc(1024 * 64, 7).toString('base64');
  await engine.exec("INSERT INTO events (slug, name, title, status, is_active, is_published, created_at, updated_at) VALUES ('fixture-event','Fixture','Fixture','registration_open',1,1,'2026-01-01','2026-01-01')");
  for (let i = 1; i <= 55; i++) {
    await engine.query(`INSERT INTO registrations (registration_id,event_id,full_name,phone,email,category,reg_status,payment_status,checked_in,certificate_eligible,amount,final_fee,payment_screenshot_url,created_at,updated_at) VALUES ($1,'fixture-event','Synthetic','0000000000','synthetic@example.invalid','Poetry',$2,$3,1,1,79,$4,$5,'2026-01-01','2026-01-01')`, ['TEST-'+i, i % 2 ? 'APPROVED':'VERIFIED', i % 2 ? 'PAID':'PENDING', i===1 ? 0 : 79,media]);
  }
  for (let i=1;i<=30;i++) await engine.query("INSERT INTO gallery_images (event_id,image_url,caption,is_published,display_order,created_at,updated_at) VALUES ('fixture-event',$1,'Fixture',1,0,'2026-01-01','2026-01-01')",[media]);
  await engine.query("INSERT INTO gallery_images (event_id,image_url,caption,is_published,created_at,updated_at) VALUES ('fixture-event',$1,'Private',0,'2026-01-01','2026-01-01')",[media]);
  for (let i=1;i<=55;i++) await engine.query("INSERT INTO users (name,email,phone,age,city,password_hash,created_at,updated_at) VALUES ('Synthetic',$1,'0000000000',25,'Test','not-a-real-password','2026-01-01','2026-01-01')",['fixture'+i+'@example.invalid']);
  const app=require('../server/index');
  await engine.query('UPDATE events SET poster_url = $1, banner_url = $1', [media]);
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  const request=(p,admin=false)=>fetch(base+p,{headers:admin?{'x-admin-secret':'synthetic-test-only'}:{}});
  try {
    const eventBody = await (await request('/api/events/active')).json();
    assert.equal(eventBody.success, true);
    assert(!JSON.stringify(eventBody).includes('base64'));
    assert.equal((await request(eventBody.event.posterUrl)).status, 200);
    assert.equal((await request('/api/events/1/media/meet_link')).status, 404);
    let r=await request('/api/gallery?eventId=fixture-event&limit=4'); let body=await r.json();
    assert.equal(body.images.length,4);assert.equal(body.hasMore,true);assert(!JSON.stringify(body).includes('base64'));
    const image=body.images[0].imageUrl;
    r=await request(image);assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,65536);
    assert.match(r.headers.get('cache-control'),/s-maxage=300/);
    r=await request('/api/gallery/image/31'); assert.equal(r.status,401);
    r=await request('/api/gallery/image/31',true); assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
    body=await (await request('/api/gallery?eventId=fixture-event&offset=24')).json();assert.equal(body.images.length,6);assert.equal(body.hasMore,false);
    body=await (await request('/api/events/fixture-event/gallery?limit=4')).json();assert.equal(body.images.length,4);
    let q=queries.length;
    body=await (await request('/api/admin/registrations?eventId=fixture-event&limit=50',true)).json();
    assert.equal(body.success,true);assert.equal(body.registrations.length,50);assert.equal(body.total,55);assert.equal(body.stats.approved,28);assert.equal(body.stats.pending,27);assert.equal(body.stats.revenue,27*79);assert(!JSON.stringify(body).includes('base64'));
    assert.equal(queries.length-q,2,'list + one aggregate');
    r=await request(body.registrations[0].paymentScreenshotUrl);assert.equal(r.status,401);
    r=await request(body.registrations[0].paymentScreenshotUrl,true);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
    body=await (await request('/api/admin/registrations?eventId=fixture-event&offset=50',true)).json();assert.equal(body.registrations.length,5);
    body=await (await request('/api/admin/overview?eventId=fixture-event',true)).json();assert.equal(body.stats.total,55);assert.equal(body.stats.certEligible,28);
    q=queries.length;body=await (await request('/api/admin/users',true)).json();assert.equal(body.users.length,50);assert.equal(body.hasMore,true);assert.equal(queries.length-q,1);assert(!JSON.stringify(body).includes('password_hash'));
    q=queries.length;body=await (await request('/api/admin/events',true)).json();assert.equal(body.success,true);assert.equal(queries.length-q,2);
    const cache=require('../server/services/readCache');cache.clear();q=queries.length;
    await Promise.all([db.getActiveEvent(),db.getActiveEvent()]);assert.equal(queries.length-q,1);
    await db.run("UPDATE events SET title = ? WHERE slug = ?",['Updated','fixture-event']);assert.equal((await db.getActiveEvent()).title,'Updated');
    const filtered=await require('../server/services/registrationStats').registrationStats(' WHERE event_id = ? AND reg_status = ?',['fixture-event','APPROVED']);assert.equal(filtered.total,28);
    fail=true;await assert.rejects(db.run('UPDATE registrations SET amount = 0'),/temporarily unavailable/);await assert.rejects(db.all('SELECT * FROM registrations'),/temporarily unavailable/);cache.clear();await assert.rejects(db.getActiveEvent(),/temporarily unavailable/);fail=false;
    assert(logs.length>0);assert(!logs.join('').match(/synthetic@example|TEST-|base64|postgres:\/\/|private data/));
    assert.equal((await engine.query('SELECT COUNT(*) AS n FROM registrations')).rows[0].n,55);
    info('PASS: PostgreSQL queries, image authorization, pagination, totals/free fees, cache invalidation, metrics privacy, and failed-write safety. No records removed.');
  } finally { server.closeAllConnections(); await new Promise(r=>server.close(r)); await engine.close();console.info=info; }
}
main().catch(async err=>{console.error(err.message);try { await engine.close(); } catch (_) {} process.exitCode=1;});
