const fs = require('fs');
const path = require('path');
const {
  ENQUIRY_STATUSES,
  VISIT_PRIORITIES,
  DEFAULT_CATEGORIES,
  DEFAULT_SALES_TEAM,
  FIXED_EXPO_NAME,
  DEFAULT_EXPOS,
  SEED_ENQUIRIES,
} = require('./config');

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsv(headers, rows) {
  const headerLine = headers.map(csvEscape).join(',');
  const lines = rows.map((row) => headers.map((h) => csvEscape(row[h])).join(','));
  return [headerLine, ...lines].join('\r\n') + '\r\n';
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
}

function isValidMobile(mobile) {
  if (!mobile) return false;
  const digits = String(mobile).replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

class ExpoStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, 'db.json');
    this.ensureInitialized();
  }

  ensureInitialized() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.dbPath)) {
      const initial = {
        categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
        salesTeam: JSON.parse(JSON.stringify(DEFAULT_SALES_TEAM)),
        expos: [...DEFAULT_EXPOS],
        enquiries: JSON.parse(JSON.stringify(SEED_ENQUIRIES)),
      };
      this.writeState(initial);
    } else {
      this.syncCsvFiles(this.readState());
    }
  }

  readState() {
    const raw = fs.readFileSync(this.dbPath, 'utf8');
    return JSON.parse(raw);
  }

  writeState(state) {
    fs.writeFileSync(this.dbPath, JSON.stringify(state, null, 2), 'utf8');
    this.syncCsvFiles(state);
  }

  buildEnquiryCategoriesLinkTable(state) {
    const categoryByName = new Map(
      state.categories.map((c) => [c.name.toLowerCase(), c])
    );
    const links = [];
    for (const enq of state.enquiries) {
      const cats = Array.isArray(enq.productCategories) ? enq.productCategories : [];
      for (const catName of cats) {
        const master = categoryByName.get(String(catName).toLowerCase());
        links.push({
          'Link ID': `${enq.enquiryId}__${master ? master.id : catName.replace(/\s+/g, '_').toUpperCase()}`,
          'Enquiry ID': enq.enquiryId,
          'Category ID': master ? master.id : '',
          'Category Name': catName,
          'Expo Name': enq.expoName,
          'Enquiry Date': enq.enquiryDate,
          'Visit Priority': enq.visitPriority,
        });
      }
    }
    return links;
  }

  syncCsvFiles(state) {
    const enquiryHeaders = [
      'Enquiry ID',
      'Expo Name',
      'Enquiry Date',
      'Business Card Image',
      'Back Card Image',
      'Company Name',
      'Contact Person',
      'Designation',
      'Mobile',
      'Email',
      'Location',
      'State / Region',
      'Website',
      'Product Categories',
      'Enquiry Remarks',
      'Visit Priority',
      'Tentative Visit Date',
      'Assigned Salesperson',
      'Enquiry Status',
      'Follow-up Remarks',
    ];
    const enquiryRows = state.enquiries.map((e) => ({
      'Enquiry ID': e.enquiryId,
      'Expo Name': e.expoName,
      'Enquiry Date': e.enquiryDate,
      'Business Card Image': e.frontCardImage ? `[Stored Image: ${e.enquiryId}-front]` : '',
      'Back Card Image': e.backCardImage ? `[Stored Image: ${e.enquiryId}-back]` : '',
      'Company Name': e.companyName,
      'Contact Person': e.contactPerson,
      'Designation': e.designation,
      'Mobile': e.mobile,
      'Email': e.email,
      'Location': e.location,
      'State / Region': e.stateRegion || '',
      'Website': e.website || '',
      'Product Categories': (e.productCategories || []).join('; '),
      'Enquiry Remarks': e.enquiryRemarks,
      'Visit Priority': e.visitPriority,
      'Tentative Visit Date': e.tentativeVisitDate || '',
      'Assigned Salesperson': e.assignedSalesperson || '',
      'Enquiry Status': e.enquiryStatus,
      'Follow-up Remarks': e.followUpRemarks || '',
    }));
    fs.writeFileSync(
      path.join(this.dataDir, 'EXPO_ENQUIRIES.csv'),
      toCsv(enquiryHeaders, enquiryRows),
      'utf8'
    );

    const categoryHeaders = ['Category ID', 'Category Name', 'Description', 'Active'];
    const categoryRows = state.categories.map((c) => ({
      'Category ID': c.id,
      'Category Name': c.name,
      'Description': c.description || '',
      'Active': c.active ? 'TRUE' : 'FALSE',
    }));
    fs.writeFileSync(
      path.join(this.dataDir, 'PRODUCT_CATEGORIES.csv'),
      toCsv(categoryHeaders, categoryRows),
      'utf8'
    );

    const salesHeaders = ['Salesperson ID', 'Name', 'Email', 'Phone', 'Region', 'Active'];
    const salesRows = state.salesTeam.map((s) => ({
      'Salesperson ID': s.id,
      'Name': s.name,
      'Email': s.email,
      'Phone': s.phone,
      'Region': s.region,
      'Active': s.active ? 'TRUE' : 'FALSE',
    }));
    fs.writeFileSync(
      path.join(this.dataDir, 'SALES_TEAM.csv'),
      toCsv(salesHeaders, salesRows),
      'utf8'
    );

    const linkHeaders = [
      'Link ID',
      'Enquiry ID',
      'Category ID',
      'Category Name',
      'Expo Name',
      'Enquiry Date',
      'Visit Priority',
    ];
    const linkRows = this.buildEnquiryCategoriesLinkTable(state);
    fs.writeFileSync(
      path.join(this.dataDir, 'ENQUIRY_CATEGORIES.csv'),
      toCsv(linkHeaders, linkRows),
      'utf8'
    );
  }

  getBootstrap() {
    const state = this.readState();
    const expoSet = new Set(state.expos || []);
    for (const enq of state.enquiries) {
      if (enq.expoName) expoSet.add(enq.expoName);
    }
    return {
      categories: state.categories,
      salesTeam: state.salesTeam,
      fixedExpoName: FIXED_EXPO_NAME,
      expos: [FIXED_EXPO_NAME],
      statuses: ENQUIRY_STATUSES,
      priorities: VISIT_PRIORITIES,
    };
  }

  generateEnquiryId(state, enquiryDate) {
    const year =
      enquiryDate && /^\d{4}/.test(enquiryDate)
        ? enquiryDate.slice(0, 4)
        : String(new Date().getFullYear());
    const prefix = `APL-${year}-`;
    let maxSeq = 0;
    for (const enq of state.enquiries) {
      if (enq.enquiryId && enq.enquiryId.startsWith(prefix)) {
        const num = parseInt(enq.enquiryId.slice(prefix.length), 10);
        if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  findDuplicates({ mobile, email, companyName, excludeEnquiryId }) {
    const state = this.readState();
    const normPhone = normalizePhone(mobile);
    const normEmail = normalizeText(email);
    const normCompany = normalizeText(companyName);

    const matches = [];
    for (const enq of state.enquiries) {
      if (excludeEnquiryId && enq.enquiryId === excludeEnquiryId) continue;
      const reasons = [];
      if (normPhone && normPhone.length >= 8 && normalizePhone(enq.mobile) === normPhone) {
        reasons.push('Mobile Number');
      }
      if (normEmail && normalizeText(enq.email) === normEmail) {
        reasons.push('Email Address');
      }
      if (
        normCompany &&
        normCompany.length >= 4 &&
        (normalizeText(enq.companyName) === normCompany ||
          normalizeText(enq.companyName).includes(normCompany) ||
          normCompany.includes(normalizeText(enq.companyName)))
      ) {
        reasons.push('Company Name');
      }
      if (reasons.length > 0) {
        matches.push({
          enquiryId: enq.enquiryId,
          companyName: enq.companyName,
          contactPerson: enq.contactPerson,
          mobile: enq.mobile,
          email: enq.email,
          expoName: enq.expoName,
          enquiryDate: enq.enquiryDate,
          enquiryStatus: enq.enquiryStatus,
          visitPriority: enq.visitPriority,
          assignedSalesperson: enq.assignedSalesperson,
          matchedOn: reasons,
        });
      }
    }
    return matches;
  }

  listEnquiries(filters = {}) {
    const state = this.readState();
    let items = [...state.enquiries];

    if (filters.expoName && filters.expoName !== 'ALL') {
      items = items.filter((e) => e.expoName === filters.expoName);
    }
    if (filters.status && filters.status !== 'ALL') {
      items = items.filter((e) => e.enquiryStatus === filters.status);
    }
    if (filters.priority && filters.priority !== 'ALL') {
      items = items.filter((e) => e.visitPriority === filters.priority);
    }
    if (filters.salespersonId && filters.salespersonId !== 'ALL') {
      if (filters.salespersonId === 'UNASSIGNED') {
        items = items.filter((e) => !e.assignedSalespersonId && !e.assignedSalesperson);
      } else {
        items = items.filter((e) => e.assignedSalespersonId === filters.salespersonId);
      }
    }
    if (filters.category && filters.category !== 'ALL') {
      items = items.filter(
        (e) => Array.isArray(e.productCategories) && e.productCategories.includes(filters.category)
      );
    }
    if (filters.dateFrom) {
      items = items.filter((e) => e.enquiryDate >= filters.dateFrom);
    }
    if (filters.dateTo) {
      items = items.filter((e) => e.enquiryDate <= filters.dateTo);
    }
    if (filters.search) {
      const q = normalizeText(filters.search);
      items = items.filter((e) =>
        [
          e.enquiryId,
          e.companyName,
          e.contactPerson,
          e.designation,
          e.mobile,
          e.email,
          e.location,
          e.stateRegion,
          e.expoName,
          e.enquiryRemarks,
          e.assignedSalesperson,
          ...(e.productCategories || []),
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }

    items.sort((a, b) => {
      const dateCmp = String(b.enquiryDate).localeCompare(String(a.enquiryDate));
      if (dateCmp !== 0) return dateCmp;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

    return items;
  }

  getEnquiry(enquiryId) {
    const state = this.readState();
    return state.enquiries.find((e) => e.enquiryId === enquiryId) || null;
  }

  validateEnquiryPayload(payload, state, isCreate = true) {
    const errors = {};
    if (isCreate || payload.companyName !== undefined) {
      if (!String(payload.companyName || '').trim()) {
        errors.companyName = 'Company name is required.';
      }
    }
    if (isCreate || payload.contactPerson !== undefined) {
      if (!String(payload.contactPerson || '').trim()) {
        errors.contactPerson = 'Contact person is required.';
      }
    }
    if (isCreate || payload.enquiryDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.enquiryDate || ''))) {
        errors.enquiryDate = 'Valid enquiry date (YYYY-MM-DD) is required.';
      }
    }
    if (isCreate || payload.mobile !== undefined) {
      if (!isValidMobile(payload.mobile)) {
        errors.mobile = 'Valid mobile/phone number (8–15 digits) is required.';
      }
    }
    if (payload.email !== undefined && String(payload.email).trim()) {
      if (!isValidEmail(payload.email)) {
        errors.email = 'Please enter a valid email address.';
      }
    }
    if (isCreate && payload.aiExtractedUsed) {
      if (!payload.mobileVerified) {
        errors.mobileVerified = 'Please verify the AI-extracted mobile number before saving.';
      }
      if (String(payload.email || '').trim() && !payload.emailVerified) {
        errors.emailVerified = 'Please verify the AI-extracted email address before saving.';
      }
    }
    if (isCreate || payload.productCategories !== undefined) {
      const cats = Array.isArray(payload.productCategories) ? payload.productCategories : [];
      if (cats.length === 0) {
        errors.productCategories = 'Select at least one product category from the master list.';
      } else {
        const activeNames = new Set(
          state.categories.filter((c) => c.active).map((c) => c.name)
        );
        const invalid = cats.filter((c) => !activeNames.has(c));
        if (invalid.length > 0) {
          errors.productCategories = `Unknown or inactive product categories: ${invalid.join(', ')}`;
        }
      }
    }
    if (isCreate || payload.visitPriority !== undefined) {
      if (!VISIT_PRIORITIES.includes(payload.visitPriority)) {
        errors.visitPriority = `Visit priority must be one of: ${VISIT_PRIORITIES.join(', ')}`;
      }
    }
    if (payload.enquiryStatus !== undefined && !ENQUIRY_STATUSES.includes(payload.enquiryStatus)) {
      errors.enquiryStatus = `Status must be one of: ${ENQUIRY_STATUSES.join(', ')}`;
    }
    if (payload.assignedSalespersonId) {
      const sp = state.salesTeam.find(
        (s) => s.id === payload.assignedSalespersonId && s.active
      );
      if (!sp) {
        errors.assignedSalespersonId = 'Assigned salesperson must be an active member from SALES_TEAM.';
      }
    }
    return errors;
  }

  createEnquiry(payload) {
    const state = this.readState();
    const errors = this.validateEnquiryPayload(payload, state, true);
    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      err.statusCode = 400;
      err.errors = errors;
      throw err;
    }

    const enquiryId = this.generateEnquiryId(state, payload.enquiryDate);
    const now = new Date().toISOString();

    let assignedSalespersonId = payload.assignedSalespersonId || '';
    let assignedSalesperson = '';
    if (assignedSalespersonId) {
      const sp = state.salesTeam.find((s) => s.id === assignedSalespersonId);
      assignedSalesperson = sp ? sp.name : '';
    }

    let enquiryStatus = payload.enquiryStatus;
    if (!enquiryStatus) {
      if (payload.tentativeVisitDate) {
        enquiryStatus = 'Visit Planned';
      } else if (assignedSalespersonId) {
        enquiryStatus = 'Assigned';
      } else {
        enquiryStatus = 'New';
      }
    }

    const expoName = FIXED_EXPO_NAME;
    if (!state.expos.includes(expoName)) {
      state.expos.push(expoName);
    }

    const record = {
      enquiryId,
      expoName,
      enquiryDate: payload.enquiryDate,
      frontCardImage: payload.frontCardImage || '',
      backCardImage: payload.backCardImage || '',
      companyName: String(payload.companyName).trim(),
      contactPerson: String(payload.contactPerson).trim(),
      designation: String(payload.designation || '').trim(),
      mobile: String(payload.mobile).trim(),
      email: String(payload.email || '').trim(),
      location: String(payload.location || '').trim(),
      stateRegion: String(payload.stateRegion || '').trim() || inferStateRegion(payload.location),
      website: String(payload.website || '').trim(),
      mobileVerified: Boolean(payload.mobileVerified),
      emailVerified: Boolean(payload.emailVerified),
      cardVerified: Boolean(payload.cardVerified),
      productCategories: [...new Set(payload.productCategories)],
      enquiryRemarks: String(payload.enquiryRemarks || '').trim(),
      visitPriority: payload.visitPriority,
      tentativeVisitDate: payload.tentativeVisitDate || '',
      assignedSalespersonId,
      assignedSalesperson,
      enquiryStatus,
      followUpRemarks: String(payload.followUpRemarks || '').trim(),
      followUpHistory: [
        {
          timestamp: now,
          actor: payload.capturedBy || 'Expo Booth Rep',
          status: enquiryStatus,
          note:
            String(payload.followUpRemarks || '').trim() ||
            `Enquiry captured at ${expoName}${assignedSalesperson ? ` and assigned to ${assignedSalesperson}` : ''}.`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    state.enquiries.push(record);
    this.writeState(state);
    return record;
  }

  updateEnquiry(enquiryId, payload) {
    const state = this.readState();
    const index = state.enquiries.findIndex((e) => e.enquiryId === enquiryId);
    if (index === -1) {
      const err = new Error(`Enquiry ${enquiryId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const existing = state.enquiries[index];
    const errors = this.validateEnquiryPayload(payload, state, false);
    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      err.statusCode = 400;
      err.errors = errors;
      throw err;
    }

    const now = new Date().toISOString();
    const updated = { ...existing };

    const editableTextFields = [
      'companyName',
      'contactPerson',
      'designation',
      'mobile',
      'email',
      'location',
      'stateRegion',
      'website',
      'enquiryRemarks',
      'tentativeVisitDate',
      'expoName',
      'enquiryDate',
    ];

    for (const field of editableTextFields) {
      if (payload[field] !== undefined) {
        updated[field] = String(payload[field] || '').trim();
      }
    }

    if (payload.location !== undefined && payload.stateRegion === undefined) {
      updated.stateRegion = inferStateRegion(updated.location) || updated.stateRegion;
    }

    if (payload.mobileVerified !== undefined) {
      updated.mobileVerified = Boolean(payload.mobileVerified);
    }
    if (payload.emailVerified !== undefined) {
      updated.emailVerified = Boolean(payload.emailVerified);
    }
    if (payload.cardVerified !== undefined) {
      updated.cardVerified = Boolean(payload.cardVerified);
    }
    if (payload.productCategories !== undefined) {
      updated.productCategories = [...new Set(payload.productCategories)];
    }
    if (payload.visitPriority !== undefined) {
      updated.visitPriority = payload.visitPriority;
    }

    if (payload.assignedSalespersonId !== undefined) {
      updated.assignedSalespersonId = payload.assignedSalespersonId || '';
      if (updated.assignedSalespersonId) {
        const sp = state.salesTeam.find((s) => s.id === updated.assignedSalespersonId);
        updated.assignedSalesperson = sp ? sp.name : '';
      } else {
        updated.assignedSalesperson = '';
      }
    }

    if (payload.enquiryStatus !== undefined) {
      updated.enquiryStatus = payload.enquiryStatus;
    } else if (
      payload.assignedSalespersonId &&
      existing.enquiryStatus === 'New' &&
      !updated.tentativeVisitDate
    ) {
      updated.enquiryStatus = 'Assigned';
    } else if (
      payload.tentativeVisitDate &&
      (existing.enquiryStatus === 'New' || existing.enquiryStatus === 'Assigned')
    ) {
      updated.enquiryStatus = 'Visit Planned';
    }

    const newNote = String(payload.newFollowUpNote || payload.followUpRemarks || '').trim();
    const changedSummary = [];
    if (updated.enquiryStatus !== existing.enquiryStatus) {
      changedSummary.push(`Status → ${updated.enquiryStatus}`);
    }
    if (updated.visitPriority !== existing.visitPriority) {
      changedSummary.push(`Priority → ${updated.visitPriority}`);
    }
    if (updated.tentativeVisitDate !== existing.tentativeVisitDate) {
      changedSummary.push(
        updated.tentativeVisitDate
          ? `Visit Date → ${updated.tentativeVisitDate}`
          : 'Visit Date cleared'
      );
    }
    if (updated.assignedSalesperson !== existing.assignedSalesperson) {
      changedSummary.push(
        updated.assignedSalesperson
          ? `Assigned → ${updated.assignedSalesperson}`
          : 'Unassigned'
      );
    }

    if (newNote) {
      updated.followUpRemarks = newNote;
    }

    if (newNote || changedSummary.length > 0) {
      const history = Array.isArray(existing.followUpHistory)
        ? [...existing.followUpHistory]
        : [];
      history.push({
        timestamp: now,
        actor: payload.updatedBy || updated.assignedSalesperson || 'Sales Team',
        status: updated.enquiryStatus,
        note: [changedSummary.join(' · '), newNote].filter(Boolean).join(' — '),
      });
      updated.followUpHistory = history;
    }

    updated.updatedAt = now;
    state.enquiries[index] = updated;
    this.writeState(state);
    return updated;
  }

  deleteEnquiry(enquiryId) {
    const state = this.readState();
    const index = state.enquiries.findIndex((e) => e.enquiryId === enquiryId);
    if (index === -1) {
      const err = new Error(`Enquiry ${enquiryId} not found`);
      err.statusCode = 404;
      throw err;
    }
    const [removed] = state.enquiries.splice(index, 1);
    this.writeState(state);
    return removed;
  }

  addCategory({ name, description }) {
    const state = this.readState();
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      const err = new Error('Category name is required');
      err.statusCode = 400;
      throw err;
    }
    if (state.categories.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
      const err = new Error('Category already exists');
      err.statusCode = 409;
      throw err;
    }
    const nextNum = state.categories.length + 1;
    const category = {
      id: `CAT-${String(nextNum).padStart(2, '0')}`,
      name: cleanName,
      description: String(description || '').trim(),
      active: true,
    };
    state.categories.push(category);
    this.writeState(state);
    return category;
  }

  updateCategory(id, patch) {
    const state = this.readState();
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) {
      const err = new Error('Category not found');
      err.statusCode = 404;
      throw err;
    }
    if (patch.name !== undefined && String(patch.name).trim()) {
      cat.name = String(patch.name).trim();
    }
    if (patch.description !== undefined) {
      cat.description = String(patch.description).trim();
    }
    if (patch.active !== undefined) {
      cat.active = Boolean(patch.active);
    }
    this.writeState(state);
    return cat;
  }

  addSalesperson({ name, email, phone, region }) {
    const state = this.readState();
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      const err = new Error('Salesperson name is required');
      err.statusCode = 400;
      throw err;
    }
    if (email && !isValidEmail(email)) {
      const err = new Error('Invalid salesperson email');
      err.statusCode = 400;
      throw err;
    }
    const nextNum = state.salesTeam.length + 1;
    const person = {
      id: `SP-${String(nextNum).padStart(2, '0')}`,
      name: cleanName,
      email: String(email || '').trim(),
      phone: String(phone || '').trim(),
      region: String(region || '').trim() || 'Pan India',
      active: true,
    };
    state.salesTeam.push(person);
    this.writeState(state);
    return person;
  }

  updateSalesperson(id, patch) {
    const state = this.readState();
    const sp = state.salesTeam.find((s) => s.id === id);
    if (!sp) {
      const err = new Error('Salesperson not found');
      err.statusCode = 404;
      throw err;
    }
    if (patch.name !== undefined && String(patch.name).trim()) {
      sp.name = String(patch.name).trim();
    }
    if (patch.email !== undefined) {
      if (patch.email && !isValidEmail(patch.email)) {
        const err = new Error('Invalid salesperson email');
        err.statusCode = 400;
        throw err;
      }
      sp.email = String(patch.email).trim();
    }
    if (patch.phone !== undefined) sp.phone = String(patch.phone).trim();
    if (patch.region !== undefined) sp.region = String(patch.region).trim();
    if (patch.active !== undefined) sp.active = Boolean(patch.active);
    this.writeState(state);
    return sp;
  }

  getCsvContent(tableName) {
    const allowed = new Set([
      'EXPO_ENQUIRIES',
      'PRODUCT_CATEGORIES',
      'SALES_TEAM',
      'ENQUIRY_CATEGORIES',
    ]);
    if (!allowed.has(tableName)) {
      const err = new Error('Unknown export table');
      err.statusCode = 400;
      throw err;
    }
    const state = this.readState();
    this.syncCsvFiles(state);
    return fs.readFileSync(path.join(this.dataDir, `${tableName}.csv`), 'utf8');
  }
}

function inferStateRegion(location) {
  const loc = String(location || '').toLowerCase();
  const map = [
    ['maharashtra', 'Maharashtra'],
    ['pune', 'Maharashtra'],
    ['mumbai', 'Maharashtra'],
    ['nashik', 'Maharashtra'],
    ['aurangabad', 'Maharashtra'],
    ['tamil nadu', 'Tamil Nadu'],
    ['chennai', 'Tamil Nadu'],
    ['hosur', 'Tamil Nadu'],
    ['coimbatore', 'Tamil Nadu'],
    ['gujarat', 'Gujarat'],
    ['ahmedabad', 'Gujarat'],
    ['rajkot', 'Gujarat'],
    ['vadodara', 'Gujarat'],
    ['surat', 'Gujarat'],
    ['karnataka', 'Karnataka'],
    ['bengaluru', 'Karnataka'],
    ['bangalore', 'Karnataka'],
    ['belagavi', 'Karnataka'],
    ['haryana', 'Haryana'],
    ['gurugram', 'Haryana'],
    ['faridabad', 'Haryana'],
    ['manesar', 'Haryana'],
    ['punjab', 'Punjab'],
    ['ludhiana', 'Punjab'],
    ['delhi', 'Delhi NCR'],
    ['noida', 'Uttar Pradesh'],
    ['uttar pradesh', 'Uttar Pradesh'],
    ['telangana', 'Telangana'],
    ['hyderabad', 'Telangana'],
    ['west bengal', 'West Bengal'],
    ['kolkata', 'West Bengal'],
    ['jharkhand', 'Jharkhand'],
    ['jamshedpur', 'Jharkhand'],
  ];
  for (const [needle, label] of map) {
    if (loc.includes(needle)) return label;
  }
  return 'Other / Unspecified';
}

module.exports = {
  ExpoStore,
  inferStateRegion,
  isValidEmail,
  isValidMobile,
  normalizePhone,
};
