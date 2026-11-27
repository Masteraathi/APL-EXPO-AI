const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const {
  PORT,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  PRIORITY_GUIDANCE,
} = require('./config');
const { ExpoStore } = require('./store');
const { extractBusinessCard } = require('./geminiExtractor');
const { buildDashboardReport } = require('./dashboardService');
const {
  ENQUIRY_SHEET_COLUMNS,
  syncEnquiryToSheet,
  deleteEnquiryFromSheet,
  syncAllToSheet,
  testSheetConnection,
} = require('./googleSheetsSync');

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'data');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, error) {
  const status = error.statusCode || 500;
  sendJson(res, status, {
    error: error.message || 'Internal Server Error',
    errors: error.errors || undefined,
  });
}

function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        return Promise.resolve(req.body ? JSON.parse(req.body) : {});
      } catch {
        const err = new Error('Invalid JSON request body');
        err.statusCode = 400;
        return Promise.reject(err);
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        const str = req.body.toString('utf8');
        return Promise.resolve(str ? JSON.parse(str) : {});
      } catch {
        const err = new Error('Invalid JSON request body');
        err.statusCode = 400;
        return Promise.reject(err);
      }
    }
    return Promise.resolve(req.body || {});
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error('Payload too large (max 15 MB)');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const err = new Error('Invalid JSON request body');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const relPath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.resolve(PUBLIC_DIR, '.' + relPath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(resolved, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (idxErr, idxContent) => {
          if (idxErr) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
          res.end(idxContent);
        });
        return;
      }
      res.writeHead(500);
      res.end('Failed to read static asset');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    });
    res.end(content);
  });
}

function resolveWebhookUrl(req, store, body) {
  return (
    store.getSheetsWebhookUrl() ||
    String(req.headers['x-sheets-webhook-url'] || '').trim() ||
    String(body?.sheetsWebhookUrl || '').trim()
  );
}

function createRequestHandler({ dataDir = DEFAULT_DATA_DIR, sheetsFetch } = {}) {
  const store = new ExpoStore(dataDir);

  const handler = async (req, res) => {
    const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsed.pathname;
    const method = req.method.toUpperCase();

    try {
      if (!pathname.startsWith('/api/')) {
        serveStatic(req, res, pathname);
        return;
      }

      if (method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'APL EXPO AI Web Application',
          geminiConfigured: Boolean(GEMINI_API_KEY),
          geminiModel: GEMINI_MODEL,
          googleSheetsConfigured: Boolean(store.getSheetsWebhookUrl()),
          platform: process.platform,
          vercel: Boolean(process.env.VERCEL),
          storageMode: process.env.VERCEL ? 'vercel-tmp-json-csv' : 'local-json-csv',
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/bootstrap') {
        sendJson(res, 200, {
          ...store.getBootstrap(),
          priorityGuidance: PRIORITY_GUIDANCE,
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/extract-card') {
        const body = await readJsonBody(req);
        const state = store.readState();
        const result = await extractBusinessCard({
          ...body,
          categories: state.categories.filter((c) => c.active),
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === 'POST' && pathname === '/api/enquiries/check-duplicate') {
        const body = await readJsonBody(req);
        const matches = store.findDuplicates(body);
        sendJson(res, 200, { matches });
        return;
      }

      if (method === 'GET' && pathname === '/api/enquiries') {
        const filters = Object.fromEntries(parsed.searchParams.entries());
        const enquiries = store.listEnquiries(filters);
        sendJson(res, 200, { enquiries });
        return;
      }

      if (method === 'POST' && pathname === '/api/enquiries') {
        const body = await readJsonBody(req);
        const created = store.createEnquiry(body);
        const state = store.readState();
        const googleSheetsSync = await syncEnquiryToSheet(
          created,
          state.categories,
          resolveWebhookUrl(req, store, body),
          sheetsFetch
        );
        sendJson(res, 201, { enquiry: created, googleSheetsSync });
        return;
      }

      if (pathname.startsWith('/api/enquiries/')) {
        const enquiryId = decodeURIComponent(pathname.slice('/api/enquiries/'.length));
        if (method === 'GET') {
          const enquiry = store.getEnquiry(enquiryId);
          if (!enquiry) {
            sendJson(res, 404, { error: 'Enquiry not found' });
            return;
          }
          const relatedHistory = store.findDuplicates({
            mobile: enquiry.mobile,
            email: enquiry.email,
            companyName: enquiry.companyName,
            excludeEnquiryId: enquiry.enquiryId,
          });
          sendJson(res, 200, { enquiry, relatedHistory });
          return;
        }
        if (method === 'PATCH') {
          const body = await readJsonBody(req);
          const updated = store.updateEnquiry(enquiryId, body);
          const state = store.readState();
          const googleSheetsSync = await syncEnquiryToSheet(
            updated,
            state.categories,
            resolveWebhookUrl(req, store, body),
            sheetsFetch
          );
          sendJson(res, 200, { enquiry: updated, googleSheetsSync });
          return;
        }
        if (method === 'DELETE') {
          const removed = store.deleteEnquiry(enquiryId);
          const googleSheetsSync = await deleteEnquiryFromSheet(
            removed.enquiryId,
            resolveWebhookUrl(req, store),
            sheetsFetch
          );
          sendJson(res, 200, { ok: true, deletedId: removed.enquiryId, googleSheetsSync });
          return;
        }
      }

      if (method === 'GET' && pathname === '/api/sheets/status') {
        const url = resolveWebhookUrl(req, store);
        sendJson(res, 200, {
          configured: Boolean(url),
          fromEnv: Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL),
          webhookUrl: url,
          columns: ENQUIRY_SHEET_COLUMNS,
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/sheets/config') {
        const body = await readJsonBody(req);
        const savedUrl = store.setSheetsWebhookUrl(body.webhookUrl || '');
        let connectionTest = null;
        if (savedUrl && body.test !== false) {
          connectionTest = await testSheetConnection(savedUrl, sheetsFetch);
        }
        sendJson(res, 200, {
          configured: Boolean(savedUrl),
          webhookUrl: savedUrl,
          connectionTest,
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/sheets/sync-all') {
        const body = await readJsonBody(req);
        const state = store.readState();
        const effectiveState =
          (!state.enquiries || state.enquiries.length === 0) &&
          Array.isArray(body?.enquiries) &&
          body.enquiries.length > 0
            ? { ...state, enquiries: body.enquiries }
            : state;
        const result = await syncAllToSheet(
          effectiveState,
          resolveWebhookUrl(req, store, body),
          sheetsFetch
        );
        sendJson(res, result.synced ? 200 : 400, result);
        return;
      }

      if (method === 'GET' && pathname === '/api/dashboard') {
        const filters = Object.fromEntries(parsed.searchParams.entries());
        const report = buildDashboardReport(store, filters);
        sendJson(res, 200, report);
        return;
      }

      if (method === 'GET' && pathname === '/api/sheets-preview') {
        const state = store.readState();
        const linkRows = store.buildEnquiryCategoriesLinkTable(state);
        sendJson(res, 200, {
          sheets: {
            EXPO_ENQUIRIES: {
              count: state.enquiries.length,
              columns: [
                'Enquiry ID',
                'Expo Name',
                'Enquiry Date',
                'Company Name',
                'Contact Person',
                'Mobile',
                'Email',
                'Product Categories',
                'Visit Priority',
                'Tentative Visit Date',
                'Assigned Salesperson',
                'Enquiry Status',
              ],
            },
            PRODUCT_CATEGORIES: {
              count: state.categories.length,
              rows: state.categories,
            },
            SALES_TEAM: {
              count: state.salesTeam.length,
              rows: state.salesTeam,
            },
            ENQUIRY_CATEGORIES: {
              count: linkRows.length,
              rows: linkRows.slice(0, 25),
            },
          },
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/export/csv') {
        const table = parsed.searchParams.get('table') || 'EXPO_ENQUIRIES';
        const csv = store.getCsvContent(table);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${table}.csv"`,
        });
        res.end(csv);
        return;
      }

      if (method === 'POST' && pathname === '/api/master/categories') {
        const body = await readJsonBody(req);
        const category = store.addCategory(body);
        sendJson(res, 201, { category });
        return;
      }

      if (method === 'PATCH' && pathname.startsWith('/api/master/categories/')) {
        const id = decodeURIComponent(pathname.slice('/api/master/categories/'.length));
        const body = await readJsonBody(req);
        const category = store.updateCategory(id, body);
        sendJson(res, 200, { category });
        return;
      }

      if (method === 'POST' && pathname === '/api/master/sales-team') {
        const body = await readJsonBody(req);
        const salesperson = store.addSalesperson(body);
        sendJson(res, 201, { salesperson });
        return;
      }

      if (method === 'PATCH' && pathname.startsWith('/api/master/sales-team/')) {
        const id = decodeURIComponent(pathname.slice('/api/master/sales-team/'.length));
        const body = await readJsonBody(req);
        const salesperson = store.updateSalesperson(id, body);
        sendJson(res, 200, { salesperson });
        return;
      }

      sendJson(res, 404, { error: 'API route not found' });
    } catch (err) {
      sendError(res, err);
    }
  };

  return { handler, store };
}

function createAppServer({ dataDir = DEFAULT_DATA_DIR } = {}) {
  const { handler, store } = createRequestHandler({ dataDir });
  const server = http.createServer(handler);
  return { server, store };
}

if (require.main === module) {
  const { server } = createAppServer();
  server.listen(PORT, () => {
    console.log(`APL EXPO AI Web Application running at http://localhost:${PORT}`);
    console.log(
      GEMINI_API_KEY
        ? `Gemini Vision OCR: ENABLED (${GEMINI_MODEL})`
        : 'Card Analyzer: LOCAL WINDOWS OCR + NLP ENGINE (set GEMINI_API_KEY in .env for Gemini Vision)'
    );
  });
}

module.exports = {
  createAppServer,
  createRequestHandler,
};
