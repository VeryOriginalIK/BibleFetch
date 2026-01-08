import os
import json
import requests
import re
import pandas as pd
import time
from typing import List, Dict, Any

# ==========================================
# CONFIGURATION
# ==========================================

CONFIG = {
    "LLM_MODEL": "gemma2:9b-instruct",
    "LLM_API_URL": "http://localhost:11434/api/generate",
    "BATCH_SIZE": 5,           
    "CHUNK_SIZE": 300,         
    "OUTPUT_DIR": "dist/bibles/hu_tagged",
    
    # EXACT FILES
    "INPUT_CSV": "BHS-with-Strong-no-extended.csv", 
    "INPUT_JSON_HU": "1chron_1.json",
    
    # Your dictionary path (optional, uses internal fallback if missing)
    "STRONGS_DIR": "src/assets/strongs/hebrew"
}

# Standard Book Numbering (BHS/KJV Common Intersection)
BOOK_MAP = {
    1: "gen", 2: "exod", 3: "lev", 4: "num", 5: "deut",
    6: "josh", 7: "judg", 8: "ruth", 9: "1sam", 10: "2sam",
    11: "1kings", 12: "2kings", 13: "1chron", 14: "2chron",
    15: "ezra", 16: "neh", 17: "est", 18: "job", 19: "ps",
    20: "prov", 21: "eccl", 22: "song", 23: "isa", 24: "jer",
    25: "lam", 26: "ezek", 27: "dan", 28: "hos", 29: "joel",
    30: "amos", 31: "obad", 32: "jonah", 33: "mic", 34: "nah",
    35: "hab", 36: "zeph", 37: "hag", 38: "zech", 39: "mal"
}

os.makedirs(CONFIG["OUTPUT_DIR"], exist_ok=True)

# ==========================================
# 1. DICTIONARY SERVICE
# ==========================================

class DictionaryService:
    def __init__(self):
        self.definitions = {}
        # Try loading real files
        if os.path.exists(CONFIG["STRONGS_DIR"]):
            try:
                files = [f for f in os.listdir(CONFIG["STRONGS_DIR"]) if f.endswith(".json")]
                print(f"[Dict] Loading {len(files)} Strong's files...")
                for file in files:
                    with open(os.path.join(CONFIG["STRONGS_DIR"], file), 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        for k, v in data.items():
                            self.definitions[k] = v.get("defs", {})
            except Exception as e:
                print(f"[Dict] Warning: {e}")

        # Fallback for 1 Chronicles 1 (Names & Genealogy)
        self.fallback = {
            "H120": "Adam (man)", "H8352": "Seth", "H583": "Enosh",
            "H7014": "Cainan", "H4111": "Mahalaleel", "H3382": "Jared",
            "H2585": "Enoch", "H4968": "Methuselah", "H3929": "Lamech",
            "H5146": "Noah", "H8035": "Shem", "H2526": "Ham", "H3315": "Japheth",
            "H1121": "son (fiai)", "H3205": "begot (nemzé)", "H4428": "king (király)"
        }

    def get_keywords(self, strong_id: str) -> str:
        # 1. Try loaded DB
        if strong_id in self.definitions:
            defs = self.definitions[strong_id]
            hu = ", ".join(defs.get('hu', [])[:2])
            en = ", ".join(defs.get('en', [])[:2])
            return f"{hu} ({en})"
        
        # 2. Try Fallback
        return self.fallback.get(strong_id, "concept")

dict_service = DictionaryService()

# ==========================================
# 2. DATA LOADERS
# ==========================================

def clean_hebrew(text: str) -> str:
    if not isinstance(text, str): return ""
    # Remove XML tags <H>...</H>
    clean = re.sub(r'<[^>]+>', '', text).strip()
    return clean

def load_hebrew_csv(path: str) -> Dict[str, List[Dict]]:
    print(f"[Loader] Reading CSV: {path}...")
    try:
        df = pd.read_csv(path, sep='\t')
    except Exception as e:
        print(f"[Error] CSV Load Failed: {e}")
        return {}

    # Define Column Names
    COL_ID = '〔KJVverseID｜book｜chapter｜verse〕'
    COL_WORD = 'BHSA'
    COL_STRONG = 'extendedStrongNumber'

    grouped = {}

    for raw_id, group in df.groupby(COL_ID, sort=False):
        try:
            # Parse ID: 〔1｜1｜1｜1〕 -> Book 1, Chap 1, Verse 1
            clean_id = raw_id.replace('〔', '').replace('〕', '')
            parts = clean_id.split('｜') # Note: Check if your separator is pipe '|' or unicode '｜'
            
            # Verify split worked
            if len(parts) < 4: continue 
            
            book_num = int(parts[1])
            chapter = parts[2]
            verse = parts[3]

            # Map to "1chron"
            book_name = BOOK_MAP.get(book_num)
            if not book_name: continue

            vid = f"{book_name}-{chapter}-{verse}"
            
            tokens = []
            for _, row in group.iterrows():
                lemma = clean_hebrew(row[COL_WORD])
                sid = str(row[COL_STRONG]).strip()
                
                if lemma and sid and sid != "nan":
                    tokens.append({
                        "id": sid,
                        "lemma": lemma,
                        "def": dict_service.get_keywords(sid)
                    })
            
            if tokens:
                grouped[vid] = tokens
                
        except Exception:
            continue

    print(f"[Loader] Parsed {len(grouped)} Hebrew verses.")
    # Debug: Print first key to verify format
    if grouped:
        print(f"[Debug] Sample Hebrew Key: {list(grouped.keys())[0]}")
    return grouped

def load_hungarian_json(path: str) -> Dict[str, str]:
    print(f"[Loader] Reading JSON: {path}...")
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        verses = data.get("verses", {}) if "verses" in data else data
        print(f"[Loader] Found {len(verses)} Hungarian verses.")
        
        # Debug: Print first key
        if verses:
            print(f"[Debug] Sample Hungarian Key: {list(verses.keys())[0]}")
            
        return verses
    except Exception as e:
        print(f"[Error] JSON Load Failed: {e}")
        return {}

# ==========================================
# 3. LLM CLIENT (Robust)
# ==========================================

class LLMClient:
    def __init__(self):
        self.url = CONFIG["LLM_API_URL"]
        self.model = CONFIG["LLM_MODEL"]

    def process_items(self, items: List[Dict]) -> List[Dict]:
        """
        Processes a list of items. 
        Note: We pass the whole object but prompt only with necessary fields.
        """
        prompt_data = []
        for item in items:
            # Construct the vocabulary map
            vocab = " | ".join([f"'{t['def']}'-><{t['id']}>" for t in item['tokens']])
            prompt_data.append({
                "id": item['verse_id'],
                "text": item['hu_text'],
                "vocab": vocab
            })

        system_prompt = (
            "You are a precise linguistic alignment engine.\n"
            "TASK: Insert Strong's Tags (e.g. <H1234>) into the 'text' based on 'vocab'.\n"
            "RULES:\n"
            "1. Insert tags immediately after the matching Hungarian word (no space).\n"
            "2. Do NOT translate or summarize. Keep text exact.\n"
            "3. Output JSON list: [{\"id\": \"...\", \"tagged_text\": \"...\"}]"
        )

        payload = {
            "model": self.model,
            "prompt": f"{system_prompt}\n\nDATA:\n{json.dumps(prompt_data, ensure_ascii=False)}",
            "format": "json",
            "stream": False,
            "temperature": 0.0
        }

        try:
            res = requests.post(self.url, json=payload).json()
            response_json = json.loads(res['response'])
            
            # Handle variable response structures
            results = []
            if isinstance(response_json, dict):
                if "verses" in response_json: results = response_json["verses"]
                elif "result" in response_json: results = response_json["result"]
                else: results = [response_json] # Single object
            elif isinstance(response_json, list):
                results = response_json
            
            # CRITICAL FIX: Re-map IDs if LLM messed them up
            # If we sent 1 item and got 1 item, force the ID to match
            if len(items) == 1 and len(results) == 1:
                results[0]['id'] = items[0]['verse_id']

            return results
            
        except Exception as e:
            print(f"  [LLM Fail] {e}")
            return [] # Return empty to trigger fallback

# ==========================================
# 4. PIPELINE ORCHESTRATOR
# ==========================================

def main():
    # 1. Load
    hebrew_db = load_hebrew_csv(CONFIG["INPUT_CSV"])
    hungarian_db = load_hungarian_json(CONFIG["INPUT_JSON_HU"])

    # 2. Match
    queue = []
    for vid, text in hungarian_db.items():
        if vid in hebrew_db:
            queue.append({
                "verse_id": vid,
                "hu_text": text,
                "tokens": hebrew_db[vid]
            })
    
    if not queue:
        print("\n[CRITICAL] No IDs matched! Check the [Debug] keys printed above.")
        print("Expected match format: '1chron-1-1'")
        return

    print(f"\n[Pipeline] Starting processing for {len(queue)} verses...")

    # 3. Execute
    llm = LLMClient()
    buffer = []
    chunk_idx = 0

    # Iterate
    i = 0
    while i < len(queue):
        # Determine current batch
        batch = queue[i : i + CONFIG["BATCH_SIZE"]]
        
        # Try processing batch
        results = llm.process_items(batch)
        
        # Validation
        valid_batch_results = []
        
        # Map inputs by ID for quick verification
        batch_map = {item['verse_id']: item for item in batch}
        
        for res in results:
            rid = res.get('id')
            rtxt = res.get('tagged_text')
            
            # If ID is valid and exists in our batch
            if rid and rid != "null" and rid in batch_map and rtxt:
                valid_batch_results.append(res)
        
        # Success check
        if len(valid_batch_results) == len(batch):
            buffer.extend(valid_batch_results)
            i += len(batch)
            print(f"Processed {i}/{len(queue)} verses...", end='\r')
        else:
            # Fallback: Process 1-by-1 if batch failed or had mismatches
            print(f"\n[Fallback] Batch failed at index {i}. Switching to single mode...")
            for item in batch:
                single_res = llm.process_items([item])
                if single_res and single_res[0].get('tagged_text'):
                    # Force ID correctness in single mode
                    single_res[0]['id'] = item['verse_id']
                    buffer.extend(single_res)
                    print(f"  -> Recovered {item['verse_id']}")
                else:
                    # Final fail: Save original text un-tagged
                    print(f"  -> Failed {item['verse_id']}")
                    buffer.append({"id": item['verse_id'], "tagged_text": item['hu_text']})
            i += len(batch)

        # Save Chunk
        if len(buffer) >= CONFIG["CHUNK_SIZE"]:
            save_buffer(buffer, chunk_idx)
            buffer = []
            chunk_idx += 1

    # Final save
    if buffer:
        save_buffer(buffer, chunk_idx)

    print("\n[Pipeline] Job Complete.")

def save_buffer(data, idx):
    path = os.path.join(CONFIG["OUTPUT_DIR"], f"chunk_{idx}.json")
    
    # Transform to Key-Value pair
    output = {}
    for item in data:
        if item.get('id') and item.get('id') != "null":
            output[item['id']] = {"t": item['tagged_text']}
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"  -> Saved {path}")

if __name__ == "__main__":
    main()