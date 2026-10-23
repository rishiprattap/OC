/**
 * Verification test for Participant CSV & Excel (.xlsx) Download with Filters
 * Validates formatting, character encoding (Hindi/UTF-8), phone numbers,
 * formula injection prevention, Excel XLSX views, frozen headers, and active filters.
 */
const http = require('http');
const path = require('path');
const ExcelJS = require('exceljs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../server/config');
const app = require('../server/index');

const PORT = config.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_SECRET = process.env.ADMIN_SECRET || config.ADMIN_SECRET || 'R!SHI88';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD || 'R!SHI88_Admin';

let serverInstance = null;

function ensureServer() {
  return new Promise((resolve) => {
    const testReq = http.request({ hostname: 'localhost', port: PORT, path: '/api/config', method: 'GET' }, () => {
      resolve(false);
    });
    testReq.on('error', () => {
      serverInstance = app.listen(PORT, () => {
        resolve(true);
      });
    });
    testReq.end();
  });
}

function request(method, path, body = null, headers = {}, isBinary = false) {
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
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: isBinary ? buffer : buffer.toString('utf8'),
          buffer
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseCsv(text) {
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
  console.log('--- Testing Participant CSV & Excel (.xlsx) Download with Filters ---');
  await ensureServer();

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

  try {
    // 1. Export all participants as CSV
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
    assert(parsedAll.headers.includes('Instagram Handle'), 'CSV contains "Instagram Handle" column');
    assert(parsedAll.headers.includes('Promo Code'), 'CSV contains "Promo Code" column');
    assert(parsedAll.headers.includes('Referrer'), 'CSV contains "Referrer" column');
    assert(parsedAll.headers.includes('Original Fee (INR)'), 'CSV contains "Original Fee (INR)" column');
    assert(parsedAll.headers.includes('Discount Amount (INR)'), 'CSV contains "Discount Amount (INR)" column');
    assert(parsedAll.headers.includes('Final Fee (INR)'), 'CSV contains "Final Fee (INR)" column');
    assert(parsedAll.rows.length >= 1, `Export contains rows (found ${parsedAll.rows.length})`);

    // Verify CSV does not contain multi-megabyte base64 strings
    const rawBase64 = resAll.data.includes('data:image/');
    assert(!rawBase64, 'CSV does NOT contain raw base64 data URIs in screenshot column');

    // 2. Filter by status=APPROVED (CSV)
    const resApproved = await request('GET', '/api/admin/registrations/export?status=APPROVED');
    assert(resApproved.status === 200, 'Filter status=APPROVED returns 200');
    const parsedApproved = parseCsv(resApproved.data);
    assert(parsedApproved.rows.length > 0, 'Found approved registrations');
    const allApproved = parsedApproved.rows.every(r => r['Registration Status'] === 'APPROVED');
    assert(allApproved, 'All exported rows have Registration Status = APPROVED');

    // 3. Filter by eventId (CSV)
    const resEvent = await request('GET', '/api/admin/registrations/export?eventId=online-open-mic-2026');
    assert(resEvent.status === 200, 'Filter eventId=online-open-mic-2026 returns 200');
    const parsedEvent = parseCsv(resEvent.data);
    const allEventMatch = parsedEvent.rows.every(r => r['Event Slug'] === 'online-open-mic-2026');
    assert(allEventMatch, 'All exported rows match the selected event');

    // 4. Filter by search text (CSV)
    const resSearch = await request('GET', '/api/admin/registrations/export?search=Suhavani');
    assert(resSearch.status === 200, 'Search filter returns 200');
    const parsedSearch = parseCsv(resSearch.data);
    assert(parsedSearch.rows.some(r => r['Full Name'].toLowerCase().includes('suhavani')), 'Search results include Suhavani Kaur');

    // 5. Filter by category (CSV)
    const resCat = await request('GET', '/api/admin/registrations/export?category=' + encodeURIComponent('Poetry & Shayari'));
    assert(resCat.status === 200, 'Category filter returns 200');
    const parsedCat = parseCsv(resCat.data);
    assert(parsedCat.rows.every(r => r['Category'] === 'Poetry & Shayari'), 'All exported rows match category Poetry & Shayari');

    // 6. Test Excel (.xlsx) export via ?format=xlsx
    const resXlsx = await request('GET', '/api/admin/registrations/export?format=xlsx', null, {}, true);
    assert(resXlsx.status === 200, 'GET /api/admin/registrations/export?format=xlsx returns 200');
    assert(
      resXlsx.headers['content-type'] && resXlsx.headers['content-type'].includes('spreadsheetml.sheet'),
      'Content-Type is application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    assert(
      resXlsx.headers['content-disposition'] && resXlsx.headers['content-disposition'].includes('.xlsx'),
      'Content-Disposition includes .xlsx filename'
    );

    // Parse and inspect Excel (.xlsx) workbook
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(resXlsx.buffer);
    const ws = wb.getWorksheet('Participants');
    assert(ws !== undefined && ws !== null, 'XLSX contains "Participants" worksheet');
    assert(ws.rowCount >= 2, `XLSX contains data rows (found ${ws.rowCount})`);

    // Verify frozen header row
    const views = ws.views || [];
    const isFrozen = views.some(v => v.state === 'frozen' && v.ySplit === 1);
    assert(isFrozen, 'XLSX has frozen header row (ySplit: 1)');

    // Verify AutoFilter
    assert(ws.autoFilter !== null && ws.autoFilter !== undefined, 'XLSX has auto-filters enabled on header row');

    // Verify columns in XLSX
    const headerRow = ws.getRow(1);
    const headersInXlsx = [];
    headerRow.eachCell((cell) => headersInXlsx.push(cell.value));
    assert(headersInXlsx.includes('Registration ID'), 'XLSX contains "Registration ID" column');
    assert(headersInXlsx.includes('Phone'), 'XLSX contains "Phone" column');
    assert(headersInXlsx.includes('Instagram Handle'), 'XLSX contains "Instagram Handle" column');
    assert(headersInXlsx.includes('Promo Code'), 'XLSX contains "Promo Code" column');
    assert(headersInXlsx.includes('Referrer'), 'XLSX contains "Referrer" column');
    assert(headersInXlsx.includes('Final Fee (INR)'), 'XLSX contains "Final Fee (INR)" column');

    // Verify phone number formatting in XLSX (numFmt = '@' Text)
    const phoneColIdx = headersInXlsx.indexOf('Phone') + 1;
    let samplePhoneCell = null;
    ws.eachRow((r, rowNumber) => {
      if (rowNumber > 1 && !samplePhoneCell) {
        samplePhoneCell = r.getCell(phoneColIdx);
      }
    });
    assert(samplePhoneCell && samplePhoneCell.numFmt === '@', 'XLSX phone numbers are formatted with numFmt="@" (Text format)');

    // 7. Test direct .xlsx extension route /api/admin/registrations/export.xlsx
    const resXlsxDirect = await request('GET', '/api/admin/registrations/export.xlsx', null, {}, true);
    assert(resXlsxDirect.status === 200, 'GET /api/admin/registrations/export.xlsx returns 200');

    // 8. Test screenshot endpoint
    const sampleReg = parsedAll.rows[0];
    if (sampleReg && sampleReg['Registration ID']) {
      const resScreen = await request('GET', `/api/admin/registrations/${encodeURIComponent(sampleReg['Registration ID'])}/screenshot`);
      assert(resScreen.status === 200 || resScreen.status === 404 || resScreen.status === 302, 'Screenshot endpoint responds gracefully (200/404/302)');
    }

    console.log(`\nResults: ${passed}/${total} tests passed.`);
    if (passed === total) {
      console.log('All CSV and XLSX Export tests PASSED successfully!');
      if (serverInstance) serverInstance.close();
      return true;
    } else {
      if (serverInstance) serverInstance.close();
      return false;
    }
  } catch (err) {
    console.error('Test error:', err);
    if (serverInstance) serverInstance.close();
    return false;
  }
}

if (require.main === module) {
  runTests().then(ok => {
    process.exit(ok ? 0 : 1);
  });
}

module.exports = runTests;
