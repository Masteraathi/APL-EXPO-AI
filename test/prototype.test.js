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

function withTempApp(fn) {
  return async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apl-expo-ai-test-'));
    const { handler, store } = createRequestHandler({ dataDir: tempDir });
    const request = (method, url, body) => invokeHandler(handler, method, url, body);
    try {
      await fn({ request, tempDir, store });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
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

test('validates verified contact info, creates enquiry with unique ID, and syncs category links', withTempApp(async ({ request }) => {
  const badRes = await request('POST', '/api/enquiries', {
    expoName: 'IMTEX 2026 - Bengaluru',
    enquiryDate: '2026-11-27',
    companyName: 'Test Metals Ltd',
    contactPerson: 'Asha Iyer',
    mobile: '+91 98765 43210',
    email: 'asha@testmetals.in',
    aiExtractedUsed: true,
    mobileVerified: false,
    emailVerified: true,
    productCategories: ['Industrial Lubricants'],
    visitPriority: 'HIGH',
  });
  assert.equal(badRes.status, 400);
  const badBody = badRes.json();
  assert.ok(badBody.errors.mobileVerified);

  const createRes = await request('POST', '/api/enquiries', {
    expoName: 'IMTEX 2026 - Bengaluru',
    enquiryDate: '2026-11-27',
    companyName: 'Test Metals Ltd',
    contactPerson: 'Asha Iyer',
    designation: 'Plant Manager',
    mobile: '+91 98765 43210',
    email: 'asha@testmetals.in',
    location: 'MIDC Bhosari, Pune, Maharashtra',
    aiExtractedUsed: true,
    mobileVerified: true,
    emailVerified: true,
    productCategories: ['Industrial Lubricants', 'Rust Preventives'],
    enquiryRemarks: 'Needs 1,000L hydraulic oil trial.',
    visitPriority: 'HIGH',
    tentativeVisitDate: '2026-12-10',
    assignedSalespersonId: 'SP-01',
  });
  assert.equal(createRes.status, 201);
  const { enquiry } = createRes.json();
  assert.match(enquiry.enquiryId, /^APL-2026-\d{4}$/);
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

test('updates follow-up history, computes dashboard metrics, and manages masters', withTempApp(async ({ request }) => {
  const patchRes = await request('PATCH', '/api/enquiries/APL-2026-0004', {
    assignedSalespersonId: 'SP-04',
    enquiryStatus: 'Visit Planned',
    tentativeVisitDate: '2026-12-08',
    newFollowUpNote: 'Assigned to Harpreet; scheduled Ludhiana visit.',
  });
  assert.equal(patchRes.status, 200);
  const { enquiry } = patchRes.json();
  assert.equal(enquiry.assignedSalesperson, 'Harpreet Singh Gill');
  assert.equal(enquiry.followUpHistory.length, 2);

  const dashRes = await request('GET', '/api/dashboard');
  assert.equal(dashRes.status, 200);
  const dash = dashRes.json();
  assert.equal(dash.cards.totalEnquiries, 7);
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

test('persists cardVerified flag and removes enquiries from JSON and CSV link tables', withTempApp(async ({ request }) => {
  const patchRes = await request('PATCH', '/api/enquiries/APL-2026-0001', {
    cardVerified: true,
    companyName: 'Bharat Precision Gears Pvt. Ltd.',
  });
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.json().enquiry.cardVerified, true);

  const delRes = await request('DELETE', '/api/enquiries/APL-2026-0001');
  assert.equal(delRes.status, 200);
  assert.equal(delRes.json().deletedId, 'APL-2026-0001');

  const getDeleted = await request('GET', '/api/enquiries/APL-2026-0001');
  assert.equal(getDeleted.status, 404);

  const csvRes = await request('GET', '/api/export/csv?table=ENQUIRY_CATEGORIES');
  assert.equal(csvRes.status, 200);
  assert.equal(csvRes.text.includes('APL-2026-0001'), false);

  const delMissing = await request('DELETE', '/api/enquiries/APL-2026-9999');
  assert.equal(delMissing.status, 404);
}));

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
