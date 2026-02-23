import json
import re

def transform_id(original_id):
    # Reguláris kifejezés: keresünk egy betűt az elején, 
    # majd tetszőleges számú nullát, amit a maradék szám követ.
    # A ^([A-Z])0+(\d+)$ minta jelentése:
    # ^([A-Z]) -> Kezdődjön egy betűvel (pl. H vagy G), ezt elmentjük az 1. csoportba
    # 0+       -> Kövessen legalább egy vagy több nulla
    # (\d+)    -> Majd jöjjön a maradék számsor, ezt elmentjük a 2. csoportba
    
    match = re.match(r"^([A-Z])0+(\d+)$", original_id)
    if match:
        prefix = match.group(1)
        number_part = match.group(2)
        return f"{prefix}{number_part}"
    return original_id

def process_bible_json(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    new_data = {}

    for old_key, value in data.items():
        # Új ID generálása a kulcs alapján (pl. H0001 -> H1)
        new_key = transform_id(old_key)
        
        # Az objektumon belüli "id" mező frissítése is szükséges
        if 'id' in value:
            value['id'] = new_key
            
        new_data[new_key] = value

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)

    print(f"Kész! Az új fájl elmentve: {output_file}")

# Futtatás
process_bible_json('stepbible_hu_formatted.json', 'stepbible_hu_cleaned.json')