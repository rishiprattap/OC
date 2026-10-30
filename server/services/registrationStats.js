const { all, get, pool } = require('../db');
const status = "UPPER(COALESCE(NULLIF(reg_status, ''), 'PENDING_VERIFICATION'))";
const paid = `(${status} = 'APPROVED' OR UPPER(payment_status) = 'PAID')`;
// Aggregate inside Postgres: one small result instead of every matching registration.
const columns = `COUNT(*) AS total,
 COUNT(*) FILTER (WHERE ${status} = 'PENDING_VERIFICATION') AS pending_verification,
 COUNT(*) FILTER (WHERE ${status} = 'VERIFIED') AS verified,
 COUNT(*) FILTER (WHERE ${status} = 'APPROVED') AS approved,
 COUNT(*) FILTER (WHERE ${status} = 'REJECTED') AS rejected,
 COUNT(*) FILTER (WHERE ${status} IN ('REVOKED', 'CANCELLED')) AS revoked,
 COUNT(*) FILTER (WHERE checked_in = 1 AND ${status} = 'APPROVED') AS checked_in,
 COUNT(*) FILTER (WHERE certificate_eligible = 1 AND ${status} = 'APPROVED') AS cert_eligible,
 COALESCE(SUM(COALESCE(final_fee, amount, 0)) FILTER (WHERE ${paid}), 0) AS revenue`;

async function registrationStats(where = '', params = []) {
  if (pool) {
    const r = await get(`SELECT ${columns} FROM registrations${where}`, params);
    return Object.fromEntries(Object.entries(r).map(([key,value]) => [key, Number(value)]));
  }
  const rows = await all(`SELECT reg_status, payment_status, checked_in, certificate_eligible, final_fee, amount FROM registrations${where}`, params);
  const result = { total: rows.length, pending_verification: 0, verified: 0, approved: 0, rejected: 0, revoked: 0, checked_in: 0, cert_eligible: 0, revenue: 0 };
  for (const r of rows) {
    const s = String(r.reg_status || 'PENDING_VERIFICATION').toUpperCase();
    const key = s === 'CANCELLED' ? 'revoked' : s.toLowerCase();
    if (Object.hasOwn(result, key)) result[key]++;
    if (s === 'APPROVED' && Number(r.checked_in) === 1) result.checked_in++;
    if (s === 'APPROVED' && Number(r.certificate_eligible) === 1) result.cert_eligible++;
    if (s === 'APPROVED' || String(r.payment_status).toUpperCase() === 'PAID') result.revenue += Number(r.final_fee ?? r.amount ?? 0);
  }
  return result;
}
module.exports = { registrationStats, columns };
