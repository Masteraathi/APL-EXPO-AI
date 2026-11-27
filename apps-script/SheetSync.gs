/**
 * APL EXPO AI — Google Sheets Sync & Workbook Setup (Google Apps Script)
 *
 * Stores and displays ALL enquiry fields in EXPO_ENQUIRIES, including:
 * Enquiry ID, Expo Name, Enquiry Date, Business Card Image, Back Card Image,
 * Company Name, Contact Person, Designation, Mobile, Email, Location,
 * State / Region, Website, Product Categories, Enquiry Remarks, Visit Priority,
 * Tentative Visit Date, Assigned Salesperson ID, Assigned Salesperson,
 * Enquiry Status, Follow-up Remarks, Follow-up History, Card Verified,
 * Created At, Updated At.
 */

var ENQUIRY_HEADERS = [
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
  'Assigned Salesperson ID',
  'Assigned Salesperson',
  'Enquiry Status',
  'Follow-up Remarks',
  'Follow-up History',
  'Card Verified',
  'Created At',
  'Updated At',
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
    .addItem('Setup / Repair Workbook Headers', 'setupWorkbook')
    .addItem('Make All Columns Visible & Auto-Fit', 'formatAllSheetsVisible')
    .addToUi();
}

function styleHeaderRow(sheet, startCol, numCols) {
  sheet
    .getRange(1, startCol, 1, numCols)
    .setBackground('#0F2942')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
}

function makeSheetColumnsVisible(sheet, headersCount) {
  var totalCols = Math.max(headersCount || 1, sheet.getLastColumn(), 1);
  sheet.showSheet();
  sheet.showColumns(1, totalCols);
  sheet.setFrozenRows(1);
  for (var c = 1; c <= totalCols; c++) {
    sheet.autoResizeColumn(c);
    var w = sheet.getColumnWidth(c);
    if (w < 130) sheet.setColumnWidth(c, 130);
    if (w > 320) sheet.setColumnWidth(c, 320);
  }
}

function getOrCreateSheet(ss, name, expectedHeaders) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(expectedHeaders);
    styleHeaderRow(sheet, 1, expectedHeaders.length);
    makeSheetColumnsVisible(sheet, expectedHeaders.length);
    return sheet;
  }

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
    styleHeaderRow(sheet, startCol, missing.length);
  }
  sheet.showSheet();
  sheet.showColumns(1, Math.max(sheet.getLastColumn(), expectedHeaders.length));
  return sheet;
}

function setupWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var enq = getOrCreateSheet(ss, 'EXPO_ENQUIRIES', ENQUIRY_HEADERS);
  var cat = getOrCreateSheet(ss, 'PRODUCT_CATEGORIES', CATEGORY_HEADERS);
  var sales = getOrCreateSheet(ss, 'SALES_TEAM', SALES_HEADERS);
  var links = getOrCreateSheet(ss, 'ENQUIRY_CATEGORIES', LINK_HEADERS);

  makeSheetColumnsVisible(enq, ENQUIRY_HEADERS.length);
  makeSheetColumnsVisible(cat, CATEGORY_HEADERS.length);
  makeSheetColumnsVisible(sales, SALES_HEADERS.length);
  makeSheetColumnsVisible(links, LINK_HEADERS.length);

  try {
    var folders = DriveApp.getFoldersByName('APL_EXPO_AI_CARDS');
    if (!folders.hasNext()) {
      DriveApp.createFolder('APL_EXPO_AI_CARDS');
    }
  } catch (err) {
    // Drive optional
  }
}

function formatAllSheetsVisible() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var enq = getOrCreateSheet(ss, 'EXPO_ENQUIRIES', ENQUIRY_HEADERS);
  var cat = getOrCreateSheet(ss, 'PRODUCT_CATEGORIES', CATEGORY_HEADERS);
  var sales = getOrCreateSheet(ss, 'SALES_TEAM', SALES_HEADERS);
  var links = getOrCreateSheet(ss, 'ENQUIRY_CATEGORIES', LINK_HEADERS);
  makeSheetColumnsVisible(enq, ENQUIRY_HEADERS.length);
  makeSheetColumnsVisible(cat, CATEGORY_HEADERS.length);
  makeSheetColumnsVisible(sales, SALES_HEADERS.length);
  makeSheetColumnsVisible(links, LINK_HEADERS.length);
  ss.setActiveSheet(enq);
}

function verifySecret(payload) {
  var expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!expected) return true;
  return payload && payload.secret === expected;
}

function saveCardImageToDrive(dataUrl, filePrefix) {
  if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
    return '';
  }
  try {
    var parts = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!parts) return '';
    var mime = parts[1];
    var bytes = Utilities.base64Decode(parts[2]);
    var ext = mime.indexOf('png') >= 0 ? 'png' : mime.indexOf('svg') >= 0 ? 'svg' : 'jpg';
    var blob = Utilities.newBlob(bytes, mime, filePrefix + '.' + ext);

    var folderName = 'APL_EXPO_AI_CARDS';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    return '[Image Saved Locally]';
  }
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

  var history = pickFirst(r, p, ['Follow-up History', 'followUpHistory'], '');
  if (Array.isArray(history)) {
    history = history
      .map(function (h) {
        return '[' + (h.timestamp || '') + '] (' + (h.actor || '') + ' · ' + (h.status || '') + ') ' + (h.note || '');
      })
      .join('\n');
  }

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
    'Business Card Image': pickFirst(r, p, ['Business Card Image', 'frontCardImage'], ''),
    'Back Card Image': pickFirst(r, p, ['Back Card Image', 'backCardImage'], ''),
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
    'Follow-up History': history,
    'Card Verified': pickFirst(r, p, ['Card Verified', 'cardVerified'], 'FALSE'),
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

function replaceSalesTeamRows(salesSheet, team) {
  var headers = getSheetHeaders(salesSheet, SALES_HEADERS);
  var lastRow = salesSheet.getLastRow();
  if (lastRow > 1) {
    salesSheet.deleteRows(2, lastRow - 1);
  }
  if (team && team.length) {
    var rows = team.map(function (sp) {
      return headers.map(function (h) {
        return sp[h] !== undefined && sp[h] !== null ? sp[h] : '';
      });
    });
    salesSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
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

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'syncAll' || action === 'setup') {
    setupWorkbook();
    formatAllSheetsVisible();
  }
  return jsonOut({
    ok: true,
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    visibleColumns: ENQUIRY_HEADERS,
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
      formatAllSheetsVisible();
      return jsonOut({
        ok: true,
        message: 'Connected to Google Sheet: ' + ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        visibleColumns: ENQUIRY_HEADERS,
      });
    }

    if (action === 'upsertEnquiry') {
      var enqSheet = getOrCreateSheet(ss, 'EXPO_ENQUIRIES', ENQUIRY_HEADERS);
      var linkSheet = getOrCreateSheet(ss, 'ENQUIRY_CATEGORIES', LINK_HEADERS);
      var row = normalizeEnquiryRow(payload, payload.row);
      var enquiryId = row['Enquiry ID'];

      if (payload.frontCardImage) {
        var frontUrl = saveCardImageToDrive(payload.frontCardImage, enquiryId + '-front');
        if (frontUrl) row['Business Card Image'] = frontUrl;
      }
      if (payload.backCardImage) {
        var backUrl = saveCardImageToDrive(payload.backCardImage, enquiryId + '-back');
        if (backUrl) row['Back Card Image'] = backUrl;
      }

      var op = upsertRowByKey(enqSheet, ENQUIRY_HEADERS, 'Enquiry ID', row);
      replaceCategoryLinks(linkSheet, enquiryId, payload.categoryLinks || []);
      makeSheetColumnsVisible(enqSheet, ENQUIRY_HEADERS.length);
      return jsonOut({
        ok: true,
        message: 'Enquiry ' + op + ' in Google Sheet (all fields saved & visible)',
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
        if (item.frontCardImage) {
          var fUrl = saveCardImageToDrive(item.frontCardImage, r['Enquiry ID'] + '-front');
          if (fUrl) r['Business Card Image'] = fUrl;
        }
        if (item.backCardImage) {
          var bUrl = saveCardImageToDrive(item.backCardImage, r['Enquiry ID'] + '-back');
          if (bUrl) r['Back Card Image'] = bUrl;
        }
        upsertRowByKey(enqSheetAll, ENQUIRY_HEADERS, 'Enquiry ID', r);
        replaceCategoryLinks(linkSheetAll, r['Enquiry ID'], item.categoryLinks || []);
      }

      var cats = payload.categories || [];
      for (var c = 0; c < cats.length; c++) {
        upsertRowByKey(catSheet, CATEGORY_HEADERS, 'Category ID', cats[c]);
      }
      var team = payload.salesTeam || [];
      replaceSalesTeamRows(salesSheet, team);
      formatAllSheetsVisible();
      return jsonOut({
        ok: true,
        message: 'Synced ' + enquiries.length + ' enquiries & made all fields visible in ' + ss.getName(),
        visibleColumns: ENQUIRY_HEADERS,
      });
    }

    if (action === 'syncSalesTeam') {
      var spSheet = getOrCreateSheet(ss, 'SALES_TEAM', SALES_HEADERS);
      replaceSalesTeamRows(spSheet, payload.salesTeam || []);
      makeSheetColumnsVisible(spSheet, SALES_HEADERS.length);
      return jsonOut({ ok: true, message: 'SALES_TEAM updated in Google Sheet' });
    }

    return jsonOut({ ok: false, error: 'Unsupported action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}
