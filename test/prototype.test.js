const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { createRequestHandler } = require('../local-dev/server');
const { buildSafeMergeResult } = require('../local-dev/geminiExtractor');
const { analyzeCardOcr } = require('../local-dev/cardAnalyzer');

function invokeHandler(handler, method, url, bodyObj) {
  return new Promise((resolve, reject) => {
    const req = new PassThrough();
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:3080', 'content-type': 'application/json' };

    const chunks = [];
    let statusCode = 200;
    let headers = {};

    const res = {
      writeHead(code, hdrs = {}) {
        statusCode = code;
        headers = hdrs;
      },
      end(data) {
        if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: statusCode,
          headers,
          text,
          json() {
            return JSON.parse(text);
          },
        });
      },
    };

    Promise.resolve(handler(req, res)).catch(reject);
    if (bodyObj !== undefined) {
      req.end(JSON.stringify(bodyObj));
    } else {
      req.end();
    }
  });
}

function withTempApp(fn, { sheetsFetch } = {}) {
  return async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apl-expo-ai-test-'));
    const { handler, store } = createAppServerForTest(tempDir, sheetsFetch);
    const request = (method, url, body) => invokeHandler(handler, method, url, body);
    try {
      await fn({ request, tempDir, store });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

function createAppServerForTest(dataDir, sheetsFetch) {
  return createRequestHandler({ dataDir, sheetsFetch });
}

test('serves web UI and reports health without leaking API keys', withTempApp(async ({ request, tempDir }) => {
  const htmlRes = await request('GET', '/');
  assert.equal(htmlRes.status, 200);
  assert.match(htmlRes.text, /APL EXPO AI/);

  const cssRes = await request('GET', '/styles.css');
  assert.equal(cssRes.status, 200);
  assert.match(cssRes.text, /--navy/);

  const healthRes = await request('GET', '/api/health');
  assert.equal(healthRes.status, 200);
  const health = healthRes.json();
  assert.equal(health.ok, true);
  assert.equal('geminiApiKey' in health, false);

  for (const name of [
    'EXPO_ENQUIRIES.csv',
    'PRODUCT_CATEGORIES.csv',
    'SALES_TEAM.csv',
    'ENQUIRY_CATEGORIES.csv',
  ]) {
    assert.equal(fs.existsSync(path.join(tempDir, name)), true, `${name} should exist`);
  }
}));

test('card analyzer parses spatial OCR lines, PIN state, phones, and industrial categories', () => {
  const analysis = analyzeCardOcr({
    frontLines: [
      { text: 'ZENITH PRECISION CASTINGS PVT. LTD.', y: 40, height: 28 },
      { text: 'Ramesh Nair', y: 110, height: 30 },
      { text: 'Head of Maintenance & Production', y: 145, height: 20 },
      { text: 'Tel: 020-27123456  Mob: +91 98220 99887', y: 200, height: 18 },
      { text: 'Email: ramesh.nair@zenithcastings.in', y: 230, height: 18 },
      { text: 'Plot J-18, MIDC Bhosari, Pune 411026', y: 270, height: 16 },
    ],
    backLines: [
      { text: 'CNC Machining, Sealed Quench Heat Treatment & Die Casting', y: 60, height: 22 },
    ],
  });

  assert.equal(analysis.companyName, 'ZENITH PRECISION CASTINGS PVT. LTD.');
  assert.equal(analysis.contactPerson, 'Ramesh Nair');
  assert.equal(analysis.designation, 'Head of Maintenance & Production');
  assert.equal(analysis.mobile, '+91 98220 99887');
  assert.equal(analysis.email, 'ramesh.nair@zenithcastings.in');
  assert.equal(analysis.stateRegion, 'Maharashtra');
  assert.equal(analysis.website, 'www.zenithcastings.in');
  assert.ok(analysis.suggestedCategories.includes('Metalworking Fluids'));
  assert.ok(analysis.suggestedCategories.includes('Heat Treatment Oils'));
});

test('card analyzer handles taglines, pipe-packed lines, inline designations, and OCR digit noise', () => {
  const analysis = analyzeCardOcr({
    frontLines: [
      { text: 'BHARAT FORGE', y: 20, height: 26 },
      { text: 'SYSTEMS PVT. LTD.', y: 48, height: 24 },
      { text: 'ISO 9001:2015 Certified Company', y: 78, height: 14 },
      { text: 'Suresh Deshmukh - VP Manufacturing', y: 120, height: 22 },
      { text: 'M: +91 9822O 55421 | E: s.deshmukh@bharatforgesys.in | W: www.bharatforgesys.in', y: 170, height: 16 },
      { text: 'Plot B-14, MIDC Chakan, Pune 410501', y: 210, height: 16 },
    ],
  });

  assert.equal(analysis.companyName, 'BHARAT FORGE SYSTEMS PVT. LTD.');
  assert.equal(analysis.contactPerson, 'Suresh Deshmukh');
  assert.equal(analysis.designation, 'VP Manufacturing');
  assert.equal(analysis.mobile, '+91 98220 55421');
  assert.equal(analysis.email, 's.deshmukh@bharatforgesys.in');
  assert.equal(analysis.website, 'www.bharatforgesys.in');
  assert.equal(analysis.stateRegion, 'Maharashtra');
});

test('non-destructive AI extraction preserves verified fields and surfaces conflicts', withTempApp(async ({ request }) => {
  const merged = buildSafeMergeResult(
    {
      companyName: 'New AI Co',
      contactPerson: 'Ravi Verma',
      mobile: '+91 99999 00000',
      email: 'ravi@newai.in',
    },
    {
      companyName: 'Old Draft Co',
      mobile: '+91 98231 55420',
    },
    {
      mobile: true,
    }
  );
  assert.equal(merged.merged.mobile, '+91 98231 55420');
  assert.equal(merged.merged.companyName, 'New AI Co');
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0].field, 'mobile');

  const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350">
    <text x="20" y="50">APEX TOOLING INDUSTRIES LLP</text>
    <text x="20" y="100">Vikram Joshi</text>
    <text x="20" y="130">Senior Plant Manager</text>
    <text x="20" y="180">M: +91 98111 22334</text>
    <text x="20" y="210">E: vikram@apextooling.in</text>
    <text x="20" y="250">Sector 8, IMT Manesar, Gurugram 122051</text>
  </svg>`;
  const frontDataUrl =
    'data:image/svg+xml;base64,' + Buffer.from(cardSvg, 'utf8').toString('base64');

  const res = await request('POST', '/api/extract-card', {
    frontCardImage: frontDataUrl,
    existingFields: { mobile: '+91 90000 11111' },
    verifiedFields: { mobile: true },
  });
  assert.equal(res.status, 200);
  const payload = res.json();
  assert.equal(payload.extracted.mobile, '+91 90000 11111');
  assert.equal(payload.extracted.companyName, 'APEX TOOLING INDUSTRIES LLP');
  assert.equal(payload.extracted.contactPerson, 'Vikram Joshi');
  assert.equal(payload.extracted.stateRegion, 'Haryana');
  assert.equal(payload.conflicts.length, 1);
}));

test('validates contact format, creates enquiry with unique ID, and syncs category links', withTempApp(async ({ request }) => {
  const badRes = await request('POST', '/api/enquiries', {
    enquiryDate: '2027-01-22',
    companyName: 'Test Metals Ltd',
    contactPerson: 'Asha Iyer',
    mobile: '123',
    email: 'not-an-email',
    aiExtractedUsed: true,
    productCategories: ['Industrial Lubricants'],
    visitPriority: 'HIGH',
  });
  assert.equal(badRes.status, 400);
  const badBody = badRes.json();
  assert.ok(badBody.errors.mobile);
  assert.ok(badBody.errors.email);

  const createRes = await request('POST', '/api/enquiries', {
    enquiryDate: '2027-01-22',
    companyName: 'Test Metals Ltd',
    contactPerson: 'Asha Iyer',
    designation: 'Plant Manager',
    mobile: '+91 98765 43210',
    email: 'asha@testmetals.in',
    location: 'MIDC Bhosari, Pune, Maharashtra',
    aiExtractedUsed: true,
    productCategories: ['Industrial Lubricants', 'Rust Preventives'],
    enquiryRemarks: 'Needs 1,000L hydraulic oil trial.',
    visitPriority: 'HIGH',
    tentativeVisitDate: '2027-02-10',
    assignedSalespersonId: 'SP-01',
  });
  assert.equal(createRes.status, 201);
  const { enquiry } = createRes.json();
  assert.match(enquiry.enquiryId, /^APL-2027-\d{4}$/);
  assert.equal(enquiry.expoName, 'IMTEX-2027');
  assert.equal(enquiry.stateRegion, 'Maharashtra');
  assert.equal(enquiry.enquiryStatus, 'Visit Planned');

  const dupRes = await request('POST', '/api/enquiries/check-duplicate', {
    mobile: '9876543210',
  });
  const dupData = dupRes.json();
  assert.equal(dupData.matches.length, 1);
  assert.equal(dupData.matches[0].enquiryId, enquiry.enquiryId);

  const csvRes = await request('GET', '/api/export/csv?table=ENQUIRY_CATEGORIES');
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.text, new RegExp(`${enquiry.enquiryId},CAT-01,Industrial Lubricants`));
  assert.match(csvRes.text, new RegExp(`${enquiry.enquiryId},CAT-05,Rust Preventives`));
}));

test('starts with zero example queries and updates follow-up history, dashboard metrics, and masters', withTempApp(async ({ request }) => {
  const initialList = await request('GET', '/api/enquiries');
  assert.equal(initialList.status, 200);
  assert.equal(initialList.json().enquiries.length, 0);

  const createdRes = await request('POST', '/api/enquiries', {
    enquiryDate: '2027-01-22',
    companyName: 'Vardhman Precision Fasteners Ltd.',
    contactPerson: 'Arvind Chawla',
    mobile: '+91 98140 77321',
    email: 'arvind@vardhmanfasteners.in',
    location: 'Focal Point, Ludhiana, Punjab 141010',
    productCategories: ['Metalworking Fluids', 'Rust Preventives'],
    visitPriority: 'HIGH',
  });
  assert.equal(createdRes.status, 201);
  const createdId = createdRes.json().enquiry.enquiryId;

  const patchRes = await request('PATCH', `/api/enquiries/${createdId}`, {
    assignedSalespersonId: 'SP-04',
    enquiryStatus: 'Visit Planned',
    tentativeVisitDate: '2027-02-08',
    newFollowUpNote: 'Assigned to Harpreet; scheduled Ludhiana visit.',
  });
  assert.equal(patchRes.status, 200);
  const { enquiry } = patchRes.json();
  assert.equal(enquiry.assignedSalesperson, 'Harpreet Singh Gill');
  assert.equal(enquiry.followUpHistory.length, 2);

  const dashRes = await request('GET', '/api/dashboard');
  assert.equal(dashRes.status, 200);
  const dash = dashRes.json();
  assert.equal(dash.cards.totalEnquiries, 1);
  assert.equal(dash.cards.pendingAssignment, 0);
  assert.ok(dash.byCategory.length > 0);
  assert.ok(dash.byRegion.length > 0);

  const catRes = await request('POST', '/api/master/categories', {
    name: 'Quenching Polymers',
    description: 'Polymer quenchants for induction hardening',
  });
  assert.equal(catRes.status, 201);
  const { category } = catRes.json();
  assert.equal(category.active, true);
}));

test('persists cardVerified flag, syncs enquiries by field columns to Google Sheet, and removes enquiries', async () => {
  const sheetCalls = [];
  const mockFetch = async (url, opts) => {
    sheetCalls.push({ url, body: JSON.parse(opts.body) });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ ok: true, message: 'Synced to sheet' });
      },
    };
  };

  await withTempApp(async ({ request }) => {
    const cfgRes = await request('POST', '/api/sheets/config', {
      webhookUrl: 'https://script.google.com/macros/s/demo-deployment/exec',
      test: true,
    });
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.json().connectionTest.synced, true);
    assert.equal(sheetCalls[0].body.action, 'ping');

    const createRes = await request('POST', '/api/enquiries', {
      enquiryDate: '2027-01-23',
      companyName: 'Bharat Precision Gears Pvt. Ltd.',
      contactPerson: 'Suresh Deshmukh',
      designation: 'VP Manufacturing',
      mobile: '+91 98231 55420',
      email: 's.deshmukh@bharatgears.in',
      location: 'MIDC Chakan, Pune, Maharashtra 410501',
      website: 'www.bharatgears.in',
      cardVerified: true,
      productCategories: ['Metalworking Fluids', 'Heat Treatment Oils'],
      enquiryRemarks: 'Needs semi-synthetic coolant trial.',
      visitPriority: 'HIGH',
      tentativeVisitDate: '2027-02-05',
      assignedSalespersonId: 'SP-01',
    });
    assert.equal(createRes.status, 201);
    const { enquiry, googleSheetsSync } = createRes.json();
    assert.equal(googleSheetsSync.synced, true);

    const upsertCall = sheetCalls.find((c) => c.body.action === 'upsertEnquiry');
    assert.ok(upsertCall);
    assert.equal(upsertCall.body.row['Enquiry ID'], enquiry.enquiryId);
    assert.equal(upsertCall.body.row['Expo Name'], 'IMTEX-2027');
    assert.equal(upsertCall.body.row['Company Name'], 'Bharat Precision Gears Pvt. Ltd.');
    assert.equal(upsertCall.body.row['Contact Person'], 'Suresh Deshmukh');
    assert.equal(upsertCall.body.row['Mobile'], '+91 98231 55420');
    assert.equal(upsertCall.body.row['Product Categories'], 'Metalworking Fluids; Heat Treatment Oils');
    assert.equal(upsertCall.body.row['Assigned Salesperson'], 'Rajesh Kulkarni');
    assert.equal(upsertCall.body.row['Card Verified'], 'TRUE');
    assert.equal(upsertCall.body.categoryLinks.length, 2);

    const patchRes = await request('PATCH', `/api/enquiries/${enquiry.enquiryId}`, {
      enquiryStatus: 'Completed',
      newFollowUpNote: 'PO closed',
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json().googleSheetsSync.synced, true);

    const delRes = await request('DELETE', `/api/enquiries/${enquiry.enquiryId}`);
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json().deletedId, enquiry.enquiryId);
    assert.equal(delRes.json().googleSheetsSync.synced, true);
    assert.ok(sheetCalls.some((c) => c.body.action === 'deleteEnquiry'));

    const getDeleted = await request('GET', `/api/enquiries/${enquiry.enquiryId}`);
    assert.equal(getDeleted.status, 404);

    const csvRes = await request('GET', '/api/export/csv?table=ENQUIRY_CATEGORIES');
    assert.equal(csvRes.status, 200);
    assert.equal(csvRes.text.includes(enquiry.enquiryId), false);

    const delMissing = await request('DELETE', '/api/enquiries/APL-2027-9999');
    assert.equal(delMissing.status, 404);
  }, { sheetsFetch: mockFetch })();
});

test('flags HTML login response from Apps Script as failed sync instead of false success', async () => {
  const htmlFetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return '<!doctype html><html><body>Google Sign In</body></html>';
    },
  });

  await withTempApp(async ({ request }) => {
    const cfgRes = await request('POST', '/api/sheets/config', {
      webhookUrl: 'https://script.google.com/macros/s/private-script/exec',
      test: true,
    });
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.json().connectionTest.synced, false);
    assert.match(cfgRes.json().connectionTest.message, /HTML page/i);
  }, { sheetsFetch: htmlFetch })();
});

test('runs real raster PNG OCR through Windows OCR + Card NLP Analyzer', withTempApp(async ({ request }) => {
  const { execFileSync } = require('node:child_process');
  const tmpPng = path.join(os.tmpdir(), `apl-card-ocr-test-${Date.now()}.png`);
  try {
    const psScript = `
      Add-Type -AssemblyName System.Drawing
      $bmp = New-Object System.Drawing.Bitmap(900, 500)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.Clear([System.Drawing.Color]::White)
      $fTitle = New-Object System.Drawing.Font("Arial", 22, [System.Drawing.FontStyle]::Bold)
      $fBody = New-Object System.Drawing.Font("Arial", 16)
      $b = [System.Drawing.Brushes]::Black
      $g.DrawString("KAVERI FORGE INDUSTRIES PVT LTD", $fTitle, $b, 40, 50)
      $g.DrawString("Arjun Kulkarni", $fTitle, $b, 40, 140)
      $g.DrawString("General Manager - Maintenance", $fBody, $b, 40, 190)
      $g.DrawString("Mob: +91 98220 55112", $fBody, $b, 40, 260)
      $g.DrawString("Email: arjun@kaveriforge.in", $fBody, $b, 40, 300)
      $g.DrawString("Plot C-12, MIDC Chakan, Pune 410501", $fBody, $b, 40, 350)
      $bmp.Save("${tmpPng.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
    `;
    execFileSync('powershell', ['-NoProfile', '-Command', psScript], { timeout: 15000 });
    const pngBase64 = fs.readFileSync(tmpPng).toString('base64');
    const res = await request('POST', '/api/extract-card', {
      frontCardImage: `data:image/png;base64,${pngBase64}`,
    });
    assert.equal(res.status, 200, res.text);
    const data = res.json();
    assert.match(data.extracted.companyName, /KAVERI FORGE/i);
    assert.match(data.extracted.contactPerson, /Arjun Kulkarni/i);
    assert.match(data.extracted.mobile, /98220/);
    assert.equal(data.extracted.email, 'arjun@kaveriforge.in');
    assert.equal(data.extracted.stateRegion, 'Maharashtra');
    assert.ok(data.ocrLines.length >= 4);
  } finally {
    fs.rmSync(tmpPng, { force: true });
  }
}));

test('handles Vercel rewritten URLs, pre-parsed req.body, and client-OCR input', async () => {
  const vercelHandler = require('../api/index');
  let status = 0;
  let body = '';
  const mockReq = {
    method: 'POST',
    url: '/api/index.js?__path=/api/extract-card',
    headers: { host: 'apl-expo-ai.vercel.app' },
    body: {
      clientOcrText:
        'SIGMA PRECISION TOOLS PVT LTD\nNeha Deshpande\nProcurement Manager\nM: +91 98230 11223\nE: neha@sigmatools.in\nMIDC Waluj, Aurangabad 431136',
    },
  };
  const mockRes = {
    writeHead(code) {
      status = code;
    },
    end(chunk) {
      body += chunk ? chunk.toString() : '';
    },
  };

  await vercelHandler(mockReq, mockRes);
  assert.equal(status, 200);
  const parsed = JSON.parse(body);
  assert.equal(parsed.extractionSource, 'browser-ocr-nlp');
  assert.equal(parsed.extracted.companyName, 'SIGMA PRECISION TOOLS PVT LTD');
  assert.equal(parsed.extracted.contactPerson, 'Neha Deshpande');
  assert.equal(parsed.extracted.stateRegion, 'Maharashtra');
});

test('reads dark-background visiting card via multi-pass inverted high-contrast OCR', withTempApp(async ({ request }) => {
  const { execFileSync } = require('node:child_process');
  const tmpPng = path.join(os.tmpdir(), `apl-dark-card-test-${Date.now()}.png`);
  try {
    const psScript = `
      Add-Type -AssemblyName System.Drawing
      $bmp = New-Object System.Drawing.Bitmap(900, 500)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.Clear([System.Drawing.Color]::FromArgb(15, 41, 66))
      $fTitle = New-Object System.Drawing.Font("Arial", 22, [System.Drawing.FontStyle]::Bold)
      $fBody = New-Object System.Drawing.Font("Arial", 16)
      $w = [System.Drawing.Brushes]::White
      $g.DrawString("APEX LUBRICANTS INDIA LTD", $fTitle, $w, 40, 50)
      $g.DrawString("Rajeshwari Menon", $fTitle, $w, 40, 140)
      $g.DrawString("Head of Procurement", $fBody, $w, 40, 190)
      $g.DrawString("M: +91 98450 77889", $fBody, $w, 40, 260)
      $g.DrawString("E: r.menon@apexlubes.in", $fBody, $w, 40, 300)
      $g.DrawString("Peenya Phase II, Bengaluru 560058", $fBody, $w, 40, 350)
      $bmp.Save("${tmpPng.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
    `;
    execFileSync('powershell', ['-NoProfile', '-Command', psScript], { timeout: 15000 });
    const pngBase64 = fs.readFileSync(tmpPng).toString('base64');
    const res = await request('POST', '/api/extract-card', {
      frontCardImage: `data:image/png;base64,${pngBase64}`,
    });
    assert.equal(res.status, 200, res.text);
    const data = res.json();
    assert.match(data.extracted.companyName, /APEX LUBRICANTS/i);
    assert.match(data.extracted.contactPerson, /Rajeshwari Menon/i);
    assert.match(data.extracted.mobile, /98450/);
    assert.equal(data.extracted.stateRegion, 'Karnataka');
  } finally {
    fs.rmSync(tmpPng, { force: true });
  }
}));
