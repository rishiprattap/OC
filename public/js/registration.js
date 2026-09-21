/**
 * Offstage Creators — Registration Permalink Page (/registration/:id)
 * Loads registration data from API, shows status, renders QR code.
 * Works correctly on page refresh — no client-only state.
 */
(function () {
  'use strict';

  // Extract registration ID from URL path: /registration/OC-OM-1234ABCD
  const pathParts = window.location.pathname.split('/');
  const registrationId = pathParts[pathParts.length - 1]?.trim().toUpperCase();

  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const errorMessage = document.getElementById('errorMessage');
  const registrationContent = document.getElementById('registrationContent');

  const statusBadgeContainer = document.getElementById('statusBadgeContainer');
  const regHeading = document.getElementById('regHeading');
  const regSubheading = document.getElementById('regSubheading');
  const passBadge = document.getElementById('passBadge');

  const passName = document.getElementById('passName');
  const passRegId = document.getElementById('passRegId');
  const passCategory = document.getElementById('passCategory');
  const passTitleRow = document.getElementById('passTitleRow');
  const passTitle = document.getElementById('passTitle');
  const passCity = document.getElementById('passCity');
  const passDateTime = document.getElementById('passDateTime');
  const passStatusLabel = document.getElementById('passStatusLabel');

  const qrContainer = document.getElementById('qrContainer');
  const qrCaption = document.getElementById('qrCaption');

  // Status notice elements
  const pendingVerifNotice = document.getElementById('pendingVerifNotice');
  const verifiedNotice = document.getElementById('verifiedNotice');
  const approvedNotice = document.getElementById('approvedNotice');
  const rejectedNotice = document.getElementById('rejectedNotice');
  const rejectedReasonText = document.getElementById('rejectedReasonText');
  const performerGuidelines = document.getElementById('performerGuidelines');

  function showError(msg) {
    if (loadingState) loadingState.style.display = 'none';
    if (registrationContent) registrationContent.style.display = 'none';
    if (errorState) errorState.style.display = 'block';
    if (errorMessage) errorMessage.textContent = msg;
  }

  function renderQR(text, dataUrl) {
    if (!qrContainer) return;
    qrContainer.innerHTML = '';

    if (dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = `QR Code for ${text}`;
      img.style.width = '160px';
      img.style.height = '160px';
      img.style.borderRadius = '4px';
      qrContainer.appendChild(img);
      return;
    }

    if (window.QRCode) {
      new window.QRCode(qrContainer, {
        text: text.trim().toUpperCase(),
        width: 160,
        height: 160,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    } else {
      // Fallback: use QR server API
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(text)}`;
      img.alt = `QR Code for ${text}`;
      img.style.width = '160px';
      img.style.height = '160px';
      qrContainer.appendChild(img);
    }
  }

  const STATUS_CONFIG = {
    PENDING_VERIFICATION: {
      badge: '<span class="badge" style="background:rgba(142,132,119,0.15); border:1px solid #4a4238; color:#9d9488;">⏳ PENDING EMAIL VERIFICATION</span>',
      heading: 'Registration Pending',
      subheading: 'Please verify your email to complete your registration.',
      statusLabel: 'Pending Verification',
      notice: 'pendingVerifNotice'
    },
    VERIFIED: {
      badge: '<span class="badge badge-gold">✓ REGISTERED — PENDING APPROVAL</span>',
      heading: 'Registration Submitted',
      subheading: 'Your email is verified. The organizers will review and approve your registration.',
      statusLabel: 'Verified — Pending Approval',
      notice: 'verifiedNotice'
    },
    APPROVED: {
      badge: '<span class="badge badge-live">✓ APPROVED — ENTRY CONFIRMED</span>',
      heading: 'Registration Confirmed!',
      subheading: 'Your registration has been approved. See you on stage!',
      statusLabel: 'Approved',
      notice: 'approvedNotice'
    },
    REJECTED: {
      badge: '<span class="badge" style="background:rgba(226,105,71,0.15); border:1px solid #e26947; color:#ff8566;">✕ REGISTRATION REJECTED</span>',
      heading: 'Registration Not Approved',
      subheading: 'Your registration was not approved. Please see the notice below.',
      statusLabel: 'Rejected',
      notice: 'rejectedNotice'
    }
  };

  async function loadRegistration() {
    if (!registrationId || registrationId === 'REGISTRATION') {
      showError('No registration ID found in URL. Please check the link.');
      return;
    }

    try {
      const res = await fetch(`/api/registrations/${encodeURIComponent(registrationId)}`);

      if (res.status === 404) {
        showError(`Registration "${registrationId}" was not found. Please check the ID or contact the organizers.`);
        return;
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        showError(data.error || 'Failed to load registration. Please try refreshing.');
        return;
      }

      const reg = data.registration;
      const status = reg.status || 'PENDING_VERIFICATION';
      const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['PENDING_VERIFICATION'];

      // Populate status elements
      if (statusBadgeContainer) statusBadgeContainer.innerHTML = cfg.badge;
      if (passBadge) passBadge.innerHTML = cfg.badge;
      if (regHeading) regHeading.textContent = cfg.heading;
      if (regSubheading) regSubheading.textContent = cfg.subheading;

      // Populate details
      if (passName) passName.textContent = reg.fullName;
      if (passRegId) passRegId.textContent = reg.registrationId;
      if (passCategory) passCategory.textContent = reg.category;
      if (passCity) passCity.textContent = reg.city || '—';
      if (passDateTime) passDateTime.textContent = `${reg.event.date} · ${reg.event.time}`;
      if (passStatusLabel) passStatusLabel.textContent = cfg.statusLabel;

      if (reg.performanceTitle) {
        if (passTitle) passTitle.textContent = reg.performanceTitle;
        if (passTitleRow) passTitleRow.style.display = 'flex';
      }

      // Show status-specific notice
      const noticeId = cfg.notice;
      [pendingVerifNotice, verifiedNotice, approvedNotice, rejectedNotice].forEach(el => {
        if (el) el.style.display = 'none';
      });
      const noticeEl = document.getElementById(noticeId);
      if (noticeEl) noticeEl.style.display = 'block';

      // Show rejection reason
      if (status === 'REJECTED' && reg.rejectedReason && rejectedReasonText) {
        rejectedReasonText.textContent = ` Reason: ${reg.rejectedReason}`;
      }

      // Show performer guidelines if approved
      if (status === 'APPROVED' && performerGuidelines) {
        performerGuidelines.style.display = 'block';
      }

      // Render QR code — always uses registration ID (never PII)
      if (qrCaption) qrCaption.textContent = reg.registrationId;

      if (reg.qrCode) {
        renderQR(reg.registrationId, reg.qrCode);
      } else {
        // QRCode lib may still be loading via defer
        function tryRenderQR() {
          if (window.QRCode) {
            renderQR(reg.registrationId);
          } else {
            setTimeout(tryRenderQR, 100);
          }
        }
        tryRenderQR();
      }

      // Update page title
      document.title = `${reg.fullName} — ${reg.registrationId} | Offstage Creators`;

      // Show content
      if (loadingState) loadingState.style.display = 'none';
      if (registrationContent) registrationContent.style.display = 'block';

    } catch (err) {
      console.error('[Registration] Load error:', err);
      showError('Network error loading registration. Please check your connection and try refreshing.');
    }
  }

  loadRegistration();

})();
