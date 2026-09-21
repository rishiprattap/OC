// Offstage Creators — Core UI Scripts
(function () {
  'use strict';

  // 1. Mobile Drawer Navigation
  const toggleBtn = document.getElementById('mobileToggle');
  const mobileDrawer = document.getElementById('mobileDrawer');

  if (toggleBtn && mobileDrawer) {
    toggleBtn.addEventListener('click', () => {
      mobileDrawer.classList.toggle('open');
      const isOpen = mobileDrawer.classList.contains('open');
      toggleBtn.innerHTML = isOpen ? '✕' : '☰';
      toggleBtn.setAttribute('aria-expanded', isOpen);
    });

    // Close on link click
    mobileDrawer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        toggleBtn.innerHTML = '☰';
      });
    });
  }

  // 2. Delhi Show Countdown Timer (Adhure Musafir — 4 October 2026, 3:30 PM IST)
  function initDelhiCountdown() {
    const daysEl = document.getElementById('cdDays');
    const hoursEl = document.getElementById('cdHours');
    const minsEl = document.getElementById('cdMins');
    const secsEl = document.getElementById('cdSecs');
    const container = document.getElementById('delhiCountdown');

    if (!container || !daysEl) return;

    const targetDate = new Date('2026-10-04T15:30:00+05:30').getTime();

    function updateTimer() {
      const now = new Date().getTime();
      const diff = targetDate - now;

      if (diff <= 0) {
        container.innerHTML = '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#e4ad57;font-weight:700;width:100%;text-align:center;padding:10px 0;">✦ SHOW IS LIVE / DOORS OPEN ✦</div>';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      daysEl.textContent = String(days).padStart(2, '0');
      hoursEl.textContent = String(hours).padStart(2, '0');
      minsEl.textContent = String(mins).padStart(2, '0');
      secsEl.textContent = String(secs).padStart(2, '0');
    }

    updateTimer();
    setInterval(updateTimer, 1000);
  }

  initDelhiCountdown();

  // 3. Header elevation on scroll
  const navHeader = document.querySelector('.nav-header');
  if (navHeader) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        navHeader.style.background = 'rgba(10, 9, 8, 0.96)';
        navHeader.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.4)';
      } else {
        navHeader.style.background = 'rgba(10, 9, 8, 0.88)';
        navHeader.style.boxShadow = 'none';
      }
    });
  }

})();
