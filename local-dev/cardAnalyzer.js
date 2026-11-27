const { inferStateRegion } = require('./store');

const COMPANY_SUFFIX_RE =
  /\b(pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|inc\.?|corp\.?|corporation|llc|gmbh|industries|enterprises|engineering|engineers|solutions|systems|castings|forgings|gears|metals|alloys|polymers|lubricants|oils|chemicals|motors|auto|automotive|precision|components|works|machinery|tools|tooling|group|associates|traders|exports|imports|india|technologies|tech|foundry|steels)\b/i;

const DESIGNATION_RE =
  /\b(managing\s+director|executive\s+director|director|c\.?e\.?o\.?|c\.?t\.?o\.?|c\.?o\.?o\.?|c\.?f\.?o\.?|vice\s+president|v\.?p\.?|president|founder|co-founder|partner|proprietor|owner|general\s+manager|g\.?m\.?|d\.?g\.?m\.?|a\.?g\.?m\.?|senior\s+manager|sr\.?\s*manager|plant\s+head|unit\s+head|business\s+head|head\s+of|department\s+head|manager|lead|engineer|executive|officer|specialist|consultant|representative|advisor|supervisor|coordinator|sales|marketing|procurement|purchase|maintenance|production|quality|operations|utilities|r\s*&\s*d)\b/i;

const TAGLINE_RE =
  /\b(iso\s*900\d|iatf\s*16949|iso\s*14001|certified\s+company|an\s+iso|since\s+19\d\d|since\s+20\d\d|manufacturers?\s+of|exporters?\s+of|dealers?\s+in|suppliers?\s+of|committed\s+to|precision\s+in\s+every|quality\s+first|excellence)\b/i;

const ADDRESS_HINT_RE =
  /\b(plot|sector|phase|midc|gidc|sidco|kiadb|riico|sipcot|industrial\s+estate|industrial\s+area|road|rd\.?|street|st\.?|avenue|ave|lane|cross|main|nagar|colony|park|tower|floor|flr|bldg|building|block|opp\.?|near|dist\.?|tal\.?|pin|pincode|india|\d{6})\b/i;

const CITY_STATE_RE =
  /\b(pune|mumbai|thane|navi\s+mumbai|nashik|aurangabad|kolhapur|nagpur|satara|chakan|bhosari|waluj|chennai|hosur|coimbatore|madurai|trichy|tiruchirappalli|bengaluru|bangalore|belagavi|belgaum|peenya|mysuru|hubballi|ahmedabad|rajkot|vadodara|baroda|surat|ankleshwar|vapi|jamnagar|gandhinagar|metoda|vatva|delhi|new\s+delhi|gurugram|gurgaon|faridabad|manesar|noida|greater\s+noida|ghaziabad|ludhiana|jalandhar|amritsar|chandigarh|jaipur|bhiwadi|udaipur|indore|pithampur|bhopal|hyderabad|secunderabad|visakhapatnam|kolkata|howrah|durgapur|jamshedpur|rourkela|raipur|maharashtra|karnataka|tamil\s+nadu|gujarat|haryana|punjab|telangana|uttar\s+pradesh|rajasthan|west\s+bengal|jharkhand|madhya\s+pradesh|odisha|kerala)\b/i;

const EMAIL_RE = /[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b(?:\/[^\s,;]*)?/gi;
const PIN_RE = /\b([1-9]\d{5})\b/;

const PIN_PREFIX_TO_STATE = [
  ['11', 'Delhi NCR'],
  ['12', 'Haryana'],
  ['13', 'Haryana'],
  ['14', 'Punjab'],
  ['15', 'Punjab'],
  ['16', 'Punjab'],
  ['17', 'Himachal Pradesh'],
  ['20', 'Uttar Pradesh'],
  ['21', 'Uttar Pradesh'],
  ['22', 'Uttar Pradesh'],
  ['24', 'Uttar Pradesh'],
  ['25', 'Uttar Pradesh'],
  ['26', 'Uttar Pradesh'],
  ['27', 'Uttar Pradesh'],
  ['28', 'Uttar Pradesh'],
  ['30', 'Rajasthan'],
  ['31', 'Rajasthan'],
  ['32', 'Rajasthan'],
  ['33', 'Rajasthan'],
  ['34', 'Rajasthan'],
  ['36', 'Gujarat'],
  ['37', 'Gujarat'],
  ['38', 'Gujarat'],
  ['39', 'Gujarat'],
  ['40', 'Maharashtra'],
  ['41', 'Maharashtra'],
  ['42', 'Maharashtra'],
  ['43', 'Maharashtra'],
  ['44', 'Maharashtra'],
  ['45', 'Madhya Pradesh'],
  ['46', 'Madhya Pradesh'],
  ['47', 'Madhya Pradesh'],
  ['48', 'Madhya Pradesh'],
  ['50', 'Telangana'],
  ['51', 'Andhra Pradesh'],
  ['52', 'Andhra Pradesh'],
  ['53', 'Andhra Pradesh'],
  ['56', 'Karnataka'],
  ['57', 'Karnataka'],
  ['58', 'Karnataka'],
  ['59', 'Karnataka'],
  ['60', 'Tamil Nadu'],
  ['61', 'Tamil Nadu'],
  ['62', 'Tamil Nadu'],
  ['63', 'Tamil Nadu'],
  ['64', 'Tamil Nadu'],
  ['67', 'Kerala'],
  ['68', 'Kerala'],
  ['69', 'Kerala'],
  ['70', 'West Bengal'],
  ['71', 'West Bengal'],
  ['72', 'West Bengal'],
  ['73', 'West Bengal'],
  ['74', 'West Bengal'],
  ['75', 'Odisha'],
  ['80', 'Bihar'],
  ['82', 'Jharkhand'],
  ['83', 'Jharkhand'],
];

const CATEGORY_KEYWORD_RULES = [
  {
    category: 'Metalworking Fluids',
    keywords: [
      'cnc',
      'vmc',
      'hmc',
      'lathe',
      'machining',
      'hobbing',
      'grinding',
      'milling',
      'drilling',
      'tooling',
      'cutting',
      'metalworking',
      'coolant',
      'turning',
      'fastener',
      'thread rolling',
    ],
  },
  {
    category: 'Heat Treatment Oils',
    keywords: [
      'heat treat',
      'quench',
      'sealed quench',
      'furnace',
      'tempering',
      'annealing',
      'forging',
      'induction hardening',
      'carburizing',
      'metallurgy',
    ],
  },
  {
    category: 'Industrial Lubricants',
    keywords: [
      'hydraulic',
      'gearbox',
      'gear',
      'compressor',
      'turbine',
      'press',
      'moulding',
      'molding',
      'die cast',
      'hpdc',
      'industrial',
      'spindle',
      'lubricant',
    ],
  },
  {
    category: 'Automotive Lubricants',
    keywords: [
      'automotive',
      'vehicle',
      'fleet',
      'engine',
      'transmission',
      'axle',
      'tractor',
      'two wheeler',
      'commercial vehicle',
      'ev ',
      'e-axle',
    ],
  },
  {
    category: 'Rust Preventives',
    keywords: [
      'rust',
      'corrosion',
      'export',
      'bright bar',
      'sheet metal',
      'stamping',
      'bearing',
      'coil',
      'steel',
      'wire',
    ],
  },
  {
    category: 'Industrial Cleaning',
    keywords: [
      'clean',
      'degreas',
      'washing',
      'ultrasonic',
      'anodiz',
      'plating',
      'die cast',
      'surface finish',
      'paint shop',
    ],
  },
  {
    category: 'Speciality Lubricants',
    keywords: [
      'speciality',
      'specialty',
      'grease',
      'aerospace',
      'food grade',
      'high temp',
      'high-temp',
      'synthetic',
      'silicone',
      'ptfe',
      'pharma',
      'nvh',
    ],
  },
];

function cleanLine(line) {
  return String(line || '')
    .replace(/[•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripContactLabels(str) {
  return str
    .replace(
      /^(?:m|mob|mobile|cell|ph|phone|tel|t|e|email|e-mail|w|web|website|fax|f|o|off|regd\.?\s*off|works|factory|plant)\s*[:.\-]\s*/i,
      ''
    )
    .trim();
}

/**
 * Split multi-segment OCR lines packed with pipes/tabs (e.g. "M: +91 ... | E: a@b.com")
 */
function explodeSegmentedLines(lines) {
  const result = [];
  for (const l of lines) {
    const parts = l.text.split(/\s+\|\s+|\t+/).map((p) => cleanLine(p)).filter(Boolean);
    if (parts.length <= 1) {
      result.push(l);
    } else {
      for (const p of parts) {
        result.push({ ...l, text: p });
      }
    }
  }
  return result;
}

function extractEmails(lines) {
  const found = [];
  for (const l of lines) {
    const matches = l.text.match(EMAIL_RE) || [];
    for (const m of matches) {
      const cleaned = m.replace(/\s+/g, '').toLowerCase();
      if (!found.includes(cleaned)) found.push(cleaned);
    }
  }
  return found;
}

function normalizeOcrDigits(raw) {
  // Fix common OCR confusion in numeric strings (O/o -> 0, l/I -> 1 when surrounded by digits)
  return raw
    .replace(/(?<=\d)[Oo](?=[\d\s-])/g, '0')
    .replace(/(?<=[\d\s+])[Oo](?=\d)/g, '0');
}

function extractPhones(lines) {
  const candidates = [];
  const phoneChunkRe = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,6}/g;

  for (const l of lines) {
    const raw = normalizeOcrDigits(l.text);
    const isFax = /\b(fax|f\s*:)\b/i.test(raw);
    const isMobileLabel = /\b(m|mob|mobile|cell|whatsapp|wa)\b\s*[:.\-]?/i.test(raw);
    const isLandlineLabel = /\b(tel|telephone|off|office|landline|ph|phone|t)\b\s*[:.\-]?/i.test(raw);

    const matches = raw.match(phoneChunkRe) || [];
    for (const m of matches) {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) continue;
      if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(m.trim())) continue;
      // Skip likely 6-digit PINs or GST numbers
      if (digits.length === 6) continue;

      let score = 1;
      if (isFax) score -= 12;
      if (isMobileLabel) score += 7;
      if (isLandlineLabel) score += 1;
      if (/^(?:\+?91|0)?[6-9]\d{9}$/.test(digits)) score += 6;
      if (m.includes('+')) score += 2;

      let formatted = m.trim().replace(/\s+/g, ' ');
      if (/^[6-9]\d{9}$/.test(digits)) {
        formatted = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
      } else if (/^91[6-9]\d{9}$/.test(digits) && !formatted.startsWith('+')) {
        formatted = `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
      }

      candidates.push({
        formatted,
        digits,
        score,
        isFax,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const unique = [];
  const seenDigits = new Set();
  for (const c of candidates) {
    const tail = c.digits.slice(-10);
    if (!seenDigits.has(tail)) {
      seenDigits.add(tail);
      unique.push(c);
    }
  }
  return unique;
}

function extractWebsites(lines, emails) {
  const emailDomains = new Set(
    emails.map((e) => e.split('@')[1]).filter(Boolean)
  );
  const found = [];
  for (const l of lines) {
    const withoutEmails = l.text.replace(EMAIL_RE, ' ').replace(/\bwww,/gi, 'www.');
    const matches = withoutEmails.match(URL_RE) || [];
    for (const m of matches) {
      const lower = m.toLowerCase().replace(/[.,;)]+$/, '');
      if (
        /\.(com|in|co\.in|net|org|io|co|biz|info|tech|ai|eu|de|us)(\/|$)/i.test(lower) ||
        lower.startsWith('http') ||
        lower.startsWith('www.')
      ) {
        if (!found.includes(lower)) found.push(lower);
      }
    }
  }
  if (found.length === 0 && emailDomains.size > 0) {
    const domain = Array.from(emailDomains)[0];
    if (!/(gmail|yahoo|outlook|hotmail|rediffmail|protonmail|icloud)\./i.test(domain)) {
      return [`www.${domain}`];
    }
  }
  return found;
}

function inferStateFromPin(text) {
  const m = String(text || '').match(PIN_RE);
  if (!m) return '';
  const prefix2 = m[1].slice(0, 2);
  for (const [pfx, state] of PIN_PREFIX_TO_STATE) {
    if (prefix2 === pfx) return state;
  }
  return '';
}

function scoreNameLikelihood(text) {
  let t = cleanLine(text).replace(/^(?:mr|mrs|ms|dr|er|shri)\.?\s+/i, '');
  if (!t || t.length < 3 || t.length > 42) return -5;
  if (/\d/.test(t) || /[@/:]/.test(t)) return -10;
  if (
    COMPANY_SUFFIX_RE.test(t) ||
    DESIGNATION_RE.test(t) ||
    ADDRESS_HINT_RE.test(t) ||
    TAGLINE_RE.test(t)
  ) {
    return -6;
  }
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 4) return 0;
  const titleWords = words.filter(
    (w) => /^[A-Z][a-z.'-]+$/.test(w) || /^[A-Z]\.?$/.test(w)
  );
  if (titleWords.length === words.length) return 6;
  if (titleWords.length >= words.length - 1) return 3;
  const allCapsWords = words.filter((w) => /^[A-Z]{2,}$/.test(w));
  if (allCapsWords.length === words.length) return 2;
  return 0;
}

function toTitleCaseIfAllCaps(name) {
  if (!name || name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, ch) => ch.toUpperCase());
}

function inferCategories(fullText, activeCategories = []) {
  const lower = fullText.toLowerCase();
  const activeSet = new Set(activeCategories.map((c) => c.name || c));
  const matched = [];
  for (const rule of CATEGORY_KEYWORD_RULES) {
    if (activeSet.size > 0 && !activeSet.has(rule.category)) continue;
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      matched.push(rule.category);
    }
  }
  return matched;
}

/**
 * Spatial + NLP business card parser.
 * Accepts OCR line arrays ({ text, x, y, width, height }) or raw text for front & back.
 */
function analyzeCardOcr({
  frontLines = [],
  backLines = [],
  frontText = '',
  backText = '',
  activeCategories = [],
}) {
  const normalizeLines = (lines, fallbackText, side) => {
    const base =
      Array.isArray(lines) && lines.length > 0
        ? lines
            .map((l, idx) => ({
              text: cleanLine(l.text),
              x: Number(l.x || 0),
              y: Number(l.y || idx * 30),
              width: Number(l.width || 0),
              height: Number(l.height || 18),
              side,
              index: idx,
            }))
            .filter((l) => l.text.length > 0)
        : String(fallbackText || '')
            .split(/\r?\n/)
            .map(cleanLine)
            .filter(Boolean)
            .map((text, idx) => ({
              text,
              x: 0,
              y: idx * 30,
              width: 0,
              height: 18,
              side,
              index: idx,
            }));

    return explodeSegmentedLines(base).map((item, idx) => ({ ...item, index: idx }));
  };

  const fLines = normalizeLines(frontLines, frontText, 'front');
  const bLines = normalizeLines(backLines, backText, 'back');
  const allLines = [...fLines, ...bLines];

  const emails = extractEmails(allLines);
  const phones = extractPhones(allLines);
  const websites = extractWebsites(allLines, emails);

  const primaryEmail = emails[0] || '';
  const emailUser = primaryEmail ? primaryEmail.split('@')[0] : '';
  const emailDomainRoot = primaryEmail
    ? (primaryEmail.split('@')[1] || '').split('.')[0]
    : '';

  let designation = '';
  let designationLineIdx = -1;
  let companyName = '';
  let contactPerson = '';

  const frontScored = fLines.map((l, i) => {
    const t = l.text;
    const hasEmail = EMAIL_RE.test(t);
    EMAIL_RE.lastIndex = 0;
    const hasPhone = extractPhones([l]).length > 0;
    const isUrl = /^(https?:\/\/|www\.)/i.test(stripContactLabels(t));
    const isTagline = TAGLINE_RE.test(t);
    const isAddr = ADDRESS_HINT_RE.test(t) || PIN_RE.test(t) || CITY_STATE_RE.test(t);
    const hasCompSuffix = COMPANY_SUFFIX_RE.test(t);
    const hasDesig = DESIGNATION_RE.test(t);
    const nameScore = scoreNameLikelihood(t);
    return {
      ...l,
      i,
      hasEmail,
      hasPhone,
      isUrl,
      isTagline,
      isAddr,
      hasCompSuffix,
      hasDesig,
      nameScore,
    };
  });

  // 0. Check for inline "Person Name - Designation" on a single line
  for (const item of frontScored) {
    if (item.hasEmail || item.hasPhone || item.isAddr || item.hasCompSuffix) continue;
    const splitMatch = item.text.match(/^([A-Za-z.\s]{4,35})\s+[-–|,/]\s+(.+)$/);
    if (splitMatch && DESIGNATION_RE.test(splitMatch[2]) && scoreNameLikelihood(splitMatch[1]) >= 2) {
      contactPerson = toTitleCaseIfAllCaps(splitMatch[1].trim());
      designation = splitMatch[2].trim();
      designationLineIdx = item.i;
      break;
    }
  }

  // 1. Find designation line if not extracted inline
  if (!designation) {
    for (const item of frontScored) {
      if (
        !item.hasEmail &&
        !item.hasPhone &&
        !item.isAddr &&
        !item.isTagline &&
        item.hasDesig &&
        !item.hasCompSuffix
      ) {
        designation = item.text;
        designationLineIdx = item.i;
        break;
      }
    }
  }

  // 2. Find company name (suffix match > domain match > prominent top line)
  let bestCompanyScore = -1;
  let companyIdx = -1;
  for (const item of frontScored) {
    if (item.hasEmail || item.hasPhone || item.isUrl || item.isTagline) continue;
    if (item.isAddr && !item.hasCompSuffix) continue;
    if (item.i === designationLineIdx) continue;

    let score = 0;
    if (item.hasCompSuffix) score += 10;
    if (
      emailDomainRoot &&
      emailDomainRoot.length >= 4 &&
      item.text.toLowerCase().replace(/\s+/g, '').includes(emailDomainRoot)
    ) {
      score += 7;
    }
    if (item.i <= 1) score += 3;
    if (item.text === item.text.toUpperCase() && item.text.length >= 5) score += 2;
    if (item.height >= 24) score += 2;
    if (item.nameScore >= 5 && !item.hasCompSuffix) score -= 5;

    if (score > bestCompanyScore && score >= 4) {
      bestCompanyScore = score;
      companyName = item.text;
      companyIdx = item.i;
    }
  }

  // Combine 2-line company names when line immediately before suffix line has no email/phone/person score
  if (companyIdx > 0 && COMPANY_SUFFIX_RE.test(companyName) && companyName.split(/\s+/).length <= 3) {
    const prev = frontScored[companyIdx - 1];
    if (
      prev &&
      !prev.hasEmail &&
      !prev.hasPhone &&
      !prev.isUrl &&
      !prev.isAddr &&
      !prev.isTagline &&
      !prev.hasDesig &&
      prev.nameScore < 4 &&
      prev.text.length <= 28
    ) {
      companyName = `${prev.text} ${companyName}`.trim();
    }
  }

  if (!companyName) {
    const fallback = frontScored.find(
      (item) =>
        !item.hasEmail &&
        !item.hasPhone &&
        !item.isUrl &&
        !item.isAddr &&
        !item.isTagline &&
        item.i !== designationLineIdx &&
        item.nameScore < 5
    );
    if (fallback) companyName = fallback.text;
  }

  // 3. Find contact person (line right above designation, or email username match, or highest nameScore)
  if (!contactPerson && designationLineIdx > 0) {
    const above = frontScored[designationLineIdx - 1];
    if (
      above &&
      !above.hasEmail &&
      !above.hasPhone &&
      !above.isAddr &&
      !above.isTagline &&
      above.text !== companyName &&
      above.nameScore >= 0
    ) {
      contactPerson = toTitleCaseIfAllCaps(
        above.text.replace(/^(?:mr|mrs|ms|dr|er|shri)\.?\s+/i, '')
      );
    }
  }

  if (!contactPerson) {
    let bestPersonScore = 0;
    for (const item of frontScored) {
      if (item.text === companyName || item.i === designationLineIdx) continue;
      if (item.hasEmail || item.hasPhone || item.isUrl || item.isAddr || item.isTagline) continue;
      let score = item.nameScore + (item.height >= 22 ? 2 : 0);
      if (emailUser) {
        const tokens = item.text.toLowerCase().split(/\s+/);
        if (tokens.some((tok) => tok.length >= 3 && emailUser.includes(tok))) {
          score += 6;
        }
      }
      if (score > bestPersonScore) {
        bestPersonScore = score;
        contactPerson = toTitleCaseIfAllCaps(
          item.text.replace(/^(?:mr|mrs|ms|dr|er|shri)\.?\s+/i, '')
        );
      }
    }
  }

  // 4. Address / Location reconstruction
  const addressLines = [];
  for (const item of frontScored) {
    if (
      item.text === companyName ||
      item.text === contactPerson ||
      item.i === designationLineIdx ||
      item.isTagline
    ) {
      continue;
    }
    if (item.isAddr && !item.hasEmail && !item.isUrl && !item.hasPhone) {
      addressLines.push(stripContactLabels(item.text));
    }
  }
  const location = addressLines.join(', ');
  const combinedFullText = allLines.map((l) => l.text).join('\n');
  const stateRegion =
    inferStateFromPin(location || combinedFullText) ||
    inferStateRegion(location || combinedFullText);

  const mobile = phones.find((p) => !p.isFax)?.formatted || '';
  const alternatePhones = phones.slice(1).map((p) => p.formatted);
  const website = websites[0] || '';
  const suggestedCategories = inferCategories(combinedFullText, activeCategories);

  const fieldConfidence = {
    companyName: companyName ? (bestCompanyScore >= 10 ? 0.94 : 0.78) : 0,
    contactPerson: contactPerson ? (designationLineIdx >= 0 ? 0.92 : 0.8) : 0,
    designation: designation ? 0.9 : 0,
    mobile: mobile ? 0.93 : 0,
    email: primaryEmail ? 0.96 : 0,
    location: location ? 0.84 : 0,
    website: website ? 0.88 : 0,
  };

  const scores = Object.values(fieldConfidence).filter((v) => v > 0);
  const overallConfidence =
    scores.length > 0
      ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
      : 0.25;

  return {
    companyName,
    contactPerson,
    designation,
    mobile,
    alternatePhones,
    email: primaryEmail,
    location,
    stateRegion: stateRegion === 'Other / Unspecified' ? '' : stateRegion,
    website,
    suggestedCategories,
    confidence: overallConfidence,
    fieldConfidence,
    ocrLines: allLines.map((l) => ({ side: l.side, text: l.text })),
    rawText: combinedFullText,
  };
}

module.exports = {
  analyzeCardOcr,
  inferStateFromPin,
  inferCategories,
};
