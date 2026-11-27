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

const DEFAULT_SALES_TEAM = [
  {
    id: 'SP-01',
    name: 'Rajesh Kulkarni',
    email: 'rajesh.kulkarni@apllubes.example',
    phone: '+91 98220 44110',
    region: 'Maharashtra (Pune / Nashik)',
    active: true,
  },
  {
    id: 'SP-02',
    name: 'Ananya Subramanian',
    email: 'ananya.s@apllubes.example',
    phone: '+91 98401 77230',
    region: 'Tamil Nadu (Chennai / Coimbatore)',
    active: true,
  },
  {
    id: 'SP-03',
    name: 'Vikramaditya Mehta',
    email: 'vikram.mehta@apllubes.example',
    phone: '+91 98250 61890',
    region: 'Gujarat (Ahmedabad / Rajkot)',
    active: true,
  },
  {
    id: 'SP-04',
    name: 'Harpreet Singh Gill',
    email: 'harpreet.gill@apllubes.example',
    phone: '+91 98111 35042',
    region: 'North NCR / Punjab (Gurugram / Ludhiana)',
    active: true,
  },
  {
    id: 'SP-05',
    name: 'Siddharth Nair',
    email: 'siddharth.nair@apllubes.example',
    phone: '+91 98450 22918',
    region: 'Karnataka (Bengaluru / Belagavi)',
    active: true,
  },
];

const FIXED_EXPO_NAME = 'IMTEX-2027';

const DEFAULT_EXPOS = [FIXED_EXPO_NAME];

function svgToDataUri(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

const SEED_ENQUIRIES = [
  {
    enquiryId: 'APL-2027-0001',
    expoName: FIXED_EXPO_NAME,
    enquiryDate: '2027-01-21',
    frontCardImage: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
      <rect width="720" height="420" rx="18" fill="#0F2942"/>
      <rect x="0" y="0" width="18" height="420" fill="#C98A2C"/>
      <text x="52" y="76" fill="#C98A2C" font-family="Arial, sans-serif" font-size="18" font-weight="700">BHARAT PRECISION GEARS PVT. LTD.</text>
      <text x="52" y="148" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="34" font-weight="700">Suresh Deshmukh</text>
      <text x="52" y="182" fill="#9EC5E5" font-family="Arial, sans-serif" font-size="20">VP - Manufacturing &amp; Tooling</text>
      <text x="52" y="256" fill="#E2E8F0" font-family="Arial, sans-serif" font-size="18">M: +91 98231 55420</text>
      <text x="52" y="290" fill="#E2E8F0" font-family="Arial, sans-serif" font-size="18">E: s.deshmukh@bharatgears.in</text>
      <text x="52" y="324" fill="#E2E8F0" font-family="Arial, sans-serif" font-size="18">W: www.bharatgears.in</text>
      <text x="52" y="368" fill="#9EC5E5" font-family="Arial, sans-serif" font-size="16">Plot B-42, MIDC Chakan Phase II, Pune, Maharashtra 410501</text>
    </svg>`),
    backCardImage: '',
    companyName: 'Bharat Precision Gears Pvt. Ltd.',
    contactPerson: 'Suresh Deshmukh',
    designation: 'VP - Manufacturing & Tooling',
    mobile: '+91 98231 55420',
    email: 's.deshmukh@bharatgears.in',
    location: 'Plot B-42, MIDC Chakan Phase II, Pune, Maharashtra 410501',
    stateRegion: 'Maharashtra',
    website: 'www.bharatgears.in',
    mobileVerified: true,
    emailVerified: true,
    cardVerified: true,
    productCategories: ['Metalworking Fluids', 'Heat Treatment Oils', 'Rust Preventives'],
    enquiryRemarks: 'Operating 28 CNC gear hobbing machines. Facing sump rancidity and tool wear with current neat cutting oil. Monthly consumption ~3,200 L. Needs trial sample of low-mist semi-synthetic + sealed quench oil.',
    visitPriority: 'HIGH',
    tentativeVisitDate: '2026-11-30',
    assignedSalespersonId: 'SP-01',
    assignedSalesperson: 'Rajesh Kulkarni',
    enquiryStatus: 'Visit Planned',
    followUpRemarks: 'Confirmed plant trial slot with Mr. Deshmukh for Nov 30 at 10:30 AM.',
    followUpHistory: [
      {
        timestamp: '2026-11-24T11:20:00.000Z',
        actor: 'Expo Booth Team',
        status: 'Assigned',
        note: 'Initial card scan at IMTEX Hall 4. Assigned to Rajesh Kulkarni.',
      },
      {
        timestamp: '2026-11-25T09:45:00.000Z',
        actor: 'Rajesh Kulkarni',
        status: 'Visit Planned',
        note: 'Confirmed plant trial slot with Mr. Deshmukh for Nov 30 at 10:30 AM.',
      },
    ],
    createdAt: '2026-11-24T11:20:00.000Z',
    updatedAt: '2026-11-25T09:45:00.000Z',
  },
  {
    enquiryId: 'APL-2027-0002',
    expoName: FIXED_EXPO_NAME,
    enquiryDate: '2026-11-25',
    frontCardImage: '',
    backCardImage: '',
    companyName: 'Kaveri Die Castings & Alloys',
    contactPerson: 'Meenakshi Sundaram',
    designation: 'Head of Maintenance & Utilities',
    mobile: '+91 94432 88109',
    email: 'meenakshi@kaveridiecast.co.in',
    location: 'SIDCO Industrial Estate, Hosur, Tamil Nadu 635126',
    stateRegion: 'Tamil Nadu',
    website: 'https://kaveridiecast.co.in',
    mobileVerified: true,
    emailVerified: true,
    cardVerified: true,
    productCategories: ['Industrial Lubricants', 'Industrial Cleaning', 'Speciality Lubricants'],
    enquiryRemarks: 'Looking for fire-resistant hydraulic fluids (HFD/HFC) for 12 HPDC machines (600T–1200T) and residue-free aluminium component cleaner prior to anodizing.',
    visitPriority: 'HIGH',
    tentativeVisitDate: '2026-12-02',
    assignedSalespersonId: 'SP-02',
    assignedSalesperson: 'Ananya Subramanian',
    enquiryStatus: 'Contacted',
    followUpRemarks: 'Shared TDS & MSDS for hydraulic grade and cleaner; awaiting maintenance shutdown schedule.',
    followUpHistory: [
      {
        timestamp: '2026-11-25T14:10:00.000Z',
        actor: 'Expo Booth Team',
        status: 'Assigned',
        note: 'Scanned card at IMTEX. Urgent requirement for HPDC hydraulic fluid.',
      },
      {
        timestamp: '2026-11-26T16:30:00.000Z',
        actor: 'Ananya Subramanian',
        status: 'Contacted',
        note: 'Shared TDS & MSDS for hydraulic grade and cleaner; awaiting maintenance shutdown schedule.',
      },
    ],
    createdAt: '2026-11-25T14:10:00.000Z',
    updatedAt: '2026-11-26T16:30:00.000Z',
  },
  {
    enquiryId: 'APL-2027-0003',
    expoName: FIXED_EXPO_NAME,
    enquiryDate: '2026-11-25',
    frontCardImage: '',
    backCardImage: '',
    companyName: 'Shakti Heavy Forgings LLP',
    contactPerson: 'Pranav Patel',
    designation: 'Director - Procurement',
    mobile: '+91 98980 12456',
    email: 'pranav@shaktiforgings.com',
    location: 'GIDC Lodhika, Metoda, Rajkot, Gujarat 360021',
    stateRegion: 'Gujarat',
    website: 'www.shaktiforgings.com',
    mobileVerified: true,
    emailVerified: true,
    cardVerified: true,
    productCategories: ['Heat Treatment Oils', 'Industrial Lubricants'],
    enquiryRemarks: 'Annual contract renewal in Jan 2027 for quenching oil (~18 KL/year) and heavy-duty press gear oil ISO VG 460.',
    visitPriority: 'MEDIUM',
    tentativeVisitDate: '2026-12-05',
    assignedSalespersonId: 'SP-03',
    assignedSalesperson: 'Vikramaditya Mehta',
    enquiryStatus: 'Visit Planned',
    followUpRemarks: 'Scheduled commercial + technical review during Rajkot industrial tour.',
    followUpHistory: [
      {
        timestamp: '2026-11-25T16:05:00.000Z',
        actor: 'Expo Booth Team',
        status: 'Visit Planned',
        note: 'Captured at MACHMA Expo. Scheduled Rajkot visit for Dec 5.',
      },
    ],
    createdAt: '2026-11-25T16:05:00.000Z',
    updatedAt: '2026-11-25T16:05:00.000Z',
  },
  {
    enquiryId: 'APL-2027-0004',
    expoName: FIXED_EXPO_NAME,
    enquiryDate: '2026-11-26',
    frontCardImage: '',
    backCardImage: '',
    companyName: 'Vardhman Precision Fasteners Ltd.',
    contactPerson: 'Arvind Chawla',
    designation: 'Plant Head',
    mobile: '+91 98140 77321',
    email: 'arvind.chawla@vardhmanfasteners.in',
    location: 'Focal Point Phase V, Ludhiana, Punjab 141010',
    stateRegion: 'Punjab',
    website: 'www.vardhmanfasteners.in',
    mobileVerified: true,
    emailVerified: true,
    productCategories: ['Metalworking Fluids', 'Rust Preventives', 'Industrial Cleaning'],
    enquiryRemarks: 'Cold heading & thread rolling unit facing rust spots during coastal export transit. Wants dewatering rust preventive with 6-month indoor protection.',
    visitPriority: 'HIGH',
    tentativeVisitDate: '',
    assignedSalespersonId: '',
    assignedSalesperson: '',
    enquiryStatus: 'New',
    followUpRemarks: '',
    followUpHistory: [
      {
        timestamp: '2026-11-26T12:15:00.000Z',
        actor: 'Expo Booth Team',
        status: 'New',
        note: 'Urgent export corrosion issue reported at booth. Needs immediate North India salesperson assignment.',
      },
    ],
    createdAt: '2026-11-26T12:15:00.000Z',
    updatedAt: '2026-11-26T12:15:00.000Z',
  },
  {
    enquiryId: 'APL-2027-0005',
    expoName: FIXED_EXPO_NAME,
    enquiryDate: '2026-11-26',
    frontCardImage: '',
    backCardImage: '',
    companyName: 'Narmada EV Drivelines Pvt. Ltd.',
    contactPerson: 'Rohan Malhotra',
    designation: 'Senior Quality Engineer',
    mobile: '+91 98182 90344',
    email: 'rohan.m@narmadaev.com',
    location: 'IMT Manesar Sector 8, Gurugram, Haryana 122051',
    stateRegion: 'Haryana',
    website: 'www.narmadaev.com',
    mobileVerified: true,
    emailVerified: true,
    productCategories: ['Speciality Lubricants', 'Automotive Lubricants'],
    enquiryRemarks: 'Testing synthetic EV reduction gearbox fluids and NVH-damping greases for 2-wheeler & 3-wheeler e-axles.',
    visitPriority: 'HIGH',
    tentativeVisitDate: '2026-12-03',
    assignedSalespersonId: 'SP-04',
    assignedSalesperson: 'Harpreet Singh Gill',
    enquiryStatus: 'Assigned',
    followUpRemarks: 'R&D lab sample pack requested before Dec 3 visit.',
    followUpHistory: [
      {
        timestamp: '2026-11-26T15:40:00.000Z',
        actor: 'Expo Booth Team',
        status: 'Assigned',
        note: 'Assigned to Harpreet Singh Gill; R&D sample requested.',
      },
    ],
    createdAt: '2026-11-26T15:40:00.000Z',
    updatedAt: '2026-11-26T15:40:00.000Z',
  },
  {
    enquiryId: 'APL-2027-0006',
    expoName: FIXED_EXPO_NAME,
    enquiryDate: '2026-11-27',
    frontCardImage: '',
    backCardImage: '',
    companyName: 'Deccan Aerospace Machining',
    contactPerson: 'Karthik Rao',
    designation: 'Production Manager',
    mobile: '+91 99001 66712',
    email: 'karthik@deccanaero.in',
    location: 'Peenya Industrial Area Phase III, Bengaluru, Karnataka 560058',
    stateRegion: 'Karnataka',
    website: 'www.deccanaero.in',
    mobileVerified: true,
    emailVerified: true,
    productCategories: ['Metalworking Fluids', 'Speciality Lubricants'],
    enquiryRemarks: 'Machining Ti-6Al-4V and Inconel 718 components on 5-axis Mazak centers. Needs high-pressure chlorine-free synthetic coolant.',
    visitPriority: 'MEDIUM',
    tentativeVisitDate: '2026-12-04',
    assignedSalespersonId: 'SP-05',
    assignedSalesperson: 'Siddharth Nair',
    enquiryStatus: 'Visit Planned',
    followUpRemarks: 'Plant technical audit set for Dec 4 afternoon.',
    followUpHistory: [
      {
        timestamp: '2026-11-27T09:50:00.000Z',
        actor: 'Siddharth Nair',
        status: 'Visit Planned',
        note: 'Plant technical audit set for Dec 4 afternoon.',
      },
    ],
    createdAt: '2026-11-27T09:50:00.000Z',
    updatedAt: '2026-11-27T09:50:00.000Z',
  },
  {
    enquiryId: 'APL-2027-0007',
    expoName: FIXED_EXPO_NAME,
    enquiryDate: '2026-11-22',
    frontCardImage: '',
    backCardImage: '',
    companyName: 'Saurashtra Polymer Moulders',
    contactPerson: 'Nilesh Jadeja',
    designation: 'Managing Partner',
    mobile: '+91 98242 33910',
    email: 'nilesh@saurashtrapolymers.com',
    location: 'GIDC Vatva, Ahmedabad, Gujarat 382445',
    stateRegion: 'Gujarat',
    website: '',
    mobileVerified: true,
    emailVerified: true,
    productCategories: ['Industrial Lubricants', 'Rust Preventives'],
    enquiryRemarks: '18 injection moulding presses using ISO VG 46 & 68 hydraulic oil. Wants bulk barrel pricing and mould-protectant spray.',
    visitPriority: 'LOW',
    tentativeVisitDate: '2026-11-28',
    assignedSalespersonId: 'SP-03',
    assignedSalesperson: 'Vikramaditya Mehta',
    enquiryStatus: 'Completed',
    followUpRemarks: 'Quoted 4-barrel initial order; trial PO received.',
    followUpHistory: [
      {
        timestamp: '2026-11-22T10:30:00.000Z',
        actor: 'Expo Booth Team',
        status: 'Assigned',
        note: 'Captured at PLASTINDIA Gandhinagar.',
      },
      {
        timestamp: '2026-11-26T17:15:00.000Z',
        actor: 'Vikramaditya Mehta',
        status: 'Completed',
        note: 'Quoted 4-barrel initial order; trial PO received.',
      },
    ],
    createdAt: '2026-11-22T10:30:00.000Z',
    updatedAt: '2026-11-26T17:15:00.000Z',
  },
];

module.exports = {
  ROOT_DIR,
  PORT: Number(process.env.PORT || 3080),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
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
