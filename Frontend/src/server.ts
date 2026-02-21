import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import fs from 'node:fs/promises';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * API: paged search helper (returns unique verse IDs and occurrence counts)
 * GET /api/search/:translation/:word?offset=0&limit=20
 * Response: { word, totalOccurrences, totalUniqueVerses, uniqueVerseIds: [] }
 */
app.get('/api/search/:translation/:word', async (req, res) => {
  try {
    const { translation, word } = req.params;
    const offset = Math.max(0, parseInt(String(req.query['offset'] || '0'), 10));
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query['limit'] || '20'), 10)));

    const bucketFirst = (word && word.length) ? word.charAt(0).toLowerCase() : '#';
    const bucket = /\d/.test(bucketFirst) ? '#' : bucketFirst;

    const bucketPath = join(browserDistFolder, 'assets', 'index', 'search', translation, `${bucket}.json`);

    let raw;
    try {
      raw = await fs.readFile(bucketPath, 'utf-8');
    } catch (err) {
      // Bucket or translation not found -> return empty result
      return res.json({ word, totalOccurrences: 0, totalUniqueVerses: 0, uniqueVerseIds: [] });
    }

    let bucketObj;
    try {
      bucketObj = JSON.parse(raw);
    } catch (err) {
      return res.status(500).json({ error: 'invalid index file' });
    }

    const key = word.toLowerCase();
    const occurrences = Array.isArray(bucketObj[key]) ? bucketObj[key] : [];
    const totalOccurrences = occurrences.length;

    // Deduplicate while preserving first-seen order to produce unique verse list
    const uniqueMap = new Map();
    for (const v of occurrences) {
      if (!uniqueMap.has(v)) uniqueMap.set(v, true);
    }
    const uniqueVerseIds = Array.from(uniqueMap.keys());
    const totalUniqueVerses = uniqueVerseIds.length;

    const slice = uniqueVerseIds.slice(offset, offset + limit);

    return res.json({ word: key, totalOccurrences, totalUniqueVerses, uniqueVerseIds: slice });
  } catch (err) {
    console.error('API /api/search error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4200.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = parseInt(process.env['PORT'] || '4000', 10);
  app.listen(port, '0.0.0.0', (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://0.0.0.0:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
