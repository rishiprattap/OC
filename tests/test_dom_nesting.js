const fs = require('fs');

function testAdminDom() {
  const html = fs.readFileSync('public/admin.html', 'utf8');
  const tabOverviewIdx = html.indexOf('id="tabOverview"');
  const tabEventsIdx = html.indexOf('id="tabEvents"');
  const tabCertsIdx = html.indexOf('id="tabCertificates"');
  const tabRegsIdx = html.indexOf('id="tabRegistrations"');
  
  console.log('Admin indices:', { tabOverviewIdx, tabEventsIdx, tabCertsIdx, tabRegsIdx });
  
  const textBetweenOverviewAndEvents = html.substring(tabOverviewIdx, tabEventsIdx);
  const openDivs = (textBetweenOverviewAndEvents.match(/<div\b/g) || []).length;
  const closeDivs = (textBetweenOverviewAndEvents.match(/<\/div>/g) || []).length;
  console.log('Between tabOverview and tabEvents: <div =', openDivs, ', </div> =', closeDivs);
  if (openDivs !== closeDivs) {
    throw new Error('Unbalanced divs in tabOverview: ' + (openDivs - closeDivs));
  }
  console.log('PASS: tabOverview closes completely before tabEvents begins.');

  const textBetweenEventsAndCerts = html.substring(tabEventsIdx, tabCertsIdx);
  const openDivsEvents = (textBetweenEventsAndCerts.match(/<div\b/g) || []).length;
  const closeDivsEvents = (textBetweenEventsAndCerts.match(/<\/div>/g) || []).length;
  console.log('Between tabEvents and tabCertificates: <div =', openDivsEvents, ', </div> =', closeDivsEvents);
  if (openDivsEvents !== closeDivsEvents) {
    throw new Error('Unbalanced divs in tabEvents: ' + (openDivsEvents - closeDivsEvents));
  }
  console.log('PASS: tabEvents closes completely before tabCertificates begins.');
}

function testIndexDom() {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const heroMetaIdx = html.indexOf('id="heroMetaStrip"');
  const heroActionsIdx = html.indexOf('id="heroActions"');
  const text = html.substring(heroMetaIdx, heroActionsIdx);
  const openDivs = (text.match(/<div\b/g) || []).length;
  const closeDivs = (text.match(/<\/div>/g) || []).length;
  console.log('Between heroMetaStrip and heroActions: <div =', openDivs, ', </div> =', closeDivs);
  if (openDivs !== closeDivs) {
    throw new Error('Unbalanced divs in heroMetaStrip: ' + (openDivs - closeDivs));
  }
  console.log('PASS: heroMetaStrip closes completely before heroActions begins.');
}

testAdminDom();
testIndexDom();
console.log('ALL DOM CHECKS PASSED PERFECTLY!');
