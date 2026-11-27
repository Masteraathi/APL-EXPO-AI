/**
 * APL EXPO AI — Google Sheets Sync & Workbook Setup (Google Apps Script)
 *
 * Syncs exact EXPO_ENQUIRIES fields:
 * Enquiry ID, Expo Name, Enquiry Date, Company Name, Contact Person, Designation,
 * Mobile, Email, Location, State / Region, Website, Product Categories,
 * Enquiry Remarks, Visit Priority, Tentative Visit Date, Assigned Salesperson ID,
 * Assigned Salesperson, Enquiry Status, Follow-up Remarks, Created At, Updated At
 */

var ENQUIRY_HEADERS = [
  'Enquiry ID',
  'Expo Name',
  'Enquiry Date',
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
  'Assigned Salesperson ID',
  'Assigned Salesperson',
  'Enquiry Status',
  'Follow-up Remarks',
  'Created At',
  'Updated At',
];

var LEGACY_REMOVED_ENQUIRY_HEADERS = [
  'Business Card Image',
  'Back Card Image',
  'Follow-up History',
  'Card Verified',
];

var CATEGORY_HEADERS = ['Category ID', 'Category Name', 'Description', 'Active'];
var SALES_HEADERS = ['Salesperson ID', 'Name', 'Email', 'Phone', 'Region', 'Active'];
var LINK_HEADERS = [
  'Link ID',
  'Enquiry ID',
  'Category ID',
  'Category Name',
  'Expo Name',
  'Enquiry Date',
  'Visit Priority',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('APL EXPO AI')
    .addItem('Setup / Update Workbook Headers', 'setupWorkbook')
    .addToUi();
}

function getOrCreateSheet(ss, name, expectedHeaders) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(expectedHeaders);
    var headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
    headerRange.setBackground('#0F2942').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, expectedHeaders.length);
    return sheet;
  }

  // Remove old deprecated columns from EXPO_ENQUIRIES if upgrading an existing sheet
  if (name === 'EXPO_ENQUIRIES') {
    var colCount = Math.max(1, sheet.getLastColumn());
    var currentHeaders = sheet.getRange(1, 1, 1, colCount).getValues()[0].map(function (h) {
      return String(h || '').trim();
    });
    for (var idx = currentHeaders.length - 1; idx >= 0; idx--) {
      if (LEGACY_REMOVED_ENQUIRY_HEADERS.indexOf(currentHeaders[idx]) !== -1) {
        sheet.deleteColumn(idx + 1);
      }
    }
  }

  // Ensure all expected columns exist in Row 1
  var lastCol = Math.max(1, sheet.getLastColumn());
  var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var missing = expectedHeaders.filter(function (h) {
    return existingHeaders.indexOf(h) === -1;
  });
  if (missing.length > 0) {
    var startCol = existingHeaders.length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    sheet
      .getRange(1, startCol, 1, missing.length)
      .setBackground('#0F2942')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  }
  return sheet;
}

function setupWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var enq = getOrCreateSheet(ss, 'EXPO_ENQUIRIES', ENQUIRY_HEADERS);
  getOrCreateSheet(ss, 'PRODUCT_CATEGORIES', CATEGORY_HEADERS);
  getOrCreateSheet(ss, 'SALES_TEAM', SALES_HEADERS);
  getOrCreateSheet(ss, 'ENQUIRY_CATEGORIES', LINK_HEADERS);
  enq.autoResizeColumns(1, Math.max(ENQUIRY_HEADERS.length, enq.getLastColumn()));
}

function verifySecret(payload) {
  var expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!expected) return true;
  return payload && payload.secret === expected;
}

function pickFirst(objA, objB, keys, fallback) {
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (objA && objA[k] !== undefined && objA[k] !== null && objA[k] !== '') return objA[k];
    if (objB && objB[k] !== undefined && objB[k] !== null && objB[k] !== '') return objB[k];
  }
  return fallback !== undefined ? fallback : '';
}

function normalizeEnquiryRow(payload, rawRow) {
  var r = rawRow || {};
  var p = payload || {};
  var cats = pickFirst(r, p, ['Product Categories', 'productCategories'], '');
  if (Array.isArray(cats)) cats = cats.join('; ');

  var contactName = pickFirst(
    r,
    p,
    ['Contact Person', 'contactPerson', 'Name', 'name', 'Contact Name', 'contactName'],
    ''
  );
  var companyName = pickFirst(r, p, ['Company Name', 'companyName', 'Company'], '');

  return {
    'Enquiry ID': pickFirst(r, p, ['Enquiry ID', 'enquiryId'], ''),
    'Expo Name': pickFirst(r, p, ['Expo Name', 'expoName'], 'IMTEX-2027'),
    'Enquiry Date': pickFirst(r, p, ['Enquiry Date', 'enquiryDate'], ''),
    'Company Name': companyName,
    'Contact Person': contactName,
    'Name': contactName,
    'Contact Name': contactName,
    'Designation': pickFirst(r, p, ['Designation', 'designation'], ''),
    'Mobile': pickFirst(r, p, ['Mobile', 'mobile', 'Mobile Number', 'phone'], ''),
    'Email': pickFirst(r, p, ['Email', 'email', 'Email Address'], ''),
    'Location': pickFirst(r, p, ['Location', 'location', 'Address', 'Location / Address'], ''),
    'State / Region': pickFirst(r, p, ['State / Region', 'stateRegion', 'Region'], ''),
    'Website': pickFirst(r, p, ['Website', 'website'], ''),
    'Product Categories': cats,
    'Enquiry Remarks': pickFirst(r, p, ['Enquiry Remarks', 'enquiryRemarks', 'Remarks'], ''),
    'Visit Priority': pickFirst(r, p, ['Visit Priority', 'visitPriority', 'Priority'], ''),
    'Tentative Visit Date': pickFirst(r, p, ['Tentative Visit Date', 'tentativeVisitDate'], ''),
    'Assigned Salesperson ID': pickFirst(r, p, ['Assigned Salesperson ID', 'assignedSalespersonId'], ''),
    'Assigned Salesperson': pickFirst(r, p, ['Assigned Salesperson', 'assignedSalesperson'], ''),
    'Enquiry Status': pickFirst(r, p, ['Enquiry Status', 'enquiryStatus', 'Status'], ''),
    'Follow-up Remarks': pickFirst(r, p, ['Follow-up Remarks', 'followUpRemarks'], ''),
    'Created At': pickFirst(r, p, ['Created At', 'createdAt'], ''),
    'Updated At': pickFirst(r, p, ['Updated At', 'updatedAt'], ''),
  };
}

function getSheetHeaders(sheet, fallbackHeaders) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  if (sheet.getLastRow() === 0) return fallbackHeaders;
  var actual = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  return actual.length ? actual : fallbackHeaders;
}

function upsertRowByKey(sheet, fallbackHeaders, keyColName, rowObj) {
  var headers = getSheetHeaders(sheet, fallbackHeaders);
  var keyIdx = headers.indexOf(keyColName);
  var keyVal = String(rowObj[keyColName] || '');
  var values = headers.map(function (h) {
    return rowObj[h] !== undefined && rowObj[h] !== null ? rowObj[h] : '';
  });

  var lastRow = sheet.getLastRow();
  if (lastRow > 1 && keyIdx >= 0 && keyVal) {
    var keys = sheet.getRange(2, keyIdx + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === keyVal) {
        sheet.getRange(i + 2, 1, 1, headers.length).setValues([values]);
        return 'updated';
      }
    }
  }
  sheet.appendRow(values);
  return 'inserted';
}

function replaceCategoryLinks(linkSheet, enquiryId, links) {
  var headers = getSheetHeaders(linkSheet, LINK_HEADERS);
  var enqCol = headers.indexOf('Enquiry ID') + 1;
  var lastRow = linkSheet.getLastRow();
  if (lastRow > 1 && enqCol > 0) {
    var vals = linkSheet.getRange(2, enqCol, lastRow - 1, 1).getValues();
    for (var r = vals.length - 1; r >= 0; r--) {
      if (String(vals[r][0]) === String(enquiryId)) {
        linkSheet.deleteRow(r + 2);
      }
    }
  }
  if (links && links.length) {
    var rows = links.map(function (lnk) {
      return headers.map(function (h) {
        return lnk[h] !== undefined ? lnk[h] : '';
      });
    });
    linkSheet
      .getRange(linkSheet.getLastRow() + 1, 1, rows.length, headers.length)
      .setValues(rows);
  }
}

function deleteEnquiryRows(ss, enquiryId) {
  var enqSheet = getOrCreateSheet(ss, 'EXPO_ENQUIRIES', ENQUIRY_HEADERS);
  var headers = getSheetHeaders(enqSheet, ENQUIRY_HEADERS);
  var enqCol = headers.indexOf('Enquiry ID') + 1;
  var lastRow = enqSheet.getLastRow();
  if (lastRow > 1 && enqCol > 0) {
    var vals = enqSheet.getRange(2, enqCol, lastRow - 1, 1).getValues();
    for (var r = vals.length - 1; r >= 0; r--) {
      if (String(vals[r][0]) === String(enquiryId)) {
        enqSheet.deleteRow(r + 2);
      }
    }
  }
  var linkSheet = getOrCreateSheet(ss, 'ENQUIRY_CATEGORIES', LINK_HEADERS);
  replaceCategoryLinks(linkSheet, enquiryId, []);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonOut({
    ok: true,
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
  });
}

function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!verifySecret(payload)) {
      return jsonOut({ ok: false, error: 'Invalid WEBHOOK_SECRET' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = payload.action || 'upsertEnquiry';

    if (action === 'ping') {
      setupWorkbook();
      return jsonOut({
        ok: true,
        message: 'Connected to Google Sheet: ' + ss.getName(),
        spreadsheetUrl: ss.getUrl(),
      });
    }

    if (action === 'upsertEnquiry') {
      var enqSheet = getOrCreateSheet(ss, 'EXPO_ENQUIRIES', ENQUIRY_HEADERS);
      var linkSheet = getOrCreateSheet(ss, 'ENQUIRY_CATEGORIES', LINK_HEADERS);
      var row = normalizeEnquiryRow(payload, payload.row);
      var enquiryId = row['Enquiry ID'];

      var op = upsertRowByKey(enqSheet, ENQUIRY_HEADERS, 'Enquiry ID', row);
      replaceCategoryLinks(linkSheet, enquiryId, payload.categoryLinks || []);
      return jsonOut({
        ok: true,
        message: 'Enquiry ' + op + ' in Google Sheet',
        enquiryId: enquiryId,
      });
    }

    if (action === 'deleteEnquiry') {
      deleteEnquiryRows(ss, payload.enquiryId);
      return jsonOut({ ok: true, message: 'Removed from Google Sheet', deletedId: payload.enquiryId });
    }

    if (action === 'syncAll') {
      setupWorkbook();
      var enqSheetAll = ss.getSheetByName('EXPO_ENQUIRIES');
      var linkSheetAll = ss.getSheetByName('ENQUIRY_CATEGORIES');
      var catSheet = ss.getSheetByName('PRODUCT_CATEGORIES');
      var salesSheet = ss.getSheetByName('SALES_TEAM');

      var enquiries = payload.enquiries || [];
      for (var i = 0; i < enquiries.length; i++) {
        var item = enquiries[i];
        var r = normalizeEnquiryRow(item, item.row);
        upsertRowByKey(enqSheetAll, ENQUIRY_HEADERS, 'Enquiry ID', r);
        replaceCategoryLinks(linkSheetAll, r['Enquiry ID'], item.categoryLinks || []);
      }

      var cats = payload.categories || [];
      for (var c = 0; c < cats.length; c++) {
        upsertRowByKey(catSheet, CATEGORY_HEADERS, 'Category ID', cats[c]);
      }
      var team = payload.salesTeam || [];
      for (var s = 0; s < team.length; s++) {
        upsertRowByKey(salesSheet, SALES_HEADERS, 'Salesperson ID', team[s]);
      }
      return jsonOut({
        ok: true,
        message: 'Synced ' + enquiries.length + ' enquiries & masters to ' + ss.getName(),
      });
    }

    return jsonOut({ ok: false, error: 'Unsupported action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}
