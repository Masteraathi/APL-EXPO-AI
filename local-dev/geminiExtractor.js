const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { GEMINI_API_KEY, GEMINI_MODEL } = require('./config');
const { inferStateRegion } = require('./store');
const { analyzeCardOcr, inferStateFromPin, inferCategories } = require('./cardAnalyzer');

const WIN_OCR_SCRIPT = path.join(__dirname, 'winOcr.ps1');

function parseBase64DataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];
  return {
    mimeType,
    base64Data,
    isSvg: mimeType === 'image/svg+xml',
  };
}

function extFromMime(mimeType) {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('bmp')) return '.bmp';
  return '.jpg';
}

function extractSvgLines(base64Data) {
  const xml = Buffer.from(base64Data, 'base64').toString('utf8');
  const lines = [];
  const textTagRe = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = textTagRe.exec(xml)) !== null) {
    const cleaned = match[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) lines.push({ text: cleaned, x: 0, y: lines.length * 24, width: 200, height: 20 });
  }
  return lines;
}

function runWindowsOcr(frontPart, backPart) {
  return new Promise((resolve, reject) => {
    const tempFiles = [];
    const writeTemp = (part, prefix) => {
      if (!part || part.isSvg) return '';
      const filePath = path.join(
        os.tmpdir(),
        `apl-ocr-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${extFromMime(
          part.mimeType
        )}`
      );
      fs.writeFileSync(filePath, Buffer.from(part.base64Data, 'base64'));
      tempFiles.push(filePath);
      return filePath;
    };

    let frontPath = '';
    let backPath = '';
    try {
      frontPath = writeTemp(frontPart, 'front');
      backPath = writeTemp(backPart, 'back');
    } catch (err) {
      for (const f of tempFiles) fs.rmSync(f, { force: true });
      reject(err);
      return;
    }

    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_OCR_SCRIPT];
    if (frontPath) args.push('-FrontPath', frontPath);
    if (backPath) args.push('-BackPath', backPath);

    execFile('powershell', args, { timeout: 25000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      for (const f of tempFiles) fs.rmSync(f, { force: true });
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim() || '{}');
        resolve({
          frontLines: Array.isArray(parsed.frontLines) ? parsed.frontLines : [],
          backLines: Array.isArray(parsed.backLines) ? parsed.backLines : [],
          frontText: parsed.frontText || '',
          backText: parsed.backText || '',
        });
      } catch (parseErr) {
        reject(new Error(`Invalid OCR output: ${parseErr.message}`));
      }
    });
  });
}

function buildSafeMergeResult(extracted, existingFields = {}, verifiedFields = {}) {
  const fields = [
    'companyName',
    'contactPerson',
    'designation',
    'mobile',
    'email',
    'location',
    'stateRegion',
    'website',
  ];

  const merged = {};
  const preservedVerified = [];
  const conflicts = [];

  for (const key of fields) {
    const incoming = String(extracted[key] || '').trim();
    const current = String(existingFields[key] || '').trim();
    const isVerified = Boolean(verifiedFields[key]);

    if (isVerified && current) {
      merged[key] = current;
      preservedVerified.push(key);
      if (incoming && incoming.toLowerCase() !== current.toLowerCase()) {
        conflicts.push({
          field: key,
          verifiedValue: current,
          aiExtractedValue: incoming,
        });
      }
    } else {
      merged[key] = incoming || current;
    }
  }

  if (!merged.stateRegion && merged.location) {
    const inferred = inferStateFromPin(merged.location) || inferStateRegion(merged.location);
    if (inferred !== 'Other / Unspecified') merged.stateRegion = inferred;
  }

  return {
    merged,
    preservedVerified,
    conflicts,
  };
}

async function callGeminiVision({ frontPart, backPart, categories }) {
  const categoryList = (categories || []).map((c) => c.name || c).join(', ');
  const prompt = [
    'You are an expert business-card vision & structured lead extraction engine for APL EXPO AI (industrial lubricants, metalworking fluids, heat treatment oils, rust preventives, industrial cleaners, speciality greases).',
    'Analyze the visiting card image(s) carefully (front side, and optional back side). Handle rotated text, stylized logos, multi-column layouts, and multiple phone numbers.',
    'Return ONLY valid JSON with these exact keys:',
    '- companyName (string: legal/trading company name, NOT a slogan or tagline)',
    '- contactPerson (string: full name of the cardholder)',
    '- designation (string: job title / department role)',
    '- mobile (string: primary mobile/WhatsApp number, preserving country code if printed; prefer mobile over landline/fax)',
    '- alternatePhones (array of strings: any secondary/office/landline numbers)',
    '- email (string: primary email address in lowercase)',
    '- location (string: full street/industrial estate/city/state/PIN address)',
    '- stateRegion (string: Indian state or region inferred from address/city/PIN)',
    '- website (string: company website URL)',
    `- suggestedCategories (array of strings chosen ONLY from: ${categoryList})`,
    '- ocrLines (array of { side: "front"|"back", text: string } representing the key text lines read on the card)',
    '- fieldConfidence (object with numeric 0..1 confidence for companyName, contactPerson, designation, mobile, email, location, website)',
    '- confidence (number 0..1 overall confidence)',
    'Rules: Never fabricate missing fields (use ""). Never confuse fax/toll-free with mobile.',
  ].join('\n');

  const parts = [{ text: prompt }];
  if (frontPart && !frontPart.isSvg) {
    parts.push({
      inline_data: {
        mime_type: frontPart.mimeType,
        data: frontPart.base64Data,
      },
    });
  }
  if (backPart && !backPart.isSvg) {
    parts.push({
      inline_data: {
        mime_type: backPart.mimeType,
        data: backPart.base64Data,
      },
    });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errText.slice(0, 220)}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);

  // Enrich suggestedCategories / stateRegion using domain analyzer if Gemini left them sparse
  const rawTextJoined = Array.isArray(parsed.ocrLines)
    ? parsed.ocrLines.map((l) => l.text).join('\n')
    : `${parsed.companyName || ''} ${parsed.designation || ''} ${parsed.location || ''}`;

  if (!parsed.stateRegion && parsed.location) {
    const inferred = inferStateFromPin(parsed.location) || inferStateRegion(parsed.location);
    if (inferred !== 'Other / Unspecified') parsed.stateRegion = inferred;
  }
  if (!Array.isArray(parsed.suggestedCategories) || parsed.suggestedCategories.length === 0) {
    parsed.suggestedCategories = inferCategories(rawTextJoined, categories);
  }

  return parsed;
}

/**
 * Analyzes Front & Back visiting card images using:
 * 1) Gemini Vision AI when GEMINI_API_KEY is configured, or
 * 2) Native Windows OCR + Spatial/NLP Card Analyzer (local-dev/cardAnalyzer.js) offline.
 * Guarantees verified fields are NEVER silently overwritten.
 */
async function extractBusinessCard({
  frontCardImage = '',
  backCardImage = '',
  existingFields = {},
  verifiedFields = {},
  categories = [],
}) {
  if (!frontCardImage && !backCardImage) {
    const err = new Error('Please capture or upload at least one business card image.');
    err.statusCode = 400;
    throw err;
  }

  const frontPart = parseBase64DataUrl(frontCardImage);
  const backPart = parseBase64DataUrl(backCardImage);
  if (!frontPart && !backPart) {
    const err = new Error('Invalid image format. Expected base64 data URL.');
    err.statusCode = 400;
    throw err;
  }

  const hasRasterImage =
    (frontPart && !frontPart.isSvg) || (backPart && !backPart.isSvg);

  let analyzed;
  let extractionSource = 'local-win-ocr-nlp';
  let warning = '';

  if (GEMINI_API_KEY && hasRasterImage) {
    try {
      analyzed = await callGeminiVision({ frontPart, backPart, categories });
      extractionSource = `gemini:${GEMINI_MODEL}`;
    } catch (error) {
      warning = `Gemini Vision unavailable (${error.message}); fell back to Local Card OCR Analyzer.`;
    }
  }

  if (!analyzed) {
    const svgFrontLines = frontPart?.isSvg ? extractSvgLines(frontPart.base64Data) : [];
    const svgBackLines = backPart?.isSvg ? extractSvgLines(backPart.base64Data) : [];

    let winOcr = { frontLines: [], backLines: [], frontText: '', backText: '' };
    if (hasRasterImage) {
      winOcr = await runWindowsOcr(frontPart, backPart);
    }

    analyzed = analyzeCardOcr({
      frontLines: svgFrontLines.length ? svgFrontLines : winOcr.frontLines,
      backLines: svgBackLines.length ? svgBackLines : winOcr.backLines,
      frontText: winOcr.frontText,
      backText: winOcr.backText,
      activeCategories: categories,
    });
  }

  const { merged, preservedVerified, conflicts } = buildSafeMergeResult(
    analyzed,
    existingFields,
    verifiedFields
  );

  return {
    extractionSource,
    warning,
    extracted: merged,
    rawExtracted: analyzed,
    alternatePhones: Array.isArray(analyzed.alternatePhones) ? analyzed.alternatePhones : [],
    suggestedCategories: Array.isArray(analyzed.suggestedCategories)
      ? analyzed.suggestedCategories
      : [],
    confidence: typeof analyzed.confidence === 'number' ? analyzed.confidence : 0.85,
    fieldConfidence: analyzed.fieldConfidence || {},
    ocrLines: Array.isArray(analyzed.ocrLines) ? analyzed.ocrLines : [],
    preservedVerified,
    conflicts,
    requiresReview: true,
  };
}

module.exports = {
  extractBusinessCard,
  buildSafeMergeResult,
};
