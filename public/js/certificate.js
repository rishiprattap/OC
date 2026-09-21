// Offstage Creators — Participation Certificate Verification & Canvas Engine
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

  let activeVerifiedName = '';
  let activeEventTitle = 'ONLINE OPEN MIC 2026';

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

  // Draw high-res canvas certificate
  function drawCertificate(name, eventTitle) {
    activeVerifiedName = name;
    activeEventTitle = eventTitle || 'ONLINE OPEN MIC 2026';

    const W = canvas.width;  // 1600
    const H = canvas.height; // 1131

    // Background parchment
    ctx.fillStyle = '#efe4cf';
    ctx.fillRect(0, 0, W, H);

    // Double frame borders
    ctx.strokeStyle = '#b58c4a';
    ctx.lineWidth = 8;
    ctx.strokeRect(34, 34, W - 68, H - 68);

    ctx.strokeStyle = '#4b4032';
    ctx.lineWidth = 2;
    ctx.strokeRect(54, 54, W - 108, H - 108);

    // Circular Logo Badge in top-left
    const logo = new Image();
    logo.onload = () => {
      ctx.save();
      const cx = 145, cy = 145, r = 72;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#f7edd9';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

      const scale = Math.min((r * 2) / logo.width, (r * 2) / logo.height);
      const lw = logo.width * scale;
      const lh = logo.height * scale;
      ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh);
      ctx.restore();

      // Badge borders
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#9b712f';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r - 9, 0, Math.PI * 2);
      ctx.strokeStyle = '#c7a86d';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      renderCertificateContent();
    };

    logo.onerror = renderCertificateContent;
    logo.src = '/assets/logo.png';

    function renderCertificateContent() {
      ctx.textAlign = 'center';

      // Header Brand
      ctx.fillStyle = '#282018';
      ctx.font = '800 26px "DM Sans", Arial, sans-serif';
      ctx.fillText('OFFSTAGE CREATORS', W / 2, 170);

      ctx.fillStyle = '#8c672f';
      ctx.font = '600 21px "DM Sans", Arial, sans-serif';
      ctx.fillText('WORDS  |  PEOPLE  |  PLATFORMS', W / 2, 210);

      // Certificate Title
      ctx.fillStyle = '#9b712f';
      ctx.font = '600 62px "Cormorant Garamond", Georgia, serif';
      ctx.fillText('CERTIFICATE', W / 2, 365);

      ctx.fillStyle = '#4d4336';
      ctx.font = '600 24px "DM Sans", Arial, sans-serif';
      ctx.fillText('OF PARTICIPATION', W / 2, 410);

      // Participant Name
      ctx.fillStyle = '#35281b';
      ctx.font = 'italic 66px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(name, W / 2, 535);

      // Underline
      ctx.strokeStyle = '#9f875f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(420, 565);
      ctx.lineTo(1180, 565);
      ctx.stroke();

      // Certificate Body Text
      ctx.fillStyle = '#4e453b';
      ctx.font = '22px "DM Sans", Arial, sans-serif';
      ctx.fillText('This is to certify that', W / 2, 630);

      ctx.fillStyle = '#292018';
      ctx.font = '800 34px "DM Sans", Arial, sans-serif';
      ctx.fillText('has successfully participated in the', W / 2, 690);

      ctx.fillStyle = '#9b712f';
      ctx.font = '800 36px "DM Sans", Arial, sans-serif';
      ctx.fillText(activeEventTitle.toUpperCase(), W / 2, 748);

      ctx.fillStyle = '#4e453b';
      ctx.font = '21px "DM Sans", Arial, sans-serif';
      ctx.fillText('organized by Offstage Creators.', W / 2, 793);

      ctx.fillStyle = '#675d51';
      ctx.font = '19px "DM Sans", Arial, sans-serif';
      ctx.fillText('We appreciate your courage, creativity and the uniqueness', W / 2, 850);
      ctx.fillText('you brought to the stage. Keep expressing, keep creating!', W / 2, 880);

      // Founders Signatures
      ctx.fillStyle = '#35281b';
      ctx.font = 'italic 36px "Cormorant Garamond", Georgia, serif';
      ctx.fillText('Muskaan', 400, 990);
      ctx.fillText('Shlok', 1200, 990);

      // Signature Underlines
      ctx.strokeStyle = '#3b3229';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(300, 1008);
      ctx.lineTo(500, 1008);
      ctx.moveTo(1100, 1008);
      ctx.lineTo(1300, 1008);
      ctx.stroke();

      ctx.fillStyle = '#62594e';
      ctx.font = '700 15px "DM Sans", Arial, sans-serif';
      ctx.fillText('MUSKAAN  •  CO-FOUNDER', 400, 1040);
      ctx.fillText('SHLOK  •  CO-FOUNDER', 1200, 1040);

      // Motto
      ctx.fillStyle = '#9b712f';
      ctx.font = '800 17px "DM Sans", Arial, sans-serif';
      ctx.fillText('DIFFERENT VOICES, SAME STAGE.', W / 2, 1070);
    }
  }

  // Form submission: call backend API
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    certError.classList.remove('show');
    certSuccess.classList.remove('show');
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'VERIFYING CREDENTIALS…';

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

    try {
      const res = await fetch('/api/certificate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showSuccess(`✓ Participant verified: ${data.verifiedName}. Your official certificate is ready!`);
        drawCertificate(data.verifiedName, data.event);
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
  });

  // PNG Download
  document.getElementById('pngBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    const cleanFileName = (activeVerifiedName || 'Participant').replace(/[^a-z0-9]+/gi, '-');
    a.download = `Offstage-Creators-Certificate-${cleanFileName}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  // PDF Download (jsPDF)
  document.getElementById('pdfBtn').addEventListener('click', () => {
    if (!window.jspdf) {
      alert('PDF generation requires internet connectivity. You can download the PNG version directly.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1600, 1131]
    });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 1600, 1131);
    const cleanFileName = (activeVerifiedName || 'Participant').replace(/[^a-z0-9]+/gi, '-');
    pdf.save(`Offstage-Creators-Certificate-${cleanFileName}.pdf`);
  });

})();
