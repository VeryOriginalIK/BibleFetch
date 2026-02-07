const fs = require('fs');
const path = require('path');

// --- KONFIGURÁCIÓ ---
const CHUNK_SIZE = 400;

// Útvonalak beállítása (a generate mappából visszalépve)
const STRONGS_DIR = path.join(__dirname, '../src/assets/strongs');

// --- TRANSZFORMÁCIÓS FÜGGVÉNYEK ---

// A héber fájl már jó szerkezetben van, csak továbbadjuk,
// de biztosítjuk a numerikus sorrendet a kulcsok alapján (H1, H2...)
const prepareHebrew = (jsonData) => {
  return Object.entries(jsonData).sort((a, b) => {
    // A "H1", "H2" stringekből kivágjuk a számot a sorbarendezéshez
    const numA = parseInt(a[0].replace('H', ''), 10);
    const numB = parseInt(b[0].replace('H', ''), 10);
    return numA - numB;
  });
};

// A görög fájlt át kell alakítani a héber sémára
const prepareGreek = (jsonData) => {
  const transformedEntries = Object.values(jsonData).map((item) => {
    // Új ID generálása: G + strongs szám (pl. G101)
    const newId = `G${item.strongs}`;

    // Az új objektum a héber struktúra szerint
    const newObj = {
      id: newId,
      lemma: item.original_word, // original_word -> lemma
      translit: item.transliteration, // transliteration -> translit
      pronounce: '', // üres, mert a héberben van, itt nincs
      defs: item.definition, // definition -> defs
    };

    return [newId, newObj]; // Visszatérünk [kulcs, érték] párral
  });

  // Sorbarendezés a Strong szám alapján (hogy az 1-400 fájlban tényleg az elsők legyenek)
  return transformedEntries.sort((a, b) => {
    const numA = parseInt(a[0].replace('G', ''), 10);
    const numB = parseInt(b[0].replace('G', ''), 10);
    return numA - numB;
  });
};

// A feldolgozandó feladatok listája
const filesToProcess = [
  {
    filename: 'hebrew.json',
    outputFolderName: 'hebrew',
    processor: prepareHebrew,
  },
  {
    filename: 'greek.json',
    outputFolderName: 'greek',
    processor: prepareGreek,
  },
];

// Mappa létrehozása
function ensureDirectoryExistence(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// --- FŐ FELDOLGOZÓ LOGIKA ---
function processFiles() {
  console.log(`Feldolgozás indítása...`);
  console.log(`Bázis könyvtár: ${STRONGS_DIR}\n`);

  filesToProcess.forEach((task) => {
    const inputPath = path.join(STRONGS_DIR, task.filename);
    const outputDir = path.join(STRONGS_DIR, task.outputFolderName);

    if (!fs.existsSync(inputPath)) {
      console.error(`❌ HIBA: A fájl nem található: ${inputPath}`);
      return;
    }

    try {
      console.log(`📖 ${task.filename} feldolgozása...`);

      const rawData = fs.readFileSync(inputPath, 'utf8');
      const jsonData = JSON.parse(rawData);

      // Adatok előkészítése (átalakítás + sorbarendezés)
      const sortedEntries = task.processor(jsonData);
      const totalEntries = sortedEntries.length;

      console.log(`   -> ${totalEntries} bejegyzés előkészítve.`);

      ensureDirectoryExistence(outputDir);

      let fileCount = 0;
      // Darabolás
      for (let i = 0; i < totalEntries; i += CHUNK_SIZE) {
        const chunkEntries = sortedEntries.slice(i, i + CHUNK_SIZE);

        // Visszaalakítás objektummá a JSON mentéshez
        const chunkObject = Object.fromEntries(chunkEntries);

        // Fájlnév: 1-400.json, 401-800.json ...
        const startNum = i + 1;
        const endNum = i + CHUNK_SIZE;
        const outputFilename = `${startNum}-${endNum}.json`;
        const outputPath = path.join(outputDir, outputFilename);

        fs.writeFileSync(outputPath, JSON.stringify(chunkObject, null, 2), 'utf8');
        fileCount++;
      }

      console.log(`✅ ${task.outputFolderName}: ${fileCount} fájl elmentve.\n`);
    } catch (error) {
      console.error(`❌ Hiba a ${task.filename} feldolgozásakor:`, error);
    }
  });
}

processFiles();
