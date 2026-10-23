/**
 * Offstage Creators — Registration Export Service
 * Generates properly formatted Excel (.xlsx) and CSV files for admin registration exports.
 *
 * Handles:
 * - Proper RFC 4180 CSV escaping (commas, quotes, line breaks)
 * - UTF-8 BOM (\uFEFF) for Excel compatibility with Hindi / Unicode characters
 * - Phone number preservation (+91, leading zeros, prevents scientific notation)
 * - Formula injection prevention (sanitizing =, +, -, @ triggers)
 * - Consistent date, payment amount, and status formatting
 * - Inclusion of promo code, referrer, and fee breakdown
 * - Base64 screenshot URL replacement with direct safe admin view links
 * - Rich Excel (.xlsx) formatting with frozen header row, auto-filter, and column widths
 */

const ExcelJS = require('exceljs');

const HEADERS = [
  { key: 'serial', header: 'Serial Number', width: 14 },
  { key: 'registrationId', header: 'Registration ID', width: 18 },
  { key: 'eventSlug', header: 'Event Slug', width: 22 },
  { key: 'eventName', header: 'Event Name', width: 24 },
  { key: 'fullName', header: 'Full Name', width: 22 },
  { key: 'email', header: 'Email', width: 28 },
  { key: 'phone', header: 'Phone', width: 18, isPhone: true },
  { key: 'city', header: 'City', width: 16 },
  { key: 'category', header: 'Category', width: 20 },
  { key: 'performanceTitle', header: 'Performance Title', width: 26 },
  { key: 'performanceDescription', header: 'Performance Description', width: 36, wrap: true },
  { key: 'instagram', header: 'Instagram Handle', width: 20 },
  { key: 'promoCode', header: 'Promo Code', width: 16 },
  { key: 'referrerName', header: 'Referrer', width: 18 },
  { key: 'originalFee', header: 'Original Fee (INR)', width: 18, isNumber: true },
  { key: 'discountAmount', header: 'Discount Amount (INR)', width: 20, isNumber: true },
  { key: 'finalFee', header: 'Final Fee (INR)', width: 16, isNumber: true },
  { key: 'amount', header: 'Fee Amount (INR)', width: 16, isNumber: true },
  { key: 'regStatus', header: 'Registration Status', width: 22 },
  { key: 'paymentStatus', header: 'Payment Status', width: 16 },
  { key: 'transactionId', header: 'Transaction ID', width: 24 },
  { key: 'otpVerified', header: 'OTP Verified', width: 14 },
  { key: 'checkedIn', header: 'Checked In (Attended)', width: 22 },
  { key: 'checkinAt', header: 'Check-in Time', width: 22 },
  { key: 'certificateEligible', header: 'Certificate Eligible', width: 20 },
  { key: 'position', header: 'Position / Award', width: 20 },
  { key: 'achievement', header: 'Achievement', width: 22 },
  { key: 'badgeText', header: 'Badge Text', width: 20 },
  { key: 'citation', header: 'Citation', width: 36, wrap: true },
  { key: 'certificateTitle', header: 'Certificate Title', width: 28 },
  { key: 'createdAt', header: 'Registered At', width: 22 },
  { key: 'approvedAt', header: 'Approved At', width: 22 },
  { key: 'approvedBy', header: 'Approved By', width: 24 },
  { key: 'rejectedReason', header: 'Rejection Reason', width: 24 },
  { key: 'adminNotes', header: 'Admin Notes', width: 26, wrap: true },
  { key: 'paymentScreenshotUrl', header: 'Payment Screenshot URL', width: 38 },
  { key: 'certificateUrl', header: 'Certificate Verification URL', width: 38 }
];

function formatDate(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).trim();
    return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  } catch (_) {
    return String(val || '').trim();
  }
}

/**
 * Sanitizes input text against Spreadsheet Formula Injection (CSV / Excel injection).
 * If a value starts with =, +, -, @, \t, or \r, prefixes it with a single quote.
 */
function sanitizeFormula(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return str;
}

function mapRowData(r, eventMap = {}, baseUrl = 'https://offstagecreators.in') {
  const evSlug = r.event_id || r.eventId || 'online-open-mic-2026';
  const evName = eventMap[evSlug] || (evSlug === 'online-open-mic-2026' ? 'Online Open Mic 2026' : evSlug);
  const serial = String(r.serial_number || r.serialNumber || r.id || '').padStart(6, '0');
  const regId = String(r.registration_id || r.registrationId || '');
  const certUrl = `${baseUrl}/certificate.html?id=${encodeURIComponent(regId)}`;

  // Safe screenshot handling: replace multi-megabyte base64 strings with clean admin view link
  let screenshot = r.payment_screenshot_url || r.paymentScreenshotUrl || '';
  if (screenshot) {
    if (screenshot.startsWith('data:') || screenshot.length > 250) {
      screenshot = `${baseUrl}/api/admin/registrations/${encodeURIComponent(regId)}/screenshot`;
    } else if (screenshot.startsWith('/')) {
      screenshot = `${baseUrl}${screenshot}`;
    }
  }

  // Consistent fee extraction
  const origFee = r.original_fee !== undefined && r.original_fee !== null ? Number(r.original_fee)
    : (r.originalFee !== undefined && r.originalFee !== null ? Number(r.originalFee) : Number(r.amount ?? 79));
  const discAmt = r.discount_amount !== undefined && r.discount_amount !== null ? Number(r.discount_amount)
    : (r.discountAmount !== undefined && r.discountAmount !== null ? Number(r.discountAmount) : 0);
  const finFee = r.final_fee !== undefined && r.final_fee !== null ? Number(r.final_fee)
    : (r.finalFee !== undefined && r.finalFee !== null ? Number(r.finalFee) : Number(r.amount ?? 79));
  const feeAmt = Number(r.amount !== undefined && r.amount !== null ? r.amount : finFee);

  const rawPhone = r.phone !== undefined && r.phone !== null ? String(r.phone).trim() : '';

  return {
    serial,
    registrationId: regId,
    eventSlug: evSlug,
    eventName: evName,
    fullName: r.full_name || r.fullName || '',
    email: r.email || '',
    phone: rawPhone,
    city: r.city || '',
    category: r.category || '',
    performanceTitle: r.performance_title || r.performanceTitle || '',
    performanceDescription: r.performance_description || r.performanceDescription || '',
    instagram: r.instagram || '',
    promoCode: r.promo_code || r.promoCode || '',
    referrerName: r.referrer_name || r.referrerName || '',
    originalFee: isNaN(origFee) ? 79 : origFee,
    discountAmount: isNaN(discAmt) ? 0 : discAmt,
    finalFee: isNaN(finFee) ? 79 : finFee,
    amount: isNaN(feeAmt) ? 79 : feeAmt,
    regStatus: (r.reg_status || r.status || 'PENDING_VERIFICATION').toUpperCase(),
    paymentStatus: (r.payment_status || r.paymentStatus || (r.reg_status === 'APPROVED' || r.status === 'APPROVED' ? 'PAID' : 'PENDING')).toUpperCase(),
    transactionId: r.transaction_id || r.transactionId || '',
    otpVerified: (r.otp_verified || r.otpVerified) ? 'YES' : 'NO',
    checkedIn: (r.checked_in || r.checkedIn) ? 'YES' : 'NO',
    checkinAt: formatDate(r.checkin_at || r.checkinAt),
    certificateEligible: (r.certificate_eligible || r.certificateEligible) ? 'YES' : 'NO',
    position: r.position || 'Participant',
    achievement: r.achievement || '',
    badgeText: r.badge_text || r.badgeText || '',
    citation: r.citation || '',
    certificateTitle: r.certificate_title || r.certificateTitle || 'CERTIFICATE OF PARTICIPATION',
    createdAt: formatDate(r.created_at || r.createdAt),
    approvedAt: formatDate(r.approved_at || r.approvedAt),
    approvedBy: r.approved_by || r.approvedBy || '',
    rejectedReason: r.rejected_reason || r.rejectedReason || '',
    adminNotes: r.admin_notes || r.adminNotes || r.rejected_reason || '',
    paymentScreenshotUrl: screenshot,
    certificateUrl: certUrl
  };
}

/**
 * Generate CSV string with UTF-8 BOM, RFC 4180 escaping, and formula prevention
 */
function generateCsv(rows, eventMap = {}, baseUrl = 'https://offstagecreators.in') {
  const headerLine = HEADERS.map(h => `"${h.header.replace(/"/g, '""')}"`).join(',');
  const lines = [headerLine];

  for (const r of rows) {
    const data = mapRowData(r, eventMap, baseUrl);
    const rowCells = HEADERS.map(h => {
      let val = data[h.key];
      if (val === null || val === undefined) return '""';
      if (h.isNumber) {
        return typeof val === 'number' ? String(val) : '0';
      }
      if (h.isPhone) {
        let phoneStr = String(val).trim();
        // Force Excel to treat phone as text so leading zeros and +91 are preserved without scientific notation
        if (/^[=+\-@\t\r0]/.test(phoneStr) || phoneStr.length >= 11) {
          if (!phoneStr.startsWith("'")) {
            phoneStr = "'" + phoneStr;
          }
        }
        return `"${phoneStr.replace(/"/g, '""')}"`;
      }
      const safeStr = sanitizeFormula(val);
      return `"${safeStr.replace(/"/g, '""')}"`;
    });
    lines.push(rowCells.join(','));
  }

  // \uFEFF is UTF-8 Byte Order Mark for Excel compatibility
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Generate Excel (.xlsx) Buffer with frozen panes, autofilters, readable column widths, and cell styling
 */
async function generateXlsxBuffer(rows, eventMap = {}, baseUrl = 'https://offstagecreators.in') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Offstage Creators';
  workbook.lastModifiedBy = 'Offstage Creators';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Participants', {
    views: [
      {
        state: 'frozen',
        xSplit: 0,
        ySplit: 1,
        topLeftCell: 'A2',
        activeCell: 'A2'
      }
    ],
    pageSetup: { fitToPage: true, orientation: 'landscape' }
  });

  worksheet.columns = HEADERS.map(h => ({
    header: h.header,
    key: h.key,
    width: h.width || 20
  }));

  // Style Header Row (Slate 800 dark background with bold white text)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Elegant dark slate
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });

  // Enable AutoFilter on header row
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: HEADERS.length }
  };

  // Add Data Rows
  rows.forEach((r, idx) => {
    const data = mapRowData(r, eventMap, baseUrl);
    const row = worksheet.addRow(data);
    row.height = 22;

    const isEven = idx % 2 === 1;

    HEADERS.forEach((h) => {
      const cell = row.getCell(h.key);

      // Light alternating row color for scanability
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      cell.font = { name: 'Segoe UI', size: 10 };

      if (h.isPhone) {
        cell.numFmt = '@'; // Explicit Text format
        cell.value = String(data[h.key] || '');
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (h.isNumber) {
        cell.numFmt = '#,##0';
        cell.value = Number(data[h.key] || 0);
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (h.wrap) {
        const textVal = sanitizeFormula(data[h.key]);
        cell.value = textVal;
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      } else {
        const textVal = sanitizeFormula(data[h.key]);
        cell.value = textVal;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  HEADERS,
  mapRowData,
  generateCsv,
  generateXlsxBuffer
};
