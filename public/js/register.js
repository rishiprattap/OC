/**
 * Offstage Creators — Registration Flow
 * Step 1: Form submission → creates registration + sends OTP
 * Step 2: OTP verification (6-digit input with resend cooldown)
 * Step 3: Confirmed — links to /registration/:id
 */
(function () {
  'use strict';

  // ── DOM Elements ─────────────────────────────────────────────────────────────
  const step1Card = document.getElementById('step1Card');
  const step2Card = document.getElementById('step2Card');
  const step3Card = document.getElementById('step3Card');

  const stepPill1 = document.getElementById('stepPill1');
  const stepPill2 = document.getElementById('stepPill2');
  const stepPill3 = document.getElementById('stepPill3');

  const pageHeading = document.getElementById('pageHeading');
  const pageSubheading = document.getElementById('pageSubheading');

  const regForm = document.getElementById('regForm');
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');

  const otpEmailDisplay = document.getElementById('otpEmailDisplay');
  const otpDigits = [1, 2, 3, 4, 5, 6].map(i => document.getElementById('otp' + i));

  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const verifyBtnText = document.getElementById('verifyBtnText');
  const resendOtpBtn = document.getElementById('resendOtpBtn');
  const resendTimerEl = document.getElementById('resendTimer');
  const otpCountdownEl = document.getElementById('otpCountdown');
  const otpTimerDiv = document.getElementById('otpTimerDiv');
  const backToFormBtn = document.getElementById('backToFormBtn');

  const confirmedRegId = document.getElementById('confirmedRegId');
  const confirmedName = document.getElementById('confirmedName');
  const viewPassLink = document.getElementById('viewPassLink');

  const errorAlert = document.getElementById('errorAlert');
  const successAlert = document.getElementById('successAlert');

  // ── State ─────────────────────────────────────────────────────────────────────
  let activeRegistrationId = null;
  let activeEmail = null;
  let activeName = null;
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

    [step1Card, step2Card, step3Card].forEach(el => { if (el) el.style.display = 'none'; });

    const pills = [stepPill1, stepPill2, stepPill3];
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
      if (pageHeading) pageHeading.innerHTML = 'You\'re<br><em>Registered!</em>';
      if (pageSubheading) pageSubheading.textContent = 'Your email is verified and registration is confirmed.';
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
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      otpCountdownEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    tick();
    otpExpiryTimer = setInterval(tick, 1000);
  }

  // ── Resend Cooldown ───────────────────────────────────────────────────────────
  function startResendCooldown(seconds) {
    if (resendCooldownTimer) clearInterval(resendCooldownTimer);
    if (!resendOtpBtn) return;

    let remaining = seconds;
    resendOtpBtn.disabled = true;

    function tick() {
      if (remaining <= 0) {
        clearInterval(resendCooldownTimer);
        resendOtpBtn.disabled = false;
        if (resendTimerEl) resendTimerEl.textContent = '';
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

  // ── OTP Input Magic ───────────────────────────────────────────────────────────
  otpDigits.forEach((input, idx) => {
    if (!input) return;

    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[0] : '';
      if (val && idx < otpDigits.length - 1) otpDigits[idx + 1].focus();
      e.target.classList.toggle('filled', Boolean(val));
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        otpDigits[idx - 1].focus();
        otpDigits[idx - 1].value = '';
        otpDigits[idx - 1].classList.remove('filled');
      }
      if (e.key === 'ArrowLeft' && idx > 0) otpDigits[idx - 1].focus();
      if (e.key === 'ArrowRight' && idx < otpDigits.length - 1) otpDigits[idx + 1].focus();
      // Auto submit on last digit
      if (e.key >= '0' && e.key <= '9' && idx === otpDigits.length - 1 && e.target.value) {
        setTimeout(() => verifyOTP(), 100);
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      otpDigits.forEach((d, i) => {
        d.value = pasted[i] || '';
        d.classList.toggle('filled', Boolean(pasted[i]));
      });
      const lastFilled = Math.min(pasted.length, otpDigits.length) - 1;
      if (lastFilled >= 0) otpDigits[lastFilled].focus();
      if (pasted.length >= 6) setTimeout(() => verifyOTP(), 100);
    });
  });

  function getOTPValue() {
    return otpDigits.map(d => (d ? d.value : '')).join('');
  }

  function setOTPError() {
    otpDigits.forEach(d => { if (d) { d.classList.add('error'); d.classList.remove('success', 'filled'); } });
  }

  function setOTPSuccess() {
    otpDigits.forEach(d => { if (d) { d.classList.add('success'); d.classList.remove('error'); } });
  }

  function clearOTPState() {
    otpDigits.forEach(d => { if (d) { d.value = ''; d.className = 'otp-digit'; } });
  }

  // ── Step 1: Submit Registration Form ─────────────────────────────────────────
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const fullName = document.getElementById('fullName')?.value.trim() || '';
      const phone = (document.getElementById('phone')?.value || '').replace(/\D/g, '');
      const email = document.getElementById('email')?.value.trim() || '';
      const city = document.getElementById('city')?.value.trim() || '';
      const category = document.getElementById('category')?.value || '';
      const instagram = document.getElementById('instagram')?.value.trim() || '';
      const performanceTitle = document.getElementById('performanceTitle')?.value.trim() || '';
      const performanceDescription = document.getElementById('performanceDescription')?.value.trim() || '';
      const terms = document.getElementById('terms')?.checked || false;

      if (fullName.length < 2) return showError('Please enter your full name (minimum 2 characters).');
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
    const otp = getOTPValue();

    if (otp.length !== 6) {
      showError('Please enter the complete 6-digit code.');
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
        const reason = data.reason;
        if (reason === 'EXPIRED') {
          showError('Your code has expired. Please click "Resend Code" to get a new one.');
          clearOTPState();
        } else if (reason === 'TOO_MANY_ATTEMPTS') {
          showError('Too many incorrect attempts. Please click "Resend Code" to get a new code.');
          clearOTPState();
        } else {
          showError(data.error || 'Incorrect code. Please try again.');
        }
        verifyOtpBtn.disabled = false;
        verifyBtnText.textContent = 'VERIFY CODE';
        return;
      }

      // Success
      setOTPSuccess();

      if (confirmedRegId) confirmedRegId.textContent = activeRegistrationId;
      if (confirmedName) confirmedName.textContent = activeName;
      if (viewPassLink) viewPassLink.href = `/registration/${activeRegistrationId}`;

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

  // ── Resend OTP ────────────────────────────────────────────────────────────────
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
        if (otpDigits[0]) otpDigits[0].focus();
        showSuccess('A new verification code has been sent to your email.');

      } catch (err) {
        console.error('[OTP] Resend error:', err);
        showError('Network error. Please try again.');
        resendOtpBtn.disabled = false;
        resendOtpBtn.textContent = 'Resend Code';
      }
    });
  }

  // ── Back to Form ──────────────────────────────────────────────────────────────
  if (backToFormBtn) {
    backToFormBtn.addEventListener('click', () => {
      clearTimers();
      clearOTPState();
      activeRegistrationId = null;
      activeEmail = null;
      goToStep(1);
    });
  }

})();
