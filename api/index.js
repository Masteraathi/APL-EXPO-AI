const os = require('os');
const path = require('path');
const { URL } = require('url');
const { createRequestHandler } = require('../local-dev/server');

const dataDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'apl-expo-ai-data')
  : path.resolve(__dirname, '..', 'data');

const { handler } = createRequestHandler({ dataDir });

module.exports = async function vercelHandler(req, res) {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const rewrittenPath = parsed.searchParams.get('__path');
    if (rewrittenPath) {
      parsed.searchParams.delete('__path');
      const qs = parsed.searchParams.toString();
      req.url = rewrittenPath + (qs ? `?${qs}` : '');
    }
  } catch {
    // Keep original req.url if URL parsing fails
  }
  return handler(req, res);
};
