const { GOOGLE_SHEETS_WEBHOOK_URL, WEBHOOK_SECRET } = require('./config');

const ENQUIRY_SHEET_COLUMNS = [
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
  'Card Verified',
  'Created At',
  'Updated At',
];

function mapEnquiryToSheetRow(enquiry) {
  return {
    'Enquiry ID': enquiry.enquiryId || '',
    'Expo Name': enquiry.expoName || '',
    'Enquiry Date': enquiry.enquiryDate || '',
    'Business Card Image': enquiry.frontCardImage ? `[Card Attached: ${enquiry.enquiryId}-front]` : '',
    'Back Card Image': enquiry.backCardImage ? `[Card Attached: ${enquiry.enquiryId}-back]` : '',
    'Company Name': enquiry.companyName || '',
    'Contact Person': enquiry.contactPerson || '',
    'Designation': enquiry.designation || '',
    'Mobile': enquiry.mobile || '',
    'Email': enquiry.email || '',
    'Location': enquiry.location || '',
    'State / Region': enquiry.stateRegion || '',
    'Website': enquiry.website || '',
    'Product Categories': Array.isArray(enquiry.productCategories)
      ? enquiry.productCategories.join('; ')
      : '',
    'Enquiry Remarks': enquiry.enquiryRemarks || '',
    'Visit Priority': enquiry.visitPriority || '',
    'Tentative Visit Date': enquiry.tentativeVisitDate || '',
    'Assigned Salesperson': enquiry.assignedSalesperson || '',
    'Enquiry Status': enquiry.enquiryStatus || '',
    'Follow-up Remarks': enquiry.followUpRemarks || '',
    'Card Verified': enquiry.cardVerified ? 'TRUE' : 'FALSE',
    'Created At': enquiry.createdAt || '',
    'Updated At': enquiry.updatedAt || '',
  };
}

function mapCategoryLinksForEnquiry(enquiry, categories = []) {
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  return (enquiry.productCategories || []).map((catName) => {
    const master = byName.get(String(catName).toLowerCase());
    return {
      'Link ID': `${enquiry.enquiryId}__${
        master ? master.id : catName.replace(/\s+/g, '_').toUpperCase()
      }`,
      'Enquiry ID': enquiry.enquiryId,
      'Category ID': master ? master.id : '',
      'Category Name': catName,
      'Expo Name': enquiry.expoName,
      'Enquiry Date': enquiry.enquiryDate,
      'Visit Priority': enquiry.visitPriority,
    };
  });
}

async function postToSheetsWebhook(webhookUrl, body, fetchImpl = fetch) {
  const targetUrl = String(webhookUrl || GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
  if (!targetUrl) {
    return {
      synced: false,
      configured: false,
      message: 'Google Sheets webhook URL not configured; saved locally.',
    };
  }

  try {
    const payload = {
      ...body,
      secret: WEBHOOK_SECRET || undefined,
    };
    const res = await fetchImpl(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return {
        synced: false,
        configured: true,
        message: (parsed && parsed.error) || `Google Sheets sync HTTP ${res.status}`,
      };
    }

    if (!parsed || parsed.ok !== true) {
      const looksHtml = /^\s*</.test(text);
      return {
        synced: false,
        configured: true,
        message:
          (parsed && parsed.error) ||
          (looksHtml
            ? 'Google Apps Script returned an HTML page instead of JSON. Deploy Web App with "Execute as: Me" and "Who has access: Anyone", and use the /exec URL.'
            : 'Google Sheets Web App did not return ok:true.'),
      };
    }

    return {
      synced: true,
      configured: true,
      message: parsed.message || 'Synced to Google Sheet',
      details: parsed,
    };
  } catch (err) {
    return {
      synced: false,
      configured: true,
      message: `Google Sheets sync error: ${err.message}`,
    };
  }
}

async function syncEnquiryToSheet(enquiry, categories, webhookUrl, fetchImpl) {
  return postToSheetsWebhook(
    webhookUrl,
    {
      action: 'upsertEnquiry',
      columns: ENQUIRY_SHEET_COLUMNS,
      row: mapEnquiryToSheetRow(enquiry),
      frontCardImage: enquiry.frontCardImage || '',
      backCardImage: enquiry.backCardImage || '',
      categoryLinks: mapCategoryLinksForEnquiry(enquiry, categories),
    },
    fetchImpl
  );
}

async function deleteEnquiryFromSheet(enquiryId, webhookUrl, fetchImpl) {
  return postToSheetsWebhook(
    webhookUrl,
    {
      action: 'deleteEnquiry',
      enquiryId,
    },
    fetchImpl
  );
}

async function syncAllToSheet(state, webhookUrl, fetchImpl) {
  const enquiries = (state.enquiries || []).map((enq) => ({
    row: mapEnquiryToSheetRow(enq),
    frontCardImage: enq.frontCardImage || '',
    backCardImage: enq.backCardImage || '',
    categoryLinks: mapCategoryLinksForEnquiry(enq, state.categories),
  }));

  return postToSheetsWebhook(
    webhookUrl,
    {
      action: 'syncAll',
      columns: ENQUIRY_SHEET_COLUMNS,
      enquiries,
      categories: (state.categories || []).map((c) => ({
        'Category ID': c.id,
        'Category Name': c.name,
        Description: c.description || '',
        Active: c.active ? 'TRUE' : 'FALSE',
      })),
      salesTeam: (state.salesTeam || []).map((s) => ({
        'Salesperson ID': s.id,
        Name: s.name,
        Email: s.email || '',
        Phone: s.phone || '',
        Region: s.region || '',
        Active: s.active ? 'TRUE' : 'FALSE',
      })),
    },
    fetchImpl
  );
}

async function testSheetConnection(webhookUrl, fetchImpl) {
  return postToSheetsWebhook(webhookUrl, { action: 'ping' }, fetchImpl);
}

module.exports = {
  ENQUIRY_SHEET_COLUMNS,
  mapEnquiryToSheetRow,
  mapCategoryLinksForEnquiry,
  syncEnquiryToSheet,
  deleteEnquiryFromSheet,
  syncAllToSheet,
  testSheetConnection,
};
