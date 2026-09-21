// Offstage Creators — Registration Status, Verification Tracker & Ticket Pass
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const regId = params.get('id');

  // DOM Elements
  const stateVerification = document.getElementById('stateVerification');
  const stateConfirmed = document.getElementById('stateConfirmed');
  const stateRejected = document.getElementById('stateRejected');
  const statePending = document.getElementById('statePending');

  // Verification State Elements
  const verifName = document.getElementById('verifName');
  const verifRegId = document.getElementById('verifRegId');
  const verifUtr = document.getElementById('verifUtr');
  const refreshStatusBtn = document.getElementById('refreshStatusBtn');

  // Confirmed Ticket Elements
  const participantName = document.getElementById('participantName');
  const ticketRegId = document.getElementById('ticketRegId');
  const ticketRegIdDisplay = document.getElementById('ticketRegIdDisplay');
  const ticketCategory = document.getElementById('ticketCategory');
  const ticketTitle = document.getElementById('ticketTitle');
  const ticketCity = document.getElementById('ticketCity');
  const qrContainer = document.getElementById('qrcode');

  // Rejected State Elements
  const rejectReasonText = document.getElementById('rejectReasonText');

  // Lookup Elements
  const lookupForm = document.getElementById('lookupForm');
  const lookupId = document.getElementById('lookupId');
  const lookupPhone = document.getElementById('lookupPhone');
  const lookupMessage = document.getElementById('lookupMessage');

  function hideAllStates() {
    if (stateVerification) stateVerification.style.display = 'none';
    if (stateConfirmed) stateConfirmed.style.display = 'none';
    if (stateRejected) stateRejected.style.display = 'none';
    if (statePending) statePending.style.display = 'none';
  }

  function renderQR(text) {
    if (!qrContainer) return;
    qrContainer.innerHTML = '';
    if (window.QRCode) {
      new window.QRCode(qrContainer, {
        text: text, // ONLY the unique registration ID (e.g. OC-OM-4892)
        width: 140,
        height: 140,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    } else {
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(text)}`;
      img.alt = 'Check-in QR';
      qrContainer.appendChild(img);
    }
  }

  function applyRegistrationData(reg) {
    hideAllStates();

    const status = reg.paymentStatus || reg.payment_status;

    if (status === 'PAID') {
      if (stateConfirmed) stateConfirmed.style.display = 'block';
      if (typeof window.trackEvent === 'function') {
        window.trackEvent('registration_confirmation_viewed');
      }
      if (participantName) participantName.textContent = reg.fullName || reg.full_name;
      const id = reg.registrationId || reg.registration_id;
      if (ticketRegId) ticketRegId.textContent = id;
      if (ticketRegIdDisplay) ticketRegIdDisplay.textContent = id;
      if (ticketCategory) ticketCategory.textContent = reg.category || 'Performer';
      if (ticketTitle) ticketTitle.textContent = reg.performanceTitle || reg.performance_title || 'Stage Performance';
      if (ticketCity) ticketCity.textContent = reg.city || 'Online';

      renderQR(id);

    } else if (status === 'PENDING_VERIFICATION') {
      if (stateVerification) stateVerification.style.display = 'block';
      if (verifName) verifName.textContent = reg.fullName || reg.full_name || 'Participant';
      if (verifRegId) verifRegId.textContent = reg.registrationId || reg.registration_id || '—';
      if (verifUtr) verifUtr.textContent = reg.transactionId || reg.transaction_id || 'Submitted via Screenshot';

    } else if (status === 'REJECTED') {
      if (stateRejected) stateRejected.style.display = 'block';
      const reason = reg.rejectionReason || reg.rejection_reason || 'Screenshot was unclear or transaction ID could not be matched with bank record.';
      if (rejectReasonText) {
        rejectReasonText.textContent = `Reason: ${reason}`;
      }

    } else {
      // PENDING
      if (statePending) statePending.style.display = 'block';
    }
  }

  async function loadRegistration(id) {
    if (!id) return;
    try {
      const res = await fetch(`/api/registrations/${encodeURIComponent(id)}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.registration) {
        hideAllStates();
        if (statePending) {
          statePending.style.display = 'block';
          const title = statePending.querySelector('h1');
          if (title) title.textContent = 'Registration Not Found';
        }
        return;
      }

      applyRegistrationData(data.registration);

    } catch (err) {
      console.error('Error fetching registration status:', err);
    }
  }

  // Refresh status button
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener('click', () => {
      refreshStatusBtn.disabled = true;
      refreshStatusBtn.textContent = 'Checking Status...';
      const id = params.get('id') || (lookupId && lookupId.value.trim());
      if (id) {
        loadRegistration(id).finally(() => {
          refreshStatusBtn.disabled = false;
          refreshStatusBtn.textContent = '⟳ Refresh Verification Status';
        });
      }
    });
  }

  // Lookup Form
  if (lookupForm) {
    lookupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idVal = lookupId ? lookupId.value.trim() : '';
      const phoneVal = lookupPhone ? lookupPhone.value.trim() : '';

      if (!idVal || !phoneVal) {
        if (lookupMessage) {
          lookupMessage.style.display = 'block';
          lookupMessage.style.color = '#ff8566';
          lookupMessage.textContent = 'Please enter both your Registration ID and 10-digit Phone Number.';
        }
        return;
      }

      if (lookupMessage) {
        lookupMessage.style.display = 'block';
        lookupMessage.style.color = '#e4ad57';
        lookupMessage.textContent = 'Looking up registration status...';
      }

      try {
        const res = await fetch('/api/registrations/status-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: idVal, phone: phoneVal })
        });
        const data = await res.json();

        if (!res.ok || !data.success || !data.registration) {
          if (lookupMessage) {
            lookupMessage.style.color = '#ff8566';
            lookupMessage.textContent = data.error || 'No matching record found. Please verify details.';
          }
          return;
        }

        if (lookupMessage) {
          lookupMessage.style.display = 'none';
        }

        // Update URL and reload view
        const newUrl = `${window.location.pathname}?id=${encodeURIComponent(data.registration.registrationId)}`;
        window.history.pushState({ id: data.registration.registrationId }, '', newUrl);
        loadRegistration(data.registration.registrationId);

      } catch (err) {
        console.error('Status lookup error:', err);
        if (lookupMessage) {
          lookupMessage.style.color = '#ff8566';
          lookupMessage.textContent = 'Network error while checking status.';
        }
      }
    });
  }

  // Initial load
  if (regId) {
    if (lookupId) lookupId.value = regId;
    loadRegistration(regId);
  } else {
    // Show lookup/pending empty prompt
    if (statePending) {
      statePending.style.display = 'block';
      const heading = statePending.querySelector('h1');
      if (heading) heading.textContent = 'Check Your Registration Status';
      const desc = statePending.querySelector('p');
      if (desc) desc.textContent = 'Enter your Registration ID and phone number below to view your verification status or entry pass.';
    }
  }

  // Track any Meet link clicks anonymously
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && (link.href.includes('meet.google.com') || link.dataset.meetLink)) {
      if (typeof window.trackEvent === 'function') {
        window.trackEvent('meet_link_clicked');
      }
    }
  });

})();
