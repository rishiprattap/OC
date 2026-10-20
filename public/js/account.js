/**
 * Offstage Creators — Account & Profile Controller
 * Manages Login, Account Creation, Email Verification,
 * Password Recovery, Profile Editing, and Registrations History.
 */
(function () {
  'use strict';

  // ── DOM Elements ─────────────────────────────────────────────────────────────
  const authSection = document.getElementById('authSection');
  const dashboardSection = document.getElementById('dashboardSection');
  const errorAlert = document.getElementById('errorAlert');
  const successAlert = document.getElementById('successAlert');

  // Auth Tabs & Cards
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const loginCard = document.getElementById('loginCard');
  const registerCard = document.getElementById('registerCard');
  const verifyOtpCard = document.getElementById('verifyOtpCard');
  const forgotPassCard = document.getElementById('forgotPassCard');
  const resetPassCard = document.getElementById('resetPassCard');

  // Forms
  const loginForm = document.getElementById('loginForm');
  const createAccountForm = document.getElementById('createAccountForm');
  const forgotPassForm = document.getElementById('forgotPassForm');
  const resetPassForm = document.getElementById('resetPassForm');
  const editProfileForm = document.getElementById('editProfileForm');

  // Buttons & Links
  const forgotPassLink = document.getElementById('forgotPassLink');
  const switchToRegisterBtn = document.getElementById('switchToRegisterBtn');
  const switchToLoginBtn = document.getElementById('switchToLoginBtn');
  const backToLoginFromOtpBtn = document.getElementById('backToLoginFromOtpBtn');
  const backToLoginFromForgot = document.getElementById('backToLoginFromForgot');
  const dashLogoutBtn = document.getElementById('dashLogoutBtn');
  const confirmOtpBtn = document.getElementById('confirmOtpBtn');
  const resendActOtpBtn = document.getElementById('resendActOtpBtn');

  // OTP inputs
  const actOtpDigits = [1, 2, 3, 4, 5, 6].map(i => document.getElementById('actOtp' + i));
  const verifyEmailDisplay = document.getElementById('verifyEmailDisplay');

  // Dashboard Tabs
  const tabMyRegistrationsBtn = document.getElementById('tabMyRegistrationsBtn');
  const tabMyProfileBtn = document.getElementById('tabMyProfileBtn');
  const registrationsTabContent = document.getElementById('registrationsTabContent');
  const profileTabContent = document.getElementById('profileTabContent');
  const registrationsListContainer = document.getElementById('registrationsListContainer');

  // State
  let currentUser = null;
  let pendingVerifyEmail = null;

  // ── Alerts ───────────────────────────────────────────────────────────────────
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
    successAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearAlerts() {
    if (errorAlert) errorAlert.classList.remove('show');
    if (successAlert) successAlert.classList.remove('show');
  }

  // ── Tab & Card Switching ─────────────────────────────────────────────────────
  function hideAllAuthCards() {
    [loginCard, registerCard, verifyOtpCard, forgotPassCard, resetPassCard].forEach(c => {
      if (c) c.style.display = 'none';
    });
  }

  function showLoginCard() {
    clearAlerts();
    hideAllAuthCards();
    if (loginCard) loginCard.style.display = 'block';
    if (tabLoginBtn) tabLoginBtn.classList.add('active');
    if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');
  }

  function showRegisterCard() {
    clearAlerts();
    hideAllAuthCards();
    if (registerCard) registerCard.style.display = 'block';
    if (tabRegisterBtn) tabRegisterBtn.classList.add('active');
    if (tabLoginBtn) tabLoginBtn.classList.remove('active');
  }

  function showVerifyOtpCard(email) {
    clearAlerts();
    hideAllAuthCards();
    pendingVerifyEmail = email;
    if (verifyEmailDisplay) verifyEmailDisplay.textContent = email;
    if (verifyOtpCard) verifyOtpCard.style.display = 'block';
    clearOtpInputs();
  }

  function showForgotPassCard() {
    clearAlerts();
    hideAllAuthCards();
    if (forgotPassCard) forgotPassCard.style.display = 'block';
  }

  function showResetPassCard(email, token) {
    clearAlerts();
    hideAllAuthCards();
    if (resetPassCard) resetPassCard.style.display = 'block';
  }

  // ── OTP Inputs Logic ──────────────────────────────────────────────────────────
  actOtpDigits.forEach((input, index) => {
    if (!input) return;

    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[val.length - 1] : '';

      if (e.target.value && index < 5) {
        actOtpDigits[index + 1].focus();
      }

      const allFilled = actOtpDigits.every(inp => inp && inp.value);
      if (allFilled) {
        handleVerifyOtp();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        actOtpDigits[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (pasted.length === 6) {
        pasted.split('').forEach((char, i) => {
          if (actOtpDigits[i]) actOtpDigits[i].value = char;
        });
        actOtpDigits[5].focus();
        handleVerifyOtp();
      }
    });
  });

  function getEnteredOtp() {
    return actOtpDigits.map(i => (i ? i.value : '')).join('');
  }

  function clearOtpInputs() {
    actOtpDigits.forEach(i => { if (i) i.value = ''; });
    if (actOtpDigits[0]) actOtpDigits[0].focus();
  }

  // ── Check Session ────────────────────────────────────────────────────────────
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      const data = await res.json();

      if (data.success && data.authenticated && data.user) {
        currentUser = data.user;
        renderDashboard(currentUser);
      } else {
        renderAuth();
        if (data.isBlocked) {
          showError(data.error || 'Your account has been suspended. Please contact support@offstagecreators.com for assistance.');
        }
      }
    } catch (err) {
      console.warn('[Account] Session check error:', err);
      renderAuth();
    }
  }

  function renderAuth() {
    if (dashboardSection) dashboardSection.style.display = 'none';
    if (authSection) authSection.style.display = 'block';

    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const token = params.get('token');
    const email = params.get('email');

    if (view === 'reset' && token && email) {
      showResetPassCard(email, token);
    } else if (view === 'verify' && email) {
      showVerifyOtpCard(email);
    } else if (view === 'register' || window.location.pathname === '/signup') {
      showRegisterCard();
    } else {
      showLoginCard();
    }
  }

  function renderDashboard(user) {
    if (authSection) authSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';

    const dashAvatar = document.getElementById('dashAvatar');
    const dashName = document.getElementById('dashName');
    const dashMeta = document.getElementById('dashMeta');

    const firstChar = (user.name || 'C').charAt(0).toUpperCase();
    if (dashAvatar) dashAvatar.textContent = firstChar;
    if (dashName) dashName.textContent = user.name;
    if (dashMeta) dashMeta.textContent = `${user.email} · Age: ${user.age} · City: ${user.city}`;

    // Fill Edit Profile form
    const editName = document.getElementById('editName');
    const editPhone = document.getElementById('editPhone');
    const editEmail = document.getElementById('editEmail');
    const editAge = document.getElementById('editAge');
    const editCity = document.getElementById('editCity');

    if (editName) editName.value = user.name || '';
    if (editPhone) editPhone.value = user.phone || '';
    if (editEmail) editEmail.value = user.email || '';
    if (editAge) editAge.value = user.age || '';
    if (editCity) editCity.value = user.city || '';

    loadRegistrations();
  }

  // ── Load User Registrations ──────────────────────────────────────────────────
  async function loadRegistrations() {
    if (!registrationsListContainer) return;
    registrationsListContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #8e8477;">Loading your registered events...</div>';

    try {
      const res = await fetch('/api/user/registrations', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.isBlocked) {
          renderAuth();
          showError(data.error || 'Your account has been suspended.');
          return;
        }
        registrationsListContainer.innerHTML = `<div style="text-align:center; padding:32px; color:#ff8566;">${data.error || 'Failed to load registrations.'}</div>`;
        return;
      }

      const list = data.registrations || [];

      if (list.length === 0) {
        registrationsListContainer.innerHTML = `
          <div class="form-card" style="text-align: center; padding: 48px 24px;">
            <div style="font-size: 40px; margin-bottom: 12px;">🎭</div>
            <h3 style="font-family:'Cormorant Garamond',Georgia,serif; font-size: 26px; color: #f7eee1; margin: 0 0 8px;">No Registrations Yet</h3>
            <p style="color: #8e8477; font-size: 14px; max-width: 440px; margin: 0 auto 24px;">
              Ready to take the mic? Register for our upcoming open mics and events with your saved details filled in one click.
            </p>
            <a href="/register" class="cta">
              <span>EXPLORE &amp; REGISTER NOW</span>
              <b>→</b>
            </a>
          </div>
        `;
        return;
      }

      registrationsListContainer.innerHTML = list.map(reg => {
        let badgeHtml = '';
        if (reg.displayStatus === 'CONFIRMED') {
          badgeHtml = `<span class="status-badge-confirmed">✓ Confirmed &amp; Approved</span>`;
        } else if (reg.displayStatus === 'PAYMENT_SUBMITTED') {
          badgeHtml = `<span class="status-badge-submitted">⏱ Payment Submitted — Pending Verification</span>`;
        } else if (reg.displayStatus === 'REJECTED') {
          badgeHtml = `<span class="status-badge-rejected">✕ Registration Rejected</span>`;
        } else {
          badgeHtml = `<span class="status-badge-pending">● Payment Pending</span>`;
        }

        const dateFormatted = reg.event?.date || 'Upcoming';
        const venueName = reg.event?.venue || 'Online';
        const eventTitle = reg.event?.title || reg.event?.name || 'Open Mic Event';

        return `
          <div class="registration-card">
            <div class="reg-card-header">
              <div>
                <h3 class="reg-card-title">${eventTitle}</h3>
                <div class="reg-card-meta">📅 ${dateFormatted} · 📍 ${venueName}</div>
              </div>
              <div>${badgeHtml}</div>
            </div>

            <div class="reg-card-grid">
              <div>
                <div class="reg-card-field-label">Registration ID</div>
                <div class="reg-card-field-val" style="color:#e4ad57; font-family:monospace;">${reg.registrationId}</div>
              </div>
              <div>
                <div class="reg-card-field-label">Category</div>
                <div class="reg-card-field-val">${reg.category || 'General'}</div>
              </div>
              <div>
                <div class="reg-card-field-label">Performance Title</div>
                <div class="reg-card-field-val">${reg.performanceTitle || '—'}</div>
              </div>
              <div>
                <div class="reg-card-field-label">Fee Amount</div>
                <div class="reg-card-field-val">₹${reg.amount || 79}</div>
              </div>
              ${reg.transactionId ? `
              <div>
                <div class="reg-card-field-label">Transaction ID / UTR</div>
                <div class="reg-card-field-val" style="font-family:monospace; color:#ffd078;">${reg.transactionId}</div>
              </div>
              ` : ''}
              <div>
                <div class="reg-card-field-label">Checked In</div>
                <div class="reg-card-field-val">${reg.checkedIn ? '✓ Checked In at Venue' : 'Not Checked In'}</div>
              </div>
            </div>

            <div class="reg-card-actions">
              <a href="/registration/${reg.registrationId}" class="cta" style="font-size: 12px; padding: 10px 18px;">
                <span>VIEW PASS &amp; QR CODE</span>
                <b>→</b>
              </a>
              ${reg.certificateEligible ? `
              <a href="/certificate" class="cta cta-secondary" style="font-size: 12px; padding: 10px 18px;">
                <span>DOWNLOAD CERTIFICATE</span>
                <b>★</b>
              </a>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('[Account] Load registrations error:', err);
      registrationsListContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #ff8566;">Network error loading registrations.</div>';
    }
  }

  // ── Login Form Handler ────────────────────────────────────────────────────────
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const email = (document.getElementById('loginEmail')?.value || '').trim().toLowerCase();
      const password = document.getElementById('loginPassword')?.value || '';

      if (!email) return showError('Please enter your email address.');
      if (!password) return showError('Please enter your password.');

      const submitBtn = document.getElementById('loginSubmitBtn');
      const submitText = document.getElementById('loginSubmitText');
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.textContent = 'LOGGING IN…';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          if (data.isBlocked) {
            showError(data.error || 'Your account has been suspended. Please contact support@offstagecreators.com for assistance.');
            if (submitBtn) submitBtn.disabled = false;
            if (submitText) submitText.textContent = 'LOG IN';
            return;
          }
          if (data.requiresVerification) {
            showVerifyOtpCard(data.email || email);
            showError(data.error || 'Please verify your email address to log in.');
            return;
          }
          showError(data.error || 'Invalid email or password.');
          if (submitBtn) submitBtn.disabled = false;
          if (submitText) submitText.textContent = 'LOG IN';
          return;
        }

        currentUser = data.user;
        showSuccess('Logged in successfully!');
        renderDashboard(currentUser);

      } catch (err) {
        console.error('[Account] Login error:', err);
        showError('Network error during login. Please try again.');
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'LOG IN';
      }
    });
  }

  // ── Create Account Form Handler ───────────────────────────────────────────────
  if (createAccountForm) {
    createAccountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const name = (document.getElementById('regName')?.value || '').trim();
      const phone = (document.getElementById('regPhone')?.value || '').trim().replace(/\D/g, '');
      const email = (document.getElementById('regEmail')?.value || '').trim().toLowerCase();
      const age = parseInt(document.getElementById('regAge')?.value, 10);
      const city = (document.getElementById('regCity')?.value || '').trim();
      const password = document.getElementById('regPassword')?.value || '';

      if (name.length < 2) return showError('Please enter your full name (minimum 2 characters).');
      if (phone.length < 10) return showError('Please enter a valid 10-digit WhatsApp/mobile number.');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.');
      if (isNaN(age) || age < 5 || age > 120) return showError('Please enter a valid age between 5 and 120.');
      if (city.length < 2) return showError('Please enter your city.');
      if (password.length < 6) return showError('Password must be at least 6 characters long.');

      const submitBtn = document.getElementById('createAccountSubmitBtn');
      const submitText = document.getElementById('createAccountSubmitText');
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.textContent = 'CREATING ACCOUNT…';

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, email, age, city, password })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Failed to create account. Please check your information.');
          if (submitBtn) submitBtn.disabled = false;
          if (submitText) submitText.textContent = 'CREATE ACCOUNT & VERIFY EMAIL';
          return;
        }

        // Account created, prompt for OTP
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'CREATE ACCOUNT & VERIFY EMAIL';
        showVerifyOtpCard(data.email || email);
        showSuccess(data.message || 'Verification code sent to your email.');

      } catch (err) {
        console.error('[Account] Registration error:', err);
        showError('Network error while creating account. Please try again.');
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'CREATE ACCOUNT & VERIFY EMAIL';
      }
    });
  }

  // ── Verify OTP Handler ────────────────────────────────────────────────────────
  async function handleVerifyOtp() {
    clearAlerts();
    const otp = getEnteredOtp();

    if (otp.length !== 6) {
      showError('Please enter the complete 6-digit verification code.');
      return;
    }

    if (!pendingVerifyEmail) {
      showError('Email session missing. Please try logging in again.');
      return;
    }

    if (confirmOtpBtn) confirmOtpBtn.disabled = true;
    const confirmText = document.getElementById('confirmOtpText');
    if (confirmText) confirmText.textContent = 'VERIFYING…';

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerifyEmail, otp })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showError(data.error || 'Incorrect or expired verification code.');
        if (confirmOtpBtn) confirmOtpBtn.disabled = false;
        if (confirmText) confirmText.textContent = 'VERIFY CODE & ACTIVATE ACCOUNT';
        return;
      }

      currentUser = data.user;
      showSuccess(data.message || 'Email verified successfully!');
      renderDashboard(currentUser);

    } catch (err) {
      console.error('[Account] Verify OTP error:', err);
      showError('Network error during verification. Please try again.');
      if (confirmOtpBtn) confirmOtpBtn.disabled = false;
      if (confirmText) confirmText.textContent = 'VERIFY CODE & ACTIVATE ACCOUNT';
    }
  }

  if (confirmOtpBtn) {
    confirmOtpBtn.addEventListener('click', handleVerifyOtp);
  }

  // ── Resend Account Verification OTP ──────────────────────────────────────────
  if (resendActOtpBtn) {
    resendActOtpBtn.addEventListener('click', async () => {
      if (!pendingVerifyEmail) return;
      resendActOtpBtn.disabled = true;
      resendActOtpBtn.textContent = 'Sending…';

      try {
        const res = await fetch('/api/auth/resend-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingVerifyEmail })
        });
        const data = await res.json();

        resendActOtpBtn.textContent = 'Resend Code';
        resendActOtpBtn.disabled = false;

        if (!res.ok || !data.success) {
          showError(data.error || 'Failed to resend code.');
          return;
        }

        clearOtpInputs();
        showSuccess(data.message || 'A new code has been sent to your email.');

      } catch (err) {
        resendActOtpBtn.textContent = 'Resend Code';
        resendActOtpBtn.disabled = false;
        showError('Network error resending code.');
      }
    });
  }

  // ── Forgot Password Handler ───────────────────────────────────────────────────
  if (forgotPassForm) {
    forgotPassForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const email = (document.getElementById('forgotEmail')?.value || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showError('Please enter a valid email address.');
      }

      const submitBtn = document.getElementById('forgotSubmitBtn');
      const submitText = document.getElementById('forgotSubmitText');
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.textContent = 'SENDING…';

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'SEND RESET LINK';

        showSuccess(data.message || 'If an account exists with that email address, reset instructions have been sent.');

      } catch (err) {
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'SEND RESET LINK';
        showError('Network error. Please try again.');
      }
    });
  }

  // ── Reset Password Handler (with token) ───────────────────────────────────────
  if (resetPassForm) {
    resetPassForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const newPassword = document.getElementById('newPassInput')?.value || '';
      const confirmPassword = document.getElementById('newPassConfirmInput')?.value || '';

      if (newPassword.length < 6) {
        return showError('New password must be at least 6 characters long.');
      }

      if (newPassword !== confirmPassword) {
        return showError('Passwords do not match. Please re-enter.');
      }

      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const email = params.get('email');

      if (!token || !email) {
        return showError('Reset token or email is missing. Please request a new password reset link.');
      }

      const submitBtn = document.getElementById('resetSubmitBtn');
      const submitText = document.getElementById('resetSubmitText');
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.textContent = 'UPDATING…';

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token, newPassword })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Failed to reset password.');
          if (submitBtn) submitBtn.disabled = false;
          if (submitText) submitText.textContent = 'UPDATE PASSWORD';
          return;
        }

        showSuccess(data.message || 'Password has been reset successfully! Please log in.');
        showLoginCard();

      } catch (err) {
        showError('Network error resetting password. Please try again.');
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'UPDATE PASSWORD';
      }
    });
  }

  // ── Edit Profile Handler ──────────────────────────────────────────────────────
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const name = (document.getElementById('editName')?.value || '').trim();
      const phone = (document.getElementById('editPhone')?.value || '').trim().replace(/\D/g, '');
      const age = parseInt(document.getElementById('editAge')?.value, 10);
      const city = (document.getElementById('editCity')?.value || '').trim();

      if (name.length < 2) return showError('Please enter your full name (minimum 2 characters).');
      if (phone.length < 10) return showError('Please enter a valid 10-digit phone number.');
      if (isNaN(age) || age < 5 || age > 120) return showError('Please enter a valid age between 5 and 120.');
      if (city.length < 2) return showError('Please enter your city.');

      const saveBtn = document.getElementById('saveProfileBtn');
      const saveText = document.getElementById('saveProfileText');
      if (saveBtn) saveBtn.disabled = true;
      if (saveText) saveText.textContent = 'SAVING…';

      try {
        const res = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, age, city })
        });
        const data = await res.json();

        if (saveBtn) saveBtn.disabled = false;
        if (saveText) saveText.textContent = 'SAVE CHANGES';

        if (!res.ok || !data.success) {
          if (data.isBlocked) {
            renderAuth();
            showError(data.error || 'Your account has been suspended.');
            return;
          }
          showError(data.error || 'Failed to update profile.');
          return;
        }

        currentUser = data.user;
        showSuccess('Profile details saved! Your details will be filled automatically for future events.');
        renderDashboard(currentUser);

      } catch (err) {
        if (saveBtn) saveBtn.disabled = false;
        if (saveText) saveText.textContent = 'SAVE CHANGES';
        showError('Network error updating profile.');
      }
    });
  }

  // ── Logout Handler ────────────────────────────────────────────────────────────
  if (dashLogoutBtn) {
    dashLogoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (_) {}
      currentUser = null;
      renderAuth();
      showSuccess('You have logged out.');
    });
  }

  // ── Switchers ─────────────────────────────────────────────────────────────────
  if (tabLoginBtn) tabLoginBtn.addEventListener('click', showLoginCard);
  if (tabRegisterBtn) tabRegisterBtn.addEventListener('click', showRegisterCard);
  if (switchToRegisterBtn) switchToRegisterBtn.addEventListener('click', showRegisterCard);
  if (switchToLoginBtn) switchToLoginBtn.addEventListener('click', showLoginCard);
  if (forgotPassLink) forgotPassLink.addEventListener('click', showForgotPassCard);
  if (backToLoginFromForgot) backToLoginFromForgot.addEventListener('click', showLoginCard);
  if (backToLoginFromOtpBtn) backToLoginFromOtpBtn.addEventListener('click', showLoginCard);

  // Dashboard Tab Switching
  if (tabMyRegistrationsBtn) {
    tabMyRegistrationsBtn.addEventListener('click', () => {
      tabMyRegistrationsBtn.classList.add('active');
      if (tabMyProfileBtn) tabMyProfileBtn.classList.remove('active');
      if (registrationsTabContent) registrationsTabContent.style.display = 'block';
      if (profileTabContent) profileTabContent.style.display = 'none';
      loadRegistrations();
    });
  }

  if (tabMyProfileBtn) {
    tabMyProfileBtn.addEventListener('click', () => {
      tabMyProfileBtn.classList.add('active');
      if (tabMyRegistrationsBtn) tabMyRegistrationsBtn.classList.remove('active');
      if (profileTabContent) profileTabContent.style.display = 'block';
      if (registrationsTabContent) registrationsTabContent.style.display = 'none';
    });
  }

  // Initialize
  checkSession();

})();
