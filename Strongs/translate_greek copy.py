import pandas as pd
import requests
import time
import sys

MODEL = "gemma3:27b"

# --- CONFIGURATION ---
INPUT_FILE = 'strongs_greek_master_hungarian_context.csv' 
OUTPUT_FILE = 'strongs_greek_master_hungarian_context_improved.csv'

SYSTEM_INSTRUCTION = """
You are a Biblical greek scholar and translator.
Task: Translate the English definition into Hungarian.
There is a translated text of strongs's definitions I will give you.
I need you to check the hungarian grammar and nuances, if the translation is nonsensical, or innatural.


Rules:
1. Output ONLY the improved Hungarian definition. No notes, no "translation:".
2. Use Theological Hungarian terminology.
3. If the definition is a list, keep it a list.
4. Always translate the brackets as well.

Input to translate:
"""

def translate_row(english_def, greek_word, strong_id):
    if pd.isna(english_def) or str(english_def).strip() == "":
        return ""
    
    url = "http://localhost:11434/api/chat"
    
    # We construct a prompt that gives the AI the Full Context
    user_message = f"greek Word: {greek_word} ({strong_id}) | English Definition: {english_def}, | Hungarian definition? {hun_def}"

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user", 
                "content": f"{SYSTEM_INSTRUCTION}\n\nTask: {user_message}"
            }
        ],
        "stream": False,
        "options": {
            "temperature": 0.01,
            "num_ctx": 2048
        }
    }
    
    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            return response.json()['message']['content'].strip()
        else:
            return english_def
    except Exception as e:
        print(f"Error: {e}")
        return english_def

def main():
    print(f"Loading {INPUT_FILE}...")
    try:
        # The Master file uses semi-colons ';' as separators
        df = pd.read_csv(INPUT_FILE, sep=';')
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    print(f"Translating {len(df)} words using {MODEL} with greek CONTEXT...")
    
    if 'HungarianDefinition' not in df.columns:
        df['HungarianDefinition'] = ""

    total = len(df)
    start_time = time.time()

    try:
        for i, row in df.iterrows():
            if str(row['HungarianDefinition']).strip() != "" and str(row['HungarianDefinition']) != "nan":
                continue

            english = row['EnglishDefinition']
            greek = row['OriginalWord']
            sid = row['StrongID']

            # Clean up quotes
            if isinstance(english, str):
                english = english.strip().replace('"', '')

            # Translate with Context
            hungarian = translate_row(english, greek, sid)
            
            df.at[i, 'HungarianDefinition'] = hungarian

            # Progress Bar
            if i % 5 == 0:
                elapsed = time.time() - start_time
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                print(f"[{i}/{total}] {rate:.1f} w/s | {greek}: {hungarian[:30]}...")
            
            if i % 20 == 0:
                df.to_csv(OUTPUT_FILE, sep=';', index=False)
                
    except KeyboardInterrupt:
        print("\nStopping & Saving...")
        df.to_csv(OUTPUT_FILE, sep=';', index=False)
        sys.exit()

    df.to_csv(OUTPUT_FILE, sep=';', index=False)
    print("Done.")

if __name__ == "__main__":
    main()
    main()