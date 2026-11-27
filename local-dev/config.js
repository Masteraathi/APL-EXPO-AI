const fs = require('fs');
const path = require('path');

/**
 * Load simple KEY=VALUE lines from .env without external dependencies.
 * Existing process.env variables take precedence.
 */
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const ROOT_DIR = path.resolve(__dirname, '..');
loadEnv(path.join(ROOT_DIR, '.env'));

const ENQUIRY_STATUSES = [
  'New',
  'Assigned',
  'Contacted',
  'Visit Planned',
  'Completed',
];

const VISIT_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];

const PRIORITY_GUIDANCE = {
  HIGH: 'Immediate or urgent opportunity. Prioritize contact and schedule the earliest practical visit.',
  MEDIUM: 'Qualified enquiry requiring follow-up within the normal sales cycle. Plan a visit when appropriate.',
  LOW: 'Longer-term, exploratory or lower-urgency lead. Keep it in the follow-up pipeline.',
};

const DEFAULT_CATEGORIES = [
  {
    id: 'CAT-01',
    name: 'Industrial Lubricants',
    description: 'Hydraulic oils, gear oils, compressor & turbine lubricants',
    active: true,
  },
  {
    id: 'CAT-02',
    name: 'Metalworking Fluids',
    description: 'Soluble cutting oils, neat cutting oils, synthetic & semi-synthetic fluids',
    active: true,
  },
  {
    id: 'CAT-03',
    name: 'Automotive Lubricants',
    description: 'Commercial fleet engine oils, transmission & axle lubricants',
    active: true,
  },
  {
    id: 'CAT-04',
    name: 'Heat Treatment Oils',
    description: 'Fast & normal quenching oils, martempering & tempering oils',
    active: true,
  },
  {
    id: 'CAT-05',
    name: 'Rust Preventives',
    description: 'Solvent-based, oil-based & water-displacing corrosion protection',
    active: true,
  },
  {
    id: 'CAT-06',
    name: 'Industrial Cleaning',
    description: 'Alkaline, neutral & solvent industrial component cleaners',
    active: true,
  },
  {
    id: 'CAT-07',
    name: 'Speciality Lubricants',
    description: 'High-temperature greases, food-grade & synthetic speciality formulations',
    active: true,
  },
  {
    id: 'CAT-08',
    name: 'Others',
    description: 'Custom formulations, testing support & allied industrial products',
    active: true,
  },
];

const DEFAULT_SALES_TEAM = [];

const FIXED_EXPO_NAME = 'IMTEX-2027';

const DEFAULT_EXPOS = [FIXED_EXPO_NAME];

const SEED_ENQUIRIES = [];

module.exports = {
  ROOT_DIR,
  PORT: Number(process.env.PORT || 3080),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  GOOGLE_SHEETS_WEBHOOK_URL: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  ENQUIRY_STATUSES,
  VISIT_PRIORITIES,
  PRIORITY_GUIDANCE,
  DEFAULT_CATEGORIES,
  DEFAULT_SALES_TEAM,
  FIXED_EXPO_NAME,
  DEFAULT_EXPOS,
  SEED_ENQUIRIES,
};
