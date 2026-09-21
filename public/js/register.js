/**
 * Offstage Creators — Registration Flow (4 Steps)
 * Step 1: Form submission → creates registration + sends OTP
 * Step 2: OTP verification (6-digit input with countdown & resend cooldown)
 * Step 3: ₹79 UPI Payment & Screenshot Submission (UTR + screenshot file upload)
 * Step 4: Confirmed — links to /registration/:id permalink
 */
(function () {
  'use strict';

  // ── DOM Elements ─────────────────────────────────────────────────────────────
  const step1Card = document.getElementById('step1Card');
  const step2Card = document.getElementById('step2Card');
  const step3Card = document.getElementById('step3Card');
  const step4Card = document.getElementById('step4Card');

  const stepPill1 = document.getElementById('stepPill1');
  const stepPill2 = document.getElementById('stepPill2');
  const stepPill3 = document.getElementById('stepPill3');
  const stepPill4 = document.getElementById('stepPill4');

  const pageHeading = document.getElementById('pageHeading');
  const pageSubheading = document.getElementById('pageSubheading');

  const regForm = document.getElementById('regForm');
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');

  // Step 2 elements
  const otpEmailDisplay = document.getElementById('otpEmailDisplay');
  const otpDigits = [1, 2, 3, 4, 5, 6].map(i => document.getElementById('otp' + i));
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const verifyBtnText = document.getElementById('verifyBtnText');
  const resendOtpBtn = document.getElementById('resendOtpBtn');
  const resendTimerEl = document.getElementById('resendTimer');
  const otpCountdownEl = document.getElementById('otpCountdown');
  const otpTimerDiv = document.getElementById('otpTimerDiv');
  const backToFormBtn = document.getElementById('backToFormBtn');

  // Step 3 (Payment) elements
  const paymentPerformerName = document.getElementById('paymentPerformerName');
  const paymentRegIdDisplay = document.getElementById('paymentRegIdDisplay');
  const copyUpiBtn = document.getElementById('copyUpiBtn');
  const upiIdText = document.getElementById('upiIdText');
  const paymentProofForm = document.getElementById('paymentProofForm');
  const utrInput = document.getElementById('utrInput');
  const screenshotInput = document.getElementById('screenshotInput');
  const screenshotDropzone = document.getElementById('screenshotDropzone');
  const screenshotPreviewContainer = document.getElementById('screenshotPreviewContainer');
  const screenshotPreviewImg = document.getElementById('screenshotPreviewImg');
  const removeScreenshotBtn = document.getElementById('removeScreenshotBtn');
  const submitProofBtn = document.getElementById('submitProofBtn');
  const submitProofBtnText = document.getElementById('submitProofBtnText');

  // Step 4 elements
  const confirmedRegId = document.getElementById('confirmedRegId');
  const confirmedName = document.getElementById('confirmedName');
  const confirmedUtr = document.getElementById('confirmedUtr');
  const viewPassLink = document.getElementById('viewPassLink');

  const errorAlert = document.getElementById('errorAlert');
  const successAlert = document.getElementById('successAlert');

  // ── State ─────────────────────────────────────────────────────────────────────
  let activeRegistrationId = null;
  let activeEmail = null;
  let activeName = null;
  let selectedScreenshotFile = null;
  let otpExpiresAt = null;
  let otpExpiryTimer = null;
  let resendCooldownTimer = null;

  // ── Alert Helpers ─────────────────────────────────────────────────────────────
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

  // ── Step Navigation ───────────────────────────────────────────────────────────
  function goToStep(step) {
    clearAlerts();

    [step1Card, step2Card, step3Card, step4Card].forEach(el => { if (el) el.style.display = 'none'; });

    const pills = [stepPill1, stepPill2, stepPill3, stepPill4];
    pills.forEach((pill, idx) => {
      if (!pill) return;
      pill.className = 'step-pill';
      if (idx + 1 < step) pill.classList.add('done');
      else if (idx + 1 === step) pill.classList.add('active');
    });

    if (step === 1) {
      if (step1Card) step1Card.style.display = 'block';
      if (pageHeading) pageHeading.innerHTML = 'Performer<br><em>Registration</em>';
      if (pageSubheading) pageSubheading.textContent = 'Reserve your 5–7 minute performance slot. Each registered creator receives a verified participation certificate.';
    } else if (step === 2) {
      if (step2Card) step2Card.style.display = 'block';
      if (pageHeading) pageHeading.innerHTML = 'Verify Your<br><em>Email</em>';
      if (pageSubheading) pageSubheading.textContent = 'Enter the 6-digit code sent to your email to complete your registration.';
      if (otpDigits[0]) otpDigits[0].focus();
      startOTPCountdown();
      startResendCooldown(60);
    } else if (step === 3) {
      if (step3Card) step3Card.style.display = 'block';
      if (pageHeading) pageHeading.innerHTML = 'Complete Entry<br><em>₹79 Payment</em>';
      if (pageSubheading) pageSubheading.textContent = 'Scan the UPI QR code, make the payment, and upload your payment proof screenshot with the UTR number.';
      if (paymentPerformerName) paymentPerformerName.textContent = activeName || '—';
      if (paymentRegIdDisplay) paymentRegIdDisplay.textContent = activeRegistrationId || '—';
      clearTimers();
    } else if (step === 4) {
      if (step4Card) step4Card.style.display = 'block';
      if (pageHeading) pageHeading.innerHTML = 'You\'re<br><em>All Set!</em>';
      if (pageSubheading) pageSubheading.textContent = 'Your email is verified and payment proof is under review by our organizers.';
      clearTimers();
    }

    window.scrollTo({ top: 100, behavior: 'smooth' });
  }

  // ── OTP Countdown ─────────────────────────────────────────────────────────────
  function startOTPCountdown() {
    if (otpExpiryTimer) clearInterval(otpExpiryTimer);
    if (!otpExpiresAt || !otpCountdownEl) return;

    function tick() {
      const ms = new Date(otpExpiresAt).getTime() - Date.now();
      if (ms <= 0) {
        otpCountdownEl.textContent = '0:00';
        otpCountdownEl.style.color = '#e26947';
        if (otpTimerDiv) otpTimerDiv.style.color = '#e26947';
        clearInterval(otpExpiryTimer);
        return;
      }
      const totalSec = Math.floor(ms / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      otpCountdownEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    tick();
    otpExpiryTimer = setInterval(tick, 1000);
  }

  function startResendCooldown(seconds) {
    if (resendCooldownTimer) clearInterval(resendCooldownTimer);
    if (!resendOtpBtn) return;

    let remaining = seconds;
    resendOtpBtn.disabled = true;

    function tick() {
      if (remaining <= 0) {
        resendOtpBtn.disabled = false;
        if (resendTimerEl) resendTimerEl.textContent = '';
        clearInterval(resendCooldownTimer);
        return;
      }
      if (resendTimerEl) resendTimerEl.textContent = `(${remaining}s)`;
      remaining--;
    }

    tick();
    resendCooldownTimer = setInterval(tick, 1000);
  }

  function clearTimers() {
    if (otpExpiryTimer) clearInterval(otpExpiryTimer);
    if (resendCooldownTimer) clearInterval(resendCooldownTimer);
  }

  // ── OTP Inputs Logic ──────────────────────────────────────────────────────────
  otpDigits.forEach((input, index) => {
    if (!input) return;

    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[val.length - 1] : '';

      if (e.target.value && index < 5) {
        otpDigits[index + 1].focus();
      }

      const allFilled = otpDigits.every(inp => inp && inp.value);
      if (allFilled) {
        verifyOTP();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        otpDigits[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (pasted.length === 6) {
        pasted.split('').forEach((char, i) => {
          if (otpDigits[i]) otpDigits[i].value = char;
        });
        otpDigits[5].focus();
        verifyOTP();
      }
    });
  });

  function getEnteredOTP() {
    return otpDigits.map(i => (i ? i.value : '')).join('');
  }

  function clearOTPState() {
    otpDigits.forEach(i => {
      if (i) {
        i.value = '';
        i.classList.remove('error', 'success');
      }
    });
    if (otpDigits[0]) otpDigits[0].focus();
  }

  function setOTPError() {
    otpDigits.forEach(i => { if (i) i.classList.add('error'); });
  }

  function setOTPSuccess() {
    otpDigits.forEach(i => {
      if (i) {
        i.classList.remove('error');
        i.classList.add('success');
      }
    });
  }

  // ── Copy UPI ID ───────────────────────────────────────────────────────────────
  if (copyUpiBtn && upiIdText) {
    copyUpiBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(upiIdText.textContent.trim());
        const origText = copyUpiBtn.textContent;
        copyUpiBtn.textContent = 'COPIED! ✓';
        copyUpiBtn.style.background = '#6edb8c';
        copyUpiBtn.style.color = '#0d0c0a';
        setTimeout(() => {
          copyUpiBtn.textContent = origText;
          copyUpiBtn.style.background = '';
          copyUpiBtn.style.color = '';
        }, 2000);
      } catch (e) {
        // Fallback
        const range = document.createRange();
        range.selectNode(upiIdText);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        copyUpiBtn.textContent = 'COPIED! ✓';
        setTimeout(() => { copyUpiBtn.textContent = 'COPY'; }, 2000);
      }
    });
  }

  // ── Drag & Drop Screenshot Upload ─────────────────────────────────────────────
  if (screenshotDropzone && screenshotInput) {
    screenshotDropzone.addEventListener('click', () => {
      screenshotInput.click();
    });

    screenshotDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      screenshotDropzone.classList.add('dragover');
    });

    screenshotDropzone.addEventListener('dragleave', () => {
      screenshotDropzone.classList.remove('dragover');
    });

    screenshotDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      screenshotDropzone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files && files[0]) {
        handleFileSelect(files[0]);
      }
    });

    screenshotInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  function handleFileSelect(file) {
    clearAlerts();
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      showError('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('Screenshot file size must be less than 5 MB.');
      return;
    }

    selectedScreenshotFile = file;

    const reader = new FileReader();
    reader.onload = function (e) {
      if (screenshotPreviewImg) screenshotPreviewImg.src = e.target.result;
      if (screenshotDropzone) screenshotDropzone.style.display = 'none';
      if (screenshotPreviewContainer) screenshotPreviewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  if (removeScreenshotBtn) {
    removeScreenshotBtn.addEventListener('click', () => {
      selectedScreenshotFile = null;
      if (screenshotInput) screenshotInput.value = '';
      if (screenshotPreviewContainer) screenshotPreviewContainer.style.display = 'none';
      if (screenshotDropzone) screenshotDropzone.style.display = 'block';
    });
  }

  // ── Step 1: Submit Details Form ───────────────────────────────────────────────
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const fullName = (document.getElementById('fullName')?.value || '').trim();
      const phone = (document.getElementById('phone')?.value || '').trim().replace(/\D/g, '');
      const email = (document.getElementById('email')?.value || '').trim().toLowerCase();
      const city = (document.getElementById('city')?.value || '').trim();
      const category = (document.getElementById('category')?.value || '').trim();
      const instagram = (document.getElementById('instagram')?.value || '').trim().replace(/^@/, '');
      const performanceTitle = (document.getElementById('performanceTitle')?.value || '').trim();
      const performanceDescription = (document.getElementById('performanceDescription')?.value || '').trim();
      const terms = document.getElementById('terms')?.checked;

      // Validation
      if (fullName.length < 2) return showError('Please enter your full name.');
      if (phone.length < 10) return showError('Please enter a valid 10-digit WhatsApp/mobile number.');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.');
      if (city.length < 2) return showError('Please enter your city.');
      if (!category) return showError('Please select a performance category.');
      if (performanceTitle.length < 2) return showError('Please enter a title for your performance.');
      if (!terms) return showError('Please accept the performance guidelines to continue.');

      submitBtn.disabled = true;
      submitBtnText.textContent = 'CREATING REGISTRATION…';

      try {
        const res = await fetch('/api/registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, phone, email, city, category, instagram, performanceTitle, performanceDescription, terms })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          if (data.status === 'VERIFIED' || data.status === 'APPROVED') {
            showError(`A verified registration already exists for ${email}. Registration ID: ${data.registrationId}`);
          } else {
            showError(data.error || 'Failed to create registration. Please check your information.');
          }
          submitBtn.disabled = false;
          submitBtnText.textContent = 'CONTINUE — VERIFY EMAIL';
          return;
        }

        activeRegistrationId = data.registrationId;
        activeEmail = email;
        activeName = fullName;
        otpExpiresAt = data.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString();

        if (otpEmailDisplay) otpEmailDisplay.textContent = email;

        if (data.otpEmailFailed) {
          showError('Registration created but we could not send the verification email. Click "Resend Code" below.');
        }

        submitBtn.disabled = false;
        submitBtnText.textContent = 'CONTINUE — VERIFY EMAIL';
        goToStep(2);

      } catch (err) {
        console.error('[Register] Network error:', err);
        showError('Network error. Please check your connection and try again.');
        submitBtn.disabled = false;
        submitBtnText.textContent = 'CONTINUE — VERIFY EMAIL';
      }
    });
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────────
  async function verifyOTP() {
    clearAlerts();
    const otp = getEnteredOTP();

    if (otp.length < 6) {
      showError('Please enter the full 6-digit verification code.');
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyBtnText.textContent = 'VERIFYING…';

    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: activeEmail,
          registrationId: activeRegistrationId,
          otp
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setOTPError();
        if (data.reason === 'TOO_MANY_ATTEMPTS') {
          showError('Too many incorrect attempts. Please click "Resend Code" for a new OTP.');
          resendOtpBtn.disabled = false;
        } else if (data.reason === 'EXPIRED') {
          showError('Your code has expired. Please click "Resend Code" for a new OTP.');
          resendOtpBtn.disabled = false;
        } else {
          showError(data.error || 'Incorrect code. Please try again.');
        }
        verifyOtpBtn.disabled = false;
        verifyBtnText.textContent = 'VERIFY CODE';
        return;
      }

      // Success — OTP verified
      setOTPSuccess();

      // Advance directly to Step 3: ₹79 Payment & Screenshot Submission
      goToStep(3);

    } catch (err) {
      console.error('[OTP] Verify error:', err);
      showError('Network error during verification. Please try again.');
      verifyOtpBtn.disabled = false;
      verifyBtnText.textContent = 'VERIFY CODE';
    }
  }

  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', verifyOTP);
  }

  // ── Step 2: Resend OTP ────────────────────────────────────────────────────────
  if (resendOtpBtn) {
    resendOtpBtn.addEventListener('click', async () => {
      clearAlerts();
      resendOtpBtn.disabled = true;
      resendOtpBtn.textContent = 'Sending…';

      try {
        const res = await fetch('/api/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: activeEmail, registrationId: activeRegistrationId })
        });

        const data = await res.json();

        resendOtpBtn.textContent = 'Resend Code';

        if (!res.ok || !data.success) {
          if (data.secondsRemaining) {
            showError(`Please wait ${data.secondsRemaining} seconds before requesting another code.`);
            startResendCooldown(data.secondsRemaining);
          } else {
            showError(data.error || 'Failed to resend code. Please try again.');
            resendOtpBtn.disabled = false;
          }
          return;
        }

        clearOTPState();
        otpExpiresAt = data.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString();
        startOTPCountdown();
        startResendCooldown(60);
        showSuccess(`New code sent to ${activeEmail}. Check your inbox.`);

      } catch (err) {
        console.error('[OTP] Resend error:', err);
        showError('Network error while sending code. Please try again.');
        resendOtpBtn.disabled = false;
        resendOtpBtn.textContent = 'Resend Code';
      }
    });
  }

  // ── Step 3: Submit Payment Proof ──────────────────────────────────────────────
  if (paymentProofForm) {
    paymentProofForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const utr = (utrInput?.value || '').trim();

      if (!utr || utr.length < 6) {
        showError('Please enter a valid UPI Transaction ID / UTR (minimum 6 digits).');
        return;
      }

      if (!selectedScreenshotFile) {
        showError('Please upload your payment screenshot to verify payment.');
        return;
      }

      submitProofBtn.disabled = true;
      submitProofBtnText.textContent = 'UPLOADING PAYMENT PROOF…';

      try {
        const formData = new FormData();
        formData.append('registrationId', activeRegistrationId);
        formData.append('transactionId', utr);
        formData.append('screenshot', selectedScreenshotFile);

        const res = await fetch('/api/payments/submit-proof', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Failed to upload payment proof. Please try again.');
          submitProofBtn.disabled = false;
          submitProofBtnText.textContent = 'SUBMIT PAYMENT PROOF';
          return;
        }

        // Successfully submitted payment proof
        if (confirmedRegId) confirmedRegId.textContent = activeRegistrationId;
        if (confirmedName) confirmedName.textContent = activeName;
        if (confirmedUtr) confirmedUtr.textContent = utr;
        if (viewPassLink) viewPassLink.href = `/registration/${activeRegistrationId}`;

        goToStep(4);

      } catch (err) {
        console.error('[Payment Proof] Upload error:', err);
        showError('Network error uploading payment proof. Please check your connection and try again.');
        submitProofBtn.disabled = false;
        submitProofBtnText.textContent = 'SUBMIT PAYMENT PROOF';
      }
    });
  }

  // ── Back to Step 1 ────────────────────────────────────────────────────────────
  if (backToFormBtn) {
    backToFormBtn.addEventListener('click', () => {
      clearTimers();
      goToStep(1);
    });
  }

})();
