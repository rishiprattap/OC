// Offstage Creators — 4-Step Performer Registration & Email OTP Verification
(function () {
  'use strict';

  // Step Indicators
  const stepIndicator1 = document.getElementById('stepIndicator1');
  const stepIndicator2 = document.getElementById('stepIndicator2');
  const stepIndicator3 = document.getElementById('stepIndicator3');
  const stepIndicator4 = document.getElementById('stepIndicator4');

  // Step Cards
  const step1Card = document.getElementById('step1Card');
  const step2Card = document.getElementById('step2Card');
  const step3Card = document.getElementById('step3Card');
  const step4Card = document.getElementById('step4Card');

  const pageHeading = document.getElementById('pageHeading');
  const pageSubheading = document.getElementById('pageSubheading');

  // Forms & Buttons
  const regForm = document.getElementById('regForm');
  const otpForm = document.getElementById('otpForm');
  const proofForm = document.getElementById('proofForm');

  const submitDetailsBtn = document.getElementById('submitDetailsBtn');
  const btnText = document.getElementById('btnText');

  const otpInput = document.getElementById('otpInput');
  const otpEmailDisplay = document.getElementById('otpEmailDisplay');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const verifyOtpBtnText = document.getElementById('verifyOtpBtnText');
  const resendOtpBtn = document.getElementById('resendOtpBtn');
  const editEmailBtn = document.getElementById('editEmailBtn');

  const copyUpiBtn = document.getElementById('copyUpiBtn');
  const upiIdText = document.getElementById('upiIdText');
  const iHavePaidBtn = document.getElementById('iHavePaidBtn');
  const backToVerifyBtn = document.getElementById('backToVerifyBtn');
  const backToQrBtn = document.getElementById('backToQrBtn');

  const displayRegId = document.getElementById('displayRegId');
  const screenshotInput = document.getElementById('screenshotInput');
  const screenshotPreview = document.getElementById('screenshotPreview');
  const submitProofBtn = document.getElementById('submitProofBtn');
  const proofBtnText = document.getElementById('proofBtnText');

  const errorAlert = document.getElementById('errorAlert');
  const successAlert = document.getElementById('successAlert');

  // State
  let activeRegistrationId = null;
  let activeEmail = null;
  let isEmailVerified = false;
  let resendTimer = null;
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
    errorAlert.textContent = msg;
    errorAlert.classList.add('show');
    successAlert.classList.remove('show');
    errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showSuccess(msg) {
    successAlert.textContent = msg;
    successAlert.classList.add('show');
    errorAlert.classList.remove('show');
  }

  function clearAlerts() {
    errorAlert.classList.remove('show');
    successAlert.classList.remove('show');
  }

  function goToStep(step) {
    clearAlerts();

    // Update Progress Bar
    if (stepIndicator1) stepIndicator1.className = 'step-indicator' + (step === 1 ? ' active' : (step > 1 ? ' completed' : ''));
    if (stepIndicator2) stepIndicator2.className = 'step-indicator' + (step === 2 ? ' active' : (step > 2 ? ' completed' : ''));
    if (stepIndicator3) stepIndicator3.className = 'step-indicator' + (step === 3 ? ' active' : (step > 3 ? ' completed' : ''));
    if (stepIndicator4) stepIndicator4.className = 'step-indicator' + (step === 4 ? ' active' : '');

    // Card Visibility
    if (step1Card) step1Card.style.display = step === 1 ? 'block' : 'none';
    if (step2Card) step2Card.style.display = step === 2 ? 'block' : 'none';
    if (step3Card) step3Card.style.display = step === 3 ? 'block' : 'none';
    if (step4Card) step4Card.style.display = step === 4 ? 'block' : 'none';

    // Headings
    if (step === 1) {
      pageHeading.innerHTML = 'Performer<br><em>Registration</em>';
      pageSubheading.textContent = 'Reserve your performance slot for the upcoming edition.';
    } else if (step === 2) {
      pageHeading.innerHTML = 'Verify Your<br><em>Email Address</em>';
      pageSubheading.textContent = 'Enter the 6-digit verification code sent to your email inbox.';
      if (otpInput) {
        setTimeout(() => otpInput.focus(), 300);
      }
    } else if (step === 3) {
      pageHeading.innerHTML = 'Scan &amp; Pay<br><em>₹79 via UPI</em>';
      pageSubheading.textContent = 'Scan the official UPI QR code below using any UPI app and pay exactly ₹79.';
    } else if (step === 4) {
      pageHeading.innerHTML = 'Upload<br><em>Payment Proof</em>';
      pageSubheading.textContent = 'Enter your transaction reference number and attach your payment screenshot.';
    }

    window.scrollTo({ top: 120, behavior: 'smooth' });
  }

  // 1. Submit Registration Details -> Generates Reg ID & Sends OTP
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const phoneInput = document.getElementById('phone');
    const cleanPhone = phoneInput.value.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      showError('Please enter a valid 10-digit WhatsApp/mobile number.');
      phoneInput.focus();
      return;
    }

    const emailVal = document.getElementById('email').value.trim();
    if (!emailVal || !emailVal.includes('@')) {
      showError('Please enter a valid email address.');
      return;
    }

    if (!document.getElementById('terms').checked) {
      showError('Please agree to the performance guidelines to continue.');
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
      instagram: document.getElementById('instagram').value.trim(),
      performanceTitle: document.getElementById('performanceTitle').value.trim(),
      performanceDescription: document.getElementById('performanceDescription').value.trim(),
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
        showError(data.error || 'Failed to create registration.');
        submitDetailsBtn.disabled = false;
        btnText.textContent = 'CONTINUE TO VERIFY EMAIL';
        return;
      }

      activeRegistrationId = data.registrationId;
      activeEmail = emailVal;
      isEmailVerified = Boolean(data.emailVerified);

      if (displayRegId) displayRegId.textContent = activeRegistrationId;
      if (otpEmailDisplay) otpEmailDisplay.textContent = activeEmail;

      submitDetailsBtn.disabled = false;
      btnText.textContent = 'CONTINUE TO VERIFY EMAIL';

      if (isEmailVerified) {
        if (typeof window.trackEvent === 'function') {
          window.trackEvent('registration_form_completed');
          window.trackEvent('payment_page_viewed');
        }
        // If somehow already verified, proceed directly to UPI Pay
        goToStep(3);
      } else {
        if (typeof window.trackEvent === 'function') {
          window.trackEvent('registration_form_completed');
          window.trackEvent('email_verification_started');
        }
        // Advance to Step 2: Email OTP Verification
        goToStep(2);
        showSuccess(`A 6-digit verification code has been dispatched to ${activeEmail}. Please check your inbox.`);
      }

    } catch (err) {
      console.error('Registration submission error:', err);
      showError('Network error connecting to registration server.');
      submitDetailsBtn.disabled = false;
      btnText.textContent = 'CONTINUE TO VERIFY EMAIL';
    }
  });

  // 2. Submit OTP for Verification
  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const code = otpInput ? otpInput.value.trim().replace(/\D/g, '') : '';
      if (!code || code.length !== 6) {
        showError('Please enter the complete 6-digit verification code.');
        if (otpInput) otpInput.focus();
        return;
      }

      verifyOtpBtn.disabled = true;
      verifyOtpBtnText.textContent = 'VERIFYING CODE…';

      try {
        const res = await fetch('/api/email/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registrationId: activeRegistrationId,
            otp: code
          })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Invalid verification code.');
          verifyOtpBtn.disabled = false;
          verifyOtpBtnText.textContent = 'VERIFY EMAIL & PROCEED';
          return;
        }

        isEmailVerified = true;
        verifyOtpBtn.disabled = false;
        verifyOtpBtnText.textContent = 'VERIFY EMAIL & PROCEED';

        if (typeof window.trackEvent === 'function') {
          window.trackEvent('email_verification_completed');
          window.trackEvent('payment_page_viewed');
        }

        showSuccess('✓ Email verified successfully! You may now complete your ₹79 UPI payment.');
        setTimeout(() => {
          goToStep(3);
        }, 500);

      } catch (err) {
        console.error('OTP verification error:', err);
        showError('Network error verifying code. Please try again.');
        verifyOtpBtn.disabled = false;
        verifyOtpBtnText.textContent = 'VERIFY EMAIL & PROCEED';
      }
    });
  }

  // 3. Resend OTP with Cooldown Timer
  if (resendOtpBtn) {
    resendOtpBtn.addEventListener('click', async () => {
      if (!activeRegistrationId) return;

      resendOtpBtn.disabled = true;
      resendOtpBtn.textContent = 'Sending code…';
      clearAlerts();

      try {
        const res = await fetch('/api/email/resend-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: activeRegistrationId })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Failed to resend code.');
          resendOtpBtn.disabled = false;
          resendOtpBtn.textContent = '⟳ Resend Code';
          return;
        }

        showSuccess(data.message || 'A new code has been sent to your email.');

        // Start 60s cooldown
        let countdown = 60;
        resendOtpBtn.disabled = true;
        resendOtpBtn.textContent = `Resend in ${countdown}s`;

        clearInterval(resendTimer);
        resendTimer = setInterval(() => {
          countdown--;
          if (countdown <= 0) {
            clearInterval(resendTimer);
            resendOtpBtn.disabled = false;
            resendOtpBtn.textContent = '⟳ Resend Code';
          } else {
            resendOtpBtn.textContent = `Resend in ${countdown}s`;
          }
        }, 1000);

      } catch (err) {
        console.error('Resend OTP error:', err);
        showError('Network error resending code.');
        resendOtpBtn.disabled = false;
        resendOtpBtn.textContent = '⟳ Resend Code';
      }
    });
  }

  if (editEmailBtn) {
    editEmailBtn.addEventListener('click', () => {
      goToStep(1);
    });
  }

  // 4. Step 3 (UPI Payment) Navigation & Copy UPI
  if (copyUpiBtn) {
    copyUpiBtn.addEventListener('click', () => {
      const upiId = upiIdText.textContent.trim();
      navigator.clipboard.writeText(upiId).then(() => {
        copyUpiBtn.textContent = 'Copied!';
        setTimeout(() => { copyUpiBtn.textContent = 'Copy'; }, 2000);
      }).catch(() => {
        copyUpiBtn.textContent = 'Copied!';
      });
    });
  }

  if (iHavePaidBtn) {
    iHavePaidBtn.addEventListener('click', () => {
      if (!isEmailVerified) {
        showError('Please verify your email address before proceeding.');
        goToStep(2);
        return;
      }
      goToStep(4);
    });
  }

  if (backToVerifyBtn) {
    backToVerifyBtn.addEventListener('click', () => {
      goToStep(2);
    });
  }

  if (backToQrBtn) {
    backToQrBtn.addEventListener('click', () => {
      goToStep(3);
    });
  }

  // 5. File Input & Image Preview
  if (screenshotInput) {
    screenshotInput.addEventListener('change', () => {
      const file = screenshotInput.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          showError('Screenshot file is too large (maximum 5MB allowed).');
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

  // 6. Submit Payment Proof (UTR + Screenshot)
  if (proofForm) {
    proofForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      if (!isEmailVerified) {
        showError('Email verification is required before submitting payment proof.');
        goToStep(2);
        return;
      }

      const utr = document.getElementById('transactionId').value.trim();
      if (!utr || utr.length < 6) {
        showError('Please enter a valid UPI Transaction ID / UTR (minimum 6 digits).');
        return;
      }

      const file = screenshotInput ? screenshotInput.files[0] : null;
      if (!file) {
        showError('Please attach a screenshot of your successful UPI payment.');
        return;
      }

      submitProofBtn.disabled = true;
      proofBtnText.textContent = 'UPLOADING PROOF…';

      const formData = new FormData();
      formData.append('registrationId', activeRegistrationId);
      formData.append('transactionId', utr);
      formData.append('screenshot', file);

      try {
        const res = await fetch('/api/payments/submit-proof', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Failed to submit payment proof.');
          submitProofBtn.disabled = false;
          proofBtnText.textContent = 'SUBMIT PAYMENT PROOF (₹79)';
          return;
        }

        showSuccess('✓ Payment proof submitted! A confirmation has been sent to your email.');
        if (typeof window.trackEvent === 'function') {
          window.trackEvent('payment_proof_submitted');
        }
        setTimeout(() => {
          window.location.href = `/registration/success?id=${encodeURIComponent(activeRegistrationId)}`;
        }, 700);

      } catch (err) {
        console.error('Proof submission error:', err);
        showError('Error uploading payment proof. Please check your connection.');
        submitProofBtn.disabled = false;
        proofBtnText.textContent = 'SUBMIT PAYMENT PROOF (₹79)';
      }
    });
  }

})();
