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
  const passUtrRow = document.getElementById('passUtrRow');
  const passUtr = document.getElementById('passUtr');
  const passProofStatus = document.getElementById('passProofStatus');

  const qrContainer = document.getElementById('qrContainer');
  const qrCaption = document.getElementById('qrCaption');

  // Status notice elements
  const pendingVerifNotice = document.getElementById('pendingVerifNotice');
  const verifiedNotice = document.getElementById('verifiedNotice');
  const approvedNotice = document.getElementById('approvedNotice');
  const rejectedNotice = document.getElementById('rejectedNotice');
  const rejectedReasonText = document.getElementById('rejectedReasonText');
  const performerGuidelines = document.getElementById('performerGuidelines');

  // Payment submission elements on pass page
  const paymentSubmissionBox = document.getElementById('paymentSubmissionBox');
  const passProofForm = document.getElementById('passProofForm');
  const passUtrInput = document.getElementById('passUtrInput');
  const passScreenshotInput = document.getElementById('passScreenshotInput');
  const passProofError = document.getElementById('passProofError');
  const passProofSuccess = document.getElementById('passProofSuccess');
  const passSubmitProofBtn = document.getElementById('passSubmitProofBtn');

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
    },
    REVOKED: {
      badge: '<span class="badge" style="background:rgba(226,71,71,0.2); border:1px solid #e24747; color:#ff7b7b;">✕ REGISTRATION REVOKED / CANCELLED</span>',
      heading: 'Registration Revoked',
      subheading: 'This registration has been revoked. Entry pass and privileges are cancelled.',
      statusLabel: 'Revoked/Cancelled',
      notice: 'revokedNotice'
    },
    CANCELLED: {
      badge: '<span class="badge" style="background:rgba(226,71,71,0.2); border:1px solid #e24747; color:#ff7b7b;">✕ REGISTRATION REVOKED / CANCELLED</span>',
      heading: 'Registration Cancelled',
      subheading: 'This registration has been cancelled. Entry pass and privileges are invalidated.',
      statusLabel: 'Revoked/Cancelled',
      notice: 'revokedNotice'
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

      // Payment UTR & Screenshot Status
      if (reg.transactionId) {
        if (passUtrRow) passUtrRow.style.display = 'flex';
        if (passUtr) passUtr.textContent = reg.transactionId;
        if (passProofStatus) {
          passProofStatus.innerHTML = '<span style="color:#6edb8c; font-weight:700;">✓ Screenshot Attached (Under Verification)</span>';
        }
        if (paymentSubmissionBox) paymentSubmissionBox.style.display = 'none';
      } else {
        if (passUtrRow) passUtrRow.style.display = 'none';
        if (passProofStatus) {
          passProofStatus.innerHTML = '<span style="color:#e4ad57; font-weight:700;">⚠️ Proof Not Submitted</span>';
        }
        if (status !== 'REJECTED' && paymentSubmissionBox) {
          paymentSubmissionBox.style.display = 'block';
        }
      }

      // Show status-specific notice
      const noticeId = cfg.notice;
      const revokedNoticeEl = document.getElementById('revokedNotice');
      [pendingVerifNotice, verifiedNotice, approvedNotice, rejectedNotice, revokedNoticeEl].forEach(el => {
        if (el) el.style.display = 'none';
      });
      const noticeEl = document.getElementById(noticeId);
      if (noticeEl) noticeEl.style.display = 'block';

      // Show rejection reason
      if (status === 'REJECTED' && reg.rejectedReason && rejectedReasonText) {
        rejectedReasonText.textContent = ` Reason: ${reg.rejectedReason}`;
      }

      // Show revocation reason / admin notes
      if (['REVOKED', 'CANCELLED'].includes(status)) {
        const revokedReasonEl = document.getElementById('revokedReasonText');
        if (revokedReasonEl) {
          revokedReasonEl.textContent = reg.adminNotes || reg.rejectedReason || 'Approval revoked after payment verification.';
        }
        if (paymentSubmissionBox) paymentSubmissionBox.style.display = 'none';
      }

      // Show performer guidelines if approved
      if (status === 'APPROVED' && performerGuidelines) {
        performerGuidelines.style.display = 'block';
      }

      // Render QR code — strictly disabled for revoked passes
      if (['REVOKED', 'CANCELLED'].includes(status) || !reg.qrCode) {
        if (qrCaption) qrCaption.textContent = `${reg.registrationId} (INVALIDATED)`;
        if (qrContainer) {
          qrContainer.innerHTML = '<div style="color:#ff8585; font-size:11px; font-weight:700; text-align:center; padding:16px; border:1px dashed #e24747; border-radius:8px;">⛔ PASS REVOKED<br><span style="font-weight:400; opacity:0.8;">QR Code Inactive</span></div>';
        }
      } else {
        if (qrCaption) qrCaption.textContent = reg.registrationId;
        renderQR(reg.registrationId, reg.qrCode);
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

  if (passProofForm) {
    passProofForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (passProofError) passProofError.style.display = 'none';
      if (passProofSuccess) passProofSuccess.style.display = 'none';

      const utr = (passUtrInput?.value || '').trim();
      const file = passScreenshotInput?.files?.[0];

      if (!utr || utr.length < 6) {
        if (passProofError) {
          passProofError.textContent = 'Please enter a valid UPI Transaction ID / UTR (minimum 6 digits).';
          passProofError.style.display = 'block';
        }
        return;
      }

      if (!file) {
        if (passProofError) {
          passProofError.textContent = 'Please select your payment screenshot.';
          passProofError.style.display = 'block';
        }
        return;
      }

      if (passSubmitProofBtn) {
        passSubmitProofBtn.disabled = true;
        passSubmitProofBtn.textContent = 'Uploading…';
      }

      try {
        const formData = new FormData();
        formData.append('registrationId', registrationId);
        formData.append('transactionId', utr);
        formData.append('screenshot', file);

        const res = await fetch('/api/payments/submit-proof', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          if (passProofError) {
            passProofError.textContent = data.error || 'Failed to upload payment proof.';
            passProofError.style.display = 'block';
          }
          if (passSubmitProofBtn) {
            passSubmitProofBtn.disabled = false;
            passSubmitProofBtn.textContent = 'SUBMIT PAYMENT PROOF →';
          }
          return;
        }

        if (passProofSuccess) {
          passProofSuccess.textContent = 'Payment proof submitted successfully! Updating pass…';
          passProofSuccess.style.display = 'block';
        }

        setTimeout(() => {
          loadRegistration();
        }, 1200);

      } catch (err) {
        if (passProofError) {
          passProofError.textContent = 'Network error uploading proof. Please try again.';
          passProofError.style.display = 'block';
        }
        if (passSubmitProofBtn) {
          passSubmitProofBtn.disabled = false;
          passSubmitProofBtn.textContent = 'SUBMIT PAYMENT PROOF →';
        }
      }
    });
  }

  loadRegistration();

})();
