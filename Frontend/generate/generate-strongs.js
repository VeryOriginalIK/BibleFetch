/**
 * Strong's Concordance Generator (KJV Source) - v5.1.0 (Fix)
 * Javítva: A Regex most már megtalálja a {H1234a} vagy { H1234 } formátumokat is.
 */

'use strict';

const fs = require('fs/promises');
const path = require('path');

// ============================================================================
// KONFIGURÁCIÓ
// ============================================================================

const ASSETS_DIR = path.join(__dirname, '../src/assets');
const INPUT_FILE = path.join(ASSETS_DIR, 'bible/kjv_strongs.json');
const OUTPUT_DIR = path.join(ASSETS_DIR, 'index/strongs');

const MAX_CONCURRENT_WRITES = 128;

// Könyv ID térkép
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
// SEGÉDFÜGGVÉNYEK
// ============================================================================

function createWriteQueue(concurrency) {
  let active = 0;
  const queue = [];

  const process = () => {

    while (active < concurrency && queue.length > 0) {
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
// FŐ PROCESSZ
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════════');
  console.log("🚀 Strong's Concordance Generator v5.1 (Fix)");
  console.log('═══════════════════════════════════════════════════════════');

  await ensureDir(OUTPUT_DIR);

  console.log('📖 KJV Strongs fájl beolvasása...');
  let content;
  try {
    const raw = await fs.readFile(INPUT_FILE, 'utf-8');
    content = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Hiba: ${err.message}`);
    process.exit(1);
  }

  const strongMap = new Map();
  let verseCount = 0;
  let totalMatches = 0;

  console.log(`🔍 ${content.verses.length} vers feldolgozása...`);

  // --- REGEX ---
  const looseStrongRegex = /\{[^}]*?([HG]\d+)[^}]*?\}/g;

  for (const v of content.verses) {
    verseCount++;

    const bookId = BOOK_ID_MAP[v.book];
    if (!bookId) continue;

    const verseId = `${bookId}-${v.chapter}-${v.verse}`;

    // A matchAll() használata biztonságosabb ciklusokban
    const matches = [...v.text.matchAll(looseStrongRegex)];

    for (const match of matches) {
      const strongId = match[1]; // Csak a kódot vesszük ki (pl. H430)

      if (!strongMap.has(strongId)) {
        strongMap.set(strongId, new Set());
      }
      strongMap.get(strongId).add(verseId);
      totalMatches++;
    }
  }

  console.log(`   ✓ Feldolgozva: ${verseCount} vers`);
  console.log(`   ✓ Összes találat: ${totalMatches}`);
  console.log(`   ✓ Egyedi Strong kulcsok: ${strongMap.size}`);

  console.log('\n💾 Fájlok írása...');

  const entries = Array.from(strongMap.entries());

  const writePromises = entries.map(([strongId, verseSet]) => {
    // Itt rendezzük sorba a verseket, hogy szépen jelenjenek meg (opcionális, de hasznos)
    // Mivel a beolvasás sorrendben történt, a Set valószínűleg már jó, de a biztonság kedvéért:
    const verseArray = Array.from(verseSet);
    return enqueueWrite(() => writeJSON(path.join(OUTPUT_DIR, `${strongId}.json`), verseArray));
  });

  await Promise.all(writePromises);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ KÉSZ! (${duration}s) - ${entries.length} fájl generálva.`);
}

main().catch(console.error);
