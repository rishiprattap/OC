const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const config = require('../config');
const emailService = require('../services/email');

// Strict Admin Authentication Middleware
function requireAdminAuth(req, res, next) {
  const rawSecret =
    req.headers['x-admin-secret'] ||
    req.query.secret ||
    (req.body && req.body.secret);

  const cleanInput = (rawSecret || '').trim().replace(/^["']|["']$/g, '');
  const cleanExpected = (config.ADMIN_SECRET || '').trim().replace(/^["']|["']$/g, '');

  if (!cleanInput || cleanInput !== cleanExpected) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid admin secret key.' });
  }
  next();
}

router.use(requireAdminAuth);

// Helper: Validate Google Meet URL
function isValidMeetUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  // Standard format: https://meet.google.com/xxx-xxxx-xxx or meet.google.com/xxx-xxxx-xxx
  const meetPattern = /^https:\/\/meet\.google\.com\/[a-z0-9\-]+(\?.*)?$/i;
  return meetPattern.test(trimmed);
}

// Helper: Sleep for rate-limited dispatch
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET /api/admin/meet/overview — Summary metrics
router.get('/overview', async (req, res) => {
  try {
    const sessionsRow = await get(`SELECT COUNT(*) as count FROM meet_sessions`);
    const logsRow = await get(`
      SELECT 
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent_count,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
      FROM meet_email_logs
    `);

    return res.json({
      success: true,
      stats: {
        totalSessions: sessionsRow ? sessionsRow.count : 0,
        invitationsSent: logsRow && logsRow.sent_count ? logsRow.sent_count : 0,
        invitationsFailed: logsRow && logsRow.failed_count ? logsRow.failed_count : 0
      }
    });
  } catch (err) {
    console.error('Error in /api/admin/meet/overview:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve Meet stats.' });
  }
});

// GET /api/admin/meet/sessions — List all created sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await all(`
      SELECT 
        s.*,
        COUNT(l.id) as total_logged,
        SUM(CASE WHEN l.status = 'SENT' THEN 1 ELSE 0 END) as sent_count,
        SUM(CASE WHEN l.status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
      FROM meet_sessions s
      LEFT JOIN meet_email_logs l ON s.id = l.meet_session_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    return res.json({ success: true, sessions });
  } catch (err) {
    console.error('Error in /api/admin/meet/sessions:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve sessions list.' });
  }
});

// GET /api/admin/meet/sessions/:id — Get session details and recipient delivery audit log
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await get(`SELECT * FROM meet_sessions WHERE id = ?`, [req.params.id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Meet session not found.' });
    }

    const logs = await all(`
      SELECT * FROM meet_email_logs 
      WHERE meet_session_id = ? 
      ORDER BY sent_at DESC, id DESC
    `, [req.params.id]);

    return res.json({ success: true, session, logs });
  } catch (err) {
    console.error(`Error in /api/admin/meet/sessions/${req.params.id}:`, err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve session details.' });
  }
});

// GET /api/admin/meet/eligible-recipients — Get participants matching criteria
router.get('/eligible-recipients', async (req, res) => {
  try {
    const { eventId, mode, sessionId, search } = req.query;

    let query = `SELECT id, registration_id, full_name, email, phone, category, event_id, payment_status, created_at FROM registrations WHERE (payment_status = 'PAID' OR reg_status = 'APPROVED') AND reg_status NOT IN ('REVOKED', 'CANCELLED', 'REJECTED') AND payment_status NOT IN ('REVOKED', 'CANCELLED', 'REJECTED')`;
    const params = [];

    if (eventId && eventId !== 'all') {
      query += ` AND event_id = ?`;
      params.push(eventId);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR registration_id LIKE ?)`;
      params.push(term, term, term, term);
    }

    if (mode === 'NOT_SENT' && sessionId) {
      query += ` AND registration_id NOT IN (
        SELECT registration_id FROM meet_email_logs 
        WHERE meet_session_id = ? AND status = 'SENT' AND registration_id IS NOT NULL
      )`;
      params.push(sessionId);
    }

    query += ` ORDER BY created_at DESC`;

    const recipients = await all(query, params);
    return res.json({ success: true, count: recipients.length, recipients });
  } catch (err) {
    console.error('Error in /api/admin/meet/eligible-recipients:', err);
    return res.status(500).json({ success: false, error: 'Failed to query eligible recipients.' });
  }
});

// POST /api/admin/meet/render-preview — Get rendered HTML for live preview
router.post('/render-preview', (req, res) => {
  try {
    const { session, customMessage, sampleParticipant, participant } = req.body;

    const sample = sampleParticipant || participant || {
      full_name: 'Aarav Sharma',
      registration_id: 'OC-OM-PREVIEW',
      email: 'aarav@example.com'
    };

    const sess = session || {
      event_name: 'Online Open Mic 2026',
      title: 'Performer Briefing & Soundcheck',
      date: '23 September',
      time: '7:30 PM IST',
      meet_url: 'https://meet.google.com/abc-defg-hij',
      message: ''
    };

    const { subject, html } = emailService.renderMeetSessionEmail({
      session: sess,
      participant: sample,
      customMessage: customMessage !== undefined ? customMessage : sess.message
    });

    return res.json({ success: true, subject, html });
  } catch (err) {
    console.error('Error in /api/admin/meet/render-preview:', err);
    return res.status(500).json({ success: false, error: 'Failed to render email preview.' });
  }
});

// POST /api/admin/meet/send-test — Send a real test email to specified recipient
router.post('/send-test', async (req, res) => {
  try {
    const { session, recipientEmail, testEmail, customMessage } = req.body;
    const targetEmail = (recipientEmail || testEmail || '').trim();

    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid recipient email address.' });
    }

    if (!session || (!session.title && !session.sessionTitle) || !session.date || !session.time || !session.meet_url) {
      return res.status(400).json({ success: false, error: 'Session Title, Date, Time, and Google Meet URL are required.' });
    }

    if (!isValidMeetUrl(session.meet_url)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Google Meet URL. Valid Google Meet URL required (format: https://meet.google.com/xxx-xxxx-xxx)'
      });
    }

    const testParticipant = {
      full_name: 'Organizer (Test Preview)',
      registration_id: 'OC-TEST-PREVIEW',
      email: targetEmail
    };

    const sess = {
      ...session,
      title: session.title || session.sessionTitle,
      message: customMessage !== undefined ? customMessage : session.message
    };

    const result = await emailService.sendMeetEmail({
      session: sess,
      participant: testParticipant,
      recipientEmail: targetEmail,
      isTest: true
    });

    return res.json({
      success: true,
      message: `Test email sent successfully to ${targetEmail}`,
      messageId: result.messageId
    });

  } catch (err) {
    console.error('Error in /api/admin/meet/send-test:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to dispatch test email.' });
  }
});

// POST /api/admin/meet/send — Batch send to selected or confirmed participants
router.post('/send', async (req, res) => {
  try {
    const {
      eventId,
      eventName,
      title,
      sessionTitle,
      date,
      time,
      meetUrl,
      message,
      recipientMode, // 'ALL_PAID' | 'SELECTED' | 'NOT_SENT'
      targetMode,
      selectedRegistrationIds,
      targetSessionId
    } = req.body;

    const resolvedTitle = (title || sessionTitle || '').trim();
    const resolvedMode = recipientMode || targetMode || 'ALL_PAID';

    // Validation
    if (!resolvedTitle) {
      return res.status(400).json({ success: false, error: 'Session title is required.' });
    }
    if (!date || !date.trim()) {
      return res.status(400).json({ success: false, error: 'Session date is required.' });
    }
    if (!time || !time.trim()) {
      return res.status(400).json({ success: false, error: 'Session time is required.' });
    }
    if (!meetUrl || !isValidMeetUrl(meetUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Google Meet URL. Valid Google Meet URL required (format: https://meet.google.com/xxx-xxxx-xxx)'
      });
    }

    // Resolve Event Name if missing
    let resolvedEventName = eventName;
    if (!resolvedEventName) {
      if (eventId === 'online-open-mic-2026') resolvedEventName = 'Online Open Mic 2026';
      else if (eventId === 'delhi-adhure-musafir-2026') resolvedEventName = 'Adhure Musafir (Delhi Show)';
      else resolvedEventName = 'Offstage Creators Event';
    }

    // Resolve target participants
    let query = `SELECT id, registration_id, full_name, email, phone, category, event_id FROM registrations WHERE (payment_status = 'PAID' OR reg_status = 'APPROVED') AND reg_status NOT IN ('REVOKED', 'CANCELLED', 'REJECTED') AND payment_status NOT IN ('REVOKED', 'CANCELLED', 'REJECTED')`;
    const params = [];

    if (eventId && eventId !== 'all') {
      query += ` AND event_id = ?`;
      params.push(eventId);
    }

    if (resolvedMode === 'SELECTED') {
      if (!Array.isArray(selectedRegistrationIds) || selectedRegistrationIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Please select at least one participant.' });
      }
      const placeholders = selectedRegistrationIds.map(() => '?').join(',');
      query += ` AND registration_id IN (${placeholders})`;
      params.push(...selectedRegistrationIds);
    } else if (resolvedMode === 'NOT_SENT' && targetSessionId) {
      query += ` AND registration_id NOT IN (
        SELECT registration_id FROM meet_email_logs 
        WHERE meet_session_id = ? AND status = 'SENT' AND registration_id IS NOT NULL
      )`;
      params.push(targetSessionId);
    }

    const participants = await all(query, params);

    if (participants.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No eligible participants found matching your criteria.'
      });
    }

    const now = new Date().toISOString();

    // Create record in meet_sessions
    const sessionInsert = await run(`
      INSERT INTO meet_sessions (
        event_id, event_name, title, date, time, meet_url, message, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT', 'Admin', ?, ?)
    `, [eventId || 'online-open-mic-2026', resolvedEventName, resolvedTitle, date.trim(), time.trim(), meetUrl.trim(), message || '', now, now]);

    const sessionId = sessionInsert.lastID;

    const sessionObj = {
      id: sessionId,
      event_id: eventId || 'online-open-mic-2026',
      event_name: resolvedEventName,
      title: resolvedTitle,
      date: date.trim(),
      time: time.trim(),
      meet_url: meetUrl.trim(),
      message: message || ''
    };

    // Sequential batch dispatch with throttling to prevent SMTP rate-limiting
    let sentCount = 0;
    let failedCount = 0;
    const failedList = [];

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const sendTime = new Date().toISOString();

      try {
        const result = await emailService.sendMeetEmail({
          session: sessionObj,
          participant: p,
          isTest: false
        });

        if (result && result.success) {
          sentCount++;
          await run(`
            INSERT INTO meet_email_logs (
              meet_session_id, registration_id, recipient_email, recipient_name, status, provider_message_id, error_message, sent_at
            ) VALUES (?, ?, ?, ?, 'SENT', ?, NULL, ?)
          `, [sessionId, p.registration_id, p.email, p.full_name, result.messageId || 'unknown', sendTime]);
        } else {
          failedCount++;
          const err = result?.error || 'Unknown delivery failure';
          failedList.push({ name: p.full_name, email: p.email, error: err });
          await run(`
            INSERT INTO meet_email_logs (
              meet_session_id, registration_id, recipient_email, recipient_name, status, provider_message_id, error_message, sent_at
            ) VALUES (?, ?, ?, ?, 'FAILED', NULL, ?, ?)
          `, [sessionId, p.registration_id, p.email, p.full_name, err, sendTime]);
        }
      } catch (err) {
        failedCount++;
        const errMsg = err.message || 'SMTP exception';
        failedList.push({ name: p.full_name, email: p.email, error: errMsg });
        await run(`
          INSERT INTO meet_email_logs (
            meet_session_id, registration_id, recipient_email, recipient_name, status, provider_message_id, error_message, sent_at
          ) VALUES (?, ?, ?, ?, 'FAILED', NULL, ?, ?)
        `, [sessionId, p.registration_id, p.email, p.full_name, errMsg, sendTime]);
      }

      // 350ms delay between consecutive dispatches to prevent Gmail burst rate-limits
      if (i < participants.length - 1) {
        await sleep(350);
      }
    }

    return res.json({
      success: true,
      sessionId,
      total: participants.length,
      sent: sentCount,
      failed: failedCount,
      failedList
    });

  } catch (err) {
    console.error('Error in /api/admin/meet/send:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to dispatch Meet emails.' });
  }
});

// POST /api/admin/meet/retry-failed — Retry only failed deliveries for a session
router.post('/retry-failed', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID is required.' });
    }

    const session = await get(`SELECT * FROM meet_sessions WHERE id = ?`, [sessionId]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session record not found.' });
    }

    const failedLogs = await all(`
      SELECT * FROM meet_email_logs 
      WHERE meet_session_id = ? AND status = 'FAILED'
    `, [sessionId]);

    if (failedLogs.length === 0) {
      return res.json({ success: true, message: 'No failed deliveries to retry for this session.', retried: 0, newlySent: 0, stillFailed: 0 });
    }

    let newlySent = 0;
    let stillFailed = 0;
    const stillFailedList = [];

    for (let i = 0; i < failedLogs.length; i++) {
      const log = failedLogs[i];
      const sendTime = new Date().toISOString();

      try {
        const result = await emailService.sendMeetEmail({
          session,
          participant: {
            full_name: log.recipient_name,
            registration_id: log.registration_id,
            email: log.recipient_email
          },
          isTest: false
        });

        if (result && result.success) {
          newlySent++;
          await run(`
            UPDATE meet_email_logs SET
              status = 'SENT',
              provider_message_id = ?,
              error_message = NULL,
              sent_at = ?
            WHERE id = ?
          `, [result.messageId || 'unknown', sendTime, log.id]);
        } else {
          stillFailed++;
          stillFailedList.push({ name: log.recipient_name, email: log.recipient_email, error: result?.error });
          await run(`
            UPDATE meet_email_logs SET
              error_message = ?,
              sent_at = ?
            WHERE id = ?
          `, [result?.error || 'Retry failed', sendTime, log.id]);
        }
      } catch (err) {
        stillFailed++;
        stillFailedList.push({ name: log.recipient_name, email: log.recipient_email, error: err.message });
        await run(`
          UPDATE meet_email_logs SET
            error_message = ?,
            sent_at = ?
          WHERE id = ?
        `, [err.message, sendTime, log.id]);
      }

      if (i < failedLogs.length - 1) {
        await sleep(350);
      }
    }

    return res.json({
      success: true,
      retried: failedLogs.length,
      newlySent,
      stillFailed,
      stillFailedList
    });

  } catch (err) {
    console.error('Error in /api/admin/meet/retry-failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to retry failed deliveries.' });
  }
});

module.exports = router;
