import json
import os
import re
import math

# --- KONFIGURÁCIÓ ---
INPUT_FILE = "strongs_hebrew.json"
OUTPUT_DIR = "dist/strongs/hebrew"
CHUNK_SIZE = 350  # Sorszám tartomány mérete

def clean_strong_key(key):
    """
    Megtisztítja a kulcsot a szemetektől.
    Pl.: '"H8670' -> 'H8670'
         '\"H1234' -> 'H1234'
    """
    if not key: return ""
    # Eltávolítjuk az idézőjeleket, backslasheket és whitespace-t
    return key.strip().replace('"', '').replace('\\', '')

def is_valid_strong_key(key):
    # Először megtisztítjuk, aztán ellenőrizzük
    clean = clean_strong_key(key)
    # Csak akkor jó, ha H vagy G betűvel kezdődik és számok követik
    return bool(re.match(r'^[HG]\d+$', clean))

def get_number_from_key(key):
    digits = re.findall(r'\d+', key)
    if digits:
        return int(digits[0])
    return 999999

def has_hungarian_def(item_data):
    """Ellenőrzi, hogy van-e magyar definíció."""
    if 'defs' in item_data and 'hu' in item_data['defs']:
        return bool(item_data['defs']['hu'] and item_data['defs']['hu'].strip())
    return False

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"HIBA: Nem találom a fájlt: {INPUT_FILE}")
        return

    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Kimeneti mappa: {OUTPUT_DIR}")

    print(f"Beolvasás: {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 1. Szűrés (csak az érvényes kulcsok maradnak)
    valid_raw_keys = [k for k in data.keys() if is_valid_strong_key(k)]
    
    # 2. Sorbarendezés a számérték alapján
    sorted_raw_keys = sorted(valid_raw_keys, key=get_number_from_key)
    
    print(f"Összesen {len(sorted_raw_keys)} érvényes definíció.")

    # 3. Csoportosítás, TISZTÍTÁS és MERGE
    buckets = {}
    hu_stats = {"found": 0, "missing": 0}

    for raw_key in sorted_raw_keys:
        num = get_number_from_key(raw_key)
        if num == 0: continue 

        # Kiszámoljuk a bucket indexet
        bucket_index = math.floor((num - 1) / CHUNK_SIZE)
        
        if bucket_index not in buckets:
            buckets[bucket_index] = {}
        
        # 1. Létrehozzuk a tiszta kulcsot (pl. "H8670")
        clean_key = clean_strong_key(raw_key)
        
        # 2. Adat előkészítése
        item_data = data[raw_key].copy()
        item_data['id'] = clean_key
        
        has_hu = has_hungarian_def(item_data)
        
        # 3. ÜTKÖZÉS KEZELÉSE (Collision Handling)
        # Ha már van ilyen kulcs a bucketben (pl. H1 és "H1" is volt a forrásban)
        if clean_key in buckets[bucket_index]:
            existing_item = buckets[bucket_index][clean_key]
            existing_has_hu = has_hungarian_def(existing_item)
            
            # Csak akkor írjuk felül, ha az újnak van magyarja, a réginek meg nincs
            if has_hu and not existing_has_hu:
                buckets[bucket_index][clean_key] = item_data
                hu_stats["found"] += 1
                hu_stats["missing"] -= 1 # Korrigáljuk a statisztikát
            # Egyébként megtartjuk a régit (vagy ha mindkettőnek van/nincs, mindegy)
        else:
            # Új elem beszúrása
            buckets[bucket_index][clean_key] = item_data
            if has_hu:
                hu_stats["found"] += 1
            else:
                hu_stats["missing"] += 1

    # Statisztika kiírása
    print(f"\n--- STATISZTIKA ---")
    print(f"Magyar definícióval rendelkezik: {hu_stats['found']} db")
    print(f"Magyar definíció hiányzik/üres:  {hu_stats['missing']} db")

    # 4. Mentés fájlokba
    print("\nMentés folyamatban...")
    for index, content in buckets.items():
        start_num = (index * CHUNK_SIZE) + 1
        filename = f"strongs_h{start_num}.json"
        filepath = os.path.join(OUTPUT_DIR, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            # ensure_ascii=False FONTOS a magyar ékezetekhez (á, é, ű...)
            json.dump(content, f, ensure_ascii=False, indent=2)

    print(f"KÉSZ! {len(buckets)} db fájl létrehozva.")
    print("Az ID-k tiszták, a magyar fordítások (ahol elérhetőek) megőrizve.")

if __name__ == "__main__":
    main()