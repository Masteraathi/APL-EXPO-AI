const state = {
  bootstrap: null,
  health: null,
  enquiries: [],
  dashboard: null,
  activeView: 'capture',
  frontCardImage: '',
  backCardImage: '',
  aiExtractedUsed: false,
  lastExtractedRaw: null,
  lastConflicts: [],
  duplicateMatches: [],
  selectedCategories: new Set(),
  selectedPriority: 'MEDIUM',
  lastSavedEnquiryId: '',
  timerSeconds: 0,
  timerInterval: null,
  calendarYear: 2026,
  calendarMonth: 10, // 0-indexed -> November 2026
  webcamStream: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

async function api(url, options = {}) {
  const savedSheetUrl = localStorage.getItem('apl_sheets_webhook_url') || '';
  const extraHeaders = savedSheetUrl ? { 'X-Sheets-Webhook-Url': savedSheetUrl } : {};
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...extraHeaders, ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.errors = data.errors;
    throw err;
  }
  return data;
}

function formatTimer(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function startCaptureTimer() {
  if (state.timerInterval) return;
  state.timerInterval = setInterval(() => {
    state.timerSeconds += 1;
    $('#captureTimerValue').textContent = formatTimer(state.timerSeconds);
    if (state.timerSeconds > 60) {
      $('#captureTimerPill').classList.add('over-target');
    }
  }, 1000);
}

function resetCaptureTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.timerSeconds = 0;
  $('#captureTimerValue').textContent = '00:00';
  $('#captureTimerPill').classList.remove('over-target');
}

function switchView(viewName) {
  state.activeView = viewName;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${viewName}`));
  $$('[data-nav]').forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.nav === viewName)
  );
  const subMap = {
    capture: 'Expo Enquiry Capture',
    enquiries: 'Enquiries & Follow-up',
    dashboard: 'Sales Dashboard',
    calendar: 'Tentative Visit Calendar',
    masters: 'Master Data & Schema',
  };
  $('#mobileHeaderSub').textContent = subMap[viewName] || 'APL EXPO AI';

  if (viewName === 'enquiries') loadEnquiriesView();
  if (viewName === 'dashboard') loadDashboardView();
  if (viewName === 'calendar') loadCalendarView();
  if (viewName === 'masters') loadMastersView();
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setCardPreview(side, dataUrl) {
  if (side === 'front') {
    state.frontCardImage = dataUrl;
    const img = $('#frontPreviewImg');
    const empty = $('#frontEmptyState');
    const clearBtn = $('#clearFrontBtn');
    const rotateBtn = $('#rotateFrontBtn');
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove('hidden');
      empty.classList.add('hidden');
      clearBtn.classList.remove('hidden');
      rotateBtn.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      empty.classList.remove('hidden');
      clearBtn.classList.add('hidden');
      rotateBtn.classList.add('hidden');
    }
  } else {
    state.backCardImage = dataUrl;
    const img = $('#backPreviewImg');
    const empty = $('#backEmptyState');
    const clearBtn = $('#clearBackBtn');
    const rotateBtn = $('#rotateBackBtn');
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove('hidden');
      empty.classList.add('hidden');
      clearBtn.classList.remove('hidden');
      rotateBtn.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      empty.classList.remove('hidden');
      clearBtn.classList.add('hidden');
      rotateBtn.classList.add('hidden');
    }
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

async function readFileAsDataUrl(file) {
  const rawUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read selected image file'));
    reader.readAsDataURL(file);
  });

  // Preserve SVG as-is; optimize large camera photos for crisp OCR & Vercel payload limits
  if (file.type === 'image/svg+xml') return rawUrl;
  try {
    const img = await loadImageElement(rawUrl);
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch {
    return rawUrl;
  }
}

async function rotateCardImage(side) {
  const src = side === 'front' ? state.frontCardImage : state.backCardImage;
  if (!src) return;
  try {
    const img = await loadImageElement(src);
    const canvas = document.createElement('canvas');
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    setCardPreview(side, canvas.toDataURL('image/jpeg', 0.92));
    showToast(`Rotated ${side} card 90°`);
  } catch {
    showToast('Could not rotate this image format');
  }
}

function populateSelectOptions() {
  const { expos, fixedExpoName, salesTeam, categories, statuses } = state.bootstrap;

  // Fixed event display
  const fixedInput = $('#expoNameFixed');
  if (fixedInput) fixedInput.value = fixedExpoName || 'IMTEX-2027';

  // Capture Salesperson Select
  const activeSales = salesTeam.filter((s) => s.active);
  $('#assignedSalespersonId').innerHTML =
    '<option value="">-- Unassigned (assign later) --</option>' +
    activeSales
      .map(
        (s) =>
          `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} — ${escapeHtml(s.region)}</option>`
      )
      .join('');

  // Filter Selects in Enquiries / Dashboard / Calendar
  const expoOpts =
    '<option value="ALL">All Expos</option>' +
    expos.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
  $('#enqFilterExpo').innerHTML = expoOpts;
  $('#dashFilterExpo').innerHTML = expoOpts;

  $('#enqFilterStatus').innerHTML =
    '<option value="ALL">All Statuses</option>' +
    statuses.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

  const spFilterOpts =
    '<option value="ALL">All Salespeople</option><option value="UNASSIGNED">Unassigned</option>' +
    salesTeam
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join('');
  $('#enqFilterSalesperson').innerHTML = spFilterOpts;
  $('#calSalespersonFilter').innerHTML = spFilterOpts;

  $('#enqFilterCategory').innerHTML =
    '<option value="ALL">All Categories</option>' +
    categories
      .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
      .join('');
}

function renderCategoryChips() {
  const q = $('#categorySearchInput').value.trim().toLowerCase();
  const activeCategories = state.bootstrap.categories.filter((c) => c.active);
  const filtered = activeCategories.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
  );

  $('#productCategoryChips').innerHTML = filtered
    .map((cat) => {
      const selected = state.selectedCategories.has(cat.name);
      return `<button type="button" class="cat-chip ${selected ? 'selected' : ''}" data-cat="${escapeHtml(cat.name)}" title="${escapeHtml(cat.description || '')}">
        <span>${selected ? '✓' : '+'}</span>
        <span>${escapeHtml(cat.name)}</span>
      </button>`;
    })
    .join('');

  $('#selectedCatCount').textContent = `(${state.selectedCategories.size} selected)`;
}

function setPriority(priority) {
  state.selectedPriority = priority;
  $$('.prio-btn').forEach((b) => b.classList.toggle('active', b.dataset.priority === priority));
  $('#priorityGuidanceText').textContent =
    state.bootstrap?.priorityGuidance?.[priority] || '';
}

function clearFormErrors() {
  $$('[data-err]').forEach((el) => {
    el.textContent = '';
  });
}

function showFormErrors(errors = {}) {
  clearFormErrors();
  for (const [key, msg] of Object.entries(errors)) {
    const el = document.querySelector(`[data-err="${key}"]`);
    if (el) el.textContent = msg;
  }
}

let tesseractLoaderPromise = null;
function loadTesseractJs() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractLoaderPromise) {
    tesseractLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () =>
        reject(new Error('Failed to load browser OCR engine. Check internet or configure GEMINI_API_KEY.'));
      document.head.appendChild(script);
    });
  }
  return tesseractLoaderPromise;
}

async function buildHighContrastCanvasUrl(dataUrl, { invert = false } = {}) {
  const img = await loadImageElement(dataUrl);
  const scale = img.width < 1200 ? Math.min(2.2, 1400 / Math.max(1, img.width)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (invert) lum = 255 - lum;
    // Contrast boost around midpoint 128
    const boosted = Math.max(0, Math.min(255, (lum - 128) * 1.45 + 128));
    d[i] = d[i + 1] = d[i + 2] = boosted;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

function mapTesseractLines(res) {
  return (res?.data?.lines || [])
    .map((l) => ({
      text: (l.text || '').trim(),
      x: l.bbox?.x0 || 0,
      y: l.bbox?.y0 || 0,
      width: (l.bbox?.x1 || 0) - (l.bbox?.x0 || 0),
      height: (l.bbox?.y1 || 0) - (l.bbox?.y0 || 0),
    }))
    .filter((l) => l.text.length > 0);
}

async function runBrowserTesseractOnImage(Tesseract, dataUrl) {
  if (!dataUrl) return { text: '', lines: [] };
  const pass1Url = await buildHighContrastCanvasUrl(dataUrl, { invert: false }).catch(() => dataUrl);
  let bestRes = await Tesseract.recognize(pass1Url, 'eng');
  let bestLines = mapTesseractLines(bestRes);

  // Dark/metallic card fallback: inverted contrast pass if few lines found
  if (bestLines.length < 4 || (bestRes?.data?.text || '').trim().length < 40) {
    const pass2Url = await buildHighContrastCanvasUrl(dataUrl, { invert: true }).catch(() => '');
    if (pass2Url) {
      const altRes = await Tesseract.recognize(pass2Url, 'eng');
      const altLines = mapTesseractLines(altRes);
      if (
        altLines.length > bestLines.length ||
        (altLines.length === bestLines.length &&
          (altRes?.data?.text || '').length > (bestRes?.data?.text || '').length)
      ) {
        bestRes = altRes;
        bestLines = altLines;
      }
    }
  }

  return {
    text: bestRes?.data?.text || '',
    lines: bestLines,
  };
}

async function extractCardWithFallback(payload, onStatus) {
  let result = await api('/api/extract-card', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (result.needsClientOcr) {
    if (onStatus) onStatus('Reading card text in browser OCR...');
    const Tesseract = await loadTesseractJs();
    const frontOcr = await runBrowserTesseractOnImage(Tesseract, payload.frontCardImage);
    const backOcr = await runBrowserTesseractOnImage(Tesseract, payload.backCardImage);
    result = await api('/api/extract-card', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        clientOcrText: frontOcr.text,
        clientOcrBackText: backOcr.text,
        clientOcrLines: frontOcr.lines,
        clientOcrBackLines: backOcr.lines,
      }),
    });
  }
  return result;
}

async function runCardExtraction() {
  if (!state.frontCardImage && !state.backCardImage) {
    showToast('Capture or upload a business card image first.');
    return;
  }

  startCaptureTimer();
  $('#scanOverlay').classList.remove('hidden');
  $('#runAiExtractBtn').disabled = true;
  $('#extractStatusText').textContent = 'Analyzing visiting card...';

  const existingFields = {
    companyName: $('#companyName').value,
    contactPerson: $('#contactPerson').value,
    designation: $('#designation').value,
    mobile: $('#mobile').value,
    email: $('#email').value,
    location: $('#location').value,
    stateRegion: $('#stateRegion').value,
    website: $('#website').value,
  };

  const verifiedFields = $('#cardVerified').checked
    ? {
        companyName: true,
        contactPerson: true,
        designation: true,
        mobile: true,
        email: true,
        location: true,
        stateRegion: true,
        website: true,
      }
    : {};

  try {
    const result = await extractCardWithFallback(
      {
        frontCardImage: state.frontCardImage,
        backCardImage: state.backCardImage,
        existingFields,
        verifiedFields,
      },
      (msg) => {
        $('#extractStatusText').textContent = msg;
      }
    );

    state.aiExtractedUsed = true;
    state.lastExtractedRaw = result.rawExtracted || result.extracted || {};
    const ex = result.extracted || {};

    const textIds = [
      'companyName',
      'contactPerson',
      'designation',
      'mobile',
      'email',
      'location',
      'stateRegion',
      'website',
    ];
    for (const id of textIds) {
      const input = $(`#${id}`);
      if (ex[id] !== undefined) {
        input.value = ex[id];
        if (ex[id]) input.classList.add('ai-filled');
      }
    }

    // Auto-suggest matching product categories if user hasn't picked any yet
    if (state.selectedCategories.size === 0 && Array.isArray(result.suggestedCategories)) {
      const activeNames = new Set(
        state.bootstrap.categories.filter((c) => c.active).map((c) => c.name)
      );
      for (const cat of result.suggestedCategories) {
        if (activeNames.has(cat)) state.selectedCategories.add(cat);
      }
      renderCategoryChips();
    }

    const modeLabel = result.extractionSource.startsWith('gemini:')
      ? `Gemini Vision (${Math.round((result.confidence || 0.9) * 100)}%)`
      : `Card OCR + NLP (${Math.round((result.confidence || 0.85) * 100)}%)`;
    $('#ocrModeBadge').textContent = modeLabel;
    $('#extractStatusText').textContent =
      result.warning || 'Analyzed card! Please verify Mobile, Email & Card Match before saving.';

    const ocrLines = result.ocrLines || [];
    if (ocrLines.length > 0) {
      $('#ocrLineCount').textContent = String(ocrLines.length);
      $('#ocrLinesList').innerHTML = ocrLines
        .map(
          (l) => `<div class="ocr-line-item">
            <span><span class="conf-pill">${escapeHtml(l.side || 'card')}</span> ${escapeHtml(l.text)}</span>
          </div>`
        )
        .join('');
      $('#ocrInspectorWrap').classList.remove('hidden');
    } else {
      $('#ocrInspectorWrap').classList.add('hidden');
    }

    if (result.conflicts && result.conflicts.length > 0) {
      state.lastConflicts = result.conflicts;
      $('#aiConflictDetails').textContent = result.conflicts
        .map((c) => `${c.field}: kept "${c.verifiedValue}" (Card read "${c.aiExtractedValue}")`)
        .join(' | ');
      $('#aiConflictBanner').classList.remove('hidden');
    } else {
      $('#aiConflictBanner').classList.add('hidden');
    }

    await checkDuplicateLead();
    if (state.frontCardImage || state.backCardImage) {
      renderCaptureCardCompare();
    }
    showToast('Card analyzed — review & verify extracted fields.');
  } catch (err) {
    showToast(err.message);
    $('#extractStatusText').textContent = err.message;
  } finally {
    $('#scanOverlay').classList.add('hidden');
    $('#runAiExtractBtn').disabled = false;
  }
}

async function checkDuplicateLead() {
  const mobile = $('#mobile').value.trim();
  const email = $('#email').value.trim();
  const companyName = $('#companyName').value.trim();
  if (!mobile && !email && companyName.length < 4) {
    $('#duplicateAlert').classList.add('hidden');
    state.duplicateMatches = [];
    return;
  }
  try {
    const { matches } = await api('/api/enquiries/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({ mobile, email, companyName }),
    });
    state.duplicateMatches = matches || [];
    if (state.duplicateMatches.length > 0) {
      const m = state.duplicateMatches[0];
      $('#duplicateAlertText').textContent = `Matches ${m.enquiryId} (${m.companyName} — ${m.expoName}, status: ${m.enquiryStatus}) on ${m.matchedOn.join(', ')}.`;
      $('#duplicateAlert').classList.remove('hidden');
    } else {
      $('#duplicateAlert').classList.add('hidden');
    }
  } catch {
    // non-fatal
  }
}

function resetCaptureForm({ keepBanner = false } = {}) {
  $('#enquiryForm').reset();
  clearFormErrors();
  setCardPreview('front', '');
  setCardPreview('back', '');
  state.aiExtractedUsed = false;
  state.lastExtractedRaw = null;
  state.lastConflicts = [];
  state.duplicateMatches = [];
  state.selectedCategories.clear();
  $$('.ai-filled').forEach((el) => el.classList.remove('ai-filled'));
  $('#aiConflictBanner').classList.add('hidden');
  $('#ocrInspectorWrap').classList.add('hidden');
  $('#cardComparePanel').classList.add('hidden');
  $('#duplicateAlert').classList.add('hidden');
  if (!keepBanner) $('#saveSuccessBanner').classList.add('hidden');
  $('#enquiryDate').value = todayIso();
  const fixedInput = $('#expoNameFixed');
  if (fixedInput) fixedInput.value = state.bootstrap?.fixedExpoName || 'IMTEX-2027';
  $('#salespersonContactHint').textContent = '';
  $('#ocrModeBadge').textContent = state.health?.geminiConfigured
    ? 'Gemini Vision Ready'
    : 'Local OCR + NLP Ready';
  $('#extractStatusText').textContent =
    'Upload or capture front (and optional back) card image to extract details.';
  setPriority('MEDIUM');
  renderCategoryChips();
  resetCaptureTimer();
}

async function handleSaveEnquiry(e) {
  e.preventDefault();
  clearFormErrors();

  const expoName = state.bootstrap?.fixedExpoName || 'IMTEX-2027';

  const payload = {
    expoName,
    enquiryDate: $('#enquiryDate').value,
    frontCardImage: state.frontCardImage,
    backCardImage: state.backCardImage,
    companyName: $('#companyName').value.trim(),
    contactPerson: $('#contactPerson').value.trim(),
    designation: $('#designation').value.trim(),
    mobile: $('#mobile').value.trim(),
    email: $('#email').value.trim(),
    location: $('#location').value.trim(),
    stateRegion: $('#stateRegion').value.trim(),
    website: $('#website').value.trim(),
    cardVerified: $('#cardVerified').checked,
    aiExtractedUsed: state.aiExtractedUsed,
    productCategories: Array.from(state.selectedCategories),
    enquiryRemarks: $('#enquiryRemarks').value.trim(),
    visitPriority: state.selectedPriority,
    tentativeVisitDate: $('#tentativeVisitDate').value,
    assignedSalespersonId: $('#assignedSalespersonId').value,
    followUpRemarks: $('#followUpRemarks').value.trim(),
  };

  const btn = $('#saveEnquiryBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const { enquiry, googleSheetsSync } = await api('/api/enquiries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const elapsed = formatTimer(state.timerSeconds);
    state.lastSavedEnquiryId = enquiry.enquiryId;
    const sheetNote = googleSheetsSync?.synced
      ? ' · Synced to Google Sheet'
      : googleSheetsSync?.configured
      ? ` · Sheet Sync Warning: ${googleSheetsSync.message}`
      : '';
    $('#savedIdLabel').textContent = `Saved ${enquiry.enquiryId} — ${enquiry.companyName}`;
    $('#savedSummaryText').textContent = `Status: ${enquiry.enquiryStatus} · Priority: ${enquiry.visitPriority}${
      state.timerSeconds > 0 ? ` · Captured in ${elapsed}` : ''
    }${sheetNote}`;
    $('#saveSuccessBanner').classList.remove('hidden');

    await refreshBootstrapAndCount();
    resetCaptureForm({ keepBanner: true });
    showToast(
      googleSheetsSync?.synced
        ? `Saved ${enquiry.enquiryId} & synced to Google Sheet`
        : `Enquiry ${enquiry.enquiryId} saved`
    );
  } catch (err) {
    if (err.errors) {
      showFormErrors(err.errors);
      showToast('Please review highlighted fields before saving.');
    } else {
      showToast(err.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Enquiry';
  }
}

/* ---------- VIEW 2: ENQUIRIES LIST & DRAWER ---------- */

async function loadEnquiriesView() {
  const params = new URLSearchParams({
    search: $('#enqSearchInput').value.trim(),
    expoName: $('#enqFilterExpo').value,
    status: $('#enqFilterStatus').value,
    priority: $('#enqFilterPriority').value,
    salespersonId: $('#enqFilterSalesperson').value,
    category: $('#enqFilterCategory').value,
  });

  try {
    const { enquiries } = await api(`/api/enquiries?${params.toString()}`);
    state.enquiries = enquiries;
    renderEnquiriesList(enquiries);
  } catch (err) {
    showToast(err.message);
  }
}

function renderEnquiriesList(enquiries) {
  const tableWrap = $('#enquiriesTableWrap');
  const mobileWrap = $('#enquiriesMobileList');

  if (!enquiries.length) {
    const emptyHtml =
      '<div style="padding:28px;text-align:center;" class="muted">No enquiries match these filters yet.</div>';
    tableWrap.innerHTML = emptyHtml;
    mobileWrap.innerHTML = `<div class="card">${emptyHtml}</div>`;
    return;
  }

  tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Enquiry ID</th>
          <th>Company &amp; Contact</th>
          <th>Product Categories</th>
          <th>Priority</th>
          <th>Visit Date</th>
          <th>Salesperson</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${enquiries
          .map(
            (e) => `<tr class="clickable-row" data-open-lead="${escapeHtml(e.enquiryId)}">
              <td><strong>${escapeHtml(e.enquiryId)}</strong><div class="muted small">${escapeHtml(e.enquiryDate)}</div></td>
              <td>
                <strong>${escapeHtml(e.companyName)}</strong>
                <div class="muted small">${escapeHtml(e.contactPerson)} · ${escapeHtml(e.mobile)}</div>
                <div class="muted small">${escapeHtml(e.stateRegion || e.location || '')}</div>
              </td>
              <td>${(e.productCategories || [])
                .map((c) => `<span class="badge badge-teal" style="margin:2px 2px 0 0;">${escapeHtml(c)}</span>`)
                .join('')}</td>
              <td><span class="badge badge-${e.visitPriority.toLowerCase()}">${escapeHtml(e.visitPriority)}</span></td>
              <td>${escapeHtml(e.tentativeVisitDate || '—')}</td>
              <td>${escapeHtml(e.assignedSalesperson || 'Unassigned')}</td>
              <td><span class="badge badge-status ${escapeHtml(e.enquiryStatus.replace(/\s+/g, '-'))}">${escapeHtml(e.enquiryStatus)}</span></td>
              <td>
                <button type="button" class="btn btn-sm btn-danger-outline" data-remove-lead="${escapeHtml(e.enquiryId)}">Remove</button>
              </td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;

  mobileWrap.innerHTML = enquiries
    .map(
      (e) => `<div class="lead-card" data-open-lead="${escapeHtml(e.enquiryId)}">
        <div class="label-row">
          <strong style="color:var(--teal);font-size:0.84rem;">${escapeHtml(e.enquiryId)}</strong>
          <span class="badge badge-${e.visitPriority.toLowerCase()}">${escapeHtml(e.visitPriority)}</span>
        </div>
        <div style="font-weight:700;margin-top:4px;color:var(--navy);">${escapeHtml(e.companyName)}</div>
        <div class="muted small">${escapeHtml(e.contactPerson)} · ${escapeHtml(e.mobile)}</div>
        <div class="mt-1">${(e.productCategories || [])
          .map((c) => `<span class="badge badge-teal" style="margin:2px 3px 0 0;">${escapeHtml(c)}</span>`)
          .join('')}</div>
        <div class="label-row mt-2 small muted">
          <span>${escapeHtml(e.assignedSalesperson || 'Unassigned')}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="badge badge-status ${escapeHtml(e.enquiryStatus.replace(/\s+/g, '-'))}">${escapeHtml(e.enquiryStatus)}</span>
            <button type="button" class="btn btn-sm btn-danger-outline" data-remove-lead="${escapeHtml(e.enquiryId)}">Remove</button>
          </div>
        </div>
      </div>`
    )
    .join('');
}

const COMPARE_FIELDS = [
  ['companyName', 'Company'],
  ['contactPerson', 'Contact Person'],
  ['designation', 'Designation'],
  ['mobile', 'Mobile'],
  ['email', 'Email'],
  ['location', 'Location'],
  ['website', 'Website'],
];

function normalizeCompareValue(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function openCardZoom(src, title = 'Visiting Card Preview') {
  if (!src) return;
  $('#cardZoomTitle').textContent = title;
  $('#cardZoomImg').src = src;
  $('#cardZoomModal').classList.remove('hidden');
}

function buildComparisonTableHtml(currentMap, cardMap, actionAttr = 'data-use-card-field') {
  return `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Entered / Saved</th>
          <th>On Visiting Card</th>
          <th>Check</th>
        </tr>
      </thead>
      <tbody>
        ${COMPARE_FIELDS.map(([key, label]) => {
          const entered = String(currentMap[key] || '').trim();
          const onCard = String(cardMap[key] || '').trim();
          const same =
            !onCard || normalizeCompareValue(entered) === normalizeCompareValue(onCard);
          const statusBadge = !onCard
            ? '<span class="muted">Not on card</span>'
            : same
            ? '<span class="badge badge-match">✓ Same</span>'
            : `<span class="badge badge-diff">Differs</span> <button type="button" class="btn btn-sm btn-ghost" ${actionAttr}="${escapeHtml(key)}" data-card-val="${escapeHtml(onCard)}">Use Card</button>`;
          return `<tr>
            <td><strong>${escapeHtml(label)}</strong></td>
            <td>${escapeHtml(entered || '—')}</td>
            <td>${escapeHtml(onCard || '—')}</td>
            <td>${statusBadge}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderCaptureCardCompare() {
  const panel = $('#cardComparePanel');
  if (!state.frontCardImage && !state.backCardImage) {
    showToast('Capture or upload a visiting card image first to compare.');
    panel.classList.add('hidden');
    return;
  }

  const imagesHtml = [
    state.frontCardImage
      ? `<img src="${state.frontCardImage}" alt="Front card preview" title="Click to zoom" />`
      : '<div class="slot-empty">No front image</div>',
    state.backCardImage
      ? `<img src="${state.backCardImage}" alt="Back card preview" title="Click to zoom" />`
      : '<div class="slot-empty">No back image</div>',
  ].join('');
  $('#cardCompareImages').innerHTML = imagesHtml;

  const currentMap = {
    companyName: $('#companyName').value,
    contactPerson: $('#contactPerson').value,
    designation: $('#designation').value,
    mobile: $('#mobile').value,
    email: $('#email').value,
    location: $('#location').value,
    website: $('#website').value,
  };

  if (!state.lastExtractedRaw) {
    $('#cardCompareTableWrap').innerHTML =
      '<div class="small muted">Click "Extract Details with AI" to automatically compare OCR card text against your entered fields, or inspect the card images above side-by-side.</div>';
  } else {
    $('#cardCompareTableWrap').innerHTML = buildComparisonTableHtml(
      currentMap,
      state.lastExtractedRaw,
      'data-use-card-field'
    );
  }

  panel.classList.remove('hidden');
}

async function handleRemoveEnquiry(enquiryId, btnEl) {
  if (!btnEl.dataset.armed) {
    btnEl.dataset.armed = '1';
    const prevText = btnEl.textContent;
    btnEl.dataset.prevText = prevText;
    btnEl.textContent = 'Confirm Remove?';
    btnEl.classList.remove('btn-danger-outline');
    btnEl.classList.add('btn-danger');
    setTimeout(() => {
      if (btnEl.isConnected && btnEl.dataset.armed === '1') {
        delete btnEl.dataset.armed;
        btnEl.textContent = btnEl.dataset.prevText || 'Remove';
        btnEl.classList.remove('btn-danger');
        btnEl.classList.add('btn-danger-outline');
      }
    }, 4000);
    return;
  }

  btnEl.disabled = true;
  btnEl.textContent = 'Removing...';
  try {
    await api(`/api/enquiries/${encodeURIComponent(enquiryId)}`, {
      method: 'DELETE',
    });
    showToast(`Removed enquiry ${enquiryId}`);
    $('#leadDrawerBackdrop').classList.add('hidden');
    await refreshBootstrapAndCount();
    if (state.activeView === 'enquiries') await loadEnquiriesView();
    if (state.activeView === 'dashboard') await loadDashboardView();
    if (state.activeView === 'calendar') await loadCalendarView();
  } catch (err) {
    showToast(err.message);
    btnEl.disabled = false;
    delete btnEl.dataset.armed;
    btnEl.textContent = 'Remove';
  }
}

async function openLeadDrawer(enquiryId) {
  try {
    const { enquiry, relatedHistory } = await api(
      `/api/enquiries/${encodeURIComponent(enquiryId)}`
    );
    $('#drawerEnquiryId').textContent = `${enquiry.enquiryId} · ${enquiry.expoName} (${enquiry.enquiryDate})`;
    $('#drawerTitle').textContent = enquiry.companyName;

    const activeSales = state.bootstrap.salesTeam.filter((s) => s.active);
    const statuses = state.bootstrap.statuses;
    const hasCardImage = Boolean(enquiry.frontCardImage || enquiry.backCardImage);

    const cardsSection = hasCardImage
      ? `<div class="drawer-cards-pair">
          ${enquiry.frontCardImage ? `<img src="${enquiry.frontCardImage}" alt="Front card (click to zoom)" title="Click to zoom" />` : '<div class="slot-empty">No front image</div>'}
          ${enquiry.backCardImage ? `<img src="${enquiry.backCardImage}" alt="Back card (click to zoom)" title="Click to zoom" />` : '<div class="slot-empty">No back image</div>'}
        </div>`
      : '<div class="muted small">No visiting card image attached to this record.</div>';

    const historyItems = (enquiry.followUpHistory || [])
      .slice()
      .reverse()
      .map(
        (h) => `<div class="timeline-item">
          <div class="timeline-meta">${escapeHtml(new Date(h.timestamp).toLocaleString())} · <strong>${escapeHtml(h.actor)}</strong> · ${escapeHtml(h.status)}</div>
          <div>${escapeHtml(h.note)}</div>
        </div>`
      )
      .join('');

    const relatedHtml =
      relatedHistory && relatedHistory.length
        ? `<div class="banner banner-warn" style="margin-bottom:0;">
            <div>
              <strong>Customer Enquiry History (${relatedHistory.length} previous)</strong>
              <p>${relatedHistory
                .map((r) => `${r.enquiryId} (${r.expoName}, ${r.enquiryDate})`)
                .join(' · ')}</p>
            </div>
          </div>`
        : '';

    $('#drawerBody').innerHTML = `
      ${relatedHtml}
      <div class="card" style="box-shadow:none;margin-top:0;">
        <div class="label-row" style="margin-bottom:8px;">
          <strong style="font-size:0.9rem;color:var(--navy);">Visiting Card &amp; Details Verification</strong>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="badge ${enquiry.cardVerified ? 'badge-match' : 'badge-diff'}">
              ${enquiry.cardVerified ? '✓ Verified vs Card' : 'Pending Card Check'}
            </span>
            ${
              hasCardImage
                ? '<button type="button" class="btn btn-sm btn-outline" id="drawerCheckCardBtn">Compare with Card</button>'
                : ''
            }
          </div>
        </div>
        ${cardsSection}
        <div id="drawerCardCompareWrap" class="mt-2 hidden"></div>
      </div>

      <form id="drawerUpdateForm" class="card" style="box-shadow:none;margin-top:0;">
        <h3 style="margin:0 0 10px;font-size:0.96rem;color:var(--navy);">Contact Check, Follow-up &amp; Visit Plan</h3>
        <div class="form-grid">
          <div class="field span-2">
            <label for="dCompany">Company Name</label>
            <input id="dCompany" type="text" value="${escapeHtml(enquiry.companyName || '')}" required />
          </div>
          <div class="field">
            <label for="dContact">Contact Person</label>
            <input id="dContact" type="text" value="${escapeHtml(enquiry.contactPerson || '')}" required />
          </div>
          <div class="field">
            <label for="dDesignation">Designation</label>
            <input id="dDesignation" type="text" value="${escapeHtml(enquiry.designation || '')}" />
          </div>
          <div class="field">
            <label for="dMobile">Mobile Number</label>
            <input id="dMobile" type="tel" value="${escapeHtml(enquiry.mobile || '')}" required />
          </div>
          <div class="field">
            <label for="dEmail">Email Address</label>
            <input id="dEmail" type="email" value="${escapeHtml(enquiry.email || '')}" />
          </div>
          <div class="field span-2">
            <label for="dLocation">Location / Address</label>
            <input id="dLocation" type="text" value="${escapeHtml(enquiry.location || '')}" />
          </div>
          <div class="field">
            <label for="dWebsite">Website</label>
            <input id="dWebsite" type="text" value="${escapeHtml(enquiry.website || '')}" />
          </div>
          <div class="field">
            <label>Product Categories</label>
            <div class="small" style="padding-top:6px;">${(enquiry.productCategories || [])
              .map((c) => `<span class="badge badge-teal" style="margin:0 4px 4px 0;">${escapeHtml(c)}</span>`)
              .join('')}</div>
          </div>
          <div class="field span-2">
            <label class="card-match-check">
              <input type="checkbox" id="dCardVerified" ${enquiry.cardVerified ? 'checked' : ''} />
              <span>Details above match the visiting / business card</span>
            </label>
          </div>
          <div class="field">
            <label for="dStatus">Enquiry Status</label>
            <select id="dStatus">
              ${statuses
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s)}" ${s === enquiry.enquiryStatus ? 'selected' : ''}>${escapeHtml(s)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="dPriority">Visit Priority</label>
            <select id="dPriority">
              ${['HIGH', 'MEDIUM', 'LOW']
                .map(
                  (p) =>
                    `<option value="${p}" ${p === enquiry.visitPriority ? 'selected' : ''}>${p}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="dVisitDate">Tentative Visit Date</label>
            <input id="dVisitDate" type="date" value="${escapeHtml(enquiry.tentativeVisitDate || '')}" />
          </div>
          <div class="field">
            <label for="dSalesperson">Assigned Salesperson</label>
            <select id="dSalesperson">
              <option value="">-- Unassigned --</option>
              ${activeSales
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s.id)}" ${s.id === enquiry.assignedSalespersonId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="field span-2">
            <label for="dNote">Follow-up Remarks</label>
            <textarea id="dNote" rows="2" placeholder="Log call outcome, quote sent, or visit update..."></textarea>
          </div>
        </div>
        <div class="mt-2" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-danger-outline" data-remove-lead="${escapeHtml(enquiry.enquiryId)}">Remove Enquiry</button>
          <button type="submit" class="btn btn-primary btn-sm">Save Changes</button>
        </div>
      </form>

      <div>
        <h3 style="margin:0 0 8px;font-size:0.92rem;color:var(--navy);">Follow-up History</h3>
        <div class="timeline">${historyItems || '<div class="muted small">No updates yet.</div>'}</div>
      </div>
    `;

    const drawerCheckBtn = $('#drawerCheckCardBtn');
    if (drawerCheckBtn) {
      drawerCheckBtn.onclick = async () => {
        drawerCheckBtn.disabled = true;
        drawerCheckBtn.textContent = 'Checking Card...';
        try {
          const res = await extractCardWithFallback({
            frontCardImage: enquiry.frontCardImage || '',
            backCardImage: enquiry.backCardImage || '',
          });
          const cardMap = res.rawExtracted || res.extracted || {};
          const currentMap = {
            companyName: $('#dCompany').value,
            contactPerson: $('#dContact').value,
            designation: $('#dDesignation').value,
            mobile: $('#dMobile').value,
            email: $('#dEmail').value,
            location: $('#dLocation').value,
            website: $('#dWebsite').value,
          };
          const wrap = $('#drawerCardCompareWrap');
          wrap.innerHTML = buildComparisonTableHtml(
            currentMap,
            cardMap,
            'data-use-drawer-card-field'
          );
          wrap.classList.remove('hidden');
        } catch (err) {
          showToast(err.message);
        } finally {
          drawerCheckBtn.disabled = false;
          drawerCheckBtn.textContent = 'Compare with Card';
        }
      };
    }

    $('#drawerUpdateForm').onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        await api(`/api/enquiries/${encodeURIComponent(enquiry.enquiryId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            companyName: $('#dCompany').value.trim(),
            contactPerson: $('#dContact').value.trim(),
            designation: $('#dDesignation').value.trim(),
            mobile: $('#dMobile').value.trim(),
            email: $('#dEmail').value.trim(),
            location: $('#dLocation').value.trim(),
            website: $('#dWebsite').value.trim(),
            cardVerified: $('#dCardVerified').checked,
            enquiryStatus: $('#dStatus').value,
            visitPriority: $('#dPriority').value,
            tentativeVisitDate: $('#dVisitDate').value,
            assignedSalespersonId: $('#dSalesperson').value,
            newFollowUpNote: $('#dNote').value.trim(),
          }),
        });
        showToast(`Updated ${enquiry.enquiryId}`);
        await openLeadDrawer(enquiry.enquiryId);
        if (state.activeView === 'enquiries') loadEnquiriesView();
        if (state.activeView === 'dashboard') loadDashboardView();
        if (state.activeView === 'calendar') loadCalendarView();
      } catch (err) {
        showToast(err.message);
      }
    };

    $('#leadDrawerBackdrop').classList.remove('hidden');
  } catch (err) {
    showToast(err.message);
  }
}

/* ---------- VIEW 3: DASHBOARD ---------- */

async function loadDashboardView() {
  const params = new URLSearchParams({
    expoName: $('#dashFilterExpo').value,
    dateFrom: $('#dashDateFrom').value,
    dateTo: $('#dashDateTo').value,
  });

  try {
    const report = await api(`/api/dashboard?${params.toString()}`);
    state.dashboard = report;
    renderDashboard(report);
  } catch (err) {
    showToast(err.message);
  }
}

function renderBarList(containerSel, rows, labelKey) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const el = $(containerSel);
  if (!rows.length) {
    el.innerHTML = '<div class="muted small">No data for current filter.</div>';
    return;
  }
  el.innerHTML = rows
    .map((r) => {
      const pct = Math.round((r.count / max) * 100);
      return `<div>
        <div class="bar-row-head">
          <span>${escapeHtml(r[labelKey])}</span>
          <strong>${r.count} ${r.highPriority ? `<span class="muted small">(${r.highPriority} HIGH)</span>` : ''}</strong>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    })
    .join('');
}

function renderDashboard(report) {
  const c = report.cards;
  $('#dashboardKpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total Enquiries</div>
      <div class="kpi-value">${c.totalEnquiries}</div>
      <div class="kpi-sub">${c.completedCount} completed</div>
    </div>
    <div class="kpi-card urgent">
      <div class="kpi-label">High Priority</div>
      <div class="kpi-value">${c.highPriority}</div>
      <div class="kpi-sub">Urgent opportunities</div>
    </div>
    <div class="kpi-card teal">
      <div class="kpi-label">Visits Planned</div>
      <div class="kpi-value">${c.visitsPlanned}</div>
      <div class="kpi-sub">With tentative visit date</div>
    </div>
    <div class="kpi-card gold">
      <div class="kpi-label">Pending Assignment</div>
      <div class="kpi-value">${c.pendingAssignment}</div>
      <div class="kpi-sub">Need salesperson allocation</div>
    </div>
  `;

  renderBarList('#chartByCategory', report.byCategory.filter((r) => r.count > 0 || r.active), 'category');
  renderBarList('#chartByRegion', report.byRegion, 'region');

  $('#salespersonAllocationTable').innerHTML = `
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th>Salesperson</th>
            <th>Region</th>
            <th>Total Leads</th>
            <th>High Priority</th>
            <th>Visits Planned</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          ${report.bySalesperson
            .map(
              (sp) => `<tr>
                <td><strong>${escapeHtml(sp.name)}</strong></td>
                <td class="muted">${escapeHtml(sp.region)}</td>
                <td><strong>${sp.total}</strong></td>
                <td>${sp.highPriority ? `<span class="badge badge-high">${sp.highPriority}</span>` : '0'}</td>
                <td>${sp.visitsPlanned}</td>
                <td>${sp.completed}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  if (!report.highPriorityPending.length) {
    $('#highPriorityQueue').innerHTML =
      '<div class="muted small">All high-priority leads are currently completed!</div>';
  } else {
    $('#highPriorityQueue').innerHTML = `
      <div class="visit-list">
        ${report.highPriorityPending
          .map(
            (e) => `<div class="visit-item" data-open-lead="${escapeHtml(e.enquiryId)}">
              <div class="label-row">
                <strong>${escapeHtml(e.enquiryId)} — ${escapeHtml(e.companyName)}</strong>
                <span class="badge badge-status">${escapeHtml(e.enquiryStatus)}</span>
              </div>
              <div class="small muted mt-1">${escapeHtml(e.contactPerson)} (${escapeHtml(e.mobile)}) · ${escapeHtml(
                e.assignedSalesperson || 'Unassigned'
              )} · Visit: ${escapeHtml(e.tentativeVisitDate || 'Not scheduled')}</div>
            </div>`
          )
          .join('')}
      </div>
    `;
  }
}

/* ---------- VIEW 4: TENTATIVE VISIT CALENDAR ---------- */

async function loadCalendarView() {
  const spId = $('#calSalespersonFilter').value;
  const params = new URLSearchParams();
  if (spId && spId !== 'ALL') params.set('salespersonId', spId);
  try {
    const report = await api(`/api/dashboard?${params.toString()}`);
    renderCalendar(report.plannedVisits || []);
  } catch (err) {
    showToast(err.message);
  }
}

function renderCalendar(visits) {
  const year = state.calendarYear;
  const month = state.calendarMonth;
  const monthName = new Date(year, month, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  $('#calMonthLabel').textContent = monthName;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = todayIso();

  const byDate = new Map();
  for (const v of visits) {
    if (!byDate.has(v.tentativeVisitDate)) byDate.set(v.tentativeVisitDate, []);
    byDate.get(v.tentativeVisitDate).push(v);
  }

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push('<div class="cal-day outside"></div>');
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayVisits = byDate.get(iso) || [];
    cells.push(`<div class="cal-day ${iso === todayStr ? 'today' : ''}">
      <div class="cal-num">${day}</div>
      ${dayVisits
        .map(
          (v) =>
            `<button type="button" class="cal-visit-chip ${escapeHtml(v.visitPriority)}" data-open-lead="${escapeHtml(
              v.enquiryId
            )}" title="${escapeHtml(v.companyName)} (${escapeHtml(v.assignedSalesperson)})">${escapeHtml(
              v.companyName
            )}</button>`
        )
        .join('')}
    </div>`);
  }
  $('#calendarGrid').innerHTML = cells.join('');

  $('#upcomingVisitsList').innerHTML = visits.length
    ? visits
        .map(
          (v) => `<div class="visit-item" data-open-lead="${escapeHtml(v.enquiryId)}">
            <div class="label-row">
              <strong>${escapeHtml(v.tentativeVisitDate)}</strong>
              <span class="badge badge-${v.visitPriority.toLowerCase()}">${escapeHtml(v.visitPriority)}</span>
            </div>
            <div style="font-weight:700;color:var(--navy);margin-top:3px;">${escapeHtml(v.companyName)}</div>
            <div class="small muted">${escapeHtml(v.assignedSalesperson)} · ${escapeHtml(v.stateRegion || '')}</div>
          </div>`
        )
        .join('')
    : '<div class="muted small">No tentative visits scheduled for this filter.</div>';
}

/* ---------- VIEW 5: MASTERS & DATA MODEL ---------- */

async function loadMastersView() {
  try {
    const [{ sheets }, sheetsStatus] = await Promise.all([
      api('/api/sheets-preview'),
      api('/api/sheets/status'),
    ]);
    renderMastersLists();
    if ($('#sheetsWebhookUrlInput')) {
      const localUrl = localStorage.getItem('apl_sheets_webhook_url') || '';
      const effectiveUrl = sheetsStatus.webhookUrl || localUrl;
      if (sheetsStatus.webhookUrl) {
        localStorage.setItem('apl_sheets_webhook_url', sheetsStatus.webhookUrl);
      }
      $('#sheetsWebhookUrlInput').value = effectiveUrl;
      $('#sheetsSyncStatusBadge').textContent = effectiveUrl
        ? 'Connected'
        : 'Local Only (Not Linked)';
    }
    $('#sheetsSchemaCards').innerHTML = [
      ['EXPO_ENQUIRIES', sheets.EXPO_ENQUIRIES.count, 'Main enquiry records, images & follow-ups'],
      ['PRODUCT_CATEGORIES', sheets.PRODUCT_CATEGORIES.count, 'Controlled APL category master'],
      ['SALES_TEAM', sheets.SALES_TEAM.count, 'Approved regional sales reps'],
      ['ENQUIRY_CATEGORIES', sheets.ENQUIRY_CATEGORIES.count, 'Multi-select enquiry/category link rows'],
    ]
      .map(
        ([name, count, desc]) => `<div class="schema-box">
          <h3>${name}</h3>
          <div style="font-size:1.4rem;font-weight:800;color:var(--teal);">${count} rows</div>
          <div class="small muted mt-1">${desc}</div>
          <a class="btn btn-outline btn-sm mt-2" href="/api/export/csv?table=${name}" download="${name}.csv">Download CSV</a>
        </div>`
      )
      .join('');
  } catch (err) {
    showToast(err.message);
  }
}

function renderMastersLists() {
  $('#masterCategoriesList').innerHTML = state.bootstrap.categories
    .map(
      (cat) => `<div class="master-row ${cat.active ? '' : 'inactive'}">
        <div>
          <strong>${escapeHtml(cat.name)}</strong>
          <div class="small muted">${escapeHtml(cat.description || '')}</div>
        </div>
        <button type="button" class="btn btn-outline btn-sm" data-toggle-cat="${escapeHtml(cat.id)}" data-active="${!cat.active}">
          ${cat.active ? 'Disable' : 'Enable'}
        </button>
      </div>`
    )
    .join('');

  $('#masterSalesTeamList').innerHTML = state.bootstrap.salesTeam
    .map(
      (sp) => `<div class="master-row ${sp.active ? '' : 'inactive'}">
        <div>
          <strong>${escapeHtml(sp.name)}</strong> <span class="small muted">(${escapeHtml(sp.region)})</span>
          <div class="small muted">${escapeHtml(sp.email)} · ${escapeHtml(sp.phone)}</div>
        </div>
        <button type="button" class="btn btn-outline btn-sm" data-toggle-sp="${escapeHtml(sp.id)}" data-active="${!sp.active}">
          ${sp.active ? 'Disable' : 'Enable'}
        </button>
      </div>`
    )
    .join('');
}

/* ---------- WEBCAM MODAL ---------- */

async function openWebcamModal() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Webcam unavailable in this browser; use Camera / Upload instead.');
    return;
  }
  try {
    state.webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    $('#webcamVideo').srcObject = state.webcamStream;
    $('#webcamModal').classList.remove('hidden');
  } catch {
    showToast('Camera permission denied or no camera detected.');
  }
}

function closeWebcamModal() {
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach((t) => t.stop());
    state.webcamStream = null;
  }
  $('#webcamModal').classList.add('hidden');
}

/* ---------- INITIALIZATION & EVENTS ---------- */

async function refreshBootstrapAndCount() {
  const [bootstrap, listResp, health] = await Promise.all([
    api('/api/bootstrap'),
    api('/api/enquiries'),
    api('/api/health'),
  ]);
  state.bootstrap = bootstrap;
  state.enquiries = listResp.enquiries || [];
  state.health = health;
  $('#navEnquiryCount').textContent = String(state.enquiries.length);

  const pill = $('#apiStatusPill');
  if (health.geminiConfigured) {
    pill.classList.remove('demo');
    $('#apiStatusText').textContent = `Gemini Vision (${health.geminiModel})`;
    $('#mobileAiChip').textContent = 'Gemini Live';
    $('#ocrModeBadge').textContent = 'Gemini Vision Ready';
  } else {
    pill.classList.add('demo');
    $('#apiStatusText').textContent = 'Local Card OCR + NLP';
    $('#mobileAiChip').textContent = 'Local OCR';
    $('#ocrModeBadge').textContent = 'Local OCR + NLP Ready';
  }

  populateSelectOptions();
  renderCategoryChips();
}

function wireEvents() {
  // Navigation
  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) {
      switchView(navBtn.dataset.nav);
      return;
    }

    const removeBtn = e.target.closest('[data-remove-lead]');
    if (removeBtn) {
      e.stopPropagation();
      handleRemoveEnquiry(removeBtn.dataset.removeLead, removeBtn);
      return;
    }

    const useCardBtn = e.target.closest('[data-use-card-field]');
    if (useCardBtn) {
      const input = $(`#${useCardBtn.dataset.useCardField}`);
      if (input) {
        input.value = useCardBtn.dataset.cardVal || '';
        renderCaptureCardCompare();
        showToast(`Updated ${useCardBtn.dataset.useCardField} from card`);
      }
      return;
    }

    const useDrawerCardBtn = e.target.closest('[data-use-drawer-card-field]');
    if (useDrawerCardBtn) {
      const map = {
        companyName: 'dCompany',
        contactPerson: 'dContact',
        designation: 'dDesignation',
        mobile: 'dMobile',
        email: 'dEmail',
        location: 'dLocation',
        website: 'dWebsite',
      };
      const input = $(`#${map[useDrawerCardBtn.dataset.useDrawerCardField]}`);
      if (input) {
        input.value = useDrawerCardBtn.dataset.cardVal || '';
        showToast('Applied card value — click Save Changes to persist');
      }
      return;
    }

    const zoomImg = e.target.closest('.slot-preview img, .compare-images img, .drawer-cards-pair img');
    if (zoomImg && zoomImg.src) {
      openCardZoom(zoomImg.src, zoomImg.alt || 'Visiting Card Preview');
      return;
    }

    const openLeadEl = e.target.closest('[data-open-lead]');
    if (openLeadEl) {
      openLeadDrawer(openLeadEl.dataset.openLead);
      return;
    }

    const chip = e.target.closest('[data-cat]');
    if (chip) {
      const name = chip.dataset.cat;
      if (state.selectedCategories.has(name)) state.selectedCategories.delete(name);
      else state.selectedCategories.add(name);
      renderCategoryChips();
      return;
    }

    const tagBtn = e.target.closest('[data-remark-tag]');
    if (tagBtn) {
      const box = $('#enquiryRemarks');
      const prefix = box.value && !box.value.endsWith('\n') ? '\n' : '';
      box.value += prefix + tagBtn.dataset.remarkTag;
      box.focus();
      return;
    }

    const prioBtn = e.target.closest('[data-priority]');
    if (prioBtn) {
      setPriority(prioBtn.dataset.priority);
      return;
    }

    const toggleCat = e.target.closest('[data-toggle-cat]');
    if (toggleCat) {
      api(`/api/master/categories/${encodeURIComponent(toggleCat.dataset.toggleCat)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: toggleCat.dataset.active === 'true' }),
      })
        .then(() => refreshBootstrapAndCount())
        .then(() => loadMastersView())
        .catch((err) => showToast(err.message));
      return;
    }

    const toggleSp = e.target.closest('[data-toggle-sp]');
    if (toggleSp) {
      api(`/api/master/sales-team/${encodeURIComponent(toggleSp.dataset.toggleSp)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: toggleSp.dataset.active === 'true' }),
      })
        .then(() => refreshBootstrapAndCount())
        .then(() => loadMastersView())
        .catch((err) => showToast(err.message));
    }
  });

  // File Inputs
  $('#frontFileInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setCardPreview('front', dataUrl);
    await runCardExtraction();
  });

  $('#backFileInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setCardPreview('back', dataUrl);
  });

  $('#rotateFrontBtn').addEventListener('click', () => rotateCardImage('front'));
  $('#rotateBackBtn').addEventListener('click', () => rotateCardImage('back'));
  $('#clearFrontBtn').addEventListener('click', () => setCardPreview('front', ''));
  $('#clearBackBtn').addEventListener('click', () => setCardPreview('back', ''));
  $('#runAiExtractBtn').addEventListener('click', () => runCardExtraction());

  $('#applyAllAiConflictsBtn').addEventListener('click', () => {
    for (const c of state.lastConflicts) {
      const input = $(`#${c.field}`);
      if (input) input.value = c.aiExtractedValue;
    }
    $('#aiConflictBanner').classList.add('hidden');
    showToast('Applied AI values — please re-verify before saving.');
  });

  $('#inspectDuplicateBtn').addEventListener('click', () => {
    if (state.duplicateMatches.length) {
      openLeadDrawer(state.duplicateMatches[0].enquiryId);
    }
  });

  ['mobile', 'email', 'companyName'].forEach((id) => {
    $(`#${id}`).addEventListener('blur', checkDuplicateLead);
  });
  ['companyName', 'contactPerson', 'designation', 'mobile', 'email', 'location', 'website'].forEach(
    (id) => {
      $(`#${id}`).addEventListener('input', () => {
        if (!$('#cardComparePanel').classList.contains('hidden')) {
          renderCaptureCardCompare();
        }
      });
    }
  );
  $('#checkCardMatchBtn').addEventListener('click', renderCaptureCardCompare);
  $('#closeComparePanelBtn').addEventListener('click', () =>
    $('#cardComparePanel').classList.add('hidden')
  );
  $('#closeCardZoomBtn').addEventListener('click', () =>
    $('#cardZoomModal').classList.add('hidden')
  );
  $('#cardZoomModal').addEventListener('click', (e) => {
    if (e.target.id === 'cardZoomModal') $('#cardZoomModal').classList.add('hidden');
  });

  $('#assignedSalespersonId').addEventListener('change', (e) => {
    const sp = state.bootstrap.salesTeam.find((s) => s.id === e.target.value);
    $('#salespersonContactHint').textContent = sp
      ? `${sp.region} · ${sp.phone} · ${sp.email}`
      : '';
  });

  $('#categorySearchInput').addEventListener('input', renderCategoryChips);
  $('#enquiryForm').addEventListener('submit', handleSaveEnquiry);
  $('#resetFormBtn').addEventListener('click', () => resetCaptureForm());
  $('#scanNextCardBtn').addEventListener('click', () => {
    resetCaptureForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#viewSavedEnquiryBtn').addEventListener('click', () => {
    if (state.lastSavedEnquiryId) openLeadDrawer(state.lastSavedEnquiryId);
  });

  // Filters
  ['enqSearchInput', 'enqFilterExpo', 'enqFilterStatus', 'enqFilterPriority', 'enqFilterSalesperson', 'enqFilterCategory'].forEach(
    (id) => {
      $(`#${id}`).addEventListener(id === 'enqSearchInput' ? 'input' : 'change', loadEnquiriesView);
    }
  );

  ['dashFilterExpo', 'dashDateFrom', 'dashDateTo'].forEach((id) => {
    $(`#${id}`).addEventListener('change', loadDashboardView);
  });
  $('#dashResetBtn').addEventListener('click', () => {
    $('#dashFilterExpo').value = 'ALL';
    $('#dashDateFrom').value = '';
    $('#dashDateTo').value = '';
    loadDashboardView();
  });

  // Calendar
  $('#calSalespersonFilter').addEventListener('change', loadCalendarView);
  $('#calPrevBtn').addEventListener('click', () => {
    state.calendarMonth -= 1;
    if (state.calendarMonth < 0) {
      state.calendarMonth = 11;
      state.calendarYear -= 1;
    }
    loadCalendarView();
  });
  $('#calNextBtn').addEventListener('click', () => {
    state.calendarMonth += 1;
    if (state.calendarMonth > 11) {
      state.calendarMonth = 0;
      state.calendarYear += 1;
    }
    loadCalendarView();
  });

  // Masters Forms
  $('#addCategoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/master/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#newCatName').value,
          description: $('#newCatDesc').value,
        }),
      });
      $('#addCategoryForm').reset();
      await refreshBootstrapAndCount();
      await loadMastersView();
      showToast('Product category added');
    } catch (err) {
      showToast(err.message);
    }
  });

  $('#addSalespersonForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/master/sales-team', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#newSpName').value,
          email: $('#newSpEmail').value,
          phone: $('#newSpPhone').value,
          region: $('#newSpRegion').value,
        }),
      });
      $('#addSalespersonForm').reset();
      await refreshBootstrapAndCount();
      await loadMastersView();
      showToast('Salesperson added');
    } catch (err) {
      showToast(err.message);
    }
  });

  $('#sheetsConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const urlVal = $('#sheetsWebhookUrlInput').value.trim();
      if (urlVal) localStorage.setItem('apl_sheets_webhook_url', urlVal);
      else localStorage.removeItem('apl_sheets_webhook_url');

      const resp = await api('/api/sheets/config', {
        method: 'POST',
        body: JSON.stringify({
          webhookUrl: urlVal,
          test: true,
        }),
      });
      if (resp.connectionTest?.synced) {
        $('#sheetsSyncStatusBadge').textContent = 'Connected';
        $('#sheetsSyncHint').textContent = resp.connectionTest.message;
        showToast(resp.connectionTest.message);
      } else if (!resp.configured) {
        $('#sheetsSyncStatusBadge').textContent = 'Local Only';
        showToast('Cleared Google Sheets URL');
      } else {
        $('#sheetsSyncStatusBadge').textContent = 'Check URL';
        $('#sheetsSyncHint').textContent = resp.connectionTest?.message || 'Could not reach sheet';
        showToast(resp.connectionTest?.message || 'Connection test failed');
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  $('#syncAllSheetsBtn').addEventListener('click', async () => {
    try {
      const res = await api('/api/sheets/sync-all', { method: 'POST', body: '{}' });
      showToast(res.message || 'Synced all records to Google Sheet');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Drawer & Webcam
  $('#closeDrawerBtn').addEventListener('click', () =>
    $('#leadDrawerBackdrop').classList.add('hidden')
  );
  $('#leadDrawerBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'leadDrawerBackdrop') {
      $('#leadDrawerBackdrop').classList.add('hidden');
    }
  });
  $('#openWebcamBtn').addEventListener('click', openWebcamModal);
  $('#closeWebcamBtn').addEventListener('click', closeWebcamModal);
  $('#snapPhotoBtn').addEventListener('click', async () => {
    const video = $('#webcamVideo');
    const canvas = $('#webcamCanvas');
    canvas.width = video.videoWidth || 800;
    canvas.height = video.videoHeight || 500;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    closeWebcamModal();
    setCardPreview('front', dataUrl);
    await runCardExtraction();
  });
}

(async function init() {
  wireEvents();
  await refreshBootstrapAndCount();
  $('#enquiryDate').value = todayIso();
  setPriority('MEDIUM');
})();
