'use strict';

const fs = require('fs/promises');
const path = require('path');
const glob = require('glob');

// ============================================================================
// CONFIGURATION
// ============================================================================

const ASSETS_DIR = path.join(__dirname, '../src/assets');
const INPUT_PATTERN = path.join(ASSETS_DIR, 'bibleTexts/');

// Output: src/assets/index/bibles/{translation}/{book}/{chapter}.json
const OUTPUT_ROOT = path.join(ASSETS_DIR, 'bibles');

const MAX_CONCURRENT_WRITES = 64;

// Standard Book IDs (1-66)
const BOOK_ID_MAP = [
  null,
  'gen',
  'exo',
  'lev',
  'num',
  'deu',
  'jos',
  'jdg',
  'rut',
  '1sa',
  '2sa',
  '1ki',
  '2ki',
  '1ch',
  '2ch',
  'ezr',
  'neh',
  'est',
  'job',
  'psa',
  'pro',
  'ecc',
  'sng',
  'isa',
  'jer',
  'lam',
  'eze',
  'dan',
  'hos',
  'joe',
  'amo',
  'oba',
  'jon',
  'mic',
  'nah',
  'hab',
  'zep',
  'hag',
  'zec',
  'mal',
  'mat',
  'mar',
  'luk',
  'joh',
  'act',
  'rom',
  '1co',
  '2co',
  'gal',
  'eph',
  'phi',
  'col',
  '1th',
  '2th',
  '1ti',
  '2ti',
  'tit',
  'phm',
  'heb',
  'jam',
  '1pe',
  '2pe',
  '1jo',
  '2jo',
  '3jo',
  'jud',
  'rev',
];

// ============================================================================
// HELPERS (Worker Pool)
// ============================================================================

function createWriteQueue(limit) {
  let active = 0;
  const queue = [];

  const process = () => {
    while (active < limit && queue.length > 0) {
      active++;
      const { fn, resolve, reject } = queue.shift();
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          active--;
          process();
        });
    }
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      process();
    });
}
const enqueueWrite = createWriteQueue(MAX_CONCURRENT_WRITES);

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
async function writeJSON(filePath, data) {
  return fs.writeFile(filePath, JSON.stringify(data));
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📖 Bible Chapter Extractor');
  console.log('═══════════════════════════════════════════════════════════');

  await ensureDir(OUTPUT_ROOT);

  // 1. Find all bible files
  const bibleFiles = await fs.readdir(INPUT_PATTERN);
  if (bibleFiles.length === 0) {
    console.error('❌ No bible files found in src/assets/bible/');
    process.exit(1);
  }

  console.log(`Found ${bibleFiles.length} bible translations.`);

  for (const file of bibleFiles) {
    // 2. Read and Parse
    const raw = await fs.readFile(path.join(INPUT_PATTERN, file), 'utf-8');
    const content = JSON.parse(raw);

    // Determine Translation ID (filename or metadata)
    const filenameId = path.basename(file, '.json').toLowerCase();
    const translationId = content.metadata?.id || filenameId;

    console.log(
      `\n⚙️  Processing: [${translationId}] (${content.metadata?.name || filenameId})...`
    );

    // 3. Organize Verses into Memory Structure
    // Structure: structure[bookId][chapterNum] = [ { v: 1, text: "..." }, ... ]
    const structure = {};
    let verseCount = 0;

    const verses = Array.isArray(content.verses) ? content.verses : Object.values(content.verses); // Handle if input is object-based

    for (const v of verses) {
      const bookId = typeof v.book === 'number' ? BOOK_ID_MAP[v.book] : v.book;
      if (!bookId) continue;

      const chapterNum = v.chapter.toString();

      if (!structure[bookId]) structure[bookId] = {};
      if (!structure[bookId][chapterNum]) structure[bookId][chapterNum] = [];

      // We use an Array for verses to preserve order easily in Frontend
      structure[bookId][chapterNum].push({
        v: v.verse,
        text: v.text,
      });
      verseCount++;
    }

    // 4. Write Chapters to Disk
    const transDir = path.join(OUTPUT_ROOT, translationId);
    await ensureDir(transDir);

    const writePromises = [];

    // Manifest to let frontend know which books/chapters exist for this translation
    const manifest = {
      id: translationId,
      name: content.metadata?.name || translationId,
      lang: content.metadata?.lang || 'en',
      books: {},
    };

    for (const [bookId, chapters] of Object.entries(structure)) {
      const bookDir = path.join(transDir, bookId);
      await ensureDir(bookDir);

      // Record available chapters for manifest
      // Sort chapters numerically to be safe
      manifest.books[bookId] = Object.keys(chapters)
        .map(Number)
        .sort((a, b) => a - b);

      for (const [chapterNum, verseList] of Object.entries(chapters)) {
        // Sort verses numerically within chapter
        verseList.sort((a, b) => a.v - b.v);

        const filePath = path.join(bookDir, `${chapterNum}.json`);
        writePromises.push(enqueueWrite(() => writeJSON(filePath, verseList)));
      }
    }

    // Write Manifest
    writePromises.push(enqueueWrite(() => writeJSON(path.join(transDir, 'index.json'), manifest)));

    await Promise.all(writePromises);
    console.log(`   ✓ Written ${verseCount} verses into ${writePromises.length} files.`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`✅ COMPLETE (${duration}s)`);
}

main().catch(console.error);
