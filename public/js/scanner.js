// Offstage Creators — Event Check-in Scanner Client Logic
(function () {
  'use strict';

  let html5QrCode = null;
  let activeParticipant = null;

  const startCamBtn = document.getElementById('startCamBtn');
  const stopCamBtn = document.getElementById('stopCamBtn');
  const manualForm = document.getElementById('manualForm');
  const manualCodeInput = document.getElementById('manualCode');
  const scanFeedback = document.getElementById('scanFeedback');
  const participantCard = document.getElementById('participantCard');

  const pName = document.getElementById('pName');
  const pCategory = document.getElementById('pCategory');
  const pPaymentBadge = document.getElementById('pPaymentBadge');
  const pRegId = document.getElementById('pRegId');
  const pPhone = document.getElementById('pPhone');
  const pTitle = document.getElementById('pTitle');
  const pCheckinBadge = document.getElementById('pCheckinBadge');
  const checkinBtn = document.getElementById('checkinBtn');

  // Audio Chime Generator using Web Audio API
  function playAudioBeep(isSuccess = true) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = isSuccess ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(isSuccess ? 880 : 300, audioCtx.currentTime); // A5 or Low Warning
      if (isSuccess) {
        osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15); // E6
      }

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + (isSuccess ? 0.3 : 0.4));

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + (isSuccess ? 0.3 : 0.4));
    } catch (e) {
      console.warn('Audio feedback unavailable', e);
    }
  }

  function showFeedback(msg, isSuccess = true) {
    scanFeedback.textContent = msg;
    scanFeedback.className = isSuccess ? 'scan-feedback success' : 'scan-feedback error';
  }

  function clearFeedback() {
    scanFeedback.className = 'scan-feedback';
    scanFeedback.textContent = '';
  }

  // Lookup participant by Scanned or Typed string
  async function lookupParticipant(code) {
    if (!code || !code.trim()) return;

    clearFeedback();
    playAudioBeep(true);

    try {
      const res = await fetch('/api/scanner/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() })
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.participant) {
        participantCard.classList.remove('show');
        showFeedback(data.error || 'Unknown or invalid registration ticket.', false);
        playAudioBeep(false);
        return;
      }

      const p = data.participant;
      activeParticipant = p;

      // Populate participant details
      pName.textContent = p.fullName;
      pCategory.textContent = p.category || 'Performer';
      pRegId.textContent = p.registrationId;
      pPhone.textContent = p.phoneMasked || '••••••••';
      pTitle.textContent = p.performanceTitle || '—';

      // Payment badge
      if (p.paymentStatus === 'PAID') {
        pPaymentBadge.className = 'table-status-badge status-paid';
        pPaymentBadge.textContent = 'PAID (₹' + (p.amount || 79) + ')';
      } else if (p.paymentStatus === 'PENDING_VERIFICATION') {
        pPaymentBadge.className = 'table-status-badge status-pending-verification';
        pPaymentBadge.textContent = 'PENDING VERIFICATION';
      } else if (p.paymentStatus === 'REJECTED') {
        pPaymentBadge.className = 'table-status-badge status-rejected';
        pPaymentBadge.textContent = 'REJECTED';
      } else {
        pPaymentBadge.className = 'table-status-badge status-pending';
        pPaymentBadge.textContent = 'PENDING (₹79)';
      }

      // Check-in status badge & gating
      if (p.checkedIn) {
        const timeStr = p.checkinAt ? new Date(p.checkinAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Earlier';
        pCheckinBadge.className = 'table-status-badge status-checked';
        pCheckinBadge.textContent = 'ALREADY CHECKED IN';
        checkinBtn.disabled = true;
        checkinBtn.textContent = 'ALREADY CHECKED IN';
        checkinBtn.style.background = '#3a342d';
        showFeedback(`ALREADY CHECKED IN (at ${timeStr})`, false);
      } else if (p.paymentStatus !== 'PAID') {
        pCheckinBadge.className = 'table-status-badge status-pending';
        pCheckinBadge.textContent = 'PAYMENT NOT VERIFIED';
        checkinBtn.disabled = true;
        checkinBtn.textContent = 'PAYMENT NOT VERIFIED';
        checkinBtn.style.background = '#4a251e';
        showFeedback('PAYMENT NOT VERIFIED: Cannot check in until payment is confirmed.', false);
      } else {
        pCheckinBadge.className = 'table-status-badge';
        pCheckinBadge.style.background = 'rgba(255,255,255,0.1)';
        pCheckinBadge.textContent = 'READY FOR ENTRY';
        checkinBtn.disabled = false;
        checkinBtn.textContent = '✓ CONFIRM ENTRY & CHECK IN';
        checkinBtn.style.background = '#288c42';
        showFeedback(`Found registration for ${p.fullName}. Ready for entry.`, true);
      }

      participantCard.classList.add('show');
      participantCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
      console.error('Scanner lookup error:', err);
      showFeedback('Network error while looking up participant.', false);
    }
  }

  // Check-in button action
  checkinBtn.addEventListener('click', async () => {
    if (!activeParticipant || !activeParticipant.canCheckIn) return;

    checkinBtn.disabled = true;
    checkinBtn.textContent = 'SAVING CHECK-IN…';

    try {
      const res = await fetch('/api/scanner/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: activeParticipant.registrationId })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        playAudioBeep(true);
        activeParticipant.checkedIn = true;
        activeParticipant.canCheckIn = false;
        pCheckinBadge.className = 'table-status-badge status-checked';
        pCheckinBadge.textContent = 'CHECKED IN JUST NOW';
        checkinBtn.textContent = '✓ ENTRY RECORDED';
        checkinBtn.style.background = '#1e3825';
        showFeedback(`✓ Check-in confirmed for ${data.participantName}!`, true);
      } else {
        showFeedback(data.error || 'Check-in failed.', false);
        playAudioBeep(false);
        checkinBtn.disabled = false;
        checkinBtn.textContent = 'RETRY CHECK-IN';
      }
    } catch (err) {
      console.error('Check-in error:', err);
      showFeedback('Error recording check-in on server.', false);
      checkinBtn.disabled = false;
      checkinBtn.textContent = 'RETRY CHECK-IN';
    }
  });

  // Manual code form submission
  manualForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = manualCodeInput.value.trim();
    if (code) {
      lookupParticipant(code);
    }
  });

  // Camera QR Scanner controls
  async function startScanner() {
    if (!window.Html5Qrcode) {
      showFeedback('QR Scanner library not loaded. Please use manual lookup.', false);
      return;
    }

    try {
      html5QrCode = new window.Html5Qrcode('reader');
      startCamBtn.style.display = 'none';
      stopCamBtn.style.display = 'inline-flex';
      clearFeedback();

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          // On QR code detected
          lookupParticipant(decodedText);
        },
        () => {
          // Frame parse error ignored
        }
      );
    } catch (err) {
      console.error('Camera start error:', err);
      showFeedback('Could not access camera. Please allow camera permissions or use manual lookup.', false);
      startCamBtn.style.display = 'inline-flex';
      stopCamBtn.style.display = 'none';
    }
  }

  async function stopScanner() {
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (e) {}
      html5QrCode = null;
    }
    startCamBtn.style.display = 'inline-flex';
    stopCamBtn.style.display = 'none';
  }

  startCamBtn.addEventListener('click', startScanner);
  stopCamBtn.addEventListener('click', stopScanner);

})();
