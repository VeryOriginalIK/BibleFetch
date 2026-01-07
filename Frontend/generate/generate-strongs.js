const fs = require('fs');
const path = require('path');

// Konfiguráció
const CHUNK_SIZE = 400;
const TARGET_BASE_DIR = path.join(__dirname.trimEnd("generate"), '../src/assets/strongs');

const filesToProcess = [
  { filename: 'hebrew.json', outputFolder: 'hebrew' },
  { filename: 'greek.json', outputFolder: 'greek' },
];

function ensureDirectoryExistence(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Mappa létrehozva: ${dirPath}`);
  }
}

// Fő feldolgozó logika
filesToProcess.forEach((fileInfo) => {
  const inputPath = path.join(
    __dirname.trimEnd('generate'),
    '../src/assets/strongs',
    fileInfo.filename
  );
  const outputDir = path.join(TARGET_BASE_DIR, fileInfo.outputFolder);

  // Ellenőrizzük, hogy létezik-e a forrásfájl
  if (!fs.existsSync(inputPath)) {
    console.error(`HIBA: A forrásfájl nem található: ${inputPath}`);
    return;
  }

  try {
    // Fájl beolvasása és parse-olása
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const jsonData = JSON.parse(rawData);

    // Az objektum átalakítása tömbbé ([kulcs, érték] párok), hogy darabolható legyen
    // Feltételezzük, hogy a JSON kulcsai sorrendben vannak (pl. H1, H2 vagy Strong's szám szerint)
    const entries = Object.entries(jsonData);
    const totalEntries = entries.length;

    console.log(`\nFeldolgozás: ${fileInfo.filename} (${totalEntries} bejegyzés)`);

    // Célmappa létrehozása
    ensureDirectoryExistence(outputDir);

    // Darabolás és mentés
    let fileCount = 0;
    for (let i = 0; i < totalEntries; i += CHUNK_SIZE) {
      // A szelet kivágása
      const chunkEntries = entries.slice(i, i + CHUNK_SIZE);

      // Visszaalakítás objektummá
      const chunkObject = Object.fromEntries(chunkEntries);

      const startNum = i + 1;
      const endNum = i + chunkEntries.length; // Ez kezeli az utolsó, csonka fájlt is
      const outputFilename = `${startNum}-${endNum}.json`;

      // A kérés szerinti fix 400-as léptékű elnevezés (pl: 1-400, 401-800...):
      // Megjegyzés: az utolsó fájl is pl. 8401-8800 lesz, még ha csak 8674-ig tart is.
      const fileNameFixed = `${i + 1}-${i + CHUNK_SIZE}.json`;

      const outputPath = path.join(outputDir, fileNameFixed);

      fs.writeFileSync(outputPath, JSON.stringify(chunkObject, null, 2), 'utf8');
      fileCount++;
    }

    console.log(`✅ Kész! ${fileCount} fájl létrehozva itt: ${outputDir}`);
  } catch (err) {
    console.error(`Hiba történt a ${fileInfo.filename} feldolgozása közben:`, err);
  }
});
