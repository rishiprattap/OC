// Offstage Creators — Organizer Admin Dashboard & Email Subsystem Logic
(function () {
  'use strict';

  let adminSecret = sessionStorage.getItem('oc_admin_secret') || '';
  let activeTab = 'queue';
  let targetRejectRegId = null;

  // DOM Elements
  const authOverlay = document.getElementById('authOverlay');
  const authForm = document.getElementById('authForm');
  const secretInput = document.getElementById('secretInput');
  const authError = document.getElementById('authError');
  const logoutBtn = document.getElementById('logoutBtn');
  const exportBtn = document.getElementById('exportBtn');
  const refreshBtn = document.getElementById('refreshBtn');

  // Metrics
  const statTotal = document.getElementById('statTotal');
  const statAwaiting = document.getElementById('statAwaiting');
  const statPaid = document.getElementById('statPaid');
  const statPending = document.getElementById('statPending');
  const statVerifiedEmails = document.getElementById('statVerifiedEmails');
  const statChecked = document.getElementById('statChecked');
  const statRevenue = document.getElementById('statRevenue');
  const queueCountBadge = document.getElementById('queueCountBadge');

  // Queue
  const queueGrid = document.getElementById('queueGrid');

  // Table
  const searchInput = document.getElementById('searchInput');
  const paymentFilter = document.getElementById('paymentFilter');
  const checkinFilter = document.getElementById('checkinFilter');
  const tableBody = document.getElementById('tableBody');

  // Email Section Elements
  const smtpTestBtn = document.getElementById('smtpTestBtn');
  const sendDiagEmailBtn = document.getElementById('sendDiagEmailBtn');
  const smtpDiagOutput = document.getElementById('smtpDiagOutput');
  const emailLogsTableBody = document.getElementById('emailLogsTableBody');
  const refreshLogsBtn = document.getElementById('refreshLogsBtn');

  // Modals
  const screenshotModal = document.getElementById('screenshotModal');
  const modalImg = document.getElementById('modalImg');
  const modalImgDownload = document.getElementById('modalImgDownload');

  const rejectModal = document.getElementById('rejectModal');
  const rejectForm = document.getElementById('rejectForm');
  const rejectTargetId = document.getElementById('rejectTargetId');
  const rejectReasonInput = document.getElementById('rejectReasonInput');

  const resendEmailModal = document.getElementById('resendEmailModal');
  const resendEmailForm = document.getElementById('resendEmailForm');
  const resendTargetEmail = document.getElementById('resendTargetEmail');
  const resendRegId = document.getElementById('resendRegId');
  const resendTypeSelect = document.getElementById('resendTypeSelect');
  const confirmResendBtn = document.getElementById('confirmResendBtn');

  // Check auth state on load
  if (adminSecret) {
    if (authOverlay) authOverlay.style.display = 'none';
    loadDashboard();
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = secretInput.value.trim().replace(/^["']|["']$/g, '');
      if (!key) return;

      try {
        const res = await fetch('/api/admin/overview', {
          headers: { 'x-admin-secret': key }
        });

        if (res.ok) {
          adminSecret = key;
          sessionStorage.setItem('oc_admin_secret', key);
          authOverlay.style.display = 'none';
          authError.style.display = 'none';
          loadDashboard();
        } else if (res.status === 404) {
          authError.textContent = 'Backend API route not found (HTTP 404). Please check server deployment.';
          authError.style.display = 'block';
        } else {
          authError.textContent = 'Invalid Admin Secret Key. Access Denied.';
          authError.style.display = 'block';
        }
      } catch (err) {
        authError.textContent = 'Connection error.';
        authError.style.display = 'block';
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('oc_admin_secret');
      adminSecret = '';
      if (authOverlay) authOverlay.style.display = 'flex';
      if (secretInput) secretInput.value = '';
    });
  }

  async function loadDashboard() {
    await Promise.all([loadStats(), loadMeetStats(), loadPendingQueue(), loadRegistrations()]);
    if (activeTab === 'email') {
      loadEmailLogs();
    } else if (activeTab === 'meet') {
      loadMeetHistory();
      loadEligibleRecipients();
      updateMeetPreview();
    }
  }

  // Load Dashboard Statistics
  async function loadStats() {
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const s = data.stats;
        if (statTotal) statTotal.textContent = s.totalRegistrations;
        if (statAwaiting) statAwaiting.textContent = s.awaitingVerification;
        if (queueCountBadge) queueCountBadge.textContent = s.awaitingVerification;
        if (statPaid) statPaid.textContent = s.paidRegistrations;
        if (statPending) statPending.textContent = s.pendingPayments;
        if (statVerifiedEmails) statVerifiedEmails.textContent = s.verifiedEmailsCount || 0;
        if (statChecked) statChecked.textContent = s.checkedInCount;
        if (statRevenue) statRevenue.textContent = '₹' + Number(s.totalRevenue).toLocaleString('en-IN');
        loadMeetStats();
      }
    } catch (e) {
      console.error('Stats load error', e);
    }
  }

  // Load Pending Payments Verification Queue
  async function loadPendingQueue() {
    if (!queueGrid) return;
    try {
      const res = await fetch('/api/admin/pending-payments', {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        queueGrid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#ff8566;">Error loading pending payments.</div>`;
        return;
      }

      if (data.queue.length === 0) {
        queueGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #8e8477; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-md);">
            <div style="font-size: 32px; margin-bottom: 10px;">✓</div>
            <div style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: #f7eee1; margin-bottom: 6px;">All Caught Up!</div>
            <p style="font-size: 13px;">There are no payments currently awaiting verification.</p>
          </div>
        `;
        return;
      }

      queueGrid.innerHTML = data.queue.map(item => {
        const submittedDate = item.payment_submitted_at
          ? new Date(item.payment_submitted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'Just now';

        const screenshotUrl = item.payment_screenshot_url || '/assets/logo.png';

        return `
          <div class="queue-card" id="card-${item.registration_id}">
            <div class="queue-header">
              <div>
                <span class="queue-reg-id">${item.registration_id}</span>
                <div style="font-size: 14px; font-weight: 700; color: #f7eee1; margin-top: 2px;">
                  ${escapeHtml(item.full_name)}
                  ${item.instagram ? `<span style="font-size: 11px; color: #e4ad57; font-weight: normal;">(@${escapeHtml(item.instagram)})</span>` : ''}
                </div>
              </div>
              <span class="queue-time">${submittedDate}</span>
            </div>

            <div class="queue-meta-row">
              <span class="queue-meta-label">Phone:</span>
              <span class="queue-meta-value">${escapeHtml(item.phone)}</span>
            </div>
            <div class="queue-meta-row">
              <span class="queue-meta-label">Email:</span>
              <span class="queue-meta-value" style="font-size: 12px;">${escapeHtml(item.email)}</span>
            </div>
            <div class="queue-meta-row">
              <span class="queue-meta-label">Category:</span>
              <span class="queue-meta-value">${escapeHtml(item.category || 'Performer')}</span>
            </div>
            <div class="queue-meta-row">
              <span class="queue-meta-label">Amount:</span>
              <span class="queue-meta-value" style="color: #6edb8c; font-weight: 800;">₹${item.amount || 79}</span>
            </div>

            <div class="queue-utr-box">
              <span style="font-size: 11px; color: #8e8477;">UTR / Trans ID:</span>
              <span class="queue-utr-code">${escapeHtml(item.transaction_id || 'NOT_ENTERED')}</span>
            </div>

            <div class="queue-screenshot-wrap" onclick="openScreenshotModal('${screenshotUrl}')">
              <img src="${screenshotUrl}" class="queue-screenshot-img" alt="Screenshot Proof">
              <div class="queue-screenshot-overlay">
                🔍 Click to Zoom Receipt
              </div>
            </div>

            <div class="queue-actions">
              <button type="button" class="btn-verify" onclick="verifyPayment('${item.registration_id}')">
                ✓ VERIFY PAYMENT
              </button>
              <button type="button" class="btn-reject" onclick="openRejectModal('${item.registration_id}')">
                ✕ REJECT
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('Queue load error', err);
    }
  }

  // Load All Registrations Table
  async function loadRegistrations() {
    if (!tableBody) return;
    const search = searchInput ? searchInput.value.trim() : '';
    const pay = paymentFilter ? paymentFilter.value : 'ALL';
    const check = checkinFilter ? checkinFilter.value : 'ALL';

    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (pay && pay !== 'ALL') query.set('payment_status', pay);
    if (check && check !== 'ALL') query.set('checked_in', check);

    try {
      const res = await fetch(`/api/admin/registrations?${query.toString()}`, {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:#e26947;padding:30px;">Error loading data: ${data.error || 'Unauthorized'}</td></tr>`;
        return;
      }

      if (data.registrations.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;color:#8e8477;">No matching registrations found.</td></tr>`;
        return;
      }

      tableBody.innerHTML = data.registrations.map(r => {
        let payBadge = '';
        if (r.payment_status === 'PAID') {
          payBadge = `<span class="table-status-badge status-paid">PAID (₹${r.amount})</span>`;
        } else if (r.payment_status === 'PENDING_VERIFICATION') {
          payBadge = `<span class="table-status-badge status-pending-verification">AWAITING VERIF</span>`;
        } else if (r.payment_status === 'REJECTED') {
          payBadge = `<span class="table-status-badge status-rejected" title="${escapeHtml(r.rejection_reason || '')}">REJECTED</span>`;
        } else {
          payBadge = `<span class="table-status-badge status-pending">PENDING</span>`;
        }

        // Email Verification Badge
        const isEmailVerified = Boolean(r.email_verified);
        const emailVerifBadge = isEmailVerified
          ? `<span style="display:inline-block; padding:2px 7px; border-radius:10px; font-size:9px; font-weight:800; background:rgba(110,219,140,0.15); color:#6edb8c; border:1px solid rgba(110,219,140,0.4);">VERIFIED ✓</span>`
          : `<span style="display:inline-block; padding:2px 7px; border-radius:10px; font-size:9px; font-weight:800; background:rgba(226,105,71,0.15); color:#ff8566; border:1px solid rgba(226,105,71,0.4);">UNVERIFIED</span>`;

        let emailStatusBadge = '';
        if (r.email_status === 'SENT') {
          emailStatusBadge = `<span style="color:#6edb8c; font-size:10px; font-weight:700;">SENT</span>`;
        } else if (r.email_status === 'FAILED') {
          emailStatusBadge = `<span style="color:#ff8566; font-size:10px; font-weight:700;" title="${escapeHtml(r.email_error || '')}">FAILED ⚠</span>`;
        }

        const isChecked = Boolean(r.checked_in);
        const checkBadge = isChecked
          ? `<button class="table-btn status-checked" onclick="toggleCheckin('${r.registration_id}')">✓ IN (${r.checkin_at ? new Date(r.checkin_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'YES'})</button>`
          : `<button class="table-btn" onclick="toggleCheckin('${r.registration_id}')">Mark In</button>`;

        const isCertEligible = Boolean(r.certificate_eligible);
        const certBadge = isCertEligible
          ? `<button class="table-btn" style="color:#6edb8c;" onclick="toggleCertificate('${r.registration_id}')" title="Click to toggle">YES</button>`
          : `<button class="table-btn" style="color:#8e8477;" onclick="toggleCertificate('${r.registration_id}')" title="Click to toggle">NO</button>`;

        let proofCell = '—';
        if (r.payment_screenshot_url) {
          proofCell = `<button type="button" class="table-btn" onclick="openScreenshotModal('${r.payment_screenshot_url}')">📷 View</button>`;
        }

        let quickActions = '';
        if (r.payment_status === 'PENDING_VERIFICATION') {
          quickActions = `
            <button class="table-btn" style="color:#6edb8c;" onclick="verifyPayment('${r.registration_id}')" title="Verify Payment">✓</button>
            <button class="table-btn" style="color:#ff8566;" onclick="openRejectModal('${r.registration_id}')" title="Reject Payment">✕</button>
          `;
        } else if (r.payment_status === 'REJECTED') {
          quickActions = `<button class="table-btn" style="color:#6edb8c;" onclick="verifyPayment('${r.registration_id}')">Re-Verify</button>`;
        } else if (r.payment_status === 'PAID') {
          quickActions = `<button class="table-btn" style="color:#ff8566;" onclick="openRejectModal('${r.registration_id}')">Revoke</button>`;
        }

        const resendBtn = `<button class="table-btn" style="color:#e4ad57;" onclick="openResendEmailModal('${r.registration_id}', '${escapeHtml(r.email)}')" title="Resend email">✉</button>`;

        return `
          <tr>
            <td class="reg-id">${r.registration_id}</td>
            <td>
              <b>${escapeHtml(r.full_name)}</b>
              ${r.instagram ? `<br><small style="color:#cda45b;">@${escapeHtml(r.instagram)}</small>` : ''}
            </td>
            <td>${escapeHtml(r.phone)}</td>
            <td>
              <span style="color:#f7eee1; font-size:12px;">${escapeHtml(r.email)}</span><br>
              <div style="margin-top:3px; display:flex; gap:6px; align-items:center;">
                ${emailVerifBadge}
                ${emailStatusBadge}
              </div>
            </td>
            <td>
              <span style="font-weight:700;color:#f7eee1;">${escapeHtml(r.category || 'Performer')}</span><br>
              <small style="color:#d5c5ae;">${escapeHtml(r.performance_title || '—')}</small>
            </td>
            <td style="color:#e4ad57; font-weight:700;">₹${r.amount}</td>
            <td><code style="color:#ffd175; font-size:12px;">${escapeHtml(r.transaction_id || '—')}</code></td>
            <td>${proofCell}</td>
            <td>${payBadge}</td>
            <td>${checkBadge}</td>
            <td>${certBadge}</td>
            <td>
              <div style="display:flex; gap:4px; align-items:center;">
                ${quickActions}
                ${resendBtn}
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Registrations table error', err);
    }
  }

  // Load Email Audit Logs
  async function loadEmailLogs() {
    if (!emailLogsTableBody) return;
    try {
      const res = await fetch('/api/admin/email-logs', {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        emailLogsTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ff8566;padding:20px;">Failed to load logs.</td></tr>`;
        return;
      }

      if (data.logs.length === 0) {
        emailLogsTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#8e8477;">No email records logged yet.</td></tr>`;
        return;
      }

      emailLogsTableBody.innerHTML = data.logs.map(log => {
        const time = new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const statusBadge = log.status === 'SENT'
          ? `<span class="table-status-badge status-paid">SENT ✓</span>`
          : `<span class="table-status-badge status-rejected">FAILED ✕</span>`;

        return `
          <tr>
            <td style="font-family:monospace; color:#8e8477;">#${log.id}</td>
            <td style="font-family:monospace; color:#e4ad57;">${log.registration_id || '—'}</td>
            <td><b>${escapeHtml(log.recipient)}</b></td>
            <td><span class="badge" style="font-size:10px;">${escapeHtml(log.email_type)}</span></td>
            <td><small style="color:#d5cbbd;">${escapeHtml(log.subject)}</small></td>
            <td>${statusBadge}</td>
            <td><small style="color:#8e8477;">${time}</small></td>
            <td><small style="font-family:monospace; color:${log.status === 'SENT' ? '#6edb8c' : '#ff8566'}; font-size:10px;">${escapeHtml(log.provider_message_id || log.error_message || '—')}</small></td>
          </tr>
        `;
      }).join('');

    } catch (e) {
      console.error('Email logs error', e);
    }
  }

  // SMTP Health Check Test
  if (smtpTestBtn) {
    smtpTestBtn.addEventListener('click', async () => {
      smtpTestBtn.disabled = true;
      smtpTestBtn.textContent = 'Testing connection…';
      if (smtpDiagOutput) {
        smtpDiagOutput.style.display = 'block';
        smtpDiagOutput.style.color = '#e4ad57';
        smtpDiagOutput.textContent = 'Connecting to smtp.gmail.com:587…\nAuthenticating offstagecreators77@gmail.com…';
      }

      try {
        const res = await fetch('/api/admin/email/health-check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret
          },
          body: JSON.stringify({ sendTestMessage: false })
        });

        const data = await res.json();
        smtpTestBtn.disabled = false;
        smtpTestBtn.textContent = '⚡ TEST SMTP CONNECTION';

        if (res.ok && data.success) {
          smtpDiagOutput.style.color = '#6edb8c';
          smtpDiagOutput.textContent = `✓ SMTP CONNECTED & AUTHENTICATED!\nHost: ${data.smtp.host}:${data.smtp.port}\nAccount: ${data.smtp.user}\nStatus: Ready for live dispatch.`;
        } else {
          smtpDiagOutput.style.color = '#ff8566';
          smtpDiagOutput.textContent = `✕ SMTP CONNECTION FAILED:\n${data.error || data.smtp?.error || 'Authentication error'}`;
        }
      } catch (err) {
        smtpTestBtn.disabled = false;
        smtpTestBtn.textContent = '⚡ TEST SMTP CONNECTION';
        smtpDiagOutput.style.color = '#ff8566';
        smtpDiagOutput.textContent = `✕ Network failure during test: ${err.message}`;
      }
    });
  }

  // Send Diagnostic Test Email
  if (sendDiagEmailBtn) {
    sendDiagEmailBtn.addEventListener('click', async () => {
      const recipient = prompt('Enter recipient address for diagnostic test email:', 'offstagecreators77@gmail.com');
      if (!recipient) return;

      sendDiagEmailBtn.disabled = true;
      sendDiagEmailBtn.textContent = 'Sending test email…';
      if (smtpDiagOutput) {
        smtpDiagOutput.style.display = 'block';
        smtpDiagOutput.style.color = '#e4ad57';
        smtpDiagOutput.textContent = `Dispatching diagnostic email to ${recipient}…`;
      }

      try {
        const res = await fetch('/api/admin/email/health-check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret
          },
          body: JSON.stringify({ sendTestMessage: true, recipient })
        });

        const data = await res.json();
        sendDiagEmailBtn.disabled = false;
        sendDiagEmailBtn.textContent = '✉ SEND TEST EMAIL';

        if (res.ok && data.success && data.testDelivery?.success) {
          smtpDiagOutput.style.color = '#6edb8c';
          smtpDiagOutput.textContent = `✓ DIAGNOSTIC EMAIL SENT SUCCESSFULLY!\nRecipient: ${recipient}\nMessage ID: ${data.testDelivery.messageId}\nCheck your inbox.`;
          loadEmailLogs();
        } else {
          smtpDiagOutput.style.color = '#ff8566';
          smtpDiagOutput.textContent = `✕ FAILED TO DELIVER TEST MESSAGE:\n${data.testDelivery?.error || data.error || 'Check mail configuration'}`;
        }
      } catch (err) {
        sendDiagEmailBtn.disabled = false;
        sendDiagEmailBtn.textContent = '✉ SEND TEST EMAIL';
        smtpDiagOutput.style.color = '#ff8566';
        smtpDiagOutput.textContent = `✕ Delivery request error: ${err.message}`;
      }
    });
  }

  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', loadEmailLogs);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Verify Payment Action
  window.verifyPayment = async function (registrationId) {
    if (!confirm(`Are you sure you want to verify payment for registration ${registrationId}?\nThis will mark status as PAID and automatically send their confirmation pass via email.`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret
        },
        body: JSON.stringify({ registrationId, adminName: 'Organizer' })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await loadDashboard();
      } else {
        alert(`Failed to verify payment: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Verify payment error:', err);
      alert('Network error while verifying payment.');
    }
  };

  // Rejection Modals & Action
  window.openRejectModal = function (registrationId) {
    targetRejectRegId = registrationId;
    if (rejectTargetId) rejectTargetId.textContent = registrationId;
    if (rejectReasonInput) rejectReasonInput.value = '';
    if (rejectModal) rejectModal.style.display = 'flex';
  };

  window.closeRejectModal = function () {
    targetRejectRegId = null;
    if (rejectModal) rejectModal.style.display = 'none';
  };

  if (rejectForm) {
    rejectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!targetRejectRegId) return;

      const reason = rejectReasonInput ? rejectReasonInput.value.trim() : '';
      try {
        const res = await fetch('/api/admin/reject-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret
          },
          body: JSON.stringify({
            registrationId: targetRejectRegId,
            reason: reason || 'Screenshot/UTR could not be verified.',
            adminName: 'Organizer'
          })
        });

        const data = await res.json();
        closeRejectModal();
        if (res.ok && data.success) {
          await loadDashboard();
        } else {
          alert(`Failed to reject payment: ${data.error || 'Server error'}`);
        }
      } catch (err) {
        console.error('Reject payment error:', err);
        alert('Network error while rejecting payment.');
      }
    });
  }

  // Resend Email Modal & Action
  window.openResendEmailModal = function (regId, email) {
    if (resendRegId) resendRegId.value = regId;
    if (resendTargetEmail) resendTargetEmail.textContent = email;
    if (resendEmailModal) resendEmailModal.style.display = 'flex';
  };

  window.closeResendEmailModal = function () {
    if (resendEmailModal) resendEmailModal.style.display = 'none';
  };

  if (resendEmailForm) {
    resendEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const regId = resendRegId ? resendRegId.value : '';
      const emailType = resendTypeSelect ? resendTypeSelect.value : '';
      if (!regId || !emailType) return;

      confirmResendBtn.disabled = true;
      confirmResendBtn.textContent = 'Sending email…';

      try {
        const res = await fetch('/api/admin/email/resend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret
          },
          body: JSON.stringify({ registrationId: regId, emailType })
        });

        const data = await res.json();
        confirmResendBtn.disabled = false;
        confirmResendBtn.textContent = '✉ Send Email Now';

        closeResendEmailModal();
        if (res.ok && data.success) {
          alert(data.message || 'Email resent successfully!');
          await loadDashboard();
        } else {
          alert(`Email sending failed: ${data.error || 'Check mail configuration'}`);
        }
      } catch (err) {
        confirmResendBtn.disabled = false;
        confirmResendBtn.textContent = '✉ Send Email Now';
        alert(`Network error resending email: ${err.message}`);
      }
    });
  }

  // Lightbox Modal
  window.openScreenshotModal = function (url) {
    if (modalImg) modalImg.src = url;
    if (modalImgDownload) modalImgDownload.href = url;
    if (screenshotModal) screenshotModal.style.display = 'flex';
  };

  window.closeScreenshotModal = function () {
    if (screenshotModal) screenshotModal.style.display = 'none';
  };

  // =========================================================
  // GOOGLE MEET SESSION DISPATCHER SUBSYSTEM
  // =========================================================

  const statMeetSessions = document.getElementById('statMeetSessions');
  const statMeetSent = document.getElementById('statMeetSent');
  const statMeetFailed = document.getElementById('statMeetFailed');

  const meetEventSelect = document.getElementById('meetEventSelect');
  const meetTitleInput = document.getElementById('meetTitleInput');
  const meetDateInput = document.getElementById('meetDateInput');
  const meetTimeInput = document.getElementById('meetTimeInput');
  const meetUrlInput = document.getElementById('meetUrlInput');
  const meetUrlBadge = document.getElementById('meetUrlBadge');
  const meetUrlError = document.getElementById('meetUrlError');
  const meetMessageInput = document.getElementById('meetMessageInput');

  const meetNotSentSessionContainer = document.getElementById('meetNotSentSessionContainer');
  const meetNotSentSessionSelect = document.getElementById('meetNotSentSessionSelect');
  const meetSelectedParticipantsContainer = document.getElementById('meetSelectedParticipantsContainer');
  const meetParticipantSearchInput = document.getElementById('meetParticipantSearchInput');
  const meetParticipantsList = document.getElementById('meetParticipantsList');
  const targetEligibleCountBadge = document.getElementById('targetEligibleCountBadge');

  const previewFrameContainer = document.getElementById('previewFrameContainer');
  const previewContentBox = document.getElementById('previewContentBox');
  const previewSubjectDisplay = document.getElementById('previewSubjectDisplay');
  const previewToDisplay = document.getElementById('previewToDisplay');
  const previewDesktopBtn = document.getElementById('previewDesktopBtn');
  const previewMobileBtn = document.getElementById('previewMobileBtn');

  const meetHistoryTableBody = document.getElementById('meetHistoryTableBody');

  // Modals
  const meetTestModal = document.getElementById('meetTestModal');
  const meetTestEmailInput = document.getElementById('meetTestEmailInput');
  const meetTestStatus = document.getElementById('meetTestStatus');
  const confirmTestSendBtn = document.getElementById('confirmTestSendBtn');

  const meetConfirmModal = document.getElementById('meetConfirmModal');
  const confirmEventDisplay = document.getElementById('confirmEventDisplay');
  const confirmTitleDisplay = document.getElementById('confirmTitleDisplay');
  const confirmDateTimeDisplay = document.getElementById('confirmDateTimeDisplay');
  const confirmMeetUrlDisplay = document.getElementById('confirmMeetUrlDisplay');
  const confirmRecipientCountDisplay = document.getElementById('confirmRecipientCountDisplay');
  const confirmBroadcastBtn = document.getElementById('confirmBroadcastBtn');

  const meetProgressModal = document.getElementById('meetProgressModal');
  const progressTitle = document.getElementById('progressTitle');
  const progressSubtitle = document.getElementById('progressSubtitle');
  const meetProgressBar = document.getElementById('meetProgressBar');
  const progressTotalCount = document.getElementById('progressTotalCount');
  const progressSentCount = document.getElementById('progressSentCount');
  const progressFailedCount = document.getElementById('progressFailedCount');
  const progressFailedContainer = document.getElementById('progressFailedContainer');
  const progressFailedList = document.getElementById('progressFailedList');
  const progressRetryBtn = document.getElementById('progressRetryBtn');
  const progressCloseBtn = document.getElementById('progressCloseBtn');

  const meetSessionDetailsModal = document.getElementById('meetSessionDetailsModal');
  const detailsSessionTitle = document.getElementById('detailsSessionTitle');
  const detailsSessionMeta = document.getElementById('detailsSessionMeta');
  const detailsSessionLogsTable = document.getElementById('detailsSessionLogsTable');
  const detailsRetryFailedBtn = document.getElementById('detailsRetryFailedBtn');

  let activeSessionDetailsId = null;
  let cachedEligibleRecipients = [];
  let previewDebounce = null;
  let activeBroadcastSessionId = null;

  // Load Meet Overview Stats
  async function loadMeetStats() {
    try {
      const res = await fetch('/api/admin/meet/overview', {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (statMeetSessions) statMeetSessions.textContent = data.stats.totalSessions;
        if (statMeetSent) statMeetSent.textContent = `${data.stats.invitationsSent} sent`;
        if (statMeetFailed) statMeetFailed.textContent = `${data.stats.invitationsFailed} failed`;
      }
    } catch (e) {
      console.error('Meet stats load error:', e);
    }
  }

  // Validate Google Meet URL
  window.validateMeetUrlInput = function () {
    if (!meetUrlInput) return false;
    const val = meetUrlInput.value.trim();
    const isValid = /^https:\/\/meet\.google\.com\/[a-z0-9\-]+(\?.*)?$/i.test(val);

    if (isValid) {
      if (meetUrlBadge) {
        meetUrlBadge.textContent = 'VALID URL ✓';
        meetUrlBadge.style.color = '#6edb8c';
        meetUrlBadge.style.background = 'rgba(110, 219, 140, 0.15)';
      }
      if (meetUrlError) meetUrlError.style.display = 'none';
      return true;
    } else {
      if (meetUrlBadge) {
        meetUrlBadge.textContent = 'INVALID ✕';
        meetUrlBadge.style.color = '#ff8566';
        meetUrlBadge.style.background = 'rgba(255, 133, 102, 0.15)';
      }
      if (meetUrlError) meetUrlError.style.display = 'block';
      return false;
    }
  };

  // Insert Variable helper into message textarea
  window.insertVariable = function (varName) {
    if (!meetMessageInput) return;
    const start = meetMessageInput.selectionStart || 0;
    const end = meetMessageInput.selectionEnd || 0;
    const text = meetMessageInput.value;
    meetMessageInput.value = text.substring(0, start) + varName + text.substring(end);
    meetMessageInput.focus();
    meetMessageInput.selectionStart = meetMessageInput.selectionEnd = start + varName.length;
    updateMeetPreview();
  };

  // Toggle Live Preview Viewport (Desktop vs Mobile)
  window.setPreviewMode = function (mode) {
    if (!previewFrameContainer) return;
    if (mode === 'mobile') {
      previewFrameContainer.classList.add('mobile-mode');
      if (previewMobileBtn) previewMobileBtn.classList.add('active');
      if (previewDesktopBtn) previewDesktopBtn.classList.remove('active');
    } else {
      previewFrameContainer.classList.remove('mobile-mode');
      if (previewDesktopBtn) previewDesktopBtn.classList.add('active');
      if (previewMobileBtn) previewMobileBtn.classList.remove('active');
    }
  };

  // Update Live Email Preview
  window.updateMeetPreview = function () {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(async () => {
      const eventSelect = meetEventSelect ? meetEventSelect.options[meetEventSelect.selectedIndex] : null;
      const eventName = eventSelect ? eventSelect.text.split('(')[0].trim() : 'Online Open Mic 2026';
      const title = meetTitleInput ? meetTitleInput.value.trim() : '';
      const date = meetDateInput ? meetDateInput.value.trim() : '';
      const time = meetTimeInput ? meetTimeInput.value.trim() : '';
      const meetUrl = meetUrlInput ? meetUrlInput.value.trim() : '';
      const message = meetMessageInput ? meetMessageInput.value : '';

      if (previewSubjectDisplay) {
        previewSubjectDisplay.textContent = `Offstage Creators — Google Meet Details | ${title || 'Live Session'}`;
      }

      try {
        const res = await fetch('/api/admin/meet/render-preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret
          },
          body: JSON.stringify({
            session: {
              event_name: eventName,
              title: title || 'Performer Briefing',
              date: date || '23 September 2026',
              time: time || '7:30 PM IST',
              meet_url: meetUrl || 'https://meet.google.com/xxx-xxxx-xxx',
              message
            },
            sampleParticipant: {
              full_name: 'Aarav Sharma',
              registration_id: 'OC-OM-2026SAMPLE',
              email: 'aarav@example.com'
            }
          })
        });

        const data = await res.json();
        if (res.ok && data.success && previewContentBox) {
          previewContentBox.innerHTML = data.html;
        }
      } catch (err) {
        console.error('Preview render error:', err);
      }
    }, 150);
  };

  // Event Change
  window.onMeetEventChange = function () {
    const eventVal = meetEventSelect ? meetEventSelect.value : '';
    if (eventVal === 'delhi-adhure-musafir-2026') {
      if (meetTitleInput) meetTitleInput.value = 'Adhure Musafir — Delhi Performer Briefing';
      if (meetDateInput) meetDateInput.value = '4 October 2026';
      if (meetTimeInput) meetTimeInput.value = '3:30 PM onwards';
    } else {
      if (meetTitleInput) meetTitleInput.value = 'Online Open Mic — Performer Briefing';
      if (meetDateInput) meetDateInput.value = '23 September 2026';
      if (meetTimeInput) meetTimeInput.value = '7:30 PM IST';
    }
    loadEligibleRecipients();
    updateMeetPreview();
  };

  // Recipient Mode Change
  window.onRecipientModeChange = function () {
    const selectedMode = document.querySelector('input[name="meetRecipientMode"]:checked')?.value || 'ALL_PAID';

    if (meetSelectedParticipantsContainer) {
      meetSelectedParticipantsContainer.style.display = (selectedMode === 'SELECTED') ? 'block' : 'none';
    }
    if (meetNotSentSessionContainer) {
      meetNotSentSessionContainer.style.display = (selectedMode === 'NOT_SENT') ? 'block' : 'none';
      if (selectedMode === 'NOT_SENT') {
        populateNotSentSessionOptions();
      }
    }

    loadEligibleRecipients();
  };

  // Populate Not-Sent session selector
  async function populateNotSentSessionOptions() {
    if (!meetNotSentSessionSelect) return;
    try {
      const res = await fetch('/api/admin/meet/sessions', {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok && data.success && data.sessions) {
        meetNotSentSessionSelect.innerHTML = '<option value="">-- Choose Previous Session to Exclude --</option>' +
          data.sessions.map(s => `<option value="${s.id}">#${s.id} — ${escapeHtml(s.title)} (${s.date})</option>`).join('');
      }
    } catch (e) {
      console.error('Failed to populate session options:', e);
    }
  }

  // Load Eligible Recipients
  window.loadEligibleRecipients = async function () {
    const eventId = meetEventSelect ? meetEventSelect.value : 'all';
    const mode = document.querySelector('input[name="meetRecipientMode"]:checked')?.value || 'ALL_PAID';
    const sessionId = meetNotSentSessionSelect ? meetNotSentSessionSelect.value : '';

    try {
      let url = `/api/admin/meet/eligible-recipients?eventId=${encodeURIComponent(eventId)}&mode=${encodeURIComponent(mode)}`;
      if (mode === 'NOT_SENT' && sessionId) {
        url += `&sessionId=${encodeURIComponent(sessionId)}`;
      }

      const res = await fetch(url, {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        cachedEligibleRecipients = data.recipients || [];
        renderParticipantsCheckboxes(cachedEligibleRecipients);

        if (mode === 'SELECTED') {
          updateSelectedCountBadge();
        } else {
          if (targetEligibleCountBadge) {
            targetEligibleCountBadge.textContent = `${cachedEligibleRecipients.length} participants will receive email`;
          }
        }
      }
    } catch (e) {
      console.error('Eligible recipients load error:', e);
    }
  };

  // Render Checkbox list for "Selected Participants"
  function renderParticipantsCheckboxes(recipients) {
    if (!meetParticipantsList) return;
    if (recipients.length === 0) {
      meetParticipantsList.innerHTML = `<div style="text-align:center; padding:16px; color:#8e8477; font-size:12px;">No confirmed participants found for this event.</div>`;
      return;
    }

    meetParticipantsList.innerHTML = recipients.map(p => `
      <label class="meet-participant-item" style="display:flex; align-items:center; gap:10px; padding:6px 8px; border-bottom:1px solid #1a1613; font-size:12px; cursor:pointer; color:#f7eee1;">
        <input type="checkbox" class="meet-p-check" value="${p.registration_id}" onchange="updateSelectedCountBadge()" checked>
        <span style="font-family:monospace; color:#e4ad57; min-width:80px;">${p.registration_id}</span>
        <b style="color:#f7eee1;">${escapeHtml(p.full_name)}</b>
        <span style="color:#8e8477; font-size:11px;">(${escapeHtml(p.email)})</span>
      </label>
    `).join('');
    updateSelectedCountBadge();
  }

  // Update selected count badge
  function updateSelectedCountBadge() {
    if (!targetEligibleCountBadge) return;
    const mode = document.querySelector('input[name="meetRecipientMode"]:checked')?.value || 'ALL_PAID';
    if (mode === 'SELECTED') {
      const checkedBoxes = document.querySelectorAll('.meet-p-check:checked');
      targetEligibleCountBadge.textContent = `${checkedBoxes.length} of ${cachedEligibleRecipients.length} selected`;
    } else {
      targetEligibleCountBadge.textContent = `${cachedEligibleRecipients.length} participants targeted`;
    }
  }

  // Filter Participant Checkboxes via search bar
  window.filterMeetParticipantsList = function () {
    if (!meetParticipantSearchInput) return;
    const q = meetParticipantSearchInput.value.toLowerCase().trim();
    const items = document.querySelectorAll('.meet-participant-item');
    items.forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(q) ? 'flex' : 'none';
    });
  };

  // Select/Deselect All Checkboxes
  window.selectAllMeetRecipients = function (select) {
    const checks = document.querySelectorAll('.meet-p-check');
    checks.forEach(c => c.checked = select);
    updateSelectedCountBadge();
  };

  // Get selected participant IDs
  function getSelectedRecipientIds() {
    const mode = document.querySelector('input[name="meetRecipientMode"]:checked')?.value || 'ALL_PAID';
    if (mode === 'SELECTED') {
      const checks = document.querySelectorAll('.meet-p-check:checked');
      return Array.from(checks).map(c => c.value);
    }
    return cachedEligibleRecipients.map(r => r.registration_id);
  }

  // TEST EMAIL MODAL
  window.openMeetTestModal = function () {
    if (!validateMeetUrlInput()) {
      alert('Please enter a valid Google Meet link first (e.g. https://meet.google.com/xxx-xxxx-xxx).');
      return;
    }
    if (meetTestStatus) meetTestStatus.style.display = 'none';
    if (meetTestModal) meetTestModal.style.display = 'flex';
  };

  window.closeMeetTestModal = function () {
    if (meetTestModal) meetTestModal.style.display = 'none';
  };

  window.executeMeetTestEmail = async function (e) {
    e.preventDefault();
    const recipient = meetTestEmailInput ? meetTestEmailInput.value.trim() : '';
    if (!recipient) return;

    if (confirmTestSendBtn) {
      confirmTestSendBtn.disabled = true;
      confirmTestSendBtn.textContent = 'Sending preview…';
    }

    if (meetTestStatus) {
      meetTestStatus.style.display = 'block';
      meetTestStatus.style.color = '#ffd685';
      meetTestStatus.textContent = `Dispatching live preview to ${recipient}…`;
    }

    try {
      const eventSelect = meetEventSelect ? meetEventSelect.options[meetEventSelect.selectedIndex] : null;
      const eventName = eventSelect ? eventSelect.text.split('(')[0].trim() : 'Online Open Mic 2026';

      const res = await fetch('/api/admin/meet/send-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret
        },
        body: JSON.stringify({
          recipientEmail: recipient,
          session: {
            event_name: eventName,
            title: meetTitleInput ? meetTitleInput.value.trim() : '',
            date: meetDateInput ? meetDateInput.value.trim() : '',
            time: meetTimeInput ? meetTimeInput.value.trim() : '',
            meet_url: meetUrlInput ? meetUrlInput.value.trim() : '',
            message: meetMessageInput ? meetMessageInput.value : ''
          }
        })
      });

      const data = await res.json();
      if (confirmTestSendBtn) {
        confirmTestSendBtn.disabled = false;
        confirmTestSendBtn.textContent = 'Send Test Preview';
      }

      if (res.ok && data.success) {
        meetTestStatus.style.color = '#6edb8c';
        meetTestStatus.textContent = `✓ Test email delivered to ${recipient}! (Message ID: ${data.messageId})`;
      } else {
        meetTestStatus.style.color = '#ff8566';
        meetTestStatus.textContent = `✕ Failed: ${data.error || 'SMTP delivery failure'}`;
      }
    } catch (err) {
      if (confirmTestSendBtn) {
        confirmTestSendBtn.disabled = false;
        confirmTestSendBtn.textContent = 'Send Test Preview';
      }
      if (meetTestStatus) {
        meetTestStatus.style.color = '#ff8566';
        meetTestStatus.textContent = `✕ Network error: ${err.message}`;
      }
    }
  };

  // CONFIRM BROADCAST MODAL
  window.openMeetConfirmModal = function () {
    if (!validateMeetUrlInput()) {
      alert('Please provide a valid Google Meet link (e.g. https://meet.google.com/xxx-xxxx-xxx).');
      return;
    }

    const title = meetTitleInput ? meetTitleInput.value.trim() : '';
    if (!title) {
      alert('Please enter a session title.');
      return;
    }

    const recipientIds = getSelectedRecipientIds();
    if (recipientIds.length === 0) {
      alert('No eligible recipients are currently targeted. Please check the recipient settings.');
      return;
    }

    const eventSelect = meetEventSelect ? meetEventSelect.options[meetEventSelect.selectedIndex] : null;
    const eventName = eventSelect ? eventSelect.text.split('(')[0].trim() : 'Online Open Mic 2026';

    if (confirmEventDisplay) confirmEventDisplay.textContent = eventName;
    if (confirmTitleDisplay) confirmTitleDisplay.textContent = title;
    if (confirmDateTimeDisplay) confirmDateTimeDisplay.textContent = `${meetDateInput.value.trim()} at ${meetTimeInput.value.trim()}`;
    if (confirmMeetUrlDisplay) confirmMeetUrlDisplay.textContent = meetUrlInput.value.trim();
    if (confirmRecipientCountDisplay) confirmRecipientCountDisplay.textContent = `${recipientIds.length} participants`;

    if (meetConfirmModal) meetConfirmModal.style.display = 'flex';
  };

  window.closeMeetConfirmModal = function () {
    if (meetConfirmModal) meetConfirmModal.style.display = 'none';
  };

  // EXECUTE BATCH BROADCAST
  window.executeMeetBroadcast = async function () {
    closeMeetConfirmModal();

    const eventSelect = meetEventSelect ? meetEventSelect.options[meetEventSelect.selectedIndex] : null;
    const eventName = eventSelect ? eventSelect.text.split('(')[0].trim() : 'Online Open Mic 2026';
    const eventId = meetEventSelect ? meetEventSelect.value : 'online-open-mic-2026';
    const title = meetTitleInput ? meetTitleInput.value.trim() : '';
    const date = meetDateInput ? meetDateInput.value.trim() : '';
    const time = meetTimeInput ? meetTimeInput.value.trim() : '';
    const meetUrl = meetUrlInput ? meetUrlInput.value.trim() : '';
    const message = meetMessageInput ? meetMessageInput.value : '';
    const recipientMode = document.querySelector('input[name="meetRecipientMode"]:checked')?.value || 'ALL_PAID';
    const selectedRegistrationIds = getSelectedRecipientIds();
    const targetSessionId = meetNotSentSessionSelect ? meetNotSentSessionSelect.value : null;

    // Open Progress Modal
    if (progressTitle) progressTitle.textContent = 'Broadcasting Google Meet Links…';
    if (progressSubtitle) progressSubtitle.textContent = 'Dispatching through Gmail SMTP with rate-limit protection…';
    if (meetProgressBar) meetProgressBar.style.width = '25%';
    if (progressTotalCount) progressTotalCount.textContent = selectedRegistrationIds.length;
    if (progressSentCount) progressSentCount.textContent = '0';
    if (progressFailedCount) progressFailedCount.textContent = '0';
    if (progressFailedContainer) progressFailedContainer.style.display = 'none';
    if (progressRetryBtn) progressRetryBtn.style.display = 'none';
    if (progressCloseBtn) progressCloseBtn.style.display = 'none';
    if (meetProgressModal) meetProgressModal.style.display = 'flex';

    try {
      const res = await fetch('/api/admin/meet/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret
        },
        body: JSON.stringify({
          eventId,
          eventName,
          title,
          date,
          time,
          meetUrl,
          message,
          recipientMode,
          selectedRegistrationIds,
          targetSessionId
        })
      });

      const data = await res.json();
      if (meetProgressBar) meetProgressBar.style.width = '100%';

      if (res.ok && data.success) {
        activeBroadcastSessionId = data.sessionId;
        if (progressTitle) progressTitle.textContent = 'Broadcast Complete! ✓';
        if (progressSubtitle) progressSubtitle.textContent = `All emails processed for session #${data.sessionId}.`;
        if (progressSentCount) progressSentCount.textContent = data.sent;
        if (progressFailedCount) progressFailedCount.textContent = data.failed;

        if (data.failed > 0 && data.failedList && data.failedList.length > 0) {
          if (progressFailedContainer) progressFailedContainer.style.display = 'block';
          if (progressFailedList) {
            progressFailedList.innerHTML = data.failedList.map(f => `<div>• <b>${escapeHtml(f.name)}</b> (${escapeHtml(f.email)}): <span style="color:#ff8566;">${escapeHtml(f.error)}</span></div>`).join('');
          }
          if (progressRetryBtn) progressRetryBtn.style.display = 'inline-block';
        }

        if (progressCloseBtn) progressCloseBtn.style.display = 'inline-block';

        // Reload data in background
        loadMeetStats();
        loadMeetHistory();
        loadEligibleRecipients();

      } else {
        if (progressTitle) progressTitle.textContent = 'Broadcast Failed';
        if (progressSubtitle) progressSubtitle.textContent = data.error || 'Server error';
        if (progressCloseBtn) progressCloseBtn.style.display = 'inline-block';
      }

    } catch (err) {
      if (progressTitle) progressTitle.textContent = 'Network Error';
      if (progressSubtitle) progressSubtitle.textContent = err.message;
      if (progressCloseBtn) progressCloseBtn.style.display = 'inline-block';
    }
  };

  window.closeMeetProgressModal = function () {
    if (meetProgressModal) meetProgressModal.style.display = 'none';
  };

  // Retry Failed from progress modal
  window.retryFailedFromProgress = async function () {
    if (!activeBroadcastSessionId) return;
    if (progressRetryBtn) {
      progressRetryBtn.disabled = true;
      progressRetryBtn.textContent = 'Retrying…';
    }
    await retrySessionFailed(activeBroadcastSessionId);
    if (progressRetryBtn) {
      progressRetryBtn.disabled = false;
      progressRetryBtn.textContent = '⟳ Retry Failed';
    }
  };

  // LOAD SESSION HISTORY
  window.loadMeetHistory = async function () {
    if (!meetHistoryTableBody) return;
    try {
      const res = await fetch('/api/admin/meet/sessions', {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.sessions) {
        meetHistoryTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#ff8566;padding:20px;">Failed to load session history.</td></tr>`;
        return;
      }

      if (data.sessions.length === 0) {
        meetHistoryTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:#8e8477;">No Google Meet sessions recorded yet. Use the form above to dispatch your first link.</td></tr>`;
        return;
      }

      meetHistoryTableBody.innerHTML = data.sessions.map(s => {
        const time = new Date(s.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const sent = s.sent_count || 0;
        const failed = s.failed_count || 0;
        const total = s.total_logged || 0;

        const retryBtn = failed > 0 ? `<button class="table-btn" style="color:#ff8566;" onclick="retrySessionFailed(${s.id})" title="Retry ${failed} failed emails">⟳ Retry (${failed})</button>` : '';

        return `
          <tr>
            <td style="font-family:monospace; color:#8e8477;">#${s.id}</td>
            <td><b style="color:#f7eee1;">${escapeHtml(s.title)}</b></td>
            <td><span class="badge" style="font-size:10px;">${escapeHtml(s.event_name)}</span></td>
            <td><small style="color:#d5cbbd;">${escapeHtml(s.date)} • ${escapeHtml(s.time)}</small></td>
            <td><a href="${escapeHtml(s.meet_url)}" target="_blank" style="color:#e4ad57; font-family:monospace; font-size:11px;">Join Link ↗</a></td>
            <td><b>${total}</b></td>
            <td>
              <span class="table-status-badge status-paid">${sent} SENT</span>
              ${failed > 0 ? `<span class="table-status-badge status-rejected" style="margin-left:4px;">${failed} FAILED</span>` : ''}
            </td>
            <td><small style="color:#8e8477;">${time}</small></td>
            <td>
              <div style="display:flex; gap:4px;">
                <button class="table-btn" style="color:#e4ad57;" onclick="openMeetSessionDetails(${s.id})" title="View delivery audit">View</button>
                <button class="table-btn" style="color:#ffd685;" onclick="duplicateSession(${s.id})" title="Duplicate session parameters">Duplicate</button>
                ${retryBtn}
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (e) {
      console.error('Session history load error:', e);
    }
  };

  // Open Session Details Modal with recipient delivery log
  window.openMeetSessionDetails = async function (id) {
    activeSessionDetailsId = id;
    if (detailsSessionTitle) detailsSessionTitle.textContent = `Session #${id}`;
    if (detailsSessionMeta) detailsSessionMeta.textContent = 'Loading audit records…';
    if (detailsSessionLogsTable) detailsSessionLogsTable.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#8e8477;">Loading…</td></tr>`;
    if (detailsRetryFailedBtn) detailsRetryFailedBtn.style.display = 'none';
    if (meetSessionDetailsModal) meetSessionDetailsModal.style.display = 'flex';

    try {
      const res = await fetch(`/api/admin/meet/sessions/${id}`, {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const s = data.session;
        if (detailsSessionTitle) detailsSessionTitle.textContent = `${s.title} (#${s.id})`;
        if (detailsSessionMeta) {
          detailsSessionMeta.textContent = `Event: ${s.event_name} • Date: ${s.date} ${s.time} • Meet: ${s.meet_url}`;
        }

        const logs = data.logs || [];
        const hasFailed = logs.some(l => l.status === 'FAILED');
        if (hasFailed && detailsRetryFailedBtn) {
          detailsRetryFailedBtn.style.display = 'inline-block';
        }

        if (logs.length === 0) {
          detailsSessionLogsTable.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#8e8477;">No email records logged for this session.</td></tr>`;
          return;
        }

        detailsSessionLogsTable.innerHTML = logs.map(l => {
          const time = new Date(l.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const statusBadge = l.status === 'SENT'
            ? `<span class="table-status-badge status-paid">SENT ✓</span>`
            : `<span class="table-status-badge status-rejected">FAILED ✕</span>`;

          return `
            <tr>
              <td><b>${escapeHtml(l.recipient_name || 'Performer')}</b><br><small style="color:#8e8477;">${escapeHtml(l.recipient_email)}</small></td>
              <td><span style="font-family:monospace; color:#e4ad57;">${escapeHtml(l.registration_id || '—')}</span></td>
              <td>${statusBadge}</td>
              <td><small style="color:#8e8477;">${time}</small></td>
              <td><small style="font-family:monospace; color:${l.status === 'SENT' ? '#6edb8c' : '#ff8566'}; font-size:10px;">${escapeHtml(l.provider_message_id || l.error_message || '—')}</small></td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) {
      console.error('Session details load error:', e);
    }
  };

  window.closeMeetDetailsModal = function () {
    activeSessionDetailsId = null;
    if (meetSessionDetailsModal) meetSessionDetailsModal.style.display = 'none';
  };

  window.retryFromDetailsModal = async function () {
    if (!activeSessionDetailsId) return;
    await retrySessionFailed(activeSessionDetailsId);
    openMeetSessionDetails(activeSessionDetailsId);
  };

  window.duplicateFromDetailsModal = function () {
    if (activeSessionDetailsId) {
      duplicateSession(activeSessionDetailsId);
      closeMeetDetailsModal();
    }
  };

  // Duplicate Session
  window.duplicateSession = async function (id) {
    try {
      const res = await fetch(`/api/admin/meet/sessions/${id}`, {
        headers: { 'x-admin-secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        const s = data.session;
        if (meetEventSelect) meetEventSelect.value = s.event_id || 'online-open-mic-2026';
        if (meetTitleInput) meetTitleInput.value = s.title || '';
        if (meetDateInput) meetDateInput.value = s.date || '';
        if (meetTimeInput) meetTimeInput.value = s.time || '';
        if (meetUrlInput) meetUrlInput.value = s.meet_url || '';
        if (meetMessageInput) meetMessageInput.value = s.message || '';

        validateMeetUrlInput();
        updateMeetPreview();
        switchAdminTab('meet');
        window.scrollTo({ top: 300, behavior: 'smooth' });
        alert(`Session #${id} details copied into form! You can now update the date, time, or Meet link and send.`);
      }
    } catch (e) {
      alert('Failed to duplicate session.');
    }
  };

  // Retry Failed
  window.retrySessionFailed = async function (id) {
    try {
      const res = await fetch('/api/admin/meet/retry-failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret
        },
        body: JSON.stringify({ sessionId: id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Retry complete for Session #${id}: ${data.newlySent} delivered, ${data.stillFailed} still failed.`);
        await loadMeetStats();
        await loadMeetHistory();
      } else {
        alert(`Retry failed: ${data.error || 'Server error'}`);
      }
    } catch (e) {
      alert(`Network error during retry: ${e.message}`);
    }
  };

  // Tab Navigation
  window.switchAdminTab = function (tab) {
    activeTab = tab;
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(b => b.classList.remove('active'));

    const tabSections = [
      'tabSectionQueue',
      'tabSectionRegistrations',
      'tabSectionMeet',
      'tabSectionEmail',
      'tabSectionCheckin',
      'tabSectionCertificates'
    ];
    tabSections.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    if (tab === 'queue') {
      const btn = document.getElementById('tabBtnQueue');
      if (btn) btn.classList.add('active');
      const sec = document.getElementById('tabSectionQueue');
      if (sec) sec.style.display = 'block';
      loadPendingQueue();
    } else if (tab === 'registrations') {
      const btn = document.getElementById('tabBtnRegistrations');
      if (btn) btn.classList.add('active');
      const sec = document.getElementById('tabSectionRegistrations');
      if (sec) sec.style.display = 'block';
      loadRegistrations();
    } else if (tab === 'meet') {
      const btn = document.getElementById('tabBtnMeet');
      if (btn) btn.classList.add('active');
      const sec = document.getElementById('tabSectionMeet');
      if (sec) sec.style.display = 'block';
      loadMeetHistory();
      loadEligibleRecipients();
      updateMeetPreview();
    } else if (tab === 'email') {
      const btn = document.getElementById('tabBtnEmail');
      if (btn) btn.classList.add('active');
      const sec = document.getElementById('tabSectionEmail');
      if (sec) sec.style.display = 'block';
      loadEmailLogs();
    } else if (tab === 'checkin') {
      const btn = document.getElementById('tabBtnCheckin');
      if (btn) btn.classList.add('active');
      const sec = document.getElementById('tabSectionCheckin');
      if (sec) sec.style.display = 'block';
    } else if (tab === 'certificates') {
      const btn = document.getElementById('tabBtnCertificates');
      if (btn) btn.classList.add('active');
      const sec = document.getElementById('tabSectionCertificates');
      if (sec) sec.style.display = 'block';
    }
  };

  // Toggle Checkin
  window.toggleCheckin = async function (registrationId) {
    try {
      const res = await fetch('/api/admin/toggle-checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret
        },
        body: JSON.stringify({ registrationId })
      });
      if (res.ok) {
        await loadDashboard();
      }
    } catch (e) {
      alert('Failed to update check-in status');
    }
  };

  // Toggle Certificate
  window.toggleCertificate = async function (registrationId) {
    try {
      const res = await fetch('/api/admin/toggle-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret
        },
        body: JSON.stringify({ registrationId })
      });
      if (res.ok) {
        await loadDashboard();
      }
    } catch (e) {
      alert('Failed to update certificate status');
    }
  };

  // CSV Export
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      window.location.href = `/api/admin/export-csv?secret=${encodeURIComponent(adminSecret)}`;
    });
  }

  // Toolbar events
  if (refreshBtn) refreshBtn.addEventListener('click', loadDashboard);
  if (paymentFilter) paymentFilter.addEventListener('change', loadRegistrations);
  if (checkinFilter) checkinFilter.addEventListener('change', loadRegistrations);

  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(loadRegistrations, 300);
    });
  }

})();
