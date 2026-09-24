// Offstage Creators — Core UI Scripts & Dynamic Event Hydration
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

    mobileDrawer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        toggleBtn.innerHTML = '☰';
      });
    });
  }

  // 2. Header elevation on scroll
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

  // 3. Dynamic Active Event Loader (Requirement 2 & 4)
  async function loadActiveEvent() {
    try {
      // Determine if a specific event is requested via URL: /event/:slug or ?event=:slug
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const isEventPath = pathParts[0] === 'event' && pathParts[1] && pathParts[1] !== 'active';
      const searchParam = new URLSearchParams(window.location.search).get('event');
      const targetSlug = isEventPath ? pathParts[1] : (searchParam || null);

      const endpoint = targetSlug
        ? `/api/events/${encodeURIComponent(targetSlug)}`
        : '/api/events/active';

      const res = await fetch(endpoint);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.event) return;

      const evt = data.event;

      // Update Document Title
      if (evt.title) {
        document.title = `${evt.title} | Offstage Creators`;
      }

      // 1. Poster & Badge
      const posterImg = document.getElementById('heroPosterImg');
      if (posterImg && evt.posterUrl) {
        posterImg.src = evt.posterUrl;
        posterImg.alt = evt.title || 'Offstage Creators Event Poster';
      }

      const posterBadge = document.getElementById('heroPosterBadge');
      if (posterBadge) {
        if (evt.status === 'event_completed') {
          posterBadge.textContent = '✓ EVENT COMPLETED';
          posterBadge.style.background = '#1b4d2e';
          posterBadge.style.color = '#7ef5a7';
          posterBadge.style.borderColor = '#2e8b57';
        } else if (evt.registrationOpen) {
          posterBadge.textContent = '● REGISTRATION OPEN';
          posterBadge.style.background = '#2a2012';
          posterBadge.style.color = '#e4ad57';
          posterBadge.style.borderColor = '#e4ad57';
        } else if (evt.status === 'registration_closed') {
          posterBadge.textContent = '✕ REGISTRATIONS CLOSED';
          posterBadge.style.background = '#2c140d';
          posterBadge.style.color = '#e26947';
          posterBadge.style.borderColor = '#e26947';
        } else if (evt.status === 'draft') {
          posterBadge.textContent = 'DRAFT / COMING SOON';
          posterBadge.style.background = '#1a1612';
          posterBadge.style.color = '#8e8477';
          posterBadge.style.borderColor = '#2a231c';
        }
      }

      // 2. Titles & Subtitle
      const heroTitle = document.getElementById('heroTitle');
      if (heroTitle && evt.title) {
        const words = evt.title.split(' ');
        if (words.length > 1) {
          heroTitle.innerHTML = `${words[0]}<br><span>${words.slice(1).join(' ')}</span>`;
        } else {
          heroTitle.textContent = evt.title;
        }
      }

      const heroQuote = document.getElementById('heroQuote');
      if (heroQuote && (evt.subtitle || evt.shortDescription)) {
        heroQuote.textContent = `“${evt.subtitle || evt.shortDescription}”`;
      }

      const heroBadgeNotice = document.getElementById('heroBadgeNotice');
      if (heroBadgeNotice) {
        if (evt.status === 'event_completed') {
          heroBadgeNotice.textContent = '✦ Event Concluded • Download official certificates & browse moments below';
        } else if (evt.registrationOpen) {
          heroBadgeNotice.textContent = `✦ Registrations Open • ₹${evt.fee} Entry • Limited Performer Slots`;
        } else {
          heroBadgeNotice.textContent = '✦ Official Offstage Creators Community Event';
        }
      }

      // 3. Meta strip
      const metaDateVal = document.getElementById('metaDateVal');
      if (metaDateVal && evt.date) {
        metaDateVal.textContent = evt.date + (evt.isCompleted ? ' (Completed)' : '');
      }

      const metaTimeVal = document.getElementById('metaTimeVal');
      if (metaTimeVal && evt.time) {
        metaTimeVal.textContent = evt.time;
      }

      const metaVenueVal = document.getElementById('metaVenueVal');
      if (metaVenueVal) {
        const venueText = evt.venue
          ? (evt.city && !evt.venue.includes(evt.city) ? `${evt.venue}, ${evt.city}` : evt.venue)
          : 'Online (Google Meet)';
        metaVenueVal.textContent = venueText;
      }

      const metaFeeVal = document.getElementById('metaFeeVal');
      if (metaFeeVal) {
        metaFeeVal.textContent = evt.isPaid ? `₹${evt.fee}` : 'FREE';
      }

      // Registration Provider Notice
      const regNoticeEl = document.getElementById('heroRegProviderNotice');
      const regNoticeTextEl = document.getElementById('heroRegProviderNoticeText');
      if (regNoticeEl && regNoticeTextEl) {
        if (evt.registrationMethodNotice && !evt.isCompleted) {
          regNoticeTextEl.textContent = evt.registrationMethodNotice;
          regNoticeEl.style.display = 'block';
        } else {
          regNoticeEl.style.display = 'none';
        }
      }

      // 4. Hero Action CTAs
      const ctaPrimary = document.getElementById('heroCtaPrimary');
      const ctaPrimaryText = document.getElementById('heroCtaPrimaryText');
      const ctaSecondary = document.getElementById('heroCtaSecondary');
      const ctaSecondaryText = document.getElementById('heroCtaSecondaryText');

      if (ctaPrimary && ctaPrimaryText) {
        ctaPrimary.removeAttribute('target');
        ctaPrimary.removeAttribute('rel');
        ctaPrimary.style.opacity = '1';

        if (evt.registrationOpen) {
          if (evt.isExternalRegistration && evt.externalRegistrationUrl) {
            ctaPrimary.href = evt.externalRegistrationUrl;
            if (evt.externalOpenNewTab !== false) {
              ctaPrimary.setAttribute('target', '_blank');
              ctaPrimary.setAttribute('rel', 'noopener noreferrer');
            }
            ctaPrimaryText.textContent = evt.registrationButtonText || 'REGISTER NOW ↗';
          } else {
            ctaPrimary.href = `/register?event=${encodeURIComponent(evt.slug)}`;
            ctaPrimaryText.textContent = evt.registrationButtonText || 'REGISTER NOW';
          }
          ctaPrimary.style.display = 'inline-flex';
        } else if (evt.isCompleted) {
          ctaPrimary.href = `/certificate?event=${encodeURIComponent(evt.slug)}`;
          ctaPrimaryText.textContent = 'DOWNLOAD CERTIFICATE';
          ctaPrimary.style.display = 'inline-flex';
        } else {
          ctaPrimary.href = `#openmic`;
          ctaPrimaryText.textContent = 'REGISTRATION CLOSED';
          ctaPrimary.style.opacity = '0.7';
        }
      }

      if (ctaSecondary && ctaSecondaryText) {
        ctaSecondary.href = `/gallery?event=${encodeURIComponent(evt.slug)}`;
        ctaSecondaryText.textContent = 'VIEW EVENT GALLERY';
      }

      // 5. Update nav bar CTA button if registration open
      const navRegBtn = document.querySelector('.nav-reg-btn');
      if (navRegBtn) {
        navRegBtn.removeAttribute('target');
        navRegBtn.removeAttribute('rel');
        if (evt.registrationOpen) {
          if (evt.isExternalRegistration && evt.externalRegistrationUrl) {
            navRegBtn.href = evt.externalRegistrationUrl;
            if (evt.externalOpenNewTab !== false) {
              navRegBtn.setAttribute('target', '_blank');
              navRegBtn.setAttribute('rel', 'noopener noreferrer');
            }
            navRegBtn.textContent = 'REGISTER ↗';
          } else {
            navRegBtn.href = `/register?event=${encodeURIComponent(evt.slug)}`;
            navRegBtn.textContent = 'REGISTER';
          }
        } else if (evt.isCompleted) {
          navRegBtn.href = `/certificate?event=${encodeURIComponent(evt.slug)}`;
          navRegBtn.textContent = 'GET CERTIFICATE';
        }
      }

      // 6. Home Gallery Preview scoped to this event
      initHomeGallery(evt.slug);

    } catch (err) {
      console.warn('[Main] Notice during event hydration:', err);
    }
  }

  loadActiveEvent();

  // 4. Dynamic Home Gallery Preview
  async function initHomeGallery(eventId = 'online-open-mic-2026') {
    const container = document.getElementById('homeGalleryContainer');
    if (!container) return;

    try {
      const url = eventId ? `/api/gallery?eventId=${encodeURIComponent(eventId)}` : '/api/gallery';
      const res = await fetch(url);
      const data = await res.json();

      if (res.ok && data.success && Array.isArray(data.images) && data.images.length > 0) {
        const previewImages = data.images.slice(0, 4);
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
        grid.style.gap = '16px';

        previewImages.forEach(img => {
          const a = document.createElement('a');
          a.href = `/gallery?event=${encodeURIComponent(eventId)}`;
          a.style.display = 'block';
          a.style.position = 'relative';
          a.style.borderRadius = '10px';
          a.style.overflow = 'hidden';
          a.style.aspectRatio = '4/3';
          a.style.border = '1px solid var(--line)';
          a.style.background = '#141210';
          a.style.transition = 'transform 0.3s ease, border-color 0.3s ease';

          a.onmouseenter = () => { a.style.transform = 'translateY(-4px)'; a.style.borderColor = '#e4ad57'; };
          a.onmouseleave = () => { a.style.transform = 'none'; a.style.borderColor = 'var(--line)'; };

          a.innerHTML = `
            <img src="${img.imageUrl}" alt="${img.caption || 'Event Moment'}" style="width:100%; height:100%; object-fit:cover; display:block;" loading="lazy">
            <div style="position:absolute; inset:0; background:linear-gradient(to top, rgba(10,8,7,0.85) 0%, transparent 60%); display:flex; align-items:flex-end; padding:12px;">
              <span style="color:#f7eee1; font-size:12.5px; font-weight:600; text-shadow:0 1px 3px rgba(0,0,0,0.8);">${img.caption || 'Event Moment'}</span>
            </div>
          `;
          grid.appendChild(a);
        });

        container.innerHTML = '';
        container.appendChild(grid);
      }
    } catch (_) {}
  }

  // 5. Delhi Show Countdown Timer
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

  // 6. Analytics
  if (typeof window.trackEvent === 'function') {
    window.trackEvent('online_open_mic_viewed');

    document.querySelectorAll('a[href*="/register"]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.trackEvent('registration_cta_clicked');
      });
    });

    const bmsBtn = document.querySelector('.bms-btn');
    if (bmsBtn) {
      bmsBtn.addEventListener('click', () => {
        window.trackEvent('delhi_event_ticket_clicked');
      });
    }
  }

})();
