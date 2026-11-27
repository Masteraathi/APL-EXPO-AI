/**
 * APL EXPO AI — Google Sheets Sync & Workbook Setup (Google Apps Script)
 *
 * Paste this script into Extensions -> Apps Script inside your Google Sheet,
 * run "APL EXPO AI -> Setup Workbook" once, and Deploy -> New deployment -> Web app
 * (Execute as: Me, Who has access: Anyone).
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
  'Assigned Salesperson',
  'Enquiry Status',
  'Follow-up Remarks',
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
    .addItem('Setup Workbook Tabs & Headers', 'setupWorkbook')
    .addToUi();
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#0F2942').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function setupWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet(ss, 'EXPO_ENQUIRIES', ENQUIRY_HEADERS);
  getOrCreateSheet(ss, 'PRODUCT_CATEGORIES', CATEGORY_HEADERS);
  getOrCreateSheet(ss, 'SALES_TEAM', SALES_HEADERS);
  getOrCreateSheet(ss, 'ENQUIRY_CATEGORIES', LINK_HEADERS);
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

function upsertRowByKey(sheet, headers, keyColName, rowObj) {
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
  var lastRow = linkSheet.getLastRow();
  if (lastRow > 1) {
    var enqCol = LINK_HEADERS.indexOf('Enquiry ID') + 1;
    var vals = linkSheet.getRange(2, enqCol, lastRow - 1, 1).getValues();
    for (var r = vals.length - 1; r >= 0; r--) {
      if (String(vals[r][0]) === String(enquiryId)) {
        linkSheet.deleteRow(r + 2);
      }
    }
  }
  if (links && links.length) {
    var rows = links.map(function (lnk) {
      return LINK_HEADERS.map(function (h) {
        return lnk[h] !== undefined ? lnk[h] : '';
      });
    });
    linkSheet
      .getRange(linkSheet.getLastRow() + 1, 1, rows.length, LINK_HEADERS.length)
      .setValues(rows);
  }
}

function deleteEnquiryRows(ss, enquiryId) {
  var enqSheet = getOrCreateSheet(ss, 'EXPO_ENQUIRIES', ENQUIRY_HEADERS);
  var lastRow = enqSheet.getLastRow();
  if (lastRow > 1) {
    var vals = enqSheet.getRange(2, 1, lastRow - 1, 1).getValues();
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
      var row = payload.row || {};
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
      return jsonOut({ ok: true, message: 'Enquiry ' + op + ' in Google Sheet', enquiryId: enquiryId });
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
        var r = item.row || {};
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
