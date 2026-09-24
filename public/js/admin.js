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

  // ── Multi-Event State ─────────────────────────────────────────────────────────
  let adminEvents = [];
  let activeAdminEventId = ''; // '' means all events or global context
  let currentEditingEventSlug = null;
  let eventsTabFilter = 'ALL';
  let cachedCertParticipants = [];

  function showDashboard() {
    if (authOverlay) authOverlay.style.display = 'none';
    if (adminLayout) adminLayout.style.display = 'flex';
    loadAdminEventsList().then(() => {
      loadOverview();
    });
  }

  // ── Global Event Context Handler ──────────────────────────────────────────────
  window.onGlobalEventChange = function (slug) {
    activeAdminEventId = slug || '';
    const regFilter = document.getElementById('regEventFilter');
    if (regFilter) regFilter.value = activeAdminEventId;
    const certFilter = document.getElementById('certEventFilter');
    if (certFilter) certFilter.value = activeAdminEventId;

    // Update active event badge and preview link
    const indicator = document.getElementById('activeEventIndicator');
    const previewLink = document.getElementById('btnPreviewEventLive');
    const selectedEvt = adminEvents.find(e => e.slug === activeAdminEventId);

    if (indicator) {
      if (selectedEvt && selectedEvt.isActive) {
        indicator.style.display = 'inline-flex';
      } else {
        indicator.style.display = 'none';
      }
    }

    if (previewLink) {
      previewLink.href = activeAdminEventId ? `/event/${activeAdminEventId}` : '/';
    }

    // Refresh currently open tab
    const activeTabBtn = document.querySelector('.admin-nav-item.active');
    const tabName = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'overview';
    showTab(tabName);
  };

  // ── Tab Navigation ────────────────────────────────────────────────────────────
  window.showTab = function (tabName) {
    ['overview', 'events', 'registrations', 'pending', 'approved', 'certificates', 'emailCenter', 'settings', 'gallery'].forEach(name => {
      const el = document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1));
      if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.admin-nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const tabEl = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (tabEl) tabEl.style.display = 'block';

    if (tabName === 'overview') loadOverview();
    else if (tabName === 'events') loadEventsTab();
    else if (tabName === 'registrations') loadRegistrations();
    else if (tabName === 'pending') loadFiltered('VERIFIED');
    else if (tabName === 'approved') loadFiltered('APPROVED');
    else if (tabName === 'certificates') loadCertificatesTab();
    else if (tabName === 'emailCenter') initEmailCenter();
    else if (tabName === 'settings') loadRegistrationSettings();
    else if (tabName === 'gallery') loadAdminGallery();
  };

  // ── Overview Stats ────────────────────────────────────────────────────────────
  window.loadOverview = async function () {
    try {
      let url = '/api/admin/overview';
      if (activeAdminEventId) {
        url += `?eventId=${encodeURIComponent(activeAdminEventId)}`;
      }
      const res = await adminFetch(url);
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

      const subtitleEl = document.getElementById('overviewEventSubtitle');
      const found = adminEvents.find(e => e.slug === activeAdminEventId);
      if (subtitleEl) {
        if (found) {
          subtitleEl.textContent = `${found.title || found.name} — Event Overview (${found.status || 'Active'})`;
        } else {
          subtitleEl.textContent = 'All Events Combined — System-wide Overview';
        }
      }

      const extNotice = document.getElementById('overviewExternalNotice');
      if (extNotice) {
        if (found && found.registrationProvider === 'external') {
          extNotice.style.display = 'flex';
          const extDetails = document.getElementById('overviewExternalDetails');
          if (extDetails) {
            extDetails.textContent = `Registrations are being handled by an external platform (${found.externalPlatformName || 'External Platform'}). Internal participant records are not collected on this website for external events.`;
          }
          const extLink = document.getElementById('overviewExternalLink');
          if (extLink) {
            extLink.href = found.externalRegistrationUrl || '#';
            extLink.textContent = `Open ${found.externalPlatformName || 'External'} Ticket Page ↗`;
          }
        } else {
          extNotice.style.display = 'none';
        }
      }
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
    const category = document.getElementById('regCategoryFilter')?.value || 'ALL';
    const checkedIn = document.getElementById('regCheckinFilter')?.value || 'ALL';
    await fetchAndRenderTable({ search, status, category, checkedIn, containerId: 'regTableWrapper' });
  };

  async function loadFiltered(status) {
    const containerId = status === 'VERIFIED' ? 'pendingTableWrapper' : 'approvedTableWrapper';
    await fetchAndRenderTable({ status, containerId });
  }

  function populateRegistrationCategories(regs) {
    const sel = document.getElementById('regCategoryFilter');
    if (!sel || !Array.isArray(regs)) return;
    const currentVal = sel.value || 'ALL';
    const categories = Array.from(new Set(regs.map(r => r.category).filter(Boolean))).sort();

    // Also include allowed categories from active event if available
    const activeEvt = adminEvents.find(e => e.slug === activeAdminEventId);
    if (activeEvt && Array.isArray(activeEvt.allowedCategories)) {
      activeEvt.allowedCategories.forEach(c => {
        if (c && !categories.includes(c)) categories.push(c);
      });
    }

    let opts = '<option value="ALL">All Categories</option>';
    categories.forEach(cat => {
      opts += `<option value="${escHtml(cat)}">${escHtml(cat)}</option>`;
    });
    sel.innerHTML = opts;
    if (currentVal && (currentVal === 'ALL' || categories.includes(currentVal))) {
      sel.value = currentVal;
    }
  }

  async function fetchAndRenderTable({ search, status, category, checkedIn, containerId }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';

    try {
      let url = '/api/admin/registrations?limit=500';
      const eventFilterVal = document.getElementById('regEventFilter')?.value || activeAdminEventId;
      if (eventFilterVal && eventFilterVal !== 'ALL') url += `&eventId=${encodeURIComponent(eventFilterVal)}`;
      if (status && status !== 'ALL') url += `&status=${encodeURIComponent(status)}`;
      if (category && category !== 'ALL') url += `&category=${encodeURIComponent(category)}`;
      if (checkedIn !== undefined && checkedIn !== '' && checkedIn !== 'ALL') url += `&checkedIn=${encodeURIComponent(checkedIn)}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await adminFetch(url);
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();

      if (!data.success) {
        container.innerHTML = `<div class="empty-state"><p>Failed to load: ${data.error}</p></div>`;
        return;
      }

      if (containerId === 'regTableWrapper') {
        populateRegistrationCategories(data.registrations);
      }

      if (!data.registrations.length) {
        container.innerHTML = '<div class="empty-state"><p>No registrations found matching the applied filters.</p></div>';
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
                <th>Checked In</th>
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
                  <td style="text-align:center;">${r.checkedIn ? '<span style="color:#6edb8c; font-weight:700;">✓ Yes</span>' : '<span style="color:#5a5248;">No</span>'}</td>
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

  // ── Download / Export Filtered Registrations CSV ───────────────────────────────
  window.exportRegistrationsCsv = async function (overrides = {}) {
    const btn = document.getElementById('btnExportCsv');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> Exporting…';
    }

    try {
      const eventFilterVal = overrides.eventId !== undefined ? overrides.eventId : (document.getElementById('regEventFilter')?.value || activeAdminEventId);
      const status = overrides.status !== undefined ? overrides.status : (document.getElementById('statusFilter')?.value || 'ALL');
      const category = overrides.category !== undefined ? overrides.category : (document.getElementById('regCategoryFilter')?.value || 'ALL');
      const checkedIn = overrides.checkedIn !== undefined ? overrides.checkedIn : (document.getElementById('regCheckinFilter')?.value || 'ALL');
      const search = overrides.search !== undefined ? overrides.search : (document.getElementById('searchInput')?.value.trim() || '');

      const params = new URLSearchParams();
      if (eventFilterVal && eventFilterVal !== 'ALL') params.append('eventId', eventFilterVal);
      if (status && status !== 'ALL') params.append('status', status);
      if (category && category !== 'ALL') params.append('category', category);
      if (checkedIn && checkedIn !== 'ALL') params.append('checkedIn', checkedIn);
      if (search) params.append('search', search);

      const url = `/api/admin/registrations/export?${params.toString()}`;
      const res = await adminFetch(url);

      if (res.status === 401) { showLoginOverlay(); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to export participant list: ${err.error || 'Server error'}`);
        return;
      }

      let filename = 'participants_export.csv';
      const disposition = res.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1].trim();
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

    } catch (err) {
      console.error('[Admin] CSV Export Error:', err);
      alert('Error downloading participant list: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  };

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
    const eventVal = document.getElementById('customEmailEventFilter')?.value || '';
    const cat = document.getElementById('customEmailCategoryFilter')?.value || 'ALL';
    const status = document.getElementById('customEmailStatusFilter')?.value || 'ALL';

    const filtered = cachedParticipants.filter(p => {
      if (eventVal && p.eventId !== eventVal) return false;
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

    const selectedEventId = document.getElementById('customEmailEventFilter')?.value || activeAdminEventId || undefined;

    try {
      const res = await adminFetch('/api/admin/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          subject,
          bodyContent,
          registrationId: firstRegId,
          manualEmail: manual,
          eventId: selectedEventId
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
    const selectedEventId = document.getElementById('customEmailEventFilter')?.value || activeAdminEventId || undefined;

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
              bodyContent,
              eventId: selectedEventId
            })
          });
          const data = await res.json();
          if (btn) { btn.disabled = false; btn.textContent = '🚀 Send Email'; }
          if (!data.success) {
            alert('Send error: ' + (data.error || 'Failed to send'));
            return;
          }
          alert(`Success! ${data.sentCount} sent, ${data.failedCount} failed.`);
          switchEmailSubtab('history');
        } catch (err) {
          if (btn) { btn.disabled = false; btn.textContent = '🚀 Send Email'; }
          alert('Send request failed: ' + err.message);
        }
      }
    });
  };

  // ── Google Meet Methods ───────────────────────────────────────────────────────

  window.updateMeetPreviewTemplate = function () {
    // Template updates dynamically via Preview Invitation modal
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
          switchEmailSubtab('history');
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
    if (confirmBtn) {
      confirmBtn.textContent = confirmText || 'Confirm';
      confirmBtn.disabled = false;
    }

    confirmModalCallback = onConfirm;

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const action = confirmModalCallback;
        if (typeof action === 'function') {
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Processing…';
          try {
            await action();
          } catch (err) {
            console.error('[Admin] Modal action error:', err);
            alert('Action failed: ' + err.message);
          } finally {
            closeConfirmModal();
          }
        } else {
          closeConfirmModal();
        }
      };
    }

    if (modal) modal.style.display = 'flex';
  };

  window.closeConfirmModal = function () {
    const modal = document.getElementById('confirmDialogModal');
    if (modal) modal.style.display = 'none';
    confirmModalCallback = null;
    const confirmBtn = document.getElementById('confirmDialogConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = false;
  };

  window.closeEmailPreviewModal = function () {
    const modal = document.getElementById('emailPreviewModal');
    if (modal) modal.style.display = 'none';
  };

  // ─── EVENT GALLERY ADMIN MANAGEMENT ──────────────────────────────────────────
  let adminGalleryList = [];
  let stagedGalleryFiles = [];

  const galleryDropzone = document.getElementById('galleryDropzone');
  const galleryFileInput = document.getElementById('adminGalleryFileInput');
  const galleryPreviewTray = document.getElementById('galleryFilePreviewTray');
  const galleryCountLabel = document.getElementById('galleryFileCountLabel');
  const galleryThumbsContainer = document.getElementById('galleryThumbnailsContainer');
  const galleryUploadForm = document.getElementById('adminGalleryUploadForm');
  const galleryUploadError = document.getElementById('galleryUploadError');
  const galleryUploadSuccess = document.getElementById('galleryUploadSuccess');
  const btnUploadGallery = document.getElementById('btnUploadGallery');

  if (galleryDropzone && galleryFileInput) {
    galleryDropzone.addEventListener('click', () => galleryFileInput.click());

    galleryDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      galleryDropzone.style.borderColor = '#e4ad57';
      galleryDropzone.style.background = '#1a1612';
    });

    galleryDropzone.addEventListener('dragleave', () => {
      galleryDropzone.style.borderColor = '#2a231c';
      galleryDropzone.style.background = '#0d0c0a';
    });

    galleryDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      galleryDropzone.style.borderColor = '#2a231c';
      galleryDropzone.style.background = '#0d0c0a';
      if (e.dataTransfer && e.dataTransfer.files) {
        addStagedFiles(Array.from(e.dataTransfer.files));
      }
    });

    galleryFileInput.addEventListener('change', () => {
      if (galleryFileInput.files) {
        addStagedFiles(Array.from(galleryFileInput.files));
      }
    });
  }

  function addStagedFiles(newFiles) {
    const validImages = newFiles.filter(f => f.type.startsWith('image/'));
    if (validImages.length === 0) return;

    stagedGalleryFiles = stagedGalleryFiles.concat(validImages);
    renderStagedThumbnails();
  }

  window.clearSelectedGalleryFiles = function () {
    stagedGalleryFiles = [];
    if (galleryFileInput) galleryFileInput.value = '';
    renderStagedThumbnails();
  };

  function renderStagedThumbnails() {
    if (!galleryPreviewTray || !galleryThumbsContainer) return;

    if (stagedGalleryFiles.length === 0) {
      galleryPreviewTray.style.display = 'none';
      galleryThumbsContainer.innerHTML = '';
      return;
    }

    galleryPreviewTray.style.display = 'block';
    if (galleryCountLabel) {
      galleryCountLabel.textContent = `${stagedGalleryFiles.length} photo${stagedGalleryFiles.length > 1 ? 's' : ''} ready to upload`;
    }

    galleryThumbsContainer.innerHTML = '';
    stagedGalleryFiles.forEach((file, idx) => {
      const thumb = document.createElement('div');
      thumb.style.position = 'relative';
      thumb.style.width = '70px';
      thumb.style.height = '60px';
      thumb.style.borderRadius = '6px';
      thumb.style.overflow = 'hidden';
      thumb.style.flexShrink = '0';
      thumb.style.border = '1px solid #3a3024';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';

      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '✕';
      removeBtn.type = 'button';
      removeBtn.style.position = 'absolute';
      removeBtn.style.top = '2px';
      removeBtn.style.right = '2px';
      removeBtn.style.background = 'rgba(0,0,0,0.7)';
      removeBtn.style.color = '#fff';
      removeBtn.style.border = 'none';
      removeBtn.style.borderRadius = '50%';
      removeBtn.style.width = '18px';
      removeBtn.style.height = '18px';
      removeBtn.style.fontSize = '10px';
      removeBtn.style.cursor = 'pointer';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        stagedGalleryFiles.splice(idx, 1);
        renderStagedThumbnails();
      };

      thumb.appendChild(img);
      thumb.appendChild(removeBtn);
      galleryThumbsContainer.appendChild(thumb);
    });
  }

  // Upload Form Submission
  if (galleryUploadForm) {
    galleryUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (galleryUploadError) galleryUploadError.textContent = '';
      if (galleryUploadSuccess) { galleryUploadSuccess.style.display = 'none'; galleryUploadSuccess.textContent = ''; }

      if (stagedGalleryFiles.length === 0) {
        if (galleryUploadError) galleryUploadError.textContent = 'Please select at least one photo to upload.';
        return;
      }

      if (btnUploadGallery) {
        btnUploadGallery.disabled = true;
        btnUploadGallery.textContent = `Uploading ${stagedGalleryFiles.length} photo(s)…`;
      }

      try {
        const formData = new FormData();
        stagedGalleryFiles.forEach(file => {
          formData.append('images', file);
        });
        const caption = document.getElementById('adminGalleryCaptionInput')?.value.trim() || '';
        if (caption) formData.append('caption', caption);
        const galleryEvtId = document.getElementById('adminGalleryUploadEvent')?.value || activeAdminEventId;
        if (galleryEvtId) formData.append('eventId', galleryEvtId);

        const res = await adminFetch('/api/admin/gallery/upload', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();

        if (res.ok && data.success) {
          if (galleryUploadSuccess) {
            galleryUploadSuccess.textContent = `✓ ${data.message || 'Photos uploaded successfully and published to Event Gallery!'}`;
            galleryUploadSuccess.style.display = 'block';
          }
          clearSelectedGalleryFiles();
          if (document.getElementById('adminGalleryCaptionInput')) {
            document.getElementById('adminGalleryCaptionInput').value = '';
          }
          await loadAdminGallery();
        } else {
          if (galleryUploadError) galleryUploadError.textContent = data.error || 'Failed to upload photos.';
        }
      } catch (err) {
        console.error('[Admin Gallery Upload Error]:', err);
        if (galleryUploadError) galleryUploadError.textContent = 'Upload failed: ' + err.message;
      } finally {
        if (btnUploadGallery) {
          btnUploadGallery.disabled = false;
          btnUploadGallery.textContent = '✓ Upload Selected Photos';
        }
      }
    });
  }

  // Add via Image URL
  window.promptAddImageUrl = async function () {
    const url = prompt('Enter the direct image URL (HTTPS):');
    if (!url || !url.trim()) return;

    const caption = prompt('Optional caption for this photo:') || '';
    const galleryEvtId = document.getElementById('adminGalleryUploadEvent')?.value || activeAdminEventId;

    try {
      const res = await adminFetch('/api/admin/gallery/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), caption: caption.trim(), eventId: galleryEvtId || undefined })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('✓ Image added to gallery successfully!');
        await loadAdminGallery();
      } else {
        alert('Failed to add image: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  };

  // Load Admin Gallery
  window.loadAdminGallery = async function () {
    const wrapper = document.getElementById('adminGalleryGridWrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '<div class="empty-state"><p>Loading gallery items…</p></div>';

    try {
      let url = '/api/admin/gallery/admin';
      const eventFilterVal = document.getElementById('adminGalleryEventSelect')?.value || activeAdminEventId;
      if (eventFilterVal) url += `?eventId=${encodeURIComponent(eventFilterVal)}`;
      const res = await adminFetch(url);
      if (res.status === 401) { showLoginOverlay(); return; }

      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.images)) {
        adminGalleryList = data.images;

        // Update counts
        const total = adminGalleryList.length;
        const published = adminGalleryList.filter(i => i.isPublished).length;
        const draft = total - published;

        setText('galleryTotalCount', total);
        setText('galleryPublishedCount', published);
        setText('galleryDraftCount', draft);

        filterAdminGallery();
      } else {
        wrapper.innerHTML = '<div class="empty-state"><p>Failed to load gallery photos.</p></div>';
      }
    } catch (err) {
      console.error('[Admin Gallery Load Error]:', err);
      wrapper.innerHTML = `<div class="empty-state"><p>Network error: ${err.message}</p></div>`;
    }
  };

  window.filterAdminGallery = function () {
    const filter = document.getElementById('galleryFilterStatus')?.value || 'ALL';
    let filtered = [...adminGalleryList];

    if (filter === 'PUBLISHED') {
      filtered = filtered.filter(i => i.isPublished);
    } else if (filter === 'DRAFT') {
      filtered = filtered.filter(i => !i.isPublished);
    }

    renderAdminGalleryGrid(filtered);
  };

  function renderAdminGalleryGrid(items) {
    const wrapper = document.getElementById('adminGalleryGridWrapper');
    if (!wrapper) return;

    if (!items || items.length === 0) {
      wrapper.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <span style="font-size: 36px; display: block; margin-bottom: 8px;">📷</span>
          <p style="color: #f7eee1; font-weight: 700; margin: 0 0 4px;">No gallery photos found</p>
          <p style="color: #8e8477; font-size: 13px; margin: 0;">Upload photos using the box above to showcase them here and in the public Event Gallery.</p>
        </div>
      `;
      return;
    }

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(290px, 1fr))';
    grid.style.gap = '18px';

    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.style.background = '#110f0d';
      card.style.border = '1px solid #2a231c';
      card.style.borderRadius = '10px';
      card.style.overflow = 'hidden';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';

      // Thumbnail with click-to-lightbox
      const imgWrap = document.createElement('div');
      imgWrap.style.position = 'relative';
      imgWrap.style.aspectRatio = '4/3';
      imgWrap.style.background = '#080706';
      imgWrap.style.cursor = 'pointer';

      const img = document.createElement('img');
      img.src = item.imageUrl;
      img.alt = item.caption || 'Gallery photo';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.onclick = () => {
        const lb = document.getElementById('lightboxOverlay');
        const lbImg = document.getElementById('lightboxImg');
        if (lb && lbImg) {
          lbImg.src = item.imageUrl;
          lb.classList.add('open');
        }
      };

      // Status pill badge on top right of thumbnail
      const statusBadge = document.createElement('div');
      statusBadge.style.position = 'absolute';
      statusBadge.style.top = '10px';
      statusBadge.style.right = '10px';
      statusBadge.style.padding = '4px 10px';
      statusBadge.style.borderRadius = '100px';
      statusBadge.style.fontSize = '11px';
      statusBadge.style.fontWeight = '800';
      statusBadge.style.letterSpacing = '0.06em';
      statusBadge.style.textTransform = 'uppercase';

      if (item.isPublished) {
        statusBadge.style.background = 'rgba(110, 219, 140, 0.2)';
        statusBadge.style.color = '#6edb8c';
        statusBadge.style.border = '1px solid #6edb8c';
        statusBadge.textContent = '✓ Published';
      } else {
        statusBadge.style.background = 'rgba(226, 105, 71, 0.2)';
        statusBadge.style.color = '#e26947';
        statusBadge.style.border = '1px solid #e26947';
        statusBadge.textContent = 'Draft';
      }

      // Order badge on top left
      const orderBadge = document.createElement('div');
      orderBadge.style.position = 'absolute';
      orderBadge.style.top = '10px';
      orderBadge.style.left = '10px';
      orderBadge.style.padding = '3px 8px';
      orderBadge.style.borderRadius = '6px';
      orderBadge.style.fontSize = '10px';
      orderBadge.style.fontWeight = '700';
      orderBadge.style.background = 'rgba(10, 9, 8, 0.85)';
      orderBadge.style.color = '#e4ad57';
      orderBadge.style.border = '1px solid #3a3024';
      orderBadge.textContent = `#${item.id} • Pos: ${item.displayOrder || index}`;

      imgWrap.appendChild(img);
      imgWrap.appendChild(statusBadge);
      imgWrap.appendChild(orderBadge);
      card.appendChild(imgWrap);

      // Card Content (Caption & Metadata)
      const body = document.createElement('div');
      body.style.padding = '14px 16px';
      body.style.flex = '1';
      body.style.display = 'flex';
      body.style.flexDirection = 'column';
      body.style.justifyContent = 'space-between';

      const captionText = document.createElement('div');
      captionText.style.color = item.caption ? '#f7eee1' : '#6b6155';
      captionText.style.fontSize = '13px';
      captionText.style.fontWeight = item.caption ? '600' : 'normal';
      captionText.style.lineHeight = '1.45';
      captionText.style.marginBottom = '12px';
      captionText.style.fontStyle = item.caption ? 'normal' : 'italic';
      captionText.textContent = item.caption || 'No caption set';

      // Action buttons toolbar
      const toolbar = document.createElement('div');
      toolbar.style.display = 'flex';
      toolbar.style.flexDirection = 'column';
      toolbar.style.gap = '8px';
      toolbar.style.paddingTop = '10px';
      toolbar.style.borderTop = '1px solid #1e1a16';

      // Row 1: Edit Caption + Toggle Publish
      const row1 = document.createElement('div');
      row1.style.display = 'flex';
      row1.style.gap = '6px';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'action-btn btn-view';
      editBtn.style.flex = '1';
      editBtn.style.fontSize = '11px';
      editBtn.textContent = '✏️ Edit Caption';
      editBtn.onclick = () => editGalleryCaption(item.id, item.caption);

      const pubBtn = document.createElement('button');
      pubBtn.type = 'button';
      pubBtn.className = item.isPublished ? 'action-btn btn-reject' : 'action-btn btn-approve';
      pubBtn.style.flex = '1';
      pubBtn.style.fontSize = '11px';
      pubBtn.textContent = item.isPublished ? 'Unpublish' : '✓ Publish';
      pubBtn.onclick = () => togglePublishGallery(item.id, item.isPublished);

      row1.appendChild(editBtn);
      row1.appendChild(pubBtn);

      // Row 2: Reorder buttons (Move Up, Move Down, Delete)
      const row2 = document.createElement('div');
      row2.style.display = 'flex';
      row2.style.gap = '6px';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'action-btn btn-view';
      upBtn.style.fontSize = '11px';
      upBtn.style.padding = '6px 10px';
      upBtn.textContent = '▲ Up';
      upBtn.disabled = index === 0;
      upBtn.style.opacity = index === 0 ? '0.35' : '1';
      upBtn.onclick = () => moveGalleryItem(item.id, -1);

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'action-btn btn-view';
      downBtn.style.fontSize = '11px';
      downBtn.style.padding = '6px 10px';
      downBtn.textContent = '▼ Down';
      downBtn.disabled = index === items.length - 1;
      downBtn.style.opacity = index === items.length - 1 ? '0.35' : '1';
      downBtn.onclick = () => moveGalleryItem(item.id, 1);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'action-btn btn-reject';
      delBtn.style.marginLeft = 'auto';
      delBtn.style.fontSize = '11px';
      delBtn.style.padding = '6px 10px';
      delBtn.textContent = '🗑️ Delete';
      delBtn.onclick = () => deleteGalleryImage(item.id);

      row2.appendChild(upBtn);
      row2.appendChild(downBtn);
      row2.appendChild(delBtn);

      toolbar.appendChild(row1);
      toolbar.appendChild(row2);

      body.appendChild(captionText);
      body.appendChild(toolbar);
      card.appendChild(body);

      grid.appendChild(card);
    });

    wrapper.innerHTML = '';
    wrapper.appendChild(grid);
  }

  window.editGalleryCaption = async function (id, currentCaption) {
    const newCaption = prompt('Edit photo caption:', currentCaption || '');
    if (newCaption === null) return; // User cancelled

    try {
      const res = await adminFetch(`/api/admin/gallery/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: newCaption.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadAdminGallery();
      } else {
        alert('Failed to update caption: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  };

  window.togglePublishGallery = async function (id, currentStatus) {
    try {
      const res = await adminFetch(`/api/admin/gallery/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !currentStatus })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadAdminGallery();
      } else {
        alert('Failed to toggle status: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  };

  window.deleteGalleryImage = function (id) {
    openConfirmModal({
      title: 'Delete Gallery Photo',
      message: 'Are you sure you want to permanently delete this photo from the gallery? This action cannot be undone.',
      confirmText: 'Yes, Delete Photo',
      confirmClass: 'btn-reject',
      onConfirm: async () => {
        const res = await adminFetch(`/api/admin/gallery/${id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadAdminGallery();
        } else {
          alert('Failed to delete photo: ' + (data.error || 'Server error'));
        }
      }
    });
  };

  window.moveGalleryItem = async function (id, direction) {
    const idx = adminGalleryList.findIndex(i => i.id === id);
    if (idx === -1) return;

    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= adminGalleryList.length) return;

    // Swap items in memory
    const temp = adminGalleryList[idx];
    adminGalleryList[idx] = adminGalleryList[targetIdx];
    adminGalleryList[targetIdx] = temp;

    // Render immediately for snappiness
    filterAdminGallery();

    // Persist new order array to server
    try {
      const order = adminGalleryList.map(i => i.id);
      await adminFetch('/api/admin/gallery/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
    } catch (err) {
      console.error('[Gallery Reorder Error]:', err);
      await loadAdminGallery();
    }
  };

  // ── Events Management System ──────────────────────────────────────────────────
  async function loadAdminEventsList() {
    try {
      const res = await adminFetch('/api/admin/events');
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.events)) {
        adminEvents = data.events;

        // Auto-select active event if none currently selected
        const activeEvt = adminEvents.find(e => e.isActive);
        if (!activeAdminEventId && activeEvt) {
          activeAdminEventId = activeEvt.slug;
        }

        // Update dropdowns
        const selects = ['globalEventSelect', 'regEventFilter', 'certEventFilter', 'customEmailEventFilter', 'adminGalleryUploadEvent'];
        selects.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const currentVal = el.value;
          const isGlobalOrFilter = id !== 'adminGalleryUploadEvent';
          let opts = isGlobalOrFilter ? '<option value="">All Events</option>' : '';
          opts += adminEvents.map(evt => {
            const label = `${evt.name || evt.title} (${evt.date || 'TBA'}) ${evt.isActive ? '★ ACTIVE' : ''}`;
            return `<option value="${evt.slug}">${escHtml(label)}</option>`;
          }).join('');
          el.innerHTML = opts;
          if (currentVal && adminEvents.some(e => e.slug === currentVal)) {
            el.value = currentVal;
          } else if (id === 'globalEventSelect') {
            el.value = activeAdminEventId;
          }
        });

        // Update count badges
        const countAll = adminEvents.length;
        const countActive = adminEvents.filter(e => e.isActive).length;
        const countOpen = adminEvents.filter(e => e.status === 'Registration Open').length;
        const countDraft = adminEvents.filter(e => e.status === 'Draft').length;
        const countCompleted = adminEvents.filter(e => e.status === 'Event Completed').length;
        const countArchived = adminEvents.filter(e => e.status === 'Archived').length;

        setText('countEventsAll', countAll);
        setText('countEventsActive', countActive);
        setText('countEventsOpen', countOpen);
        setText('countEventsDraft', countDraft);
        setText('countEventsCompleted', countCompleted);
        setText('countEventsArchived', countArchived);

        // Update live indicator & preview link
        const indicator = document.getElementById('activeEventIndicator');
        const previewLink = document.getElementById('btnPreviewEventLive');
        const selected = adminEvents.find(e => e.slug === activeAdminEventId);
        if (indicator) {
          indicator.style.display = (selected && selected.isActive) ? 'inline-flex' : 'none';
        }
        if (previewLink) {
          previewLink.href = activeAdminEventId ? `/event/${activeAdminEventId}` : '/';
        }
      }
    } catch (err) {
      console.error('[Admin] Events list error:', err);
    }
  }

  window.loadEventsTab = async function () {
    await loadAdminEventsList();
    renderEventsList(eventsTabFilter);
  };

  window.filterEventsTab = function (filter) {
    eventsTabFilter = filter;
    ['All', 'Active', 'Open', 'Draft', 'Completed', 'Archived'].forEach(k => {
      const b = document.getElementById('subnavEvent' + k);
      if (b) b.classList.remove('active');
    });

    if (filter === 'ALL') document.getElementById('subnavEventAll')?.classList.add('active');
    else if (filter === 'ACTIVE') document.getElementById('subnavEventActive')?.classList.add('active');
    else if (filter === 'Registration Open') document.getElementById('subnavEventOpen')?.classList.add('active');
    else if (filter === 'Draft') document.getElementById('subnavEventDraft')?.classList.add('active');
    else if (filter === 'Event Completed') document.getElementById('subnavEventCompleted')?.classList.add('active');
    else if (filter === 'Archived') document.getElementById('subnavEventArchived')?.classList.add('active');

    renderEventsList(filter);
  };

  function renderEventsList(filter) {
    const wrapper = document.getElementById('eventsListWrapper');
    if (!wrapper) return;

    let list = [...adminEvents];
    if (filter === 'ACTIVE') {
      list = list.filter(e => e.isActive);
    } else if (filter && filter !== 'ALL') {
      list = list.filter(e => e.status === filter);
    }

    if (!list.length) {
      wrapper.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;">
          <span style="font-size:36px; display:block; margin-bottom:8px;">🎪</span>
          <p style="color:#f7eee1; font-weight:700;">No events match the "${escHtml(filter)}" filter.</p>
          <button type="button" class="cta" onclick="openCreateEventModal()" style="margin-top:12px;">+ Create New Event</button>
        </div>
      `;
      return;
    }

    wrapper.innerHTML = list.map(evt => {
      const isCurrentActive = Boolean(evt.isActive);
      const isSelectedContext = activeAdminEventId === evt.slug;
      const statusClass = 'badge-' + (evt.status || 'Draft').replace(/[^a-zA-Z0-9]/g, '');

      return `
        <div class="event-card ${isCurrentActive ? 'is-active' : ''}" style="${isSelectedContext ? 'box-shadow: 0 0 0 2px #e4ad57;' : ''}">
          <img src="${evt.posterUrl || '/assets/poster.jpeg'}" alt="${escHtml(evt.name)}" class="event-thumb" onerror="this.src='/assets/poster.jpeg'">

          <div class="event-info">
            <div class="event-title-row">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <h3 class="event-title">${escHtml(evt.name || evt.title)}</h3>
                <span class="event-slug-pill">/event/${escHtml(evt.slug)}</span>
                ${isCurrentActive ? '<span class="status-pill status-APPROVED" style="font-size:10px;">★ ACTIVE HOMEPAGE</span>' : ''}
                <span class="badge-status ${statusClass}">${escHtml(evt.status || 'Draft')}</span>
                ${evt.registrationProvider === 'external' ? `
                  <span class="badge-status" style="background:rgba(110,219,140,0.12); color:#6edb8c; border:1px solid rgba(110,219,140,0.3);">🌐 External: ${escHtml(evt.externalPlatformName || 'Platform')}</span>
                ` : (evt.registrationProvider === 'disabled' ? `
                  <span class="badge-status" style="background:rgba(226,105,71,0.12); color:#e26947; border:1px solid rgba(226,105,71,0.3);">🚫 Reg Disabled</span>
                ` : `
                  <span class="badge-status" style="background:rgba(228,173,87,0.1); color:#e4ad57; border:1px solid rgba(228,173,87,0.25);">📝 Website Reg</span>
                `)}
              </div>
            </div>

            <div style="font-size:13px; color:#d5cbbd; margin-bottom:8px;">
              ${escHtml(evt.shortDescription || evt.title || '')}
            </div>

            <div class="event-meta-grid">
              <div class="event-meta-item"><span>📅</span> <b>${escHtml(evt.date || 'TBA')}</b> ${escHtml(evt.time || '')}</div>
              <div class="event-meta-item"><span>📍</span> ${escHtml(evt.venue || 'Online')}, <b>${escHtml(evt.city || 'Online')}</b></div>
              <div class="event-meta-item"><span>🎟️</span> <b>${evt.fee ? ('₹' + evt.fee) : 'Free'}</b></div>
              <div class="event-meta-item"><span>👥</span> Registrations: <b style="color:#e4ad57;">${evt.registrationCount || 0}</b> (${evt.approvedCount || 0} approved)</div>
              ${evt.registrationProvider === 'external' ? `
                <div class="event-meta-item"><span>🌐</span> Provider: <b style="color:#6edb8c;">${escHtml(evt.externalPlatformName || 'External Platform')}</b></div>
              ` : ''}
            </div>

            <div class="event-actions-bar">
              <button type="button" class="action-btn ${isSelectedContext ? 'btn-approve' : 'btn-view'}" onclick="onGlobalEventChange('${evt.slug}')">
                ${isSelectedContext ? '✓ Managing Event' : 'Manage Event'}
              </button>

              <button type="button" class="action-btn btn-view" onclick="openEditEventModal('${evt.slug}')">
                ✏️ Edit Details
              </button>

              <button type="button" class="action-btn btn-view" onclick="openDuplicateModalFor('${evt.slug}')">
                ⧉ Duplicate Event
              </button>

              ${!isCurrentActive ? `
                <button type="button" class="action-btn btn-approve" onclick="setActiveEvent('${evt.slug}')">
                  ★ Set Active
                </button>
              ` : `
                <span style="font-size:11px; color:#6edb8c; font-weight:700;">✓ Active Live</span>
              `}

              ${(evt.registrationProvider === 'external' && evt.externalRegistrationUrl) ? `
                <a href="${escHtml(evt.externalRegistrationUrl)}" target="_blank" rel="noopener noreferrer" class="action-btn btn-view" style="text-decoration:none; color:#6edb8c;" title="Open external registration platform">
                  ↗ Tickets (${escHtml(evt.externalPlatformName || 'External')})
                </a>
              ` : ''}

              <select class="filter-select" style="padding:4px 8px; font-size:11px; height:28px;" onchange="setEventStatus('${evt.slug}', this.value)">
                <option value="" disabled selected>Status: ${evt.status}</option>
                <option value="Draft">Draft</option>
                <option value="Registration Open">Registration Open</option>
                <option value="Registration Closed">Registration Closed</option>
                <option value="Event Completed">Event Completed</option>
                <option value="Archived">Archived</option>
              </select>

              <button type="button" class="action-btn btn-view" onclick="exportRegistrationsCsv({ eventId: '${evt.slug}' })" title="Download participant CSV for ${escHtml(evt.name || evt.title)}">
                📥 Export CSV
              </button>

              <a href="/event/${evt.slug}" target="_blank" class="action-btn btn-view" style="text-decoration:none;">
                ↗ Public Page
              </a>

              <button type="button" class="action-btn btn-revoke" onclick="deleteEvent('${evt.slug}')" style="margin-left:auto;">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Registration Provider State & Handlers ──────────────────────────────────
  let editingEventPreviousProvider = 'internal';
  let editingEventRegistrationCount = 0;

  window.onRegistrationProviderChange = function (newVal) {
    if (currentEditingEventSlug && editingEventRegistrationCount > 0 && newVal !== editingEventPreviousProvider) {
      const msg = `Notice: This event has ${editingEventRegistrationCount} existing internal registration(s).\n\nChanging the registration method will direct ALL NEW registrations to ${newVal === 'external' ? 'an external website' : (newVal === 'disabled' ? 'a disabled state' : 'the website form')}, but will NOT delete or alter any existing participant records.\n\nDo you want to proceed?`;
      if (!confirm(msg)) {
        const prevRadio = document.querySelector(`input[name="evtRegistrationMethod"][value="${editingEventPreviousProvider}"]`);
        if (prevRadio) prevRadio.checked = true;
        return;
      }
    }

    editingEventPreviousProvider = newVal;

    const extBlock = document.getElementById('evtExternalSettingsBlock');
    const intBlock = document.getElementById('evtInternalSettingsBlock');
    const maxRegBlock = document.getElementById('evtMaxRegBlock');

    if (extBlock) extBlock.style.display = (newVal === 'external') ? 'block' : 'none';
    if (intBlock) intBlock.style.display = (newVal === 'internal') ? 'block' : 'none';
    if (maxRegBlock) maxRegBlock.style.display = (newVal === 'internal') ? 'block' : 'none';

    updateExternalAdminPreview();
  };

  window.updateExternalAdminPreview = function () {
    const url = document.getElementById('evtExternalUrl')?.value.trim() || '';
    const platform = document.getElementById('evtExternalPlatformName')?.value.trim() || '';
    const previewUrlEl = document.getElementById('evtExternalPreviewUrl');
    const previewBtn = document.getElementById('evtExternalPreviewBtn');

    if (previewUrlEl) {
      previewUrlEl.textContent = url || 'https://example.com/registration';
    }
    if (previewBtn) {
      previewBtn.href = url || '#';
      if (platform) {
        previewBtn.innerHTML = `<span>↗</span> Open Registration Link (${platform})`;
      } else {
        previewBtn.innerHTML = '<span>↗</span> Open Registration Link';
      }
    }
  };

  window.changeRegMethodToInternal = function () {
    const radio = document.getElementById('regMethodInternal');
    if (radio) {
      radio.checked = true;
      onRegistrationProviderChange('internal');
    }
  };

  // ── Event Modal (Create / Edit) ───────────────────────────────────────────────
  window.openCreateEventModal = function () {
    currentEditingEventSlug = null;
    editingEventPreviousProvider = 'internal';
    editingEventRegistrationCount = 0;
    const form = document.getElementById('eventEditorForm');
    if (form) form.reset();

    setText('eventModalKicker', 'CREATE NEW EVENT');
    setText('eventModalHeading', 'New Open Mic Event');
    const slugInput = document.getElementById('evtSlug');
    if (slugInput) slugInput.readOnly = false;
    document.getElementById('evtFee').value = '79';
    document.getElementById('evtCurrency').value = '₹';
    document.getElementById('evtPayeeName').value = 'Preeti Yadav / Offstage Creators';
    document.getElementById('evtUpiId').value = 'preetiyadav15071985@okaxis';
    document.getElementById('evtPaymentQr').value = '/assets/payment-qr.jpeg';
    document.getElementById('evtPosterUrl').value = '/assets/poster.jpeg';
    document.getElementById('evtLogoUrl').value = '/assets/logo.png';
    document.getElementById('evtIsRegistrationOpen').checked = true;
    document.getElementById('evtIsRegistrationFeeEnabled').checked = true;
    document.getElementById('evtRegButtonText').value = 'REGISTER NOW';
    document.getElementById('evtAllowedCategories').value = 'Poetry & Shayari, Storytelling, Stand-up Comedy, Music & Vocals, Spoken Word, Other';
    document.getElementById('evtStatus').value = 'Draft';

    const intRadio = document.getElementById('regMethodInternal');
    if (intRadio) intRadio.checked = true;
    if (document.getElementById('evtExternalUrl')) document.getElementById('evtExternalUrl').value = '';
    if (document.getElementById('evtExternalPlatformName')) document.getElementById('evtExternalPlatformName').value = '';
    if (document.getElementById('evtExternalNotes')) document.getElementById('evtExternalNotes').value = '';
    if (document.getElementById('evtExternalOpenNewTab')) document.getElementById('evtExternalOpenNewTab').checked = true;
    onRegistrationProviderChange('internal');

    switchEvtModalTab('basic');
    const modal = document.getElementById('eventEditorModal');
    if (modal) modal.style.display = 'flex';
  };

  window.openEditEventModal = async function (slug) {
    currentEditingEventSlug = slug;
    try {
      const res = await adminFetch(`/api/admin/events/${encodeURIComponent(slug)}`);
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();
      if (!res.ok || !data.success || !data.event) {
        alert('Failed to load event details: ' + (data.error || 'Server error'));
        return;
      }

      const evt = data.event;
      setText('eventModalKicker', 'EDIT EVENT CONFIGURATION');
      setText('eventModalHeading', `Edit: ${evt.name || evt.title}`);

      // Tab 1: Basic
      document.getElementById('evtSlug').value = evt.slug || '';
      document.getElementById('evtSlug').readOnly = true;
      document.getElementById('evtName').value = evt.name || '';
      document.getElementById('evtTitle').value = evt.title || '';

      const normStatus = (evt.status || '').toLowerCase().replace(/[\s_-]+/g, '');
      let matchedStatus = 'Draft';
      if (normStatus === 'registrationopen' || normStatus === 'open') matchedStatus = 'Registration Open';
      else if (normStatus === 'registrationclosed' || normStatus === 'closed') matchedStatus = 'Registration Closed';
      else if (normStatus === 'eventcompleted' || normStatus === 'completed') matchedStatus = 'Event Completed';
      else if (normStatus === 'archived') matchedStatus = 'Archived';
      document.getElementById('evtStatus').value = matchedStatus;

      document.getElementById('evtShortDescription').value = evt.shortDescription || evt.short_description || '';
      document.getElementById('evtDescription').value = evt.description || '';

      // Tab 2: Date & Time
      document.getElementById('evtDate').value = evt.date || evt.eventDate || evt.event_date || '';
      document.getElementById('evtTime').value = evt.time || evt.start_time || '';
      document.getElementById('evtStartTime').value = evt.startTime || evt.start_time || '';
      document.getElementById('evtEndTime').value = evt.endTime || evt.end_time || '';
      document.getElementById('evtTimezone').value = evt.timezone || 'IST (GMT+5:30)';
      document.getElementById('evtRegOpeningDate').value = evt.registrationOpeningDate || evt.reg_open_date || '';
      document.getElementById('evtRegClosingDate').value = evt.registrationClosingDate || evt.reg_close_date || '';

      // Tab 3: Venue
      document.getElementById('evtVenue').value = evt.venue || evt.venueName || evt.venue_name || '';
      document.getElementById('evtCity').value = evt.city || '';
      document.getElementById('evtState').value = evt.state || '';
      document.getElementById('evtGoogleMapsUrl').value = evt.googleMapsUrl || evt.maps_url || '';
      document.getElementById('evtVenueAddress').value = evt.venueAddress || evt.venue_address || '';
      document.getElementById('evtVenueImage').value = evt.venueImage || evt.venue_image_url || '';

      // Tab 4: Pricing
      document.getElementById('evtFee').value = evt.fee ?? 79;
      document.getElementById('evtCurrency').value = evt.currency || '₹';
      document.getElementById('evtEarlyBirdPrice').value = evt.earlyBirdPrice || '';
      document.getElementById('evtIsRegistrationFeeEnabled').checked = evt.isRegistrationFeeEnabled !== false;
      document.getElementById('evtAllowedCategories').value = Array.isArray(evt.allowedCategories) ? evt.allowedCategories.join(', ') : (evt.allowedCategories || '');
      document.getElementById('evtPayeeName').value = evt.payeeName || evt.payee_name || 'Preeti Yadav / Offstage Creators';
      document.getElementById('evtUpiId').value = evt.upiId || evt.upi_id || 'preetiyadav15071985@okaxis';
      document.getElementById('evtPaymentQr').value = evt.paymentQr || evt.qr_asset_path || '/assets/payment-qr.jpeg';
      document.getElementById('evtPaymentInstructions').value = evt.paymentInstructions || evt.payment_instructions || '';

      // Tab 5: Media
      let poster = evt.posterUrl || evt.poster_url;
      if (!poster || poster === '/assets/poster.jpeg') {
        poster = (evt.slug === 'delhi-adhure-musafir-2026') ? '/assets/adhure-musafir-poster.png' : '/assets/event-poster.png';
      }
      document.getElementById('evtPosterUrl').value = poster;
      document.getElementById('evtBannerUrl').value = evt.bannerUrl || evt.banner_url || poster;
      document.getElementById('evtLogoUrl').value = evt.logoUrl || evt.logo_url || '/assets/logo.png';
      document.getElementById('evtPromoVideoUrl').value = evt.promoVideoUrl || evt.promo_video_url || '';

      // Tab 6: Registration Provider & Settings
      let provider = (evt.registrationProvider || evt.registration_provider || 'internal').toLowerCase();
      if (!['internal', 'external', 'disabled'].includes(provider)) {
        provider = 'internal';
      }
      editingEventPreviousProvider = provider;
      editingEventRegistrationCount = evt.registrationCount || 0;

      const targetRadio = document.querySelector(`input[name="evtRegistrationMethod"][value="${provider}"]`);
      if (targetRadio) targetRadio.checked = true;

      let extUrl = evt.externalRegistrationUrl || evt.external_registration_url || '';
      if (!/^https?:\/\//i.test(extUrl)) extUrl = '';
      document.getElementById('evtExternalUrl').value = extUrl;
      document.getElementById('evtExternalPlatformName').value = evt.externalPlatformName || evt.external_platform_name || '';
      document.getElementById('evtExternalNotes').value = evt.externalPlatformNotes || evt.external_platform_notes || '';
      document.getElementById('evtExternalOpenNewTab').checked = evt.externalOpenNewTab !== false && evt.external_open_new_tab !== 0;

      const extBlock = document.getElementById('evtExternalSettingsBlock');
      const intBlock = document.getElementById('evtInternalSettingsBlock');
      const maxRegBlock = document.getElementById('evtMaxRegBlock');
      if (extBlock) extBlock.style.display = (provider === 'external') ? 'block' : 'none';
      if (intBlock) intBlock.style.display = (provider === 'internal') ? 'block' : 'none';
      if (maxRegBlock) maxRegBlock.style.display = (provider === 'internal') ? 'block' : 'none';
      updateExternalAdminPreview();

      document.getElementById('evtIsRegistrationOpen').checked = evt.isRegistrationOpen !== false && evt.reg_enabled !== 0;
      document.getElementById('evtRegButtonText').value = evt.registrationButtonText || evt.reg_button_text || 'REGISTER NOW';
      document.getElementById('evtMaxRegistrations').value = evt.maxRegistrations || evt.max_registrations || 50;
      document.getElementById('evtConfirmationMessage').value = evt.confirmationMessage || evt.confirmation_message || '';
      document.getElementById('evtPerformanceGuidelines').value = evt.performanceGuidelines || evt.performance_guidelines || '';

      // Tab 7: Social
      document.getElementById('evtContactEmail').value = evt.contactEmail || 'support@offstagecreators.com';
      document.getElementById('evtContactPhone').value = evt.contactPhone || '';
      document.getElementById('evtInstagram').value = evt.instagram || 'https://www.instagram.com/offstagecreators/';
      document.getElementById('evtYoutube').value = evt.youtube || '';
      document.getElementById('evtWhatsapp').value = evt.whatsapp || '';
      document.getElementById('evtGoogleMeetLink').value = evt.googleMeetLink || '';

      switchEvtModalTab('basic');
      const modal = document.getElementById('eventEditorModal');
      if (modal) modal.style.display = 'flex';
    } catch (err) {
      alert('Network error loading event: ' + err.message);
    }
  };

  window.switchEvtModalTab = function (tabId) {
    const tabs = ['basic', 'datetime', 'venue', 'pricing', 'media', 'reg', 'social'];
    const tabMap = {
      basic: 'Basic',
      datetime: 'DateTime',
      venue: 'Venue',
      pricing: 'Pricing',
      media: 'Media',
      reg: 'Reg',
      social: 'Social'
    };

    tabs.forEach(t => {
      const btn = document.getElementById('tabBtnEvt' + tabMap[t]);
      const content = document.getElementById('evtTabContent' + tabMap[t]);
      if (btn) btn.classList.toggle('active', t === tabId);
      if (content) content.style.display = (t === tabId) ? 'block' : 'none';
    });
  };

  window.closeEventModal = function () {
    const modal = document.getElementById('eventEditorModal');
    if (modal) modal.style.display = 'none';
    currentEditingEventSlug = null;
  };

  window.saveEventForm = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const btn = document.getElementById('btnSaveEvent');

    const slug = (document.getElementById('evtSlug').value || '').trim().toLowerCase();
    const name = (document.getElementById('evtName').value || '').trim();
    const title = (document.getElementById('evtTitle').value || '').trim();

    if (!name || !title) {
      switchEvtModalTab('basic');
      alert('Please provide both an Event Name and Event Display Title.');
      document.getElementById(!name ? 'evtName' : 'evtTitle')?.focus();
      return;
    }

    const date = (document.getElementById('evtDate').value || '').trim();
    const time = (document.getElementById('evtTime').value || '').trim();
    if (!date || !time) {
      switchEvtModalTab('datetime');
      alert('Please provide a Display Date and Display Time.');
      document.getElementById(!date ? 'evtDate' : 'evtTime')?.focus();
      return;
    }

    const rawCats = document.getElementById('evtAllowedCategories').value;
    const allowedCategories = rawCats.split(',').map(s => s.trim()).filter(Boolean);

    const providerRadio = document.querySelector('input[name="evtRegistrationMethod"]:checked');
    const registrationProvider = providerRadio ? providerRadio.value : 'internal';
    const externalRegistrationUrl = document.getElementById('evtExternalUrl')?.value.trim() || '';
    const externalPlatformName = document.getElementById('evtExternalPlatformName')?.value.trim() || '';
    const externalPlatformNotes = document.getElementById('evtExternalNotes')?.value.trim() || '';
    const externalOpenNewTab = document.getElementById('evtExternalOpenNewTab')?.checked ?? true;

    if (registrationProvider === 'external') {
      if (!externalRegistrationUrl) {
        switchEvtModalTab('reg');
        alert('Please enter an External Registration URL (e.g. BookMyShow, Google Forms).');
        document.getElementById('evtExternalUrl')?.focus();
        return;
      }
      if (!/^https?:\/\//i.test(externalRegistrationUrl)) {
        switchEvtModalTab('reg');
        alert('External Registration URL must start with http:// or https://');
        document.getElementById('evtExternalUrl')?.focus();
        return;
      }
    }

    let posterUrl = (document.getElementById('evtPosterUrl').value || '').trim();
    if (!posterUrl || posterUrl === '/assets/poster.jpeg') {
      posterUrl = (slug === 'delhi-adhure-musafir-2026') ? '/assets/adhure-musafir-poster.png' : '/assets/event-poster.png';
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    const payload = {
      slug: document.getElementById('evtSlug').value.trim().toLowerCase(),
      name: document.getElementById('evtName').value.trim(),
      title: document.getElementById('evtTitle').value.trim(),
      status: document.getElementById('evtStatus').value,
      shortDescription: document.getElementById('evtShortDescription').value.trim(),
      description: document.getElementById('evtDescription').value.trim(),
      date: document.getElementById('evtDate').value.trim(),
      time: document.getElementById('evtTime').value.trim(),
      startTime: document.getElementById('evtStartTime').value.trim(),
      endTime: document.getElementById('evtEndTime').value.trim(),
      timezone: document.getElementById('evtTimezone').value.trim(),
      registrationOpeningDate: document.getElementById('evtRegOpeningDate').value.trim(),
      registrationClosingDate: document.getElementById('evtRegClosingDate').value.trim(),
      venue: document.getElementById('evtVenue').value.trim(),
      city: document.getElementById('evtCity').value.trim(),
      state: document.getElementById('evtState').value.trim(),
      googleMapsUrl: document.getElementById('evtGoogleMapsUrl').value.trim(),
      venueAddress: document.getElementById('evtVenueAddress').value.trim(),
      venueImage: document.getElementById('evtVenueImage').value.trim(),
      fee: Number(document.getElementById('evtFee').value) || 0,
      currency: document.getElementById('evtCurrency').value.trim() || '₹',
      earlyBirdPrice: document.getElementById('evtEarlyBirdPrice').value ? Number(document.getElementById('evtEarlyBirdPrice').value) : null,
      isRegistrationFeeEnabled: document.getElementById('evtIsRegistrationFeeEnabled').checked,
      allowedCategories,
      payeeName: document.getElementById('evtPayeeName').value.trim(),
      upiId: document.getElementById('evtUpiId').value.trim(),
      paymentQr: document.getElementById('evtPaymentQr').value.trim(),
      paymentInstructions: document.getElementById('evtPaymentInstructions').value.trim(),
      posterUrl,
      bannerUrl: document.getElementById('evtBannerUrl').value.trim(),
      logoUrl: document.getElementById('evtLogoUrl').value.trim(),
      promoVideoUrl: document.getElementById('evtPromoVideoUrl').value.trim(),
      registrationProvider,
      externalRegistrationUrl,
      externalPlatformName,
      externalPlatformNotes,
      externalOpenNewTab,
      isRegistrationOpen: document.getElementById('evtIsRegistrationOpen').checked,
      registrationButtonText: document.getElementById('evtRegButtonText').value.trim(),
      maxRegistrations: Number(document.getElementById('evtMaxRegistrations').value) || 0,
      confirmationMessage: document.getElementById('evtConfirmationMessage').value.trim(),
      performanceGuidelines: document.getElementById('evtPerformanceGuidelines').value.trim(),
      contactEmail: document.getElementById('evtContactEmail').value.trim(),
      contactPhone: document.getElementById('evtContactPhone').value.trim(),
      instagram: document.getElementById('evtInstagram').value.trim(),
      youtube: document.getElementById('evtYoutube').value.trim(),
      whatsapp: document.getElementById('evtWhatsapp').value.trim(),
      googleMeetLink: document.getElementById('evtGoogleMeetLink').value.trim()
    };

    try {
      let res;
      if (currentEditingEventSlug) {
        res = await adminFetch(`/api/admin/events/${encodeURIComponent(currentEditingEventSlug)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await adminFetch('/api/admin/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Failed to save event: ' + (data.error || 'Server error'));
        if (btn) { btn.disabled = false; btn.textContent = '✓ Save Event'; }
        return;
      }

      closeEventModal();
      await loadAdminEventsList();
      renderEventsList(eventsTabFilter);
      alert(currentEditingEventSlug ? 'Event updated successfully!' : 'New event created successfully!');
    } catch (err) {
      alert('Network error saving event: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Save Event'; }
    }
  };

  window.setActiveEvent = async function (slug) {
    try {
      const res = await adminFetch(`/api/admin/events/${encodeURIComponent(slug)}/set-active`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        activeAdminEventId = slug;
        await loadAdminEventsList();
        renderEventsList(eventsTabFilter);
        loadOverview();
      } else {
        alert('Failed to set active event: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  };

  window.setEventStatus = async function (slug, status) {
    if (!status) return;
    try {
      const res = await adminFetch(`/api/admin/events/${encodeURIComponent(slug)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadAdminEventsList();
        renderEventsList(eventsTabFilter);
      } else {
        alert('Failed to update event status: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  };

  // ── Duplicate Event ───────────────────────────────────────────────────────────
  window.openDuplicateModalFor = function (slug) {
    const evt = adminEvents.find(e => e.slug === slug);
    if (!evt) return;

    document.getElementById('dupSourceSlug').value = evt.slug;
    document.getElementById('dupSourceEventDisplay').textContent = `${evt.name || evt.title} (${evt.slug})`;
    document.getElementById('dupNewSlug').value = `${evt.slug}-copy`;
    document.getElementById('dupNewName').value = `${evt.name || evt.title} (New Edition)`;
    document.getElementById('dupNewTitle').value = `${evt.title || evt.name} — Next Edition`;
    document.getElementById('dupNewDate').value = '';

    const modal = document.getElementById('duplicateEventModal');
    if (modal) modal.style.display = 'flex';
  };

  window.openDuplicateCurrentEvent = function () {
    const slug = activeAdminEventId || (adminEvents[0] ? adminEvents[0].slug : null);
    if (!slug) {
      alert('Please create or select an event first.');
      return;
    }
    openDuplicateModalFor(slug);
  };

  window.closeDuplicateModal = function () {
    const modal = document.getElementById('duplicateEventModal');
    if (modal) modal.style.display = 'none';
  };

  window.submitDuplicateEvent = async function (e) {
    e.preventDefault();
    const sourceSlug = document.getElementById('dupSourceSlug').value;
    const newSlug = document.getElementById('dupNewSlug').value.trim().toLowerCase();
    const newName = document.getElementById('dupNewName').value.trim();
    const newTitle = document.getElementById('dupNewTitle').value.trim();
    const newDate = document.getElementById('dupNewDate').value.trim();

    const btn = document.getElementById('btnConfirmDuplicate');
    if (btn) { btn.disabled = true; btn.textContent = 'Cloning…'; }

    try {
      const res = await adminFetch(`/api/admin/events/${encodeURIComponent(sourceSlug)}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSlug, newName, newTitle, newDate })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Failed to duplicate event: ' + (data.error || 'Server error'));
        if (btn) { btn.disabled = false; btn.textContent = '⧉ Clone Event'; }
        return;
      }

      closeDuplicateModal();
      activeAdminEventId = newSlug;
      await loadAdminEventsList();
      renderEventsList(eventsTabFilter);
      alert(`Event duplicated successfully! New event "${newName}" created as Draft template.`);
    } catch (err) {
      alert('Network error duplicating event: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⧉ Clone Event'; }
    }
  };

  window.deleteEvent = function (slug) {
    const evt = adminEvents.find(e => e.slug === slug);
    const regCount = evt ? (evt.registrationCount || 0) : 0;

    let warningMsg = `Are you sure you want to permanently delete event "${evt?.name || slug}"?`;
    if (regCount > 0) {
      warningMsg += `\n\n⚠️ CAUTION: This event currently has ${regCount} existing participant registrations! Deleting this event configuration will NOT destroy participant records, but will disassociate them from this event.`;
    }

    openConfirmModal({
      title: 'Delete Event Configuration',
      message: warningMsg,
      confirmText: 'Yes, Delete Event',
      confirmClass: 'btn-reject',
      onConfirm: async () => {
        try {
          const res = await adminFetch(`/api/admin/events/${encodeURIComponent(slug)}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (res.ok && data.success) {
            if (activeAdminEventId === slug) activeAdminEventId = '';
            await loadAdminEventsList();
            renderEventsList(eventsTabFilter);
          } else {
            alert('Failed to delete event: ' + (data.error || 'Server error'));
          }
        } catch (err) {
          alert('Network error: ' + err.message);
        }
      }
    });
  };

  // ── Certificates & Winners Management ─────────────────────────────────────────
  window.loadCertificatesTab = async function () {
    const wrapper = document.getElementById('certTableWrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '<div class="empty-state"><p>Loading certificates…</p></div>';

    const eventSlug = document.getElementById('certEventFilter')?.value || activeAdminEventId;

    try {
      let url = '/api/admin/registrations?limit=300';
      if (eventSlug) url += `&eventId=${encodeURIComponent(eventSlug)}`;

      const res = await adminFetch(url);
      if (res.status === 401) { showLoginOverlay(); return; }
      const data = await res.json();

      if (!res.ok || !data.success) {
        wrapper.innerHTML = `<div class="empty-state"><p>Failed to load registrations: ${data.error}</p></div>`;
        return;
      }

      cachedCertParticipants = data.registrations || [];
      renderCertificatesTable(cachedCertParticipants);
    } catch (err) {
      wrapper.innerHTML = `<div class="empty-state"><p>Network error: ${err.message}</p></div>`;
    }
  };

  window.filterCertificatesList = function () {
    const search = (document.getElementById('certSearchInput')?.value || '').trim().toLowerCase();
    let filtered = [...cachedCertParticipants];
    if (search) {
      filtered = filtered.filter(p =>
        (p.fullName && p.fullName.toLowerCase().includes(search)) ||
        (p.registrationId && p.registrationId.toLowerCase().includes(search)) ||
        (p.category && p.category.toLowerCase().includes(search)) ||
        (p.position && p.position.toLowerCase().includes(search))
      );
    }
    renderCertificatesTable(filtered);
  };

  function renderCertificatesTable(list) {
    const wrapper = document.getElementById('certTableWrapper');
    if (!wrapper) return;

    if (!list.length) {
      wrapper.innerHTML = '<div class="empty-state"><p>No registrations found for certificate issuance.</p></div>';
      return;
    }

    let html = `
      <table class="reg-table">
        <thead>
          <tr>
            <th>Reg ID</th>
            <th>Performer Name</th>
            <th>Event</th>
            <th>Category</th>
            <th>Status</th>
            <th>Achievement / Position</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(p => {
      const isWinner = Boolean(
        p.position === 'WINNER' ||
        p.isWinner ||
        p.registrationId === 'OC-OM-2440F923' ||
        (p.fullName && p.fullName.toLowerCase().includes('suhavani'))
      );

      const posLabel = p.position || (isWinner ? 'WINNER' : 'PARTICIPANT');
      const posClass = isWinner ? 'status-APPROVED' : 'status-VERIFIED';

      html += `
        <tr>
          <td class="id-cell">${escHtml(p.registrationId)}</td>
          <td class="name-cell">${escHtml(p.fullName)}</td>
          <td><span class="event-slug-pill">${escHtml(p.eventId || 'online-open-mic-2026')}</span></td>
          <td>${escHtml(p.category || 'Performer')}</td>
          <td><span class="status-pill status-${p.status}">${formatStatus(p.status)}</span></td>
          <td>
            <span class="status-pill ${posClass}" style="font-weight:800;">
              ${isWinner ? '🏆 ' : ''}${escHtml(posLabel)}
            </span>
            ${p.badgeText ? `<div style="font-size:11px; color:#e4ad57; margin-top:2px;">${escHtml(p.badgeText)}</div>` : ''}
          </td>
          <td>
            <div style="display:flex; gap:6px;">
              <button type="button" class="action-btn btn-view" onclick="openWinnerModal('${p.registrationId}', '${escHtml(p.fullName)}', '${escHtml(p.position || '')}', '${escHtml(p.certificateTitle || '')}', '${escHtml(p.badgeText || '')}', '${escHtml(p.citation || '')}')">
                🎖️ Award / Edit
              </button>
              <a href="/certificate?id=${p.registrationId}" target="_blank" class="action-btn btn-view" style="text-decoration:none;">
                ↗ Verify
              </a>
            </div>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    wrapper.innerHTML = html;
  }

  window.openWinnerModal = function (regId, name, position, certTitle, badgeText, citation) {
    document.getElementById('winnerTargetRegId').value = regId;
    document.getElementById('winnerModalRegId').textContent = regId;
    document.getElementById('winnerModalPerformerName').textContent = name;
    document.getElementById('winnerPositionSelect').value = position || 'WINNER';
    document.getElementById('winnerCertTitle').value = certTitle || 'CERTIFICATE OF EXCELLENCE';
    document.getElementById('winnerBadgeText').value = badgeText || '✦ 1ST PLACE WINNER — OUTSTANDING ARTISTRY ✦';
    document.getElementById('winnerCitationText').value = citation || 'For poetic excellence, heartfelt stage delivery, and resonant storytelling at Offstage Creators.';

    const modal = document.getElementById('winnerModal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeWinnerModal = function () {
    const modal = document.getElementById('winnerModal');
    if (modal) modal.style.display = 'none';
  };

  window.submitWinnerForm = async function (e) {
    e.preventDefault();
    const registrationId = document.getElementById('winnerTargetRegId').value;
    const position = document.getElementById('winnerPositionSelect').value;
    const certificateTitle = document.getElementById('winnerCertTitle').value.trim();
    const badgeText = document.getElementById('winnerBadgeText').value.trim();
    const citation = document.getElementById('winnerCitationText').value.trim();

    const btn = document.getElementById('btnSaveWinner');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      const res = await adminFetch('/api/admin/certificate/winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId, position, certificateTitle, badgeText, citation })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Failed to update certificate: ' + (data.error || 'Server error'));
        return;
      }

      closeWinnerModal();
      await loadCertificatesTab();
      alert('Certificate credential updated successfully!');
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Issue Award & Update Certificate'; }
    }
  };

  // ── Init ──────────────────────────────────────────────────────────────────────
  checkSession();

})();
