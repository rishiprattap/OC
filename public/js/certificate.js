// Offstage Creators — Official Participation Certificate Engine
(function () {
  'use strict';

  const tabNamePhone = document.getElementById('tabNamePhone');
  const tabRegId = document.getElementById('tabRegId');
  const groupNamePhone = document.getElementById('groupNamePhone');
  const groupRegId = document.getElementById('groupRegId');

  const form = document.getElementById('certForm');
  const verifyBtn = document.getElementById('verifyBtn');
  const certError = document.getElementById('certError');
  const certSuccess = document.getElementById('certSuccess');

  const previewBox = document.getElementById('previewBox');
  const downloadsBar = document.getElementById('downloadsBar');
  const canvas = document.getElementById('certCanvas');
  const ctx = canvas.getContext('2d');

  const printBtn = document.getElementById('printBtn');
  const pngBtn = document.getElementById('pngBtn');
  const pdfBtn = document.getElementById('pdfBtn');

  // Active verified certificate state
  let currentCertData = {
    verifiedName: '',
    certificateId: '',
    registrationId: '',
    event: 'ONLINE OPEN MIC 2026',
    category: 'Performer',
    performanceTitle: null,
    date: '23 September 2026',
    verificationUrl: '',
    qrCode: null
  };

  // Track page view
  if (typeof window.trackEvent === 'function') {
    window.trackEvent('certificate_page_viewed');
  }

  // Tab switching
  tabNamePhone.addEventListener('click', () => {
    tabNamePhone.classList.add('active');
    tabRegId.classList.remove('active');
    groupNamePhone.style.display = 'block';
    groupRegId.style.display = 'none';
  });

  tabRegId.addEventListener('click', () => {
    tabRegId.classList.add('active');
    tabNamePhone.classList.remove('active');
    groupNamePhone.style.display = 'none';
    groupRegId.style.display = 'block';
  });

  function showError(msg) {
    certError.textContent = msg;
    certError.classList.add('show');
    certSuccess.classList.remove('show');
    previewBox.classList.remove('show');
    downloadsBar.classList.remove('show');
    verifyBtn.disabled = false;
    verifyBtn.textContent = '✓  VERIFY & GENERATE CERTIFICATE';
  }

  function showSuccess(msg) {
    certSuccess.textContent = msg;
    certSuccess.classList.add('show');
    certError.classList.remove('show');
    verifyBtn.disabled = false;
    verifyBtn.textContent = '✓  VERIFY & GENERATE CERTIFICATE';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Canvas Helper: Draw Scalloped Gold Medallion / Official Seal
  // ─────────────────────────────────────────────────────────────────────────────
  function drawGoldSeal(ctx, cx, cy, radius, isWinner = false) {
    ctx.save();

    // Seal Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;

    // Draw 24-point scalloped starburst rosette
    const points = 24;
    const innerRadius = radius * 0.90;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = (i % 2 === 0) ? radius : innerRadius;
      const angle = (i * Math.PI) / points;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Metallic Gold Gradient
    const goldGrad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
    goldGrad.addColorStop(0, '#fff4d0');
    goldGrad.addColorStop(0.25, '#f4d27c');
    goldGrad.addColorStop(0.55, '#d4a23f');
    goldGrad.addColorStop(0.85, '#a37121');
    goldGrad.addColorStop(1, '#784d0f');

    ctx.fillStyle = goldGrad;
    ctx.fill();

    // Rosette Border
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff2c6';
    ctx.stroke();

    // Concentric Inner Gold Ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
    ctx.strokeStyle = '#7c5113';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Dotted Ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.77, 0, Math.PI * 2);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = '#fff5cf';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.setLineDash([]);

    // Solid Inner Medallion Center
    const innerCenterGrad = ctx.createRadialGradient(cx, cy - radius * 0.2, 5, cx, cy, radius * 0.72);
    innerCenterGrad.addColorStop(0, '#fcedb9');
    innerCenterGrad.addColorStop(0.6, '#ce9b38');
    innerCenterGrad.addColorStop(1, '#8f5e14');
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = innerCenterGrad;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#5a3809';
    ctx.stroke();

    // Text in Seal
    ctx.fillStyle = '#422704';
    ctx.font = '800 10px "DM Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OFFSTAGE CREATORS', cx, cy - 23);

    // 5 Center Stars
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px "DM Sans", Arial, sans-serif';
    ctx.fillText('★ ★ ★ ★ ★', cx, cy - 8);

    ctx.fillStyle = '#3a2203';
    ctx.font = '800 12px "Cinzel", "DM Sans", serif';
    ctx.fillText(isWinner ? 'WINNER' : 'OFFICIAL', cx, cy + 9);

    ctx.font = '700 9.5px "DM Sans", Arial, sans-serif';
    ctx.fillStyle = '#4e3108';
    ctx.fillText(isWinner ? '1ST PLACE • EXCELLENCE' : 'SEAL OF EXCELLENCE', cx, cy + 24);

    // Notched Ribbon Tails at bottom of the seal
    const ribbonY = cy + radius - 2;
    ctx.fillStyle = '#8f5e14';
    ctx.beginPath();
    // Left ribbon
    ctx.moveTo(cx - 24, ribbonY);
    ctx.lineTo(cx - 40, ribbonY + 36);
    ctx.lineTo(cx - 24, ribbonY + 28);
    ctx.lineTo(cx - 10, ribbonY + 36);
    ctx.lineTo(cx - 10, ribbonY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f8e09e';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Right ribbon
    ctx.beginPath();
    ctx.moveTo(cx + 10, ribbonY);
    ctx.lineTo(cx + 10, ribbonY + 36);
    ctx.lineTo(cx + 24, ribbonY + 28);
    ctx.lineTo(cx + 40, ribbonY + 36);
    ctx.lineTo(cx + 24, ribbonY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Canvas Helper: Draw Ornate Art Deco Corner Flourishes
  // ─────────────────────────────────────────────────────────────────────────────
  function drawCornerOrnaments(ctx, x, y, dx, dy) {
    ctx.save();
    ctx.strokeStyle = '#b88c3a';
    ctx.fillStyle = '#b88c3a';
    ctx.lineWidth = 2;

    // Corner L-Bracket
    const length = 56;
    ctx.beginPath();
    ctx.moveTo(x, y + dy * length);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * length, y);
    ctx.stroke();

    // Inner secondary accent
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#d7b469';
    ctx.beginPath();
    ctx.moveTo(x + dx * 10, y + dy * (length - 12));
    ctx.lineTo(x + dx * 10, y + dy * 10);
    ctx.lineTo(x + dx * (length - 12), y + dy * 10);
    ctx.stroke();

    // Diagonal Accent Line
    ctx.beginPath();
    ctx.moveTo(x + dx * 28, y + dy * 8);
    ctx.lineTo(x + dx * 8, y + dy * 28);
    ctx.stroke();

    // Corner Diamond Stud
    const diamondSize = 6;
    const cx = x + dx * 18;
    const cy = y + dy * 18;
    ctx.beginPath();
    ctx.moveTo(cx, cy - diamondSize);
    ctx.lineTo(cx + diamondSize, cy);
    ctx.lineTo(cx, cy + diamondSize);
    ctx.lineTo(cx - diamondSize, cy);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main Rendering Engine: Draw High-Resolution Professional Certificate
  // ─────────────────────────────────────────────────────────────────────────────
  function drawCertificate(certData) {
    currentCertData = Object.assign({}, currentCertData, certData);

    const name = currentCertData.verifiedName || 'Participant';
    const eventTitle = currentCertData.event || 'ONLINE OPEN MIC 2026';
    const certId = currentCertData.certificateId || currentCertData.registrationId || 'OC-OM-CERT';
    const category = currentCertData.category || 'Performer';
    const dateStr = currentCertData.date || '23 September 2026';

    const W = canvas.width;  // 1600
    const H = canvas.height; // 1131

    // 1. Base Multi-tone Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#fefdfa');
    bgGrad.addColorStop(0.5, '#f8f4ec');
    bgGrad.addColorStop(1, '#efe7d8');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Subtle Security Guilloche / Linen Pattern
    ctx.save();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(195, 160, 95, 0.04)';
    const step = 28;
    for (let x = -H; x < W + H; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
    }
    for (let x = W + H; x > -H; x -= step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - H, H);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Triple-Layered Border System
    // Outer Deep Frame
    ctx.strokeStyle = '#181410';
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, W - 64, H - 64);

    // Primary Metallic Champagne Gold Frame
    const goldBorder = ctx.createLinearGradient(44, 44, W - 44, H - 44);
    goldBorder.addColorStop(0, '#9e7328');
    goldBorder.addColorStop(0.3, '#dfbe75');
    goldBorder.addColorStop(0.7, '#cba353');
    goldBorder.addColorStop(1, '#8e641e');
    ctx.strokeStyle = goldBorder;
    ctx.lineWidth = 3;
    ctx.strokeRect(42, 42, W - 84, H - 84);

    // Fine Gold Hairline Inlay
    ctx.strokeStyle = '#dfc384';
    ctx.lineWidth = 1;
    ctx.strokeRect(50, 50, W - 100, H - 100);

    // Inner Framing Line
    ctx.strokeStyle = 'rgba(35, 28, 20, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(62, 62, W - 124, H - 124);

    // 4. Four Corner Ornaments
    drawCornerOrnaments(ctx, 62, 62, 1, 1);
    drawCornerOrnaments(ctx, W - 62, 62, -1, 1);
    drawCornerOrnaments(ctx, 62, H - 62, 1, -1);
    drawCornerOrnaments(ctx, W - 62, H - 62, -1, -1);

    // 5. Load and Draw Images (Logo & QR Code)
    const logoImg = new Image();
    const qrImg = new Image();
    let logoLoaded = false;
    let qrLoaded = false;

    function checkReadyAndRender() {
      renderAllContent(logoLoaded ? logoImg : null, qrLoaded ? qrImg : null);
    }

    logoImg.onload = () => {
      logoLoaded = true;
      checkReadyAndRender();
    };
    logoImg.onerror = () => {
      logoLoaded = false;
      checkReadyAndRender();
    };
    logoImg.src = '/assets/logo.png';

    if (currentCertData.qrCode) {
      qrImg.onload = () => {
        qrLoaded = true;
        checkReadyAndRender();
      };
      qrImg.onerror = () => {
        qrLoaded = false;
        checkReadyAndRender();
      };
      qrImg.src = currentCertData.qrCode;
    } else {
      // Fallback: Generate QR Code on client if QRCode library is present
      const verifyTargetUrl = currentCertData.verificationUrl ||
        `${window.location.origin}/certificate?regId=${encodeURIComponent(certId)}`;
      if (typeof window.QRCode === 'function') {
        const dummyDiv = document.createElement('div');
        try {
          new window.QRCode(dummyDiv, {
            text: verifyTargetUrl,
            width: 250,
            height: 250,
            correctLevel: window.QRCode.CorrectLevel.M
          });
          setTimeout(() => {
            const canvasEl = dummyDiv.querySelector('canvas');
            const imgEl = dummyDiv.querySelector('img');
            const qrSrc = canvasEl ? canvasEl.toDataURL() : (imgEl ? imgEl.src : null);
            if (qrSrc) {
              qrImg.onload = () => {
                qrLoaded = true;
                checkReadyAndRender();
              };
              qrImg.src = qrSrc;
            } else {
              checkReadyAndRender();
            }
          }, 60);
        } catch (e) {
          checkReadyAndRender();
        }
      } else {
        checkReadyAndRender();
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sub-routine: Render Vector Layout & Typography
    // ─────────────────────────────────────────────────────────────────────────
    function renderAllContent(logo, qr) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      // ── Background Center Watermark ──
      ctx.save();
      ctx.globalAlpha = 0.035;
      if (logo) {
        const wmSize = 480;
        ctx.drawImage(logo, (W - wmSize) / 2, (H - wmSize) / 2, wmSize, wmSize);
      }
      ctx.restore();

      // ── Top Header Logo & Brand Lockup ──
      const brandCenterY = 125;
      if (logo) {
        ctx.save();
        const logoR = 38;
        const logoCx = W / 2;
        const logoCy = brandCenterY;

        // Circular Logo Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;

        // White Circular Backing
        ctx.beginPath();
        ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Draw Clipped Logo
        ctx.save();
        ctx.beginPath();
        ctx.arc(logoCx, logoCy, logoR - 2, 0, Math.PI * 2);
        ctx.clip();
        const scale = Math.min((logoR * 2) / logo.width, (logoR * 2) / logo.height);
        const lw = logo.width * scale;
        const lh = logo.height * scale;
        ctx.drawImage(logo, logoCx - lw / 2, logoCy - lh / 2, lw, lh);
        ctx.restore();

        // Gold Ring around logo
        ctx.shadowColor = 'transparent';
        ctx.beginPath();
        ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
        ctx.strokeStyle = '#c59a42';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(logoCx, logoCy, logoR - 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#dfc27e';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Horizontal Ornamental Wings on Left & Right of Logo
        ctx.strokeStyle = '#c59a42';
        ctx.lineWidth = 1.5;
        // Left Wing
        ctx.beginPath();
        ctx.moveTo(logoCx - logoR - 16, logoCy);
        ctx.lineTo(logoCx - logoR - 160, logoCy);
        ctx.stroke();
        // Left Wing Diamond
        ctx.fillStyle = '#c59a42';
        ctx.beginPath();
        ctx.arc(logoCx - logoR - 160, logoCy, 3, 0, Math.PI * 2);
        ctx.fill();

        // Right Wing
        ctx.beginPath();
        ctx.moveTo(logoCx + logoR + 16, logoCy);
        ctx.lineTo(logoCx + logoR + 160, logoCy);
        ctx.stroke();
        // Right Wing Diamond
        ctx.beginPath();
        ctx.arc(logoCx + logoR + 160, logoCy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      const isWinner = Boolean(
        currentCertData.isWinner ||
        currentCertData.position === 'WINNER' ||
        currentCertData.registrationId === 'OC-OM-2440F923' ||
        (currentCertData.verifiedName && currentCertData.verifiedName.toLowerCase().includes('suhavani'))
      );

      // Brand Title
      ctx.fillStyle = '#1c1712';
      ctx.font = '800 24px "Cinzel", "DM Sans", serif';
      ctx.fillText('OFFSTAGE CREATORS', W / 2, 195);

      // Brand Subtitle
      ctx.fillStyle = '#946d29';
      ctx.font = '700 12.5px "DM Sans", Arial, sans-serif';
      ctx.fillText('WORDS   •   PEOPLE   •   PLATFORMS', W / 2, 218);

      // ── Official Recognition Kicker ──
      ctx.fillStyle = '#b38435';
      ctx.font = '700 12px "DM Sans", Arial, sans-serif';
      if (isWinner) {
        ctx.fillText('✦   OFFICIAL CREDENTIAL OF WINNING ACHIEVEMENT   ✦', W / 2, 262);
      } else {
        ctx.fillText('✦   OFFICIAL CREDENTIAL OF ACHIEVEMENT   ✦', W / 2, 264);
      }

      // ── Main Certificate Title ──
      ctx.fillStyle = '#17120c';
      ctx.font = '700 52px "Cinzel", "Cormorant Garamond", Georgia, serif';
      if (isWinner) {
        ctx.fillText('CERTIFICATE OF EXCELLENCE', W / 2, 320);

        // Thin Elegant Gold Accent Line
        ctx.strokeStyle = '#caa558';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 250, 336);
        ctx.lineTo(W / 2 + 250, 336);
        ctx.stroke();

        // Small Center Diamond
        ctx.fillStyle = '#caa558';
        ctx.beginPath();
        ctx.arc(W / 2, 336, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // ── Radiant Gold Winner Achievement Badge ──
        const badgeW = 430;
        const badgeH = 34;
        const badgeX = W / 2 - badgeW / 2;
        const badgeY = 349;
        const badgeR = 8;

        ctx.save();
        ctx.shadowColor = 'rgba(180, 130, 40, 0.28)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 3;

        // Metallic Gold Gradient Pill
        const pillGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
        pillGrad.addColorStop(0, '#8e641e');
        pillGrad.addColorStop(0.2, '#d4a23f');
        pillGrad.addColorStop(0.5, '#fff1c7');
        pillGrad.addColorStop(0.8, '#d4a23f');
        pillGrad.addColorStop(1, '#8e641e');

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeR);
        } else {
          ctx.rect(badgeX, badgeY, badgeW, badgeH);
        }
        ctx.fillStyle = pillGrad;
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#5c3a07';
        ctx.stroke();
        ctx.restore();

        // Inner fine border
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(badgeX + 2, badgeY + 2, badgeW - 4, badgeH - 4, badgeR - 2);
        } else {
          ctx.rect(badgeX + 2, badgeY + 2, badgeW - 4, badgeH - 4);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Badge Text
        ctx.fillStyle = '#3a2203';
        ctx.font = '800 13.5px "Cinzel", "DM Sans", serif';
        ctx.fillText('★   EVENT WINNER — FIRST PLACE   ★', W / 2, badgeY + 22);

      } else {
        ctx.fillText('CERTIFICATE OF PARTICIPATION', W / 2, 326);

        // Thin Elegant Title Underline
        ctx.strokeStyle = '#caa558';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 220, 342);
        ctx.lineTo(W / 2 + 220, 342);
        ctx.stroke();

        // Small Center Diamond
        ctx.fillStyle = '#caa558';
        ctx.beginPath();
        ctx.arc(W / 2, 342, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Subtitle Presentation ──
      ctx.fillStyle = '#6e6151';
      ctx.font = '600 15px "DM Sans", Arial, sans-serif';
      ctx.fillText('THIS IS PROUDLY PRESENTED TO', W / 2, isWinner ? 414 : 386);

      // ── Participant Name (The Hero Element!) ──
      // Dynamic auto-scaling ensures names of ANY length fit with elegance
      let nameFontSize = 68;
      ctx.font = `italic 700 ${nameFontSize}px "Cormorant Garamond", Georgia, serif`;
      const maxNameWidth = 1050;

      while (ctx.measureText(name).width > maxNameWidth && nameFontSize > 34) {
        nameFontSize -= 2;
        ctx.font = `italic 700 ${nameFontSize}px "Cormorant Garamond", Georgia, serif`;
      }

      const nameY = isWinner ? 478 : 474;
      ctx.save();
      ctx.fillStyle = '#16110a';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.fillText(name, W / 2, nameY);
      ctx.restore();

      // Majestic Flourish Underline below Participant Name
      const nameWidth = Math.min(Math.max(ctx.measureText(name).width + 80, 520), 1080);
      const underY = isWinner ? 498 : 496;

      ctx.save();
      const underGrad = ctx.createLinearGradient(W / 2 - nameWidth / 2, underY, W / 2 + nameWidth / 2, underY);
      underGrad.addColorStop(0, 'rgba(189, 148, 68, 0)');
      underGrad.addColorStop(0.2, 'rgba(189, 148, 68, 0.9)');
      underGrad.addColorStop(0.5, 'rgba(235, 203, 133, 1)');
      underGrad.addColorStop(0.8, 'rgba(189, 148, 68, 0.9)');
      underGrad.addColorStop(1, 'rgba(189, 148, 68, 0)');

      ctx.strokeStyle = underGrad;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(W / 2 - nameWidth / 2, underY);
      ctx.lineTo(W / 2 + nameWidth / 2, underY);
      ctx.stroke();

      // Center decorative glyph on underline
      ctx.fillStyle = '#9b7128';
      ctx.font = '12px "DM Sans", Arial, sans-serif';
      ctx.fillText(isWinner ? '★' : '◆', W / 2, underY + 4);
      ctx.restore();

      // ── Narrative Body & Event Details ──
      ctx.fillStyle = '#4c4235';
      ctx.font = '400 20px "DM Sans", Arial, sans-serif';
      if (isWinner) {
        ctx.fillText('for being declared the Event Winner (1st Place) for outstanding creative excellence in', W / 2, 552);
      } else {
        ctx.fillText('for active participation and outstanding creative expression in', W / 2, 550);
      }

      // Event Title
      ctx.fillStyle = '#926a24';
      ctx.font = '800 32px "Cinzel", "DM Sans", serif';
      ctx.fillText(eventTitle.toUpperCase(), W / 2, 600);

      // Performance Category & Title
      let catText = category ? `PERFORMANCE CATEGORY: ${category.toUpperCase()}` : 'OFFICIAL ARTIST PARTICIPANT';
      if (currentCertData.performanceTitle) {
        catText += `  •  "${currentCertData.performanceTitle.toUpperCase()}"`;
      }
      ctx.fillStyle = '#3a3024';
      ctx.font = '700 15px "DM Sans", Arial, sans-serif';
      ctx.fillText(catText, W / 2, 638);

      // Commendation
      ctx.fillStyle = '#5c5042';
      ctx.font = '400 18px "DM Sans", Arial, sans-serif';
      ctx.fillText('organized and officially recognized by Offstage Creators.', W / 2, 676);

      ctx.fillStyle = '#756857';
      ctx.font = 'italic 16.5px "DM Sans", Arial, sans-serif';
      if (isWinner) {
        ctx.fillText('In celebration of your exemplary talent, poetic brilliance, and winning performance.', W / 2, 715);
      } else {
        ctx.fillText('In appreciation of your authenticity, courage, and unique artistic voice on our stage.', W / 2, 715);
      }
      ctx.fillText('Keep creating, inspiring, and expressing without limits.', W / 2, 742);

      // ───────────────────────────────────────────────────────────────────────
      // Bottom Grid (3 Balanced Columns: Verification QR | Seal | Signatures)
      // ───────────────────────────────────────────────────────────────────────

      // ── LEFT COLUMN: QR Code & Verification Lockup ──
      const qrBoxX = 145;
      const qrBoxY = 800;
      const qrBoxSize = 136;

      // QR Protective Container
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
      ctx.restore();

      ctx.strokeStyle = '#c49b49';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);

      if (qr) {
        ctx.drawImage(qr, qrBoxX + 6, qrBoxY + 6, qrBoxSize - 12, qrBoxSize - 12);
      } else {
        // Aesthetic Placeholder if QR still loading
        ctx.fillStyle = '#1c1712';
        ctx.font = '600 11px "DM Sans", Arial, sans-serif';
        ctx.fillText('VERIFIED QR', qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize / 2);
      }

      // Metadata alongside/under QR Code
      ctx.textAlign = 'left';
      const metaX = qrBoxX + qrBoxSize + 22;
      const metaStartY = qrBoxY + 22;

      ctx.fillStyle = '#1c1712';
      ctx.font = '800 12px "DM Sans", Arial, sans-serif';
      ctx.fillText('SCAN TO VERIFY', metaX, metaStartY);

      ctx.fillStyle = '#8f6825';
      ctx.font = '700 11px "DM Sans", Arial, sans-serif';
      ctx.fillText('AUTHENTIC CREDENTIAL', metaX, metaStartY + 20);

      ctx.fillStyle = '#42372a';
      ctx.font = '700 12px "DM Sans", Arial, sans-serif';
      ctx.fillText(`ID: ${certId}`, metaX, metaStartY + 45);

      ctx.fillStyle = '#6e6150';
      ctx.font = '500 11.5px "DM Sans", Arial, sans-serif';
      ctx.fillText(`DATE: ${dateStr}`, metaX, metaStartY + 68);

      ctx.fillStyle = '#1e7b45';
      ctx.font = '700 11px "DM Sans", Arial, sans-serif';
      if (isWinner) {
        ctx.fillText('● STATUS: VERIFIED WINNER (1ST PLACE)', metaX, metaStartY + 91);
      } else {
        ctx.fillText('● STATUS: VERIFIED', metaX, metaStartY + 91);
      }

      // ── CENTER COLUMN: Official Gold Foil Seal ──
      drawGoldSeal(ctx, W / 2, 878, 68, isWinner);

      // ── RIGHT COLUMN: Authorized Executive Signatures ──
      ctx.textAlign = 'center';

      // Signatory 1: Muskaan
      const sig1X = 1120;
      const sig1Y = 880;

      ctx.save();
      ctx.fillStyle = '#1c1610';
      ctx.font = 'italic 46px "Pinyon Script", "Cormorant Garamond", cursive, serif';
      ctx.fillText('Muskaan', sig1X, sig1Y);
      ctx.restore();

      // Signature 1 Line
      ctx.strokeStyle = '#4a3f32';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sig1X - 90, sig1Y + 12);
      ctx.lineTo(sig1X + 90, sig1Y + 12);
      ctx.stroke();

      ctx.fillStyle = '#221a12';
      ctx.font = '800 12.5px "DM Sans", Arial, sans-serif';
      ctx.fillText('MUSKAAN', sig1X, sig1Y + 34);

      ctx.fillStyle = '#7a6c5b';
      ctx.font = '600 10.5px "DM Sans", Arial, sans-serif';
      ctx.fillText('Co-Founder & Creative Director', sig1X, sig1Y + 50);

      // Signatory 2: Shlok
      const sig2X = 1360;
      const sig2Y = 880;

      ctx.save();
      ctx.fillStyle = '#1c1610';
      ctx.font = 'italic 46px "Pinyon Script", "Cormorant Garamond", cursive, serif';
      ctx.fillText('Shlok', sig2X, sig2Y);
      ctx.restore();

      // Signature 2 Line
      ctx.strokeStyle = '#4a3f32';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sig2X - 90, sig2Y + 12);
      ctx.lineTo(sig2X + 90, sig2Y + 12);
      ctx.stroke();

      ctx.fillStyle = '#221a12';
      ctx.font = '800 12.5px "DM Sans", Arial, sans-serif';
      ctx.fillText('SHLOK', sig2X, sig2Y + 34);

      ctx.fillStyle = '#7a6c5b';
      ctx.font = '600 10.5px "DM Sans", Arial, sans-serif';
      ctx.fillText('Co-Founder & Managing Director', sig2X, sig2Y + 50);

      // ── Bottom Brand Motto & Verification Stamp ──
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9b7129';
      ctx.font = '800 13px "Cinzel", "DM Sans", serif';
      ctx.fillText('—   DIFFERENT VOICES   •   SAME STAGE   —', W / 2, 1060);

      ctx.fillStyle = '#8f8374';
      ctx.font = '500 10px "DM Sans", Arial, sans-serif';
      ctx.fillText('Official Credential issued by Offstage Creators • Protected by Security Verification Engine', W / 2, 1082);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Verification Handler
  // ─────────────────────────────────────────────────────────────────────────────
  async function performVerification(payload) {
    certError.classList.remove('show');
    certSuccess.classList.remove('show');
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'VERIFYING CREDENTIALS…';

    try {
      if (typeof window.trackEvent === 'function') {
        window.trackEvent('certificate_verification_started');
      }

      const res = await fetch('/api/certificate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (typeof window.trackEvent === 'function') {
          window.trackEvent('certificate_verification_success');
        }

        const isWinner = Boolean(
          data.isWinner ||
          data.position === 'WINNER' ||
          data.registrationId === 'OC-OM-2440F923' ||
          (data.verifiedName && data.verifiedName.toLowerCase().includes('suhavani'))
        );

        if (isWinner) {
          showSuccess(`🏆 Event Winner Verified: ${data.verifiedName} (Winner — First Place). Your official Certificate of Excellence is ready!`);
        } else {
          showSuccess(`✓ Participant verified: ${data.verifiedName}. Your official certificate is ready!`);
        }

        // Render the new premium certificate design with all dynamic metadata
        drawCertificate({
          verifiedName: data.verifiedName,
          event: data.event,
          certificateId: data.certificateId || data.registrationId,
          registrationId: data.registrationId,
          category: data.category,
          performanceTitle: data.performanceTitle,
          date: data.date,
          verificationUrl: data.verificationUrl,
          qrCode: data.qrCode,
          isWinner: isWinner,
          position: data.position || (isWinner ? 'WINNER' : 'Participant')
        });

        previewBox.classList.add('show');
        downloadsBar.classList.add('show');
        previewBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        showError(data.error || 'We could not verify a confirmed participant registration with those details.');
      }

    } catch (err) {
      console.error('Certificate verification error:', err);
      showError('Unable to connect to verification server. Please check connection and try again.');
    }
  }

  // Form submission: call backend API
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const isRegTab = tabRegId.classList.contains('active');
    const nameVal = document.getElementById('certName').value.trim();
    const phoneVal = document.getElementById('certPhone').value.trim();
    const regIdVal = document.getElementById('certRegId').value.trim();

    const payload = {};
    if (isRegTab) {
      if (!regIdVal) {
        showError('Please enter your Registration ID.');
        return;
      }
      payload.registrationId = regIdVal;
    } else {
      if (nameVal.length < 2 || phoneVal.length < 8) {
        showError('Please enter the full registered name and phone number.');
        return;
      }
      payload.name = nameVal;
      payload.phone = phoneVal;
    }

    performVerification(payload);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Action Handlers: PNG Export, PDF Export, Print
  // ─────────────────────────────────────────────────────────────────────────────

  // PNG Download
  pngBtn.addEventListener('click', () => {
    if (typeof window.trackEvent === 'function') {
      window.trackEvent('certificate_downloaded', { format: 'png' });
    }
    const a = document.createElement('a');
    const cleanFileName = (currentCertData.verifiedName || 'Participant').replace(/[^a-z0-9]+/gi, '-');
    a.download = `Offstage-Creators-Certificate-${cleanFileName}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  // PDF Download (jsPDF)
  pdfBtn.addEventListener('click', () => {
    if (!window.jspdf) {
      alert('PDF generation requires internet connectivity. You can download the PNG version directly.');
      return;
    }
    if (typeof window.trackEvent === 'function') {
      window.trackEvent('certificate_downloaded', { format: 'pdf' });
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1600, 1131]
    });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 1600, 1131, undefined, 'FAST');
    const cleanFileName = (currentCertData.verifiedName || 'Participant').replace(/[^a-z0-9]+/gi, '-');
    pdf.save(`Offstage-Creators-Certificate-${cleanFileName}.pdf`);
  });

  // Browser Print Action
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Auto-Verification via URL Parameters (e.g. Scanned QR Code)
  // ─────────────────────────────────────────────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const regIdParam = urlParams.get('regId') || urlParams.get('id');

  if (regIdParam && regIdParam.trim()) {
    tabRegId.click();
    const regInput = document.getElementById('certRegId');
    if (regInput) {
      regInput.value = regIdParam.trim();
      performVerification({ registrationId: regIdParam.trim() });
    }
  }

})();
