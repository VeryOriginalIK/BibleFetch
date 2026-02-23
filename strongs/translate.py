import json
import os
import ollama
from tqdm import tqdm

# --- KONFIGURÁCIÓ ---
MODEL_NAME = "gemma3:27b" 
INPUT_FILE = "stepbible-tbesg.json"
OUTPUT_FILE = "stepbible_hu_formatted_greek.json" # A kimeneti fájl neve
BATCH_SIZE = 5  # Kisebb batch méret a pontosabb generálásért

def translate_batch(batch_data): # type: ignore
    """
    Kéri a lokális Ollama modelltől a magyarítást.
    Csak a tartalomra fókuszálunk, a JSON szerkezetet a Python építi fel.
    """
    
    prompt = f"""
    You are a Biblical Greek translator. 
    I will provide Greek dictionary entries.
    
    TASK:
    1. Create a Hungarian phonetic transcription for the 'transliteration'.
       - Rules: 'sh'->'s', 'ch'->'h', 'ts'->'c', 'y'->'j', 'w'->'v'. 
       - Example: "sha.lom" -> "sálóm".
    2. Translate the 'definition' to Hungarian.
       - Use the 'gloss' (short meaning) to understand the context.
       - Keep HTML tags (<br>) intact.

    INPUT DATA:
    {json.dumps(batch_data, ensure_ascii=False)}

    OUTPUT FORMAT (JSON only):
    Return a JSON object where keys are the original IDs and values contain:
    - "translit_hu": The Hungarian phonetic string.
    - "def_hu": The Hungarian translation of the definition.
    """

    try:
        response = ollama.chat(
            model=MODEL_NAME,
            messages=[{'role': 'user', 'content': prompt}],
            format='json',
            options={'temperature': 0.1, 'num_ctx': 4096}
        )
        return json.loads(response['message']['content'])
    except Exception as e:
        print(f"\n[HIBA] Batch feldolgozási hiba: {e}")
        return {}

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Hiba: Nem található a bemeneti fájl ({INPUT_FILE})")
        return

    print(f"Betöltés: {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        source_data = json.load(f)

    keys = list(source_data.keys())
    total_items = len(keys)
    
    # Memóriában tárolt eredmények
    formatted_output = {}
    if os.path.exists(OUTPUT_FILE):
        print(f"Korábbi eredmények betöltése: {OUTPUT_FILE}...")
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            formatted_output = json.load(f)

    print(f"Feldolgozás indul {total_items} elemen (Modell: {MODEL_NAME})...")

    for i in tqdm(range(0, total_items, BATCH_SIZE), desc="Generálás"):
        batch_keys = keys[i : i + BATCH_SIZE]
        
        # 1. Bemenet összeállítása az LLM-nek
        batch_input = {}
        for k in batch_keys:
            item = source_data[k]
            batch_input[k] = {
                "transliteration": item.get("transliteration", ""),
                "gloss": item.get("gloss", ""),
                "definition": item.get("definition", "")
            }

        # 2. LLM hívás
        translations = translate_batch(batch_input)
        
        # 3. Adatok átalakítása és hozzáadása a memóriához
        for k in batch_keys:
            original_item = source_data[k]
            
            translit_hu = translations.get(k, {}).get("translit_hu", original_item.get("transliteration", ""))
            def_hu = translations.get(k, {}).get("def_hu", "")
            
            if not def_hu: 
                def_hu = original_item.get("definition", "")

            new_entry = {
                "id": k,
                "lemma": original_item.get("lemma", ""),
                "translit": translit_hu,
                "pronounce": "",
                "defs": {
                    "hu": def_hu,
                    "en": original_item.get("gloss", "")
                }
            }
            formatted_output[k] = new_entry

        # 4. Fájl újraírása a memóriában lévő teljes tartalommal
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(formatted_output, f, ensure_ascii=False, indent=2)
    
    print(f"\nKész! A(z) {OUTPUT_FILE} fájl frissítve.")

if __name__ == "__main__":
    main()