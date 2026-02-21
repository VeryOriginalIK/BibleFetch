'use strict';

const fs = require('fs/promises');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../src/assets');
const BIBLES_DIR = path.join(ASSETS_DIR, 'bibles');
const STRONGS_DIR = path.join(ASSETS_DIR, 'strongs');
const OUTPUT_ROOT = path.join(ASSETS_DIR, 'index/original-language');

const PREFERRED_TRANSLATIONS = ['asvs', 'kjv_strongs'];

function normalizeTerm(term) {
  return String(term || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getBucket(term) {
  const normalized = normalizeTerm(term);
  const first = normalized.charAt(0);
  if (!first) return '#';
  if (/\d/.test(first)) return '#';
  return first;
}

function addTerm(index, term, verseId) {
  const normalized = normalizeTerm(term);
  if (!normalized) return;

  if (!index.has(normalized)) {
    index.set(normalized, new Set());
  }

  index.get(normalized).add(verseId);
}

async function chooseTranslation() {
  const dirs = await fs.readdir(BIBLES_DIR, { withFileTypes: true });
  const available = new Set(dirs.filter((d) => d.isDirectory()).map((d) => d.name));

  for (const id of PREFERRED_TRANSLATIONS) {
    if (available.has(id)) return id;
  }

  throw new Error(
    `No Strong's-enabled translation found. Expected one of: ${PREFERRED_TRANSLATIONS.join(', ')}`
  );
}

async function loadLexicon() {
  const hebrewPath = path.join(STRONGS_DIR, 'hebrew.json');
  const greekPath = path.join(STRONGS_DIR, 'greek.json');

  const [hebrewRaw, greekRaw] = await Promise.all([
    fs.readFile(hebrewPath, 'utf8'),
    fs.readFile(greekPath, 'utf8'),
  ]);

  const hebrew = JSON.parse(hebrewRaw);
  const greek = JSON.parse(greekRaw);

  const lexicon = new Map();

  for (const [id, entry] of Object.entries(hebrew)) {
    lexicon.set(id.toUpperCase(), {
      lemma: entry.lemma || '',
      translit: entry.translit || '',
    });
  }

  for (const entry of Object.values(greek)) {
    const id = `G${entry.strongs}`;
    lexicon.set(id, {
      lemma: entry.original_word || '',
      translit: entry.transliteration || '',
    });
  }

  return lexicon;
}

async function main() {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🕎 Original Language Index Generator');
  console.log('═══════════════════════════════════════════════════════════');

  const translationId = await chooseTranslation();
  console.log(`Using Strong's-enabled translation: ${translationId}`);

  const transDir = path.join(BIBLES_DIR, translationId);
  const outputDir = path.join(OUTPUT_ROOT, translationId);

  const manifestRaw = await fs.readFile(path.join(transDir, 'index.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);

  const lexicon = await loadLexicon();
  const inverted = new Map();

  let chapterCount = 0;
  let verseCount = 0;
  let strongTagCount = 0;

  const strongRegex = /\{([HG]\d+)\}/g;

  for (const [bookId, chapters] of Object.entries(manifest.books || {})) {
    for (const chapterNum of chapters) {
      chapterCount++;
      const chapterPath = path.join(transDir, bookId, `${chapterNum}.json`);

      let verses;
      try {
        verses = JSON.parse(await fs.readFile(chapterPath, 'utf8'));
      } catch {
        continue;
      }

      for (const verse of verses) {
        verseCount++;
        const verseId = `${bookId}-${chapterNum}-${verse.v}`;
        const text = String(verse.text || '');

        let match;
        while ((match = strongRegex.exec(text)) !== null) {
          strongTagCount++;
          const code = match[1].toUpperCase();

          addTerm(inverted, code, verseId);

          const lex = lexicon.get(code);
          if (!lex) continue;

          addTerm(inverted, lex.lemma, verseId);
          addTerm(inverted, lex.translit, verseId);
        }
      }
    }
  }

  const buckets = new Map();
  for (const [term, verseIdSet] of inverted.entries()) {
    const bucket = getBucket(term);
    if (!buckets.has(bucket)) buckets.set(bucket, {});
    buckets.get(bucket)[term] = Array.from(verseIdSet);
  }

  await fs.mkdir(outputDir, { recursive: true });

  const bucketManifest = [];
  for (const [bucket, terms] of buckets.entries()) {
    const fileName = `${bucket}.json`;
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(terms));

    bucketManifest.push({
      bucket,
      file: fileName,
      termCount: Object.keys(terms).length,
    });
  }

  bucketManifest.sort((a, b) => a.bucket.localeCompare(b.bucket));

  const outManifest = {
    translation: translationId,
    totalBooks: Object.keys(manifest.books || {}).length,
    totalChapters: chapterCount,
    totalVerses: verseCount,
    totalStrongTags: strongTagCount,
    totalIndexedTerms: inverted.size,
    buckets: bucketManifest,
  };

  await fs.writeFile(path.join(outputDir, 'index.json'), JSON.stringify(outManifest, null, 2));

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n   📚 Chapters scanned: ${chapterCount}`);
  console.log(`   📖 Verses scanned: ${verseCount}`);
  console.log(`   🔢 Strong tags parsed: ${strongTagCount}`);
  console.log(`   🧠 Indexed terms: ${inverted.size}`);
  console.log(`   🗂️  Bucket files: ${bucketManifest.length}`);
  console.log(`   ✅ Output: index/original-language/${translationId}/`);
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`✅ ORIGINAL LANGUAGE INDEX COMPLETE (${duration}s)`);
}

main().catch((err) => {
  console.error('❌ Failed to generate original language index:', err);
  process.exit(1);
});
