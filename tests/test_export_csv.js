/**
 * Verification test for Participant CSV Download with Filters
 */
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../server/config');

const BASE_URL = `http://localhost:${config.PORT || 3000}`;
const ADMIN_SECRET = process.env.ADMIN_SECRET || config.ADMIN_SECRET || 'R!SHI88';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD || 'R!SHI88_Admin';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'x-admin-secret': ADMIN_SECRET,
        'x-admin-password': ADMIN_PASSWORD,
        ...headers
      }
    };

    if (body) {
      const data = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => rawData += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: rawData
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseCsv(text) {
  // strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  
  function parseLine(line) {
    const values = [];
    let insideQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = parseLine(l);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] !== undefined ? vals[idx] : '';
    });
    return obj;
  });

  return { headers, rows };
}

async function runTests() {
  console.log('--- Testing Participant CSV Download with Filters ---');
  let passed = 0;
  let total = 0;

  function assert(cond, msg) {
    total++;
    if (cond) {
      console.log(`✓ ${msg}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${msg}`);
    }
  }

  // 1. Export all participants
  const resAll = await request('GET', '/api/admin/registrations/export');
  assert(resAll.status === 200, 'GET /api/admin/registrations/export returns 200');
  assert(resAll.headers['content-type'] && resAll.headers['content-type'].includes('text/csv'), 'Content-Type is text/csv');
  assert(resAll.headers['content-disposition'] && resAll.headers['content-disposition'].includes('.csv'), 'Content-Disposition includes .csv filename');
  assert(resAll.data.charCodeAt(0) === 0xFEFF, 'CSV starts with UTF-8 BOM (\\uFEFF) for Excel compatibility');

  const parsedAll = parseCsv(resAll.data);
  assert(parsedAll.headers.includes('Registration ID'), 'CSV contains "Registration ID" column');
  assert(parsedAll.headers.includes('Full Name'), 'CSV contains "Full Name" column');
  assert(parsedAll.headers.includes('Event Slug'), 'CSV contains "Event Slug" column');
  assert(parsedAll.headers.includes('Category'), 'CSV contains "Category" column');
  assert(parsedAll.headers.includes('Registration Status'), 'CSV contains "Registration Status" column');
  assert(parsedAll.headers.includes('Certificate Verification URL'), 'CSV contains "Certificate Verification URL" column');
  assert(parsedAll.rows.length >= 2, `Export contains rows (found ${parsedAll.rows.length})`);

  // 2. Filter by status=APPROVED
  const resApproved = await request('GET', '/api/admin/registrations/export?status=APPROVED');
  assert(resApproved.status === 200, 'Filter status=APPROVED returns 200');
  const parsedApproved = parseCsv(resApproved.data);
  assert(parsedApproved.rows.length > 0, 'Found approved registrations');
  const allApproved = parsedApproved.rows.every(r => r['Registration Status'] === 'APPROVED');
  assert(allApproved, 'All exported rows have Registration Status = APPROVED');

  // 3. Filter by eventId
  const resEvent = await request('GET', '/api/admin/registrations/export?eventId=online-open-mic-2026');
  assert(resEvent.status === 200, 'Filter eventId=online-open-mic-2026 returns 200');
  const parsedEvent = parseCsv(resEvent.data);
  const allEventMatch = parsedEvent.rows.every(r => r['Event Slug'] === 'online-open-mic-2026');
  assert(allEventMatch, 'All exported rows match the selected event');

  // 4. Filter by search text
  const resSearch = await request('GET', '/api/admin/registrations/export?search=Suhavani');
  assert(resSearch.status === 200, 'Search filter returns 200');
  const parsedSearch = parseCsv(resSearch.data);
  assert(parsedSearch.rows.some(r => r['Full Name'].toLowerCase().includes('suhavani')), 'Search results include Suhavani Kaur');

  // 5. Filter by category
  const resCat = await request('GET', '/api/admin/registrations/export?category=' + encodeURIComponent('Poetry & Shayari'));
  assert(resCat.status === 200, 'Category filter returns 200');
  const parsedCat = parseCsv(resCat.data);
  assert(parsedCat.rows.every(r => r['Category'] === 'Poetry & Shayari'), 'All exported rows match category Poetry & Shayari');

  // 6. Test Registrations List API with category and search
  const resList = await request('GET', '/api/admin/registrations?category=' + encodeURIComponent('Poetry & Shayari'));
  const jsonList = JSON.parse(resList.data);
  assert(jsonList.success === true, 'List API returns success');
  assert(jsonList.registrations.every(r => r.category === 'Poetry & Shayari'), 'List API respects category filter');

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  if (passed === total) {
    console.log('All CSV Export and Filter tests PASSED successfully!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
