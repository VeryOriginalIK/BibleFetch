const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const INPUT_FILE = 'strongs_greek_master_hungarian_context.csv';
const OUTPUT_PREFIX = 'strongs_greek_part_';
const BATCH_SIZE = 350;

/**
 * Helper: Parse CSV line respecting quotes and semicolons
 * Handles cases like: G1;Alpha;"Definition with ; semicolon";...
 */
function parseCSVLine(text, delimiter = ';') {
    const result = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
                currentField += '"'; // Handle escaped quotes
                i++; 
            } else {
                inQuotes = !inQuotes; // Toggle quote mode
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(currentField.trim());
            currentField = '';
        } else {
            currentField += char;
        }
    }
    result.push(currentField.trim());
    return result;
}

/**
 * Helper: Generate unique Key
 * Prioritizes Transliteration (e.g. "sw-logos")
 * Fallback to G-Number (e.g. "sw-g1234") if transliteration is missing
 */
function generateKey(transliteration, strongsNumber, existingKeys) {
    let baseString = "";

    // 1. Try to use transliteration first
    if (transliteration && transliteration.trim() !== '') {
        baseString = transliteration
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^a-zA-Z0-9]/g, '') // Remove symbols
            .toLowerCase();
    }

    // 2. Fallback to Strong's Number if transliteration is empty
    if (baseString.length === 0) {
        baseString = `g${strongsNumber}`;
    }

    let baseKey = `sw-${baseString}`;
    let finalKey = baseKey;

    // 3. Handle duplicates (e.g. if two words transliterate to "kai")
    if (existingKeys.has(finalKey)) {
        finalKey = `${baseKey}-${strongsNumber}`;
    }

    existingKeys.add(finalKey);
    return finalKey;
}

function processDictionary() {
    try {
        console.log(`Reading ${INPUT_FILE}...`);
        
        if (!fs.existsSync(INPUT_FILE)) {
            throw new Error(`File not found: ${INPUT_FILE}`);
        }

        const fileContent = fs.readFileSync(INPUT_FILE, 'utf-8');
        // Split by newlines, handling Windows (\r\n) and Unix (\n)
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');

        // --- 1. PARSE HEADERS ---
        // Expected header in CSV: StrongID;OriginalWord;Transliteration;EnglishDefinition;HungarianDefinition
        const headers = parseCSVLine(lines[0]);
        console.log("Found headers:", headers);

        const colMap = {
            id: headers.indexOf('StrongID'),
            orig: headers.indexOf('OriginalWord'),
            trans: headers.indexOf('Transliteration'),
            eng: headers.indexOf('EnglishDefinition'),
            hun: headers.indexOf('HungarianDefinition')
        };

        if (colMap.id === -1 || colMap.hun === -1) {
            throw new Error("Missing required columns in CSV (StrongID or HungarianDefinition)");
        }

        // --- 2. PROCESS ROWS ---
        const allEntries = [];
        const existingKeys = new Set();

        // Start from i=1 to skip header
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            
            // Skip broken/empty lines
            if (cols.length < 2) continue;

            // Extract Data
            const rawId = cols[colMap.id] || "0";
            // Convert "G1234" -> 1234
            const strongsNum = parseInt(rawId.replace(/[^0-9]/g, ''));
            
            const originalWord = cols[colMap.orig] || "";
            const translit = cols[colMap.trans] || "";
            
            // Clean Definitions (remove surrounding quotes if extra ones exist)
            let engDef = cols[colMap.eng] || "";
            let hunDef = cols[colMap.hun] || "";
            
            engDef = engDef.replace(/^"|"$/g, '').trim();
            hunDef = hunDef.replace(/^"|"$/g, '').trim();

            // Generate Key (sw-word or sw-g123)
            const keyId = generateKey(translit, strongsNum, existingKeys);

            // Create JSON Entry matching your exact style
            const entry = {
                [keyId]: {
                    strongs: strongsNum,
                    original_word: originalWord,
                    transliteration: translit,
                    language: "Greek",
                    definition: {
                        en: engDef,
                        hu: hunDef
                    }
                }
            };

            allEntries.push(entry);
        }

        console.log(`Parsed ${allEntries.length} words.`);

        // --- 3. SAVE IN BATCHES (350 per file) ---
        let fileCount = 0;
        for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
            fileCount++;
            const batch = allEntries.slice(i, i + BATCH_SIZE);
            
            // Merge array of objects into one big object for the file
            const batchObject = Object.assign({}, ...batch);
            
            const fileName = `${OUTPUT_PREFIX}${fileCount}.json`;
            fs.writeFileSync(fileName, JSON.stringify(batchObject, null, 2), 'utf-8');
            
            console.log(`Created: ${fileName} (Items: ${Object.keys(batchObject).length})`);
        }

        console.log("Done! JSON files generated.");

    } catch (error) {
        console.error("Error:", error.message);
    }
}

// Run the script
processDictionary();