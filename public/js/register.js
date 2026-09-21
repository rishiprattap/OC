// Offstage Creators — Streamlined Performer Registration & Direct Payment Pass Flow
(function () {
  'use strict';

  // Step Indicators
  const stepIndicator1 = document.getElementById('stepIndicator1');
  const stepIndicator2 = document.getElementById('stepIndicator2');

  // Step Cards
  const step1Card = document.getElementById('step1Card');
  const step2Card = document.getElementById('step2Card');

  const pageHeading = document.getElementById('pageHeading');
  const pageSubheading = document.getElementById('pageSubheading');

  // Step 1 Elements
  const regForm = document.getElementById('regForm');
  const submitDetailsBtn = document.getElementById('submitDetailsBtn');
  const btnText = document.getElementById('btnText');

  // Step 2 Pass Preview Elements
  const passParticipantName = document.getElementById('passParticipantName');
  const passRegId = document.getElementById('passRegId');
  const passQrcode = document.getElementById('passQrcode');
  const passQrCaption = document.getElementById('passQrCaption');

  // Step 2 UPI Payment Elements
  const copyUpiBtn = document.getElementById('copyUpiBtn');
  const upiIdText = document.getElementById('upiIdText');
  const proofForm = document.getElementById('proofForm');
  const transactionId = document.getElementById('transactionId');
  const screenshotInput = document.getElementById('screenshotInput');
  const screenshotPreview = document.getElementById('screenshotPreview');
  const dropzone = document.getElementById('dropzone');
  const submitProofBtn = document.getElementById('submitProofBtn');
  const proofBtnText = document.getElementById('proofBtnText');
  const editDetailsBtn = document.getElementById('editDetailsBtn');

  // Alerts
  const errorAlert = document.getElementById('errorAlert');
  const successAlert = document.getElementById('successAlert');

  // State
  let activeRegistrationId = null;
  let activeFullName = '';
  let formStartedTracked = false;

  // Track initial registration view
  if (typeof window.trackEvent === 'function') {
    window.trackEvent('registration_started');
  }

  if (regForm) {
    regForm.addEventListener('focusin', () => {
      if (!formStartedTracked) {
        formStartedTracked = true;
        if (typeof window.trackEvent === 'function') {
          window.trackEvent('registration_form_started');
        }
      }
    }, { once: true });
  }

  function showError(msg) {
    if (!errorAlert) return;
    errorAlert.textContent = msg;
    errorAlert.classList.add('show');
    if (successAlert) successAlert.classList.remove('show');
    errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showSuccess(msg) {
    if (!successAlert) return;
    successAlert.textContent = msg;
    successAlert.classList.add('show');
    if (errorAlert) errorAlert.classList.remove('show');
  }

  function clearAlerts() {
    if (errorAlert) errorAlert.classList.remove('show');
    if (successAlert) successAlert.classList.remove('show');
  }

  // Generate QR code using ONLY plain registration_id (no PII, no UTR)
  function renderPassQR(registrationId) {
    if (!passQrcode) return;
    passQrcode.innerHTML = '';

    const qrText = String(registrationId).trim().toUpperCase();

    if (window.QRCode) {
      new window.QRCode(passQrcode, {
        text: qrText,
        width: 130,
        height: 130,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    } else {
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrText)}`;
      img.alt = `Registration Pass QR ${qrText}`;
      img.style.width = '130px';
      img.style.height = '130px';
      passQrcode.appendChild(img);
    }
  }

  function goToStep(step) {
    clearAlerts();

    if (stepIndicator1) {
      stepIndicator1.className = 'step-indicator' + (step === 1 ? ' active' : ' completed');
    }
    if (stepIndicator2) {
      stepIndicator2.className = 'step-indicator' + (step === 2 ? ' active' : '');
    }

    if (step === 1) {
      if (step1Card) step1Card.style.display = 'block';
      if (step2Card) step2Card.style.display = 'none';
      if (pageHeading) pageHeading.innerHTML = 'Performer<br><em>Registration</em>';
      if (pageSubheading) pageSubheading.textContent = 'Reserve your performance slot for the upcoming edition. Each registered creator receives a 5-7 minute stage slot and a verified certificate.';
    } else if (step === 2) {
      if (step1Card) step1Card.style.display = 'none';
      if (step2Card) step2Card.style.display = 'block';
      if (pageHeading) pageHeading.innerHTML = 'Registration Pass &amp;<br><em>₹79 UPI Payment</em>';
      if (pageSubheading) pageSubheading.textContent = 'Your unique registration ID and pass are ready below. Pay ₹79 via UPI and submit your payment receipt.';
    }

    window.scrollTo({ top: 100, behavior: 'smooth' });
  }

  // 1. Submit Registration Form -> Creates Registration & Shows Pass + UPI Section
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const phoneInput = document.getElementById('phone');
      const cleanPhone = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
      if (cleanPhone.length < 10) {
        showError('Please enter a valid 10-digit WhatsApp/mobile number.');
        if (phoneInput) phoneInput.focus();
        return;
      }

      const emailInput = document.getElementById('email');
      const emailVal = emailInput ? emailInput.value.trim() : '';
      if (!emailVal || !emailVal.includes('@')) {
        showError('Please enter a valid email address.');
        if (emailInput) emailInput.focus();
        return;
      }

      const termsCheckbox = document.getElementById('terms');
      if (termsCheckbox && !termsCheckbox.checked) {
        showError('Please accept the performance guidelines and terms to continue.');
        return;
      }

      submitDetailsBtn.disabled = true;
      btnText.textContent = 'CREATING REGISTRATION…';

      const payload = {
        fullName: document.getElementById('fullName').value.trim(),
        phone: cleanPhone,
        email: emailVal,
        city: document.getElementById('city').value.trim(),
        category: document.getElementById('category').value,
        instagram: (document.getElementById('instagram')?.value || '').trim(),
        performanceTitle: document.getElementById('performanceTitle').value.trim(),
        performanceDescription: (document.getElementById('performanceDescription')?.value || '').trim(),
        terms: true
      };

      try {
        const res = await fetch('/api/registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Failed to create registration. Please check your information.');
          submitDetailsBtn.disabled = false;
          btnText.textContent = 'CONTINUE TO PASS & PAYMENT';
          return;
        }

        activeRegistrationId = data.registrationId;
        activeFullName = data.fullName || payload.fullName;

        // Populate pass preview
        if (passParticipantName) passParticipantName.textContent = activeFullName;
        if (passRegId) passRegId.textContent = activeRegistrationId;
        if (passQrCaption) passQrCaption.textContent = activeRegistrationId;

        // Render QR Pass with strictly registration_id
        renderPassQR(activeRegistrationId);

        // Pre-fill / reset buttons
        submitDetailsBtn.disabled = false;
        btnText.textContent = 'CONTINUE TO PASS & PAYMENT';

        // Track custom analytics (no PII)
        if (typeof window.trackEvent === 'function') {
          window.trackEvent('registration_created');
          window.trackEvent('payment_page_viewed');
        }

        // Advance to Step 2 immediately (NO OTP, NO WAIT)
        goToStep(2);
        showSuccess(`Registration ${activeRegistrationId} created! Please complete your ₹79 UPI payment below.`);

      } catch (err) {
        console.error('Registration submission error:', err);
        showError('Network error connecting to registration server. Please try again.');
        submitDetailsBtn.disabled = false;
        btnText.textContent = 'CONTINUE TO PASS & PAYMENT';
      }
    });
  }

  // 2. Return to Edit Details
  if (editDetailsBtn) {
    editDetailsBtn.addEventListener('click', () => {
      goToStep(1);
    });
  }

  // 3. Copy UPI ID Button
  if (copyUpiBtn && upiIdText) {
    copyUpiBtn.addEventListener('click', () => {
      const upiId = upiIdText.textContent.trim();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(upiId).then(() => {
          copyUpiBtn.textContent = 'Copied!';
          setTimeout(() => { copyUpiBtn.textContent = 'Copy'; }, 2000);
        }).catch(() => {
          copyUpiBtn.textContent = 'Copied!';
        });
      } else {
        copyUpiBtn.textContent = 'Copied!';
      }
    });
  }

  // 4. File Input & Image Preview
  if (screenshotInput) {
    screenshotInput.addEventListener('change', () => {
      const file = screenshotInput.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          showError('Screenshot file exceeds the 5MB size limit.');
          screenshotInput.value = '';
          if (screenshotPreview) screenshotPreview.classList.remove('show');
          return;
        }
        clearAlerts();
        if (screenshotPreview) {
          screenshotPreview.src = URL.createObjectURL(file);
          screenshotPreview.classList.add('show');
        }
      } else {
        if (screenshotPreview) screenshotPreview.classList.remove('show');
      }
    });
  }

  // 5. Submit Payment Proof (UTR + Screenshot)
  if (proofForm) {
    proofForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      if (!activeRegistrationId) {
        showError('No active registration found. Please complete Step 1 first.');
        goToStep(1);
        return;
      }

      const utrVal = transactionId ? transactionId.value.trim() : '';
      if (!utrVal || utrVal.length < 6) {
        showError('Please enter a valid UPI Transaction ID / UTR (minimum 6 digits).');
        if (transactionId) transactionId.focus();
        return;
      }

      const file = screenshotInput ? screenshotInput.files[0] : null;
      if (!file) {
        showError('Please attach a screenshot of your ₹79 UPI payment.');
        return;
      }

      submitProofBtn.disabled = true;
      proofBtnText.textContent = 'UPLOADING PROOF…';

      const formData = new FormData();
      formData.append('registrationId', activeRegistrationId);
      formData.append('transactionId', utrVal);
      formData.append('screenshot', file);

      try {
        const res = await fetch('/api/payments/submit-proof', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Failed to submit payment proof. Please try again.');
          submitProofBtn.disabled = false;
          proofBtnText.textContent = 'SUBMIT PAYMENT PROOF (₹79)';
          return;
        }

        // Track custom analytics (no PII)
        if (typeof window.trackEvent === 'function') {
          window.trackEvent('payment_proof_submitted');
        }

        showSuccess('✓ Payment proof submitted! Redirecting to your pass status page...');
        setTimeout(() => {
          window.location.href = `/registration/success?id=${encodeURIComponent(activeRegistrationId)}`;
        }, 500);

      } catch (err) {
        console.error('Payment proof submission error:', err);
        showError('Network error uploading payment proof. Please check your internet connection.');
        submitProofBtn.disabled = false;
        proofBtnText.textContent = 'SUBMIT PAYMENT PROOF (₹79)';
      }
    });
  }

})();
