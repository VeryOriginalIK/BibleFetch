const fs = require('fs');
const path = require('path');

// KONFIGURÁCIÓ
// Hol vannak a téma JSON fájlok a scripthez képest?
// Ha a script a "generate" mappában van, és az assets a "src/assets"-ben:
const TOPICS_DIR = path.join(__dirname, '../src/assets/topics');
const OUTPUT_FILE = path.join(TOPICS_DIR, 'index.json');

function generateTopicIndex() {
  console.log('🔄 Téma index generálása...');

  // 1. Ellenőrizzük, létezik-e a mappa
  if (!fs.existsSync(TOPICS_DIR)) {
    console.error(`❌ Hiba: A mappa nem található: ${TOPICS_DIR}`);
    return;
  }

  // 2. Fájlok beolvasása
  const files = fs.readdirSync(TOPICS_DIR);

  const indexList = [];

  files.forEach((file) => {
    // Csak a .json fájlokat nézzük, de az index.json-t kihagyjuk
    if (path.extname(file) === '.json' && file !== 'index.json') {
      const filePath = path.join(TOPICS_DIR, file);

      try {
        // Fájl beolvasása és parse-olása
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const topicData = JSON.parse(fileContent);

        // Fájlnév kiterjesztés nélkül (ez lesz az ID)
        const id = path.basename(file, '.json');

        // Validáció: Van-e verse_ids tömb?
        const verseCount = Array.isArray(topicData.verse_ids) ? topicData.verse_ids.length : 0;

        // 3. Az Index elem összeállítása (TopicSummary modell szerint)
        const indexItem = {
          id: id,
          titles: topicData.titles || { hu: 'Névtelen', en: 'Untitled' },
          description: topicData.description || { hu: '', en: '' },
          icon: topicData.icon || 'star', // Fallback ikon
          category: topicData.category || 'general',
          theme_color: topicData.theme_color || '#3b82f6', // Fallback szín
          verseCount: verseCount,
        };

        indexList.push(indexItem);
        console.log(`✅ Feldolgozva: ${file} (Versek: ${verseCount})`);
      } catch (error) {
        console.error(`⚠️ Hiba a(z) ${file} feldolgozásakor:`, error.message);
      }
    }
  });

  // 4. Mentés az index.json fájlba
  // Szép formázással (null, 2)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(indexList, null, 2), 'utf-8');

  console.log('------------------------------------------------');
  console.log(`🎉 Kész! ${indexList.length} téma hozzáadva az index.json-hoz.`);
  console.log(`📂 Kimenet: ${OUTPUT_FILE}`);
}

// Függvény futtatása
generateTopicIndex();
