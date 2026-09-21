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

  // ── Session Check ─────────────────────────────────────────────────────────────
  async function checkSession() {
    try {
      const res = await fetch('/api/admin/session', { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated) {
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
        await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
      } catch (_) {}
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
    ['overview', 'registrations', 'pending', 'approved'].forEach(name => {
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
  };

  // ── Overview Stats ────────────────────────────────────────────────────────────
  window.loadOverview = async function () {
    try {
      const res = await fetch('/api/admin/overview', { credentials: 'include' });
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

      const res = await fetch(url, { credentials: 'include' });
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
                <th>Status</th>
                <th>OTP</th>
                <th>Registered</th>
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
                  <td><span class="status-pill status-${r.status}">${formatStatus(r.status)}</span></td>
                  <td style="text-align:center;">${r.otpVerified ? '<span style="color:#6edb8c;">✓</span>' : '<span style="color:#5a5248;">✗</span>'}</td>
                  <td style="font-size:11px; color:#8e8477;">${formatDate(r.createdAt)}</td>
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
      const res = await fetch(`/api/admin/registrations/${encodeURIComponent(regId)}`, { credentials: 'include' });
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
          ${r.transactionId ? `<div class="modal-row"><span class="modal-label">UPI Transaction ID</span><span class="modal-value" style="font-family:monospace;">${escHtml(r.transactionId)}</span></div>` : ''}
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
          actionsHtml += `<button class="cta" style="padding:12px 24px; opacity:0.5; cursor:not-allowed;" disabled>✓ ALREADY APPROVED</button>`;
          actionsHtml += `<button class="action-btn btn-view" onclick="resendApprovalEmail('${escHtml(r.registrationId)}')" style="padding:12px 24px;">Resend Approval Email</button>`;
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
      const res = await fetch(`/api/admin/approve/${encodeURIComponent(regId)}`, {
        method: 'POST',
        credentials: 'include',
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
      const res = await fetch(`/api/admin/reject/${encodeURIComponent(regId)}`, {
        method: 'POST',
        credentials: 'include',
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

  // ── Check-in ──────────────────────────────────────────────────────────────────
  window.checkinReg = async function (regId) {
    if (!confirm(`Check in ${regId}?`)) return;

    try {
      const res = await fetch(`/api/admin/checkin/${encodeURIComponent(regId)}`, {
        method: 'POST',
        credentials: 'include'
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
      const res = await fetch(`/api/admin/approve/${encodeURIComponent(regId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      alert(data.message || (data.success ? 'Done.' : data.error));
    } catch (_) {
      alert('Network error.');
    }
  };

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
      REJECTED: 'Rejected'
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

  // ── Init ──────────────────────────────────────────────────────────────────────
  checkSession();

})();
