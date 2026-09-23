/**
 * Offstage Creators — Admin Dashboard JS
 * Session-based auth. No secrets stored in browser localStorage.
 */
(function () {
  'use strict';

  const authOverlay = document.getElementById('authOverlay');
  const adminLayout = document.getElementById('adminLayout');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  let currentModalRegId = null;

  // ── Admin Fetch Helper (supports session & secret header on Vercel) ───────────
  function adminFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const adminKey = sessionStorage.getItem('oc_admin_key');
    if (adminKey) {
      headers['x-admin-secret'] = adminKey;
      headers['x-admin-password'] = adminKey;
    }
    return fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });
  }

  // ── Session Check ─────────────────────────────────────────────────────────────
  async function checkSession() {
    try {
      const res = await adminFetch('/api/admin/session');
      const data = await res.json();
      if (data.authenticated || sessionStorage.getItem('oc_admin_key')) {
        showDashboard();
      }
    } catch (_) {}
  }

  // ── Login ─────────────────────────────────────────────────────────────────────
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value.trim() || '';
      const password = document.getElementById('loginPassword')?.value || '';

      if (loginError) loginError.textContent = '';
      if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'LOGGING IN…'; }

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          if (loginError) loginError.textContent = data.error || 'Invalid credentials.';
          if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'LOGIN TO DASHBOARD'; }
          return;
        }

        sessionStorage.setItem('oc_admin_key', password);
        showDashboard();

      } catch (err) {
        if (loginError) loginError.textContent = 'Network error. Please try again.';
        if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'LOGIN TO DASHBOARD'; }
      }
    });
  }

  // ── Logout ────────────────────────────────────────────────────────────────────
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await adminFetch('/api/admin/logout', { method: 'POST' });
      } catch (_) {}
      sessionStorage.removeItem('oc_admin_key');
      if (adminLayout) adminLayout.style.display = 'none';
      if (authOverlay) authOverlay.style.display = 'flex';
      if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'LOGIN TO DASHBOARD'; }
      if (document.getElementById('loginEmail')) document.getElementById('loginEmail').value = '';
      if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '';
    });
  }

  function showDashboard() {
    if (authOverlay) authOverlay.style.display = 'none';
    if (adminLayout) adminLayout.style.display = 'flex';
    loadOverview();
  }

  // ── Tab Navigation ────────────────────────────────────────────────────────────
  window.showTab = function (tabName) {
    ['overview', 'registrations', 'pending', 'approved', 'emailCenter', 'settings'].forEach(name => {
      const el = document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1));
      if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.admin-nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const tabEl = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (tabEl) tabEl.style.display = 'block';

    if (tabName === 'overview') loadOverview();
    else if (tabName === 'registrations') loadRegistrations();
    else if (tabName === 'pending') loadFiltered('VERIFIED');
    else if (tabName === 'approved') loadFiltered('APPROVED');
    else if (tabName === 'emailCenter') initEmailCenter();
    else if (tabName === 'settings') loadRegistrationSettings();
  };

  // ── Overview Stats ────────────────────────────────────────────────────────────
  window.loadOverview = async function () {
    try {
      const res = await adminFetch('/api/admin/overview');
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();
      if (!data.success) return;
      const s = data.stats;
      setText('statTotal', s.total);
      setText('statPendingVerif', s.pendingVerification);
      setText('statVerified', s.verified);
      setText('statApproved', s.approved);
      setText('statRejected', s.rejected);
      setText('statCheckedIn', s.checkedIn);
    } catch (err) {
      console.error('[Admin] Overview error:', err);
    }
  };

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '0';
  }

  // ── Load Registrations ────────────────────────────────────────────────────────
  window.loadRegistrations = async function () {
    const search = document.getElementById('searchInput')?.value.trim() || '';
    const status = document.getElementById('statusFilter')?.value || 'ALL';
    await fetchAndRenderTable({ search, status, containerId: 'regTableWrapper' });
  };

  async function loadFiltered(status) {
    const containerId = status === 'VERIFIED' ? 'pendingTableWrapper' : 'approvedTableWrapper';
    await fetchAndRenderTable({ status, containerId });
  }

  async function fetchAndRenderTable({ search, status, containerId }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';

    try {
      let url = '/api/admin/registrations?limit=200';
      if (status && status !== 'ALL') url += `&status=${encodeURIComponent(status)}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await adminFetch(url);
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();

      if (!data.success) {
        container.innerHTML = `<div class="empty-state"><p>Failed to load: ${data.error}</p></div>`;
        return;
      }

      if (!data.registrations.length) {
        container.innerHTML = '<div class="empty-state"><p>No registrations found.</p></div>';
        return;
      }

      container.innerHTML = `
        <div style="overflow-x:auto;">
          <table class="reg-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Registration ID</th>
                <th>Email</th>
                <th>Category</th>
                <th>Phone</th>
                <th>City</th>
                <th>Performance</th>
                <th>Status</th>
                <th>OTP</th>
                <th>Registered</th>
                <th>Transaction ID</th>
                <th>Screenshot</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.registrations.map(r => `
                <tr>
                  <td class="name-cell">${escHtml(r.fullName)}</td>
                  <td class="id-cell">${escHtml(r.registrationId)}</td>
                  <td style="font-size:12px;">${escHtml(r.email)}</td>
                  <td style="font-size:12px;">${escHtml(r.category)}</td>
                  <td>${escHtml(r.phone)}</td>
                  <td>${escHtml(r.city || '—')}</td>
                  <td>${escHtml(r.performanceTitle || '—')}</td>
                  <td><span class="status-pill status-${r.status}">${formatStatus(r.status)}</span></td>
                  <td style="text-align:center;">${r.otpVerified ? '<span style="color:#6edb8c;">✓</span>' : '<span style="color:#5a5248;">✗</span>'}</td>
                  <td style="font-size:11px; color:#8e8477;">${formatDate(r.createdAt)}</td>
                  <td><span style="font-family:monospace; color:#e4ad57;">${escHtml(r.transactionId)}</span></td>
                  <td>${r.paymentScreenshotUrl ? `<img src="${escHtml(r.paymentScreenshotUrl)}" alt="Screenshot" title="Click to enlarge" style="max-width:80px; border-radius:4px; cursor:zoom-in;" onclick="openLightbox('${escHtml(r.paymentScreenshotUrl)}')" />` : '—'}</td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <button class="action-btn btn-view" onclick="openDetail('${escHtml(r.registrationId)}')">View</button>
                      ${r.status === 'VERIFIED' ? `<button class="action-btn btn-approve" onclick="approveReg('${escHtml(r.registrationId)}', this)">Approve</button>` : ''}
                      ${(r.status === 'VERIFIED' || r.status === 'PENDING_VERIFICATION') ? `<button class="action-btn btn-reject" onclick="openReject('${escHtml(r.registrationId)}')">Reject</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="padding:12px 16px; font-size:12px; color:#8e8477;">${data.registrations.length} registration${data.registrations.length !== 1 ? 's' : ''}</div>
        </div>
      `;

    } catch (err) {
      console.error('[Admin] Load registrations error:', err);
      container.innerHTML = '<div class="empty-state"><p>Network error. Please retry.</p></div>';
    }
  }

  // Debounce search input
  let searchDebounce;
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(loadRegistrations, 300);
    });
  }
  if (statusFilter) {
    statusFilter.addEventListener('change', loadRegistrations);
  }

  // ── Registration Detail Modal ─────────────────────────────────────────────────
  window.openDetail = async function (regId) {
    currentModalRegId = regId;
    const modal = document.getElementById('detailModal');
    const modalBody = document.getElementById('modalBody');
    const modalRegId = document.getElementById('modalRegId');
    const modalActions = document.getElementById('modalActions');

    if (!modal) return;
    if (modalRegId) modalRegId.textContent = regId;
    if (modalBody) modalBody.innerHTML = '<p style="color:#8e8477; text-align:center; padding:20px;">Loading…</p>';
    if (modalActions) modalActions.innerHTML = '';
    modal.style.display = 'flex';

    try {
      const res = await adminFetch(`/api/admin/registrations/${encodeURIComponent(regId)}`);
      if (res.status === 401) { closeModal(); showLoginOverlay(); return; }
      const data = await res.json();

      if (!data.success) {
        if (modalBody) modalBody.innerHTML = `<p style="color:#e26947; padding:20px;">${escHtml(data.error)}</p>`;
        return;
      }

      const r = data.registration;

      if (modalBody) {
        modalBody.innerHTML = `
          <div class="modal-row"><span class="modal-label">Name</span><span class="modal-value">${escHtml(r.fullName)}</span></div>
          <div class="modal-row"><span class="modal-label">Email</span><span class="modal-value">${escHtml(r.email)}</span></div>
          <div class="modal-row"><span class="modal-label">Phone</span><span class="modal-value">${escHtml(r.phone)}</span></div>
          <div class="modal-row"><span class="modal-label">City</span><span class="modal-value">${escHtml(r.city || '—')}</span></div>
          <div class="modal-row"><span class="modal-label">Category</span><span class="modal-value">${escHtml(r.category)}</span></div>
          <div class="modal-row"><span class="modal-label">Performance Title</span><span class="modal-value">${escHtml(r.performanceTitle || '—')}</span></div>
          ${r.performanceDescription ? `<div class="modal-row"><span class="modal-label">Description</span><span class="modal-value">${escHtml(r.performanceDescription)}</span></div>` : ''}
          ${r.instagram ? `<div class="modal-row"><span class="modal-label">Instagram</span><span class="modal-value">@${escHtml(r.instagram)}</span></div>` : ''}
          <div class="modal-row"><span class="modal-label">Status</span><span class="modal-value"><span class="status-pill status-${r.status}">${formatStatus(r.status)}</span></span></div>
          <div class="modal-row"><span class="modal-label">OTP Verified</span><span class="modal-value" style="color:${r.otpVerified ? '#6edb8c' : '#e26947'}">${r.otpVerified ? '✓ Yes' : '✗ No'}</span></div>
          ${r.otpVerifiedAt ? `<div class="modal-row"><span class="modal-label">Verified At</span><span class="modal-value">${formatDate(r.otpVerifiedAt)}</span></div>` : ''}
          ${r.approvedAt ? `<div class="modal-row"><span class="modal-label">Approved At</span><span class="modal-value">${formatDate(r.approvedAt)}</span></div>` : ''}
          ${r.approvedBy ? `<div class="modal-row"><span class="modal-label">Approved By</span><span class="modal-value">${escHtml(r.approvedBy)}</span></div>` : ''}
          ${r.rejectedAt ? `<div class="modal-row"><span class="modal-label">Rejected At</span><span class="modal-value">${formatDate(r.rejectedAt)}</span></div>` : ''}
          ${r.rejectedReason ? `<div class="modal-row"><span class="modal-label">Rejection Reason</span><span class="modal-value">${escHtml(r.rejectedReason)}</span></div>` : ''}
          ${r.adminNotes ? `<div class="modal-row" style="background:rgba(226,71,71,0.08); border-radius:6px; padding:10px; margin:4px 0;"><span class="modal-label" style="color:#ff8585; font-weight:700;">Admin Note</span><span class="modal-value" style="color:#ffb0b0;">${escHtml(r.adminNotes)}</span></div>` : ''}
          ${r.transactionId ? `<div class="modal-row"><span class="modal-label">UPI Transaction ID</span><span class="modal-value" style="font-family:monospace; color:#e4ad57; font-weight:700;">${escHtml(r.transactionId)}</span></div>` : '<div class="modal-row"><span class="modal-label">UPI Transaction ID</span><span class="modal-value" style="color:#8e8477;">Not submitted yet</span></div>'}
          ${r.paymentScreenshotUrl ? `
            <div class="modal-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
              <span class="modal-label">Payment Screenshot (Click to enlarge)</span>
              <a href="${escHtml(r.paymentScreenshotUrl)}" target="_blank" rel="noopener" style="display:block; width:100%; text-align:center;">
                <img src="${escHtml(r.paymentScreenshotUrl)}" alt="Payment Screenshot" style="max-width:100%; max-height:260px; border-radius:8px; border:1px solid #2a231c; object-fit:contain; background:#080706; padding:4px;" />
              </a>
            </div>
          ` : '<div class="modal-row"><span class="modal-label">Payment Screenshot</span><span class="modal-value" style="color:#8e8477;">No screenshot uploaded</span></div>'}
          ${r.approvalEmailSentAt ? `<div class="modal-row"><span class="modal-label">Approval Email Sent</span><span class="modal-value" style="color:#6edb8c;">✓ ${formatDate(r.approvalEmailSentAt)}</span></div>` : ''}
          ${r.lastEmailError ? `<div class="modal-row"><span class="modal-label">Last Email Error</span><span class="modal-value" style="color:#e26947; font-size:11px;">${escHtml(r.lastEmailError)}</span></div>` : ''}
          <div class="modal-row"><span class="modal-label">Registered</span><span class="modal-value">${formatDate(r.createdAt)}</span></div>
          <div class="modal-row"><span class="modal-label">Pass URL</span><span class="modal-value"><a href="/registration/${escHtml(r.registrationId)}" target="_blank" style="color:#e4ad57;">View Pass ↗</a></span></div>
        `;
      }

      // Actions
      if (modalActions) {
        let actionsHtml = '';

        if (r.status === 'VERIFIED') {
          actionsHtml += `<button class="cta" onclick="approveReg('${escHtml(r.registrationId)}', null, true)" style="padding:12px 24px;">✓ APPROVE &amp; SEND EMAIL</button>`;
        }
        if (r.status === 'APPROVED') {
          actionsHtml += `<button class="cta" style="padding:12px 24px; opacity:0.5; cursor:not-allowed;" disabled>✓ APPROVED</button>`;
          actionsHtml += `<button class="action-btn btn-revoke" onclick="revokeReg('${escHtml(r.registrationId)}')" style="padding:12px 24px; font-weight:700;">⛔ REVOKE APPROVAL</button>`;
          actionsHtml += `<button class="action-btn btn-view" onclick="resendApprovalEmail('${escHtml(r.registrationId)}')" style="padding:12px 24px;">Resend Email</button>`;
        }
        if (['REVOKED', 'CANCELLED'].includes(r.status)) {
          actionsHtml += `<span style="color:#ff8585; font-size:13px; font-weight:700; padding:10px 16px; background:rgba(226,71,71,0.1); border-radius:6px; border:1px solid rgba(226,71,71,0.3);">✕ REGISTRATION REVOKED / CANCELLED</span>`;
        }
        if (r.status === 'VERIFIED' || r.status === 'PENDING_VERIFICATION') {
          actionsHtml += `
            <div style="width:100%; margin-top:8px;">
              <input type="text" class="reject-reason-input" id="rejectReasonInput" placeholder="Rejection reason (optional)…">
              <button class="action-btn btn-reject" onclick="rejectReg('${escHtml(r.registrationId)}')" style="padding:12px 24px; font-size:12px;">✕ REJECT</button>
            </div>
          `;
        }
        if (r.status === 'APPROVED' && !r.checkedIn) {
          actionsHtml += `<button class="action-btn btn-approve" onclick="checkinReg('${escHtml(r.registrationId)}')" style="padding:12px 24px;">✓ CHECK IN</button>`;
        }
        if (!actionsHtml) actionsHtml = '<span style="color:#8e8477; font-size:13px;">No actions available for this registration.</span>';
        modalActions.innerHTML = actionsHtml;
      }

    } catch (err) {
      console.error('[Admin] Detail modal error:', err);
      if (modalBody) modalBody.innerHTML = '<p style="color:#e26947; padding:20px;">Failed to load details.</p>';
    }
  };

  window.closeModal = function () {
    const modal = document.getElementById('detailModal');
    if (modal) modal.style.display = 'none';
    currentModalRegId = null;
  };

  // Close modal on overlay click
  const detailModal = document.getElementById('detailModal');
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) window.closeModal();
    });
  }

  // ── Approve ───────────────────────────────────────────────────────────────────
  window.approveReg = async function (regId, btnEl, fromModal = false) {
    if (!confirm(`Approve registration ${regId} and send approval email?`)) return;

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Approving…'; }

    try {
      const res = await adminFetch(`/api/admin/approve/${encodeURIComponent(regId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();

      if (!data.success) {
        alert(`Error: ${data.error}`);
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Approve'; }
        return;
      }

      alert(data.message);
      if (fromModal) window.closeModal();
      refreshCurrentTab();
      loadOverview();

    } catch (err) {
      alert('Network error. Please try again.');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Approve'; }
    }
  };

  // ── Reject ────────────────────────────────────────────────────────────────────
  window.openReject = function (regId) {
    window.openDetail(regId);
  };

  window.rejectReg = async function (regId) {
    const reasonInput = document.getElementById('rejectReasonInput');
    const reason = reasonInput ? reasonInput.value.trim() : '';

    if (!confirm(`Reject registration ${regId}?`)) return;

    try {
      const res = await adminFetch(`/api/admin/reject/${encodeURIComponent(regId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();

      if (!data.success) { alert(`Error: ${data.error}`); return; }

      alert(data.message);
      window.closeModal();
      refreshCurrentTab();
      loadOverview();

    } catch (err) {
      alert('Network error. Please try again.');
    }
  };

  // ── Revoke Registration ───────────────────────────────────────────────────────
  window.revokeReg = async function (regId) {
    const defaultNote = 'Approval revoked after payment verification. Submitted payment proof identified as a demo/non-real transaction. Initial approval email was sent before verification.';
    const note = prompt(`Enter reason / admin note to revoke registration ${regId}:`, defaultNote);
    if (note === null) return; // cancelled prompt

    try {
      const res = await adminFetch(`/api/admin/revoke/${encodeURIComponent(regId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() })
      });
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();
      if (!data.success) { alert(`Error: ${data.error}`); return; }

      alert(data.message);
      window.closeModal();
      refreshCurrentTab();
      loadOverview();
    } catch (err) {
      alert('Network error while revoking registration.');
    }
  };

  // ── Check-in ──────────────────────────────────────────────────────────────────
  window.checkinReg = async function (regId) {
    if (!confirm(`Check in ${regId}?`)) return;

    try {
      const res = await adminFetch(`/api/admin/checkin/${encodeURIComponent(regId)}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!data.success) { alert(`Error: ${data.error}`); return; }
      alert(data.message);
      window.closeModal();
      refreshCurrentTab();
    } catch (err) {
      alert('Network error.');
    }
  };

  // ── Resend Approval Email ─────────────────────────────────────────────────────
  window.resendApprovalEmail = async function (regId) {
    if (!confirm(`Resend approval email to ${regId}?`)) return;

    try {
      const res = await adminFetch(`/api/admin/approve/${encodeURIComponent(regId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      alert(data.message || (data.success ? 'Done.' : data.error));
    } catch (_) {
      alert('Network error.');
    }
  };

  // ── Lightbox ──────────────────────────────────────────────────────────────────
  window.openLightbox = function (url) {
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImg');
    if (!overlay || !img) return;
    img.src = url;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeLightbox = function () {
    const overlay = document.getElementById('lightboxOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeLightbox();
  });

  // ── Utility ───────────────────────────────────────────────────────────────────
  function refreshCurrentTab() {
    const activeTab = document.querySelector('.admin-nav-item.active')?.dataset?.tab;
    if (activeTab === 'registrations') loadRegistrations();
    else if (activeTab === 'pending') loadFiltered('VERIFIED');
    else if (activeTab === 'approved') loadFiltered('APPROVED');
  }

  function showLoginOverlay() {
    if (adminLayout) adminLayout.style.display = 'none';
    if (authOverlay) authOverlay.style.display = 'flex';
  }

  function formatStatus(status) {
    const map = {
      PENDING_VERIFICATION: 'Pending Verif.',
      VERIFIED: 'Verified',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      REVOKED: 'Revoked/Cancelled',
      CANCELLED: 'Revoked/Cancelled'
    };
    return map[status] || status;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) { return iso; }
  }

  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── EMAIL CENTER & GOOGLE MEET INVITATIONS ──────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  let cachedParticipants = [];
  const selectedCustomRecipients = new Set();
  const selectedMeetRecipients = new Set();
  let currentRegistrationStatus = 'OPEN';

  window.switchEmailSubtab = function (subtab) {
    ['Custom', 'Meet', 'History'].forEach(t => {
      const el = document.getElementById('emailSubtab' + t);
      const btn = document.getElementById('subnavBtn' + t);
      if (el) el.style.display = 'none';
      if (btn) btn.classList.remove('active');
    });

    const targetEl = document.getElementById('emailSubtab' + subtab.charAt(0).toUpperCase() + subtab.slice(1));
    const targetBtn = document.getElementById('subnavBtn' + subtab.charAt(0).toUpperCase() + subtab.slice(1));
    if (targetEl) targetEl.style.display = 'block';
    if (targetBtn) targetBtn.classList.add('active');

    if (subtab === 'history') {
      loadEmailHistory();
    }
  };

  async function initEmailCenter() {
    updateMeetPreviewTemplate();
    await loadParticipantsForEmail();
  }

  async function loadParticipantsForEmail() {
    try {
      const res = await adminFetch('/api/admin/registrations?limit=500');
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();
      if (!data.success) return;

      cachedParticipants = data.registrations || [];

      // Populate category dropdown
      const categories = Array.from(new Set(cachedParticipants.map(p => p.category).filter(Boolean)));
      const catOptions = ['<option value="ALL">All Categories</option>', ...categories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)].join('');

      const customCatSelect = document.getElementById('customEmailCategoryFilter');
      if (customCatSelect) customCatSelect.innerHTML = catOptions;

      const meetCatSelect = document.getElementById('meetEmailCategoryFilter');
      if (meetCatSelect) meetCatSelect.innerHTML = catOptions;

      filterCustomEmailList();
      filterMeetEmailList();
    } catch (err) {
      console.error('[Email Center] Failed to load participants:', err);
    }
  }

  // ── Custom Email Methods ──────────────────────────────────────────────────────

  window.filterCustomEmailList = function () {
    const search = (document.getElementById('customEmailSearch')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('customEmailCategoryFilter')?.value || 'ALL';
    const status = document.getElementById('customEmailStatusFilter')?.value || 'ALL';

    const filtered = cachedParticipants.filter(p => {
      if (cat !== 'ALL' && p.category !== cat) return false;
      if (status !== 'ALL' && p.status !== status) return false;
      if (!search) return true;

      const serialStr = String(p.id).padStart(6, '0');
      return (p.fullName && p.fullName.toLowerCase().includes(search)) ||
             (p.email && p.email.toLowerCase().includes(search)) ||
             (p.registrationId && p.registrationId.toLowerCase().includes(search)) ||
             (p.city && p.city.toLowerCase().includes(search)) ||
             serialStr.includes(search) ||
             String(p.id) === search;
    });

    renderCustomRecipientTable(filtered);
  };

  function renderCustomRecipientTable(list) {
    const container = document.getElementById('customEmailTableWrapper');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No participants match your search.</p></div>';
      return;
    }

    let html = `
      <table class="reg-table" style="font-size:12px;">
        <thead>
          <tr>
            <th style="width:36px; text-align:center;">✓</th>
            <th>Serial #</th>
            <th>Reg ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Category</th>
            <th>City</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(p => {
      const isSelected = selectedCustomRecipients.has(p.registrationId);
      const serialStr = String(p.id).padStart(6, '0');
      html += `
        <tr style="cursor:pointer;" onclick="toggleCustomRecipient('${p.registrationId}')">
          <td style="text-align:center;" onclick="event.stopPropagation()">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleCustomRecipient('${p.registrationId}')">
          </td>
          <td style="font-family:monospace; color:#8e8477;">${serialStr}</td>
          <td class="id-cell">${escHtml(p.registrationId)}</td>
          <td class="name-cell">${escHtml(p.fullName)}</td>
          <td style="color:#8e8477;">${escHtml(p.email)}</td>
          <td>${escHtml(p.category || '—')}</td>
          <td>${escHtml(p.city || '—')}</td>
          <td><span class="status-pill status-${p.status}">${formatStatus(p.status)}</span></td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
    updateCustomRecipientCount();
  }

  window.toggleCustomRecipient = function (regId) {
    if (selectedCustomRecipients.has(regId)) {
      selectedCustomRecipients.delete(regId);
    } else {
      selectedCustomRecipients.add(regId);
    }
    filterCustomEmailList();
  };

  window.selectAllCustomEmail = function (select) {
    const search = (document.getElementById('customEmailSearch')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('customEmailCategoryFilter')?.value || 'ALL';
    const status = document.getElementById('customEmailStatusFilter')?.value || 'ALL';

    const filtered = cachedParticipants.filter(p => {
      if (cat !== 'ALL' && p.category !== cat) return false;
      if (status !== 'ALL' && p.status !== status) return false;
      if (!search) return true;
      const serialStr = String(p.id).padStart(6, '0');
      return (p.fullName && p.fullName.toLowerCase().includes(search)) ||
             (p.email && p.email.toLowerCase().includes(search)) ||
             (p.registrationId && p.registrationId.toLowerCase().includes(search)) ||
             (p.city && p.city.toLowerCase().includes(search)) ||
             serialStr.includes(search) ||
             String(p.id) === search;
    });

    filtered.forEach(p => {
      if (select) selectedCustomRecipients.add(p.registrationId);
      else selectedCustomRecipients.delete(p.registrationId);
    });

    filterCustomEmailList();
  };

  function updateCustomRecipientCount() {
    const countEl = document.getElementById('customEmailSelectedCount');
    if (countEl) {
      const manualCount = getManualEmails('customEmailManual').length;
      const total = selectedCustomRecipients.size + manualCount;
      countEl.textContent = `${total} recipient${total === 1 ? '' : 's'} selected (${selectedCustomRecipients.size} registered, ${manualCount} manual)`;
    }
  }

  function getManualEmails(elementId) {
    const raw = document.getElementById(elementId)?.value || '';
    return raw.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  }

  window.insertCustomPlaceholder = function (placeholder) {
    const textarea = document.getElementById('customEmailBody');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + placeholder + text.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
  };

  window.openPreviewCustomEmail = async function () {
    const subject = document.getElementById('customEmailSubject')?.value || '';
    const bodyContent = document.getElementById('customEmailBody')?.value || '';
    const firstRegId = selectedCustomRecipients.values().next().value || null;
    const manual = getManualEmails('customEmailManual')[0] || null;

    try {
      const res = await adminFetch('/api/admin/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          subject,
          bodyContent,
          registrationId: firstRegId,
          manualEmail: manual
        })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Failed to generate preview.');
        return;
      }

      const modal = document.getElementById('emailPreviewModal');
      const iframe = document.getElementById('previewIframe');
      const subjEl = document.getElementById('previewSubject');
      const noteEl = document.getElementById('previewNote');

      if (subjEl) subjEl.textContent = data.subject || 'Message from Offstage Creators';
      if (noteEl) noteEl.textContent = firstRegId ? `Previewing with data from ${firstRegId}` : 'Previewing with sample participant data';

      if (iframe) {
        iframe.srcdoc = data.html;
      }
      if (modal) modal.style.display = 'flex';
    } catch (err) {
      alert('Error generating preview: ' + err.message);
    }
  };

  window.sendCustomEmail = function () {
    const subject = document.getElementById('customEmailSubject')?.value?.trim();
    const bodyContent = document.getElementById('customEmailBody')?.value?.trim();
    const regIds = Array.from(selectedCustomRecipients);
    const manualEmails = getManualEmails('customEmailManual');

    if (!subject) return alert('Please enter an email subject.');
    if (!bodyContent) return alert('Please write the email message.');
    const total = regIds.length + manualEmails.length;
    if (total === 0) return alert('Please select at least one recipient or enter a manual email address.');

    openConfirmModal({
      title: 'Confirm Send Custom Email',
      message: `You are about to dispatch this custom email to <strong>${total} recipient(s)</strong> (${regIds.length} registered participant(s), ${manualEmails.length} manual).<br><br>Each participant will automatically have their placeholders replaced with their actual data.`,
      confirmText: `Send to ${total} Recipient${total === 1 ? '' : 's'}`,
      onConfirm: async () => {
        const btn = document.getElementById('btnSendCustomEmail');
        if (btn) { btn.disabled = true; btn.textContent = 'SENDING…'; }
        try {
          const res = await adminFetch('/api/admin/email/custom-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              registrationIds: regIds,
              manualEmails,
              subject,
              bodyContent
            })
          });
          const data = await res.json();
          if (btn) { btn.disabled = false; btn.textContent = '🚀 Send Email'; }
          if (!data.success) {
            alert('Send error: ' + (data.error || 'Failed to send'));
            return;
          }
          alert(`Success! ${data.sentCount} sent, ${data.failedCount} failed.`);
        } catch (err) {
          if (btn) { btn.disabled = false; btn.textContent = '🚀 Send Email'; }
          alert('Send request failed: ' + err.message);
        }
      }
    });
  };

  // ── Google Meet Methods ───────────────────────────────────────────────────────

  window.updateMeetPreviewTemplate = function () {
    const title = document.getElementById('meetTitle')?.value || 'Online Open Mic 2026 Performer Briefing';
    const link = document.getElementById('meetLink')?.value || 'https://meet.google.com/xxx-yyyy-zzz';
    const date = document.getElementById('meetDate')?.value || '23 September 2026';
    const startTime = document.getElementById('meetStartTime')?.value || '7:30 PM';
    const endTime = document.getElementById('meetEndTime')?.value || '9:00 PM';
    const tz = document.getElementById('meetTimeZone')?.value || 'IST (GMT+5:30)';
    const extra = document.getElementById('meetAdditionalMessage')?.value || '';

    const textarea = document.getElementById('meetCustomBody');
    if (textarea && (!textarea.dataset.userEdited || textarea.dataset.userEdited === 'false')) {
      textarea.value = `Dear {name},\n\nYou are invited to join the upcoming Offstage Creators performer session.\n\nMeeting: ${title}\nDate: ${date}\nTime: ${startTime} – ${endTime} (${tz})\nGoogle Meet: ${link}\n\n${extra ? extra + '\n\n' : ''}Registration ID: {registration_id}\nPerformance Category: {category}\n\nPlease join 5 minutes early with your camera and microphone working.\n\nWarm regards,\nOffstage Creators Team`;
    }
  };

  window.filterMeetEmailList = function () {
    const search = (document.getElementById('meetEmailSearch')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('meetEmailCategoryFilter')?.value || 'ALL';
    const status = document.getElementById('meetEmailStatusFilter')?.value || 'ALL';

    const filtered = cachedParticipants.filter(p => {
      if (cat !== 'ALL' && p.category !== cat) return false;
      if (status !== 'ALL' && p.status !== status) return false;
      if (!search) return true;

      const serialStr = String(p.id).padStart(6, '0');
      return (p.fullName && p.fullName.toLowerCase().includes(search)) ||
             (p.email && p.email.toLowerCase().includes(search)) ||
             (p.registrationId && p.registrationId.toLowerCase().includes(search)) ||
             (p.city && p.city.toLowerCase().includes(search)) ||
             serialStr.includes(search) ||
             String(p.id) === search;
    });

    renderMeetRecipientTable(filtered);
  };

  function renderMeetRecipientTable(list) {
    const container = document.getElementById('meetEmailTableWrapper');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No participants match your filter.</p></div>';
      return;
    }

    let html = `
      <table class="reg-table" style="font-size:12px;">
        <thead>
          <tr>
            <th style="width:36px; text-align:center;">✓</th>
            <th>Serial #</th>
            <th>Reg ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Category</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(p => {
      const isSelected = selectedMeetRecipients.has(p.registrationId);
      const serialStr = String(p.id).padStart(6, '0');
      html += `
        <tr style="cursor:pointer;" onclick="toggleMeetRecipient('${p.registrationId}')">
          <td style="text-align:center;" onclick="event.stopPropagation()">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleMeetRecipient('${p.registrationId}')">
          </td>
          <td style="font-family:monospace; color:#8e8477;">${serialStr}</td>
          <td class="id-cell">${escHtml(p.registrationId)}</td>
          <td class="name-cell">${escHtml(p.fullName)}</td>
          <td style="color:#8e8477;">${escHtml(p.email)}</td>
          <td>${escHtml(p.category || '—')}</td>
          <td><span class="status-pill status-${p.status}">${formatStatus(p.status)}</span></td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
    updateMeetRecipientCount();
  }

  window.toggleMeetRecipient = function (regId) {
    if (selectedMeetRecipients.has(regId)) {
      selectedMeetRecipients.delete(regId);
    } else {
      selectedMeetRecipients.add(regId);
    }
    filterMeetEmailList();
  };

  window.selectAllMeetEmail = function (select) {
    const search = (document.getElementById('meetEmailSearch')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('meetEmailCategoryFilter')?.value || 'ALL';
    const status = document.getElementById('meetEmailStatusFilter')?.value || 'ALL';

    const filtered = cachedParticipants.filter(p => {
      if (cat !== 'ALL' && p.category !== cat) return false;
      if (status !== 'ALL' && p.status !== status) return false;
      if (!search) return true;
      const serialStr = String(p.id).padStart(6, '0');
      return (p.fullName && p.fullName.toLowerCase().includes(search)) ||
             (p.email && p.email.toLowerCase().includes(search)) ||
             (p.registrationId && p.registrationId.toLowerCase().includes(search)) ||
             (p.city && p.city.toLowerCase().includes(search)) ||
             serialStr.includes(search) ||
             String(p.id) === search;
    });

    filtered.forEach(p => {
      if (select) selectedMeetRecipients.add(p.registrationId);
      else selectedMeetRecipients.delete(p.registrationId);
    });

    filterMeetEmailList();
  };

  function updateMeetRecipientCount() {
    const countEl = document.getElementById('meetEmailSelectedCount');
    if (countEl) {
      const manualCount = getManualEmails('meetEmailManual').length;
      const total = selectedMeetRecipients.size + manualCount;
      countEl.textContent = `${total} recipient${total === 1 ? '' : 's'} selected (${selectedMeetRecipients.size} registered, ${manualCount} manual)`;
    }
  }

  window.openPreviewMeetEmail = async function () {
    const meetingTitle = document.getElementById('meetTitle')?.value || '';
    const meetLink = document.getElementById('meetLink')?.value || '';
    const date = document.getElementById('meetDate')?.value || '';
    const startTime = document.getElementById('meetStartTime')?.value || '';
    const endTime = document.getElementById('meetEndTime')?.value || '';
    const timeZone = document.getElementById('meetTimeZone')?.value || '';
    const additionalMessage = document.getElementById('meetAdditionalMessage')?.value || '';
    const customBody = document.getElementById('meetCustomBody')?.value || '';

    const firstRegId = selectedMeetRecipients.values().next().value || null;
    const manual = getManualEmails('meetEmailManual')[0] || null;

    try {
      const res = await adminFetch('/api/admin/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'meet',
          meetData: {
            meetingTitle,
            meetLink,
            date,
            startTime,
            endTime,
            timeZone,
            additionalMessage,
            customHtml: customBody
          },
          registrationId: firstRegId,
          manualEmail: manual
        })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Failed to generate preview.');
        return;
      }

      const modal = document.getElementById('emailPreviewModal');
      const iframe = document.getElementById('previewIframe');
      const subjEl = document.getElementById('previewSubject');
      const noteEl = document.getElementById('previewNote');

      if (subjEl) subjEl.textContent = data.subject;
      if (noteEl) noteEl.textContent = firstRegId ? `Previewing with data from ${firstRegId}` : 'Previewing with sample participant data';

      if (iframe) {
        iframe.srcdoc = data.html;
      }
      if (modal) modal.style.display = 'flex';
    } catch (err) {
      alert('Error generating preview: ' + err.message);
    }
  };

  window.promptSendMeetEmail = function () {
    const meetLink = document.getElementById('meetLink')?.value?.trim();
    const regIds = Array.from(selectedMeetRecipients);
    const manualEmails = getManualEmails('meetEmailManual');
    const total = regIds.length + manualEmails.length;

    if (!meetLink) return alert('Please enter the Google Meet link.');
    if (total === 0) return alert('Please select at least one recipient or enter a manual email address.');

    openConfirmModal({
      title: 'Confirm Google Meet Dispatch',
      message: `You are about to send a Google Meet invitation to <strong>${total} recipient(s)</strong>.<br><br>Meeting Link: <code>${escHtml(meetLink)}</code><br><br>Proceed with sending?`,
      confirmText: `Confirm & Send to ${total} Recipient${total === 1 ? '' : 's'}`,
      onConfirm: async () => {
        const btn = document.getElementById('btnSendMeetEmail');
        if (btn) { btn.disabled = true; btn.textContent = 'SENDING INVITATIONS…'; }

        const meetingTitle = document.getElementById('meetTitle')?.value || '';
        const date = document.getElementById('meetDate')?.value || '';
        const startTime = document.getElementById('meetStartTime')?.value || '';
        const endTime = document.getElementById('meetEndTime')?.value || '';
        const timeZone = document.getElementById('meetTimeZone')?.value || '';
        const additionalMessage = document.getElementById('meetAdditionalMessage')?.value || '';
        const customBody = document.getElementById('meetCustomBody')?.value || '';

        try {
          const res = await adminFetch('/api/admin/email/meet-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              registrationIds: regIds,
              manualEmails,
              meetingTitle,
              meetLink,
              date,
              startTime,
              endTime,
              timeZone,
              additionalMessage,
              customHtml: customBody
            })
          });
          const data = await res.json();
          if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Send Meet Invitation →'; }
          if (!data.success) {
            alert('Error sending invitations: ' + (data.error || 'Failed'));
            return;
          }
          alert(`Invitations processed! ${data.sentCount} sent, ${data.failedCount} failed.`);
        } catch (err) {
          if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Send Meet Invitation →'; }
          alert('Meet invitation request error: ' + err.message);
        }
      }
    });
  };

  // ── Email History ─────────────────────────────────────────────────────────────

  window.loadEmailHistory = async function () {
    const container = document.getElementById('historyTableWrapper');
    if (!container) return;
    container.innerHTML = '<div class="empty-state"><p>Loading email history…</p></div>';

    const search = document.getElementById('historySearchInput')?.value?.trim() || '';
    const type = document.getElementById('historyTypeFilter')?.value || 'ALL';
    const status = document.getElementById('historyStatusFilter')?.value || 'ALL';

    try {
      let url = '/api/admin/email-history?limit=100';
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (type !== 'ALL') url += `&type=${encodeURIComponent(type)}`;
      if (status !== 'ALL') url += `&status=${encodeURIComponent(status)}`;

      const res = await adminFetch(url);
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();
      if (!data.success) {
        container.innerHTML = `<div class="empty-state"><p>Failed to load history: ${escHtml(data.error)}</p></div>`;
        return;
      }

      if (!data.logs.length) {
        container.innerHTML = '<div class="empty-state"><p>No email logs found.</p></div>';
        return;
      }

      let html = `
        <table class="reg-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>Date / Time</th>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Type</th>
              <th>Reg ID</th>
              <th>Status</th>
              <th>Details / Message ID</th>
            </tr>
          </thead>
          <tbody>
      `;

      data.logs.forEach(log => {
        const isSent = log.status === 'SENT';
        const badgeClass = isSent ? 'badge-sent' : 'badge-failed';
        html += `
          <tr>
            <td style="white-space:nowrap; color:#8e8477;">${formatDate(log.createdAt)}</td>
            <td style="font-weight:600; color:#f7eee1;">${escHtml(log.recipient)}</td>
            <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(log.subject)}</td>
            <td><span class="badge-pill" style="background:#1e1a16; color:#e4ad57; border:1px solid #3a3228;">${escHtml(log.emailType)}</span></td>
            <td style="font-family:monospace; color:#8e8477;">${escHtml(log.registrationId || '—')}</td>
            <td><span class="badge-pill ${badgeClass}">${escHtml(log.status)}</span></td>
            <td style="font-size:11px; color:${isSent ? '#6edb8c' : '#e26947'}; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${escHtml(log.errorMessage || log.providerMessageId || '—')}
            </td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      container.innerHTML = html;

    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>Network error loading history.</p></div>`;
    }
  };

  // ── Registration Settings ─────────────────────────────────────────────────────

  window.loadRegistrationSettings = async function () {
    try {
      const res = await adminFetch('/api/admin/settings');
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();
      if (data.success && data.settings) {
        currentRegistrationStatus = data.settings.registration_status || 'OPEN';
        updateRegistrationSettingsUI();
      }
    } catch (err) {
      console.error('[Admin] Load settings error:', err);
    }
  };

  function updateRegistrationSettingsUI() {
    const badge = document.getElementById('settingsStatusBadge');
    const text = document.getElementById('settingsStatusText');
    const btn = document.getElementById('btnToggleRegStatus');

    if (currentRegistrationStatus === 'OPEN') {
      if (badge) { badge.className = 'status-badge-lg open'; badge.textContent = '🟢 OPEN'; }
      if (text) text.textContent = 'Registrations are currently open for public submissions.';
      if (btn) { btn.textContent = '🔴 Close Registrations'; btn.className = 'cta'; btn.style.background = '#e26947'; btn.style.color = '#fff'; }
    } else {
      if (badge) { badge.className = 'status-badge-lg closed'; badge.textContent = '🔴 CLOSED'; }
      if (text) text.textContent = 'Registrations are currently closed. New submissions are blocked.';
      if (btn) { btn.textContent = '🟢 Reopen Registrations'; btn.className = 'cta'; btn.style.background = '#6edb8c'; btn.style.color = '#0d0c0a'; }
    }
  }

  window.promptToggleRegistrationStatus = function () {
    const isClosing = currentRegistrationStatus === 'OPEN';
    const newStatus = isClosing ? 'CLOSED' : 'OPEN';

    const title = isClosing ? 'Close Registrations?' : 'Reopen Registrations?';
    const message = isClosing
      ? 'Are you sure you want to close registrations?<br><br>• New registrations will be immediately blocked on <code>/register</code>.<br>• Existing registrations remain completely safe and untouched.'
      : 'Are you sure you want to reopen registrations?<br><br>• Public registration form will immediately become available again for new performers.';

    openConfirmModal({
      title,
      message,
      confirmText: isClosing ? 'Yes, Close Registrations' : 'Yes, Reopen Registrations',
      onConfirm: async () => {
        try {
          const res = await adminFetch('/api/admin/settings/registration-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          const data = await res.json();
          if (!data.success) {
            alert('Failed to update status: ' + (data.error || 'Server error'));
            return;
          }
          currentRegistrationStatus = data.registration_status;
          updateRegistrationSettingsUI();
          alert(`Registration status updated to ${newStatus}.`);
        } catch (err) {
          alert('Network error updating status: ' + err.message);
        }
      }
    });
  };

  // ── Modal Handlers ────────────────────────────────────────────────────────────

  let confirmModalCallback = null;

  window.openConfirmModal = function ({ title, message, confirmText, onConfirm }) {
    const modal = document.getElementById('confirmDialogModal');
    const titleEl = document.getElementById('confirmDialogTitle');
    const msgEl = document.getElementById('confirmDialogMessage');
    const confirmBtn = document.getElementById('confirmDialogConfirmBtn');

    if (titleEl) titleEl.textContent = title || 'Confirmation';
    if (msgEl) msgEl.innerHTML = message || 'Are you sure?';
    if (confirmBtn) confirmBtn.textContent = confirmText || 'Confirm';

    confirmModalCallback = onConfirm;

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        closeConfirmModal();
        if (typeof confirmModalCallback === 'function') {
          await confirmModalCallback();
        }
      };
    }

    if (modal) modal.style.display = 'flex';
  };

  window.closeConfirmModal = function () {
    const modal = document.getElementById('confirmDialogModal');
    if (modal) modal.style.display = 'none';
    confirmModalCallback = null;
  };

  window.closeEmailPreviewModal = function () {
    const modal = document.getElementById('emailPreviewModal');
    if (modal) modal.style.display = 'none';
  };

  // ── Init ──────────────────────────────────────────────────────────────────────
  checkSession();

})();
