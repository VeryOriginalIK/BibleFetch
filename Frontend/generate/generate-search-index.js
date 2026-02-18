'use strict';

const fs = require('fs/promises');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const ASSETS_DIR = path.join(__dirname, '../src/assets');
const BIBLES_DIR = path.join(ASSETS_DIR, 'bibles');
const OUTPUT_DIR = path.join(ASSETS_DIR, 'index/search');

// Which translations to index (add more as needed)
const TRANSLATIONS_TO_INDEX = ['kjv_strongs', 'karoli'];

// Minimum word length to include in the index
const MIN_WORD_LENGTH = 3;

// Standard Book IDs (1-66) — same order as generate-bibles.js
const BOOK_ID_MAP = [
  null,
  'gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut',
  '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est',
  'job', 'psa', 'pro', 'ecc', 'sng',
  'isa', 'jer', 'lam', 'eze', 'dan',
  'hos', 'joe', 'amo', 'oba', 'jon', 'mic', 'nah', 'hab', 'zep', 'hag', 'zec', 'mal',
  'mat', 'mar', 'luk', 'joh', 'act',
  'rom', '1co', '2co', 'gal', 'eph', 'phi', 'col',
  '1th', '2th', '1ti', '2ti', 'tit', 'phm',
  'heb', 'jam', '1pe', '2pe', '1jo', '2jo', '3jo', 'jud', 'rev',
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Strip Strong's number tags from text.
 * Input:  "In the beginning{H7225} God{H430} created{H1254}"
 * Output: "In the beginning God created"
 *
 * Also handles the <H1234> format used in some translations.
 */
function stripStrongsTags(text) {
  return text
    .replace(/\{[HG]\d+\}/g, '')   // {H7225} format
    .replace(/<[HG]\d+>/g, '')     // <H7225> format
    .trim();
}

/**
 * Tokenize text into lowercase words, stripping punctuation.
 * Returns words (including duplicates) from the text — preserves multiple instances so generator records all occurrences.
 */
function tokenize(text) {
  const cleaned = stripStrongsTags(text);

  // Split on non-letter/non-digit characters, keep Unicode letters
  const words = cleaned
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')  // Keep letters, numbers, spaces, apostrophes, hyphens
    .split(/\s+/)
    .map(w => w.replace(/^['-]+|['-]+$/g, ''))  // Trim leading/trailing punctuation
    .filter(w => w.length >= MIN_WORD_LENGTH);

  return words;
}

/**
 * Get the first letter bucket for a word.
 * Groups non-latin characters under their first letter.
 * Numbers go under '#'.
 */
function getBucket(word) {
  const first = word.charAt(0);
  if (/\d/.test(first)) return '#';
  return first.toLowerCase();
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function indexTranslation(translationId) {
  const transDir = path.join(BIBLES_DIR, translationId);
  const outputDir = path.join(OUTPUT_DIR, translationId);

  // Check if translation exists
  try {
    await fs.access(transDir);
  } catch {
    console.log(`   ⚠️  Skipping ${translationId}: directory not found`);
    return;
  }

  console.log(`\n⚙️  Indexing: ${translationId}...`);

  // Read the translation index to get available books/chapters
  let manifest;
  try {
    const raw = await fs.readFile(path.join(transDir, 'index.json'), 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    console.log(`   ⚠️  Skipping ${translationId}: no index.json found`);
    return;
  }

  // Build inverted index: word -> Set of verse IDs
  const invertedIndex = new Map();
  let totalVerses = 0;
  let totalWords = 0;

  for (const [bookId, chapters] of Object.entries(manifest.books)) {
    for (const chapterNum of chapters) {
      const chapterFile = path.join(transDir, bookId, `${chapterNum}.json`);

      let verses;
      try {
        const raw = await fs.readFile(chapterFile, 'utf-8');
        verses = JSON.parse(raw);
      } catch {
        continue; // Skip missing chapter files
      }

      for (const verse of verses) {
        const verseId = `${bookId}-${chapterNum}-${verse.v}`;
        const words = tokenize(verse.text);
        totalVerses++;

        for (const word of words) {
          if (!invertedIndex.has(word)) {
            invertedIndex.set(word, []);
            totalWords++;
          }
          invertedIndex.get(word).push(verseId);
        }
      }
    }
  }

  console.log(`   📊 Indexed ${totalVerses} verses, ${totalWords} unique words`);

  // Group by first-letter bucket
  const buckets = new Map();
  for (const [word, verseIds] of invertedIndex) {
    const bucket = getBucket(word);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {});
    }
    buckets.get(bucket)[word] = verseIds;
  }

  // Write bucket files
  await fs.mkdir(outputDir, { recursive: true });

  const bucketList = [];
  for (const [bucket, words] of buckets) {
    const filename = `${bucket}.json`;
    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, JSON.stringify(words));
    bucketList.push({
      bucket,
      file: filename,
      wordCount: Object.keys(words).length,
    });
  }

  // Write bucket manifest
  const manifestOut = {
    translation: translationId,
    totalWords,
    totalVerses,
    buckets: bucketList.sort((a, b) => a.bucket.localeCompare(b.bucket)),
  };
  await fs.writeFile(
    path.join(outputDir, 'index.json'),
    JSON.stringify(manifestOut, null, 2)
  );

  console.log(`   ✓ Written ${bucketList.length} bucket files to index/search/${translationId}/`);
}

async function main() {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 Bible Word Search Index Generator');
  console.log('═══════════════════════════════════════════════════════════');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Check which translations are available
  let availableTranslations;
  try {
    const dirs = await fs.readdir(BIBLES_DIR, { withFileTypes: true });
    availableTranslations = dirs.filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    console.error('❌ Cannot read bibles directory. Run generate-bibles first.');
    process.exit(1);
  }

  // Filter to configured translations that actually exist
  const toIndex = TRANSLATIONS_TO_INDEX.filter(t => availableTranslations.includes(t));

  if (toIndex.length === 0) {
    console.log('⚠️  No configured translations found. Available:', availableTranslations.join(', '));
    console.log('   Update TRANSLATIONS_TO_INDEX in generate-search-index.js');
    return;
  }

  console.log(`Translations to index: ${toIndex.join(', ')}`);

  for (const trans of toIndex) {
    await indexTranslation(trans);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`✅ SEARCH INDEX COMPLETE (${duration}s)`);
}

main().catch(console.error);
