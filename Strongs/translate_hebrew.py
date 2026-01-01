import json
import re

# Bemeneti és kimeneti fájlok
INPUT_FILE = 'strongs_hebrew_master_hungarian_27b.csv'
OUTPUT_FILE = 'strongs_h1.json'

def clean_text(text):
    if not text: return ""
    # 1. Curly braces törlése: {father} -> father
    text = text.replace('{', '').replace('}', '')
    
    # 2. Idézőjel káosz javítása
    # "szó"," jelentés" -> "szó, jelentés"
    text = text.replace('","', ', ')
    text = text.replace('",', ',')
    text = text.replace(',"', ', ')
    
    # 3. Maradék szélső idézőjelek levágása
    text = text.strip('"').strip()
    
    # 4. Dupla szóközök irtása
    text = re.sub(r'\s+', ' ', text)
    return text

def smart_split(english_raw):
    """
    Megpróbálja szétválasztani az angolt és a magyart, ha egy mezőbe csúsztak.
    Heurisztika: Ha a vessző után ékezetes magyar betű jön.
    """
    # Pl: "a green plant,zöld növény"
    match = re.search(r'(.*?),\s*([a-zA-Z\s]*[áéíóöőúüűÁÉÍÓÖŐÚÜŰ][^;]*)', english_raw)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return english_raw, ""

strongs_map = {}

print(f"Feldolgozás: {INPUT_FILE}...")

with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        # Fejléc és üres sorok kihagyása
        if not line or line.startswith('StrongID'):
            continue
            
        parts = line.split(';')
        
        # Adatok kinyerése (biztonságos indexeléssel)
        s_id = parts[0].strip()
        original = parts[1].strip() if len(parts) > 1 else ""
        translit = parts[2].strip() if len(parts) > 2 else ""
        english_raw = parts[3].strip() if len(parts) > 3 else ""
        hungarian_raw = parts[4].strip() if len(parts) > 4 else ""

        # Sorból kilógó adatok javítása (pl. H3)
        if not hungarian_raw and ',' in english_raw:
            eng_cand, hun_cand = smart_split(english_raw)
            if hun_cand:
                english_raw = eng_cand
                hungarian_raw = hun_cand
                print(f"  -> Javítva: {s_id} (Szétválasztva)")

        # Tisztítás
        entry = {
            "id": s_id,
            "lemma": original,
            "translit": translit,
            "pronounce": "", # A CSV nem tartalmaz kiejtést, üresen hagyjuk
            "defs": {
                "hu": clean_text(hungarian_raw),
                "en": clean_text(english_raw)
            }
        }
        
        strongs_map[s_id] = entry

# Mentés JSON-be
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(strongs_map, f, ensure_ascii=False, indent=2)

print(f"KÉSZ! {len(strongs_map)} definíció mentve ide: {OUTPUT_FILE}")