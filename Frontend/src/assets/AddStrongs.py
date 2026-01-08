import os
import json
import re
import requests
import gc
import sys
import unicodedata
from collections import deque
from typing import Tuple, Optional, List, Dict

# --- KONFIGURÁCIÓ ---

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_BIBLES_DIR = os.path.join(SCRIPT_DIR, "bibles")
KJV_ROOT = os.path.join(BASE_BIBLES_DIR, "kjv_strongs")
KAROLI_ROOT = os.path.join(BASE_BIBLES_DIR, "karoli")
STRONGS_DIR = os.path.join(SCRIPT_DIR, "strongs")

# Kimeneti fájlok
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "hu_karoli_strongs.json")
FAILED_FILE = os.path.join(SCRIPT_DIR, "failed_verses.json")

# Modell - Qwen 2.5 7B Instruct (GTX 1080 Ti-re optimalizálva)
OLLAMA_MODEL = "qwen2.5:7b-instruct" 
OLLAMA_URL = "http://localhost:11434/api/generate"

# Hányszor próbálja újra, ha elrontja a szöveget?
MAX_RETRIES = 5

# Request timeout (másodpercben)
REQUEST_TIMEOUT = 180

class BibleTagger:
    def __init__(self):
        self.hebrew_defs = {}
        self.greek_defs = {}
        self.load_dictionaries()
        self.memory = deque(maxlen=3)
        
        self.first_failure = True
        # Ha a fájl nem létezik vagy üres, kezdjük tömbbel, egyébként feltételezzük a folytatást (most resetelünk)
        with open(FAILED_FILE, 'w', encoding='utf-8') as f:
            f.write('[\n')

    def load_dictionaries(self):
        """Szótárak betöltése a Strong számokhoz."""
        print("Szótárak betöltése...")
        try:
            hebrew_path = os.path.join(STRONGS_DIR, "hebrew.json")
            greek_path = os.path.join(STRONGS_DIR, "greek.json")
            
            if not os.path.exists(hebrew_path):
                raise FileNotFoundError(f"Hiányzó fájl: {hebrew_path}")
            if not os.path.exists(greek_path):
                raise FileNotFoundError(f"Hiányzó fájl: {greek_path}")
            
            with open(hebrew_path, 'r', encoding='utf-8') as f:
                self.hebrew_defs = json.load(f)
            with open(greek_path, 'r', encoding='utf-8') as f:
                self.greek_defs = json.load(f)
            
            print(f"  ✓ {len(self.hebrew_defs)} héber és {len(self.greek_defs)} görög definíció betöltve")
        except Exception as e:
            print(f"HIBA a szótárak betöltése során: {e}")
            sys.exit(1)

    def get_def_compact(self, strong_id: str) -> str:
        """ULTRA-KOMPAKT definíció."""
        entry = None
        if strong_id.startswith('H'):
            entry = self.hebrew_defs.get(strong_id)
        elif strong_id.startswith('G'):
            entry = self.greek_defs.get(strong_id)
        
        if entry and 'defs' in entry:
            # Magyar
            hu_def = entry['defs'].get('hu', '').replace('\n', ' ').strip()
            hu_def = re.sub(r'[;,].*', '', hu_def) # Első elválasztóig
            
            if hu_def:
                words = hu_def.split()
                return " ".join(words[:4]) 
            
            # Angol fallback
            en_def = entry['defs'].get('en', '').replace('\n', ' ').strip()
            if en_def:
                words = en_def.split()
                return " ".join(words[:3])
        
        return "szó"

    def extract_strongs_data(self, text: str) -> List[Tuple[str, str, str]]:
        """Strong számok kinyerése."""
        matches = re.findall(r"([A-Za-z\'-]+)\{(H\d+|G\d+)\}", text)
        result = []
        for word, sid in matches:
            word = word.strip()
            compact_def = self.get_def_compact(sid)
            result.append((word, sid, compact_def))
        return result

    def generate_base_prompt(self, kjv_text: str, karoli_text: str) -> str:
        """Prompt generálása Qwen 2.5 stílusban."""
        strong_data = self.extract_strongs_data(kjv_text)
        
        mapping_parts = []
        for word, sid, compact_def in strong_data:
            mapping_parts.append(f"{word} -> {sid} ({compact_def})")
        
        mapping_text = "\n".join(mapping_parts) if mapping_parts else "Nincs Strong hivatkozás."

        examples_text = ""
        if len(self.memory) > 0:
            examples_text = "\n### PÉLDÁK (Így csináld):\n"
            for m_eng, m_hun in list(self.memory)[-3:]:
                examples_text += f"BEMENET (Angol): {m_eng}\nKIMENET (Magyar): {m_hun}\n---\n"

        # Qwen szereti a '###' szeparátorokat és a világos utasításokat
        prompt = f"""### UTASÍTÁS
A feladatod Strong-számok (pl. {{H1234}}) beillesztése egy meglévő magyar bibliai versbe, az angol eredeti alapján.

### SZABÁLYOK
1. A magyar szöveg minden szavát, írásjelét és sorrendjét TARTSD MEG pontosan úgy, ahogy van. Szigorúan TILOS átírni vagy fordítani!
2. A Strong kódokat közvetlenül a vonatkozó magyar szó után illeszd be kapcsos zárójelben. Pl: Az Úr{{H3068}}
3. Használd a lenti szótárat a párosításhoz. Nem minden szóhoz tartozik kód.

### SZÓTÁR (Angol szó -> Kód (Jelentés))
{mapping_text}
{examples_text}
### FELADAT
Angol forrás: {kjv_text}
Magyar szöveg: {karoli_text}

### VÁLASZ (A teljes magyar vers Strong kódokkal):"""
        
        return prompt

    def call_ollama(self, prompt: str) -> Optional[str]:
        """Ollama API hívás (GTX 1080 Ti optimalizált)."""
        try:
            payload = {
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    # HARDVER OPTIMALIZÁLÁS
                    "num_gpu_layers": -1,  # Mindent a VRAM-ba (kritikus!)
                    "num_thread": 4,       # i5-7600k 4 magját használja a prompt feldolgozáshoz
                    "num_ctx": 4096,       # Elég a versekhez, marad hely a VRAM-ban
                    
                    # GENERÁLÁSI PARAMÉTEREK
                    "num_predict": 1024,
                    "temperature": 0.1,    # Alacsony hőmérséklet a pontosságért
                    "top_p": 0.9,
                    "repeat_penalty": 1.1,
                    "stop": ["\n\n", "###", "Angol forrás:", "Magyar szöveg:"]
                }
            }
            
            resp = requests.post(
                OLLAMA_URL, 
                json=payload, 
                timeout=REQUEST_TIMEOUT
            )
            
            if resp.status_code == 200:
                response_text = resp.json().get('response', '').strip()
                # Qwen néha "Here is the text:" bevezetővel kezd, ezt vágjuk le
                response_text = re.sub(r'^(Itt van.*?|Válasz:|Kimenet:)\s*', '', response_text, flags=re.IGNORECASE)
                return response_text.strip() if response_text else None
            else:
                print(f"\n  ⚠ HTTP hiba: {resp.status_code}")
                return None
                
        except Exception as e:
            print(f"\n  ⚠ Hiba az API híváskor: {e}")
            return None

    def check_integrity(self, original_text: str, tagged_text: str) -> Tuple[bool, str]:
        """Szigorú integritás ellenőrzés."""
        if not tagged_text:
            return False, "Üres válasz."

        # Eltávolítjuk a Strong tageket a válaszból (rugalmasan kezelve a szóközöket a {} körül)
        clean_tagged = re.sub(r'\s*\{\s*([HG]\d+)\s*\}\s*', '', tagged_text)
        # Dupla szóközök normalizálása
        clean_tagged = re.sub(r'\s+', ' ', clean_tagged).strip()
        
        def normalize(s: str) -> str:
            s = unicodedata.normalize('NFKC', s)
            s = re.sub(r'\s+', ' ', s)
            # Kisbetűsítés és írásjelek egyszerűsítése az összehasonlításhoz
            return s.strip().lower()

        norm_original = normalize(original_text)
        norm_tagged = normalize(clean_tagged)

        if norm_original == norm_tagged:
            return True, ""
        
        # Ha a normalizált nem egyezik, nézzük meg, csak írásjel hiba-e (opcionális finomítás)
        # De most maradjunk szigorúak.
        
        return False, (
            f"SZÖVEG ELTÉRÉS!\n"
            f"Eredeti: {norm_original[:50]}...\n"
            f"Kaptam:  {norm_tagged[:50]}...\n"
            f"A szöveg nem egyezik az eredetivel a tagek nélkül."
        )

    def log_failure(self, book: str, chapter: str, verse: int, original: str, generated: str, error_msg: str):
        """Hiba logolása."""
        entry = {
            "location": f"{book} {chapter}:{verse}",
            "original_karoli": original,
            "generated_attempt": generated,
            "error": error_msg
        }
        
        try:
            with open(FAILED_FILE, 'a', encoding='utf-8') as f:
                if not self.first_failure:
                    f.write(',\n')
                else:
                    self.first_failure = False
                json.dump(entry, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"\n[LOGGER HIBA] {e}")

    def process_verse_with_retry(self, kjv_text: str, karoli_text: str, verse_id: str) -> str:
        base_prompt = self.generate_base_prompt(kjv_text, karoli_text)
        current_prompt = base_prompt
        last_output = None
        
        for attempt in range(1, MAX_RETRIES + 1):
            raw_output = self.call_ollama(current_prompt)
            
            if raw_output is None:
                print(f" [API_ERROR {attempt}]", end=""); sys.stdout.flush()
                continue
            
            last_output = raw_output
            is_valid, error_msg = self.check_integrity(karoli_text, raw_output)
            
            if is_valid:
                print(" ✓", end="")
                return raw_output
            else:
                print(f" ✗{attempt}", end="")
                sys.stdout.flush()
                # Qwen-nek udvariasan de határozottan szólunk
                current_prompt = base_prompt + f"\n\n### HIBA JELENTÉS\nAz előző válaszodban megváltoztattad az eredeti magyar szöveget: {error_msg}\n\n### ÚJ PRÓBÁLKOZÁS\nKérlek, add vissza a magyar szöveget SZÓ SZERINT, csak a {{Strong}} kódokat illeszd be!"
        
        print(" [MANUAL]", end="")
        if last_output: return f"!!!MANUAL_CHECK!!! {last_output}"
        else: return f"!!!MANUAL_CHECK!!! {karoli_text}"

    def process_chapter(self, kjv_path: str, karoli_path: str, book_name: str, chapter_name: str) -> List[Dict]:
        """Fejezet feldolgozása."""
        try:
            with open(kjv_path, 'r', encoding='utf-8') as f: kjv_data = json.load(f)
            with open(karoli_path, 'r', encoding='utf-8') as f: karoli_data = json.load(f)
        except Exception as e:
            print(f"\n  ⚠ Fájl hiba: {e}")
            return []

        kjv_map = {str(item['v']): item['text'] for item in kjv_data if 'v' in item and 'text' in item}
        karoli_map = {str(item['v']): item['text'] for item in karoli_data if 'v' in item and 'text' in item}

        chapter_results = []
        sorted_verses = sorted(kjv_map.keys(), key=lambda x: int(x))

        for v_num in sorted_verses:
            kjv_text = kjv_map.get(v_num)
            karoli_text = karoli_map.get(v_num)

            if not kjv_text or not karoli_text: continue
            
            final_text = karoli_text

            if "{" in kjv_text and "}" in kjv_text:
                print(f"\r  {book_name}/{chapter_name}:{v_num}", end="")
                sys.stdout.flush()
                
                final_text = self.process_verse_with_retry(kjv_text, karoli_text, f"{book_name}:{v_num}")
                
                if "!!!MANUAL_CHECK!!!" not in final_text:
                    self.memory.append((kjv_text, final_text))
                else:
                    failed_content = final_text.replace("!!!MANUAL_CHECK!!! ", "")
                    self.log_failure(
                        book=book_name, 
                        chapter=chapter_name, 
                        verse=int(v_num),
                        original=karoli_text, 
                        generated=failed_content,
                        error_msg="Integritási hiba (Max retry elérve)"
                    )
                    self.memory.clear() # Töröljük a memóriát hiba után, ne zavarja a következőt
            
            entry = {
                "book": book_name,
                "chapter": chapter_name,
                "verse": int(v_num),
                "text": final_text,
                "version": "Karoli Strongs"
            }
            chapter_results.append(entry)
        
        return chapter_results

    def process_bible(self):
        """Fő folyamat."""
        print(f"\nBiblia feldolgozása indul...")
        print(f"  Modell: {OLLAMA_MODEL} (Qwen 2.5 7B)")
        print(f"  Kimenet: {OUTPUT_FILE}")
        
        if not os.path.exists(KJV_ROOT) or not os.path.exists(KAROLI_ROOT):
            print("HIBA: Hiányzó input mappák (bibles/kjv_strongs vagy bibles/karoli).")
            return

        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            f.write('[\n')

        is_first_entry = True
        book_dirs = sorted(os.listdir(KJV_ROOT))
        
        # Mappák ellenőrzése
        valid_books = [d for d in book_dirs if os.path.isdir(os.path.join(KJV_ROOT, d))]
        total_books = len(valid_books)
        processed_books = 0
        
        for book_dir in valid_books:
            kjv_book_path = os.path.join(KJV_ROOT, book_dir)
            karoli_book_path = os.path.join(KAROLI_ROOT, book_dir)

            if not os.path.exists(karoli_book_path): continue

            processed_books += 1
            print(f"\n[{processed_books}/{total_books}] 📖 {book_dir}")
            self.memory.clear()

            chapter_files = sorted(
                [f for f in os.listdir(kjv_book_path) if f.endswith('.json')],
                key=lambda x: int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 0
            )

            for chapter_file in chapter_files:
                chapter_results = self.process_chapter(
                    os.path.join(kjv_book_path, chapter_file),
                    os.path.join(karoli_book_path, chapter_file),
                    book_dir,
                    chapter_file.replace('.json', '')
                )

                if chapter_results:
                    with open(OUTPUT_FILE, 'a', encoding='utf-8') as f:
                        for item in chapter_results:
                            if not is_first_entry: f.write(',\n')
                            else: is_first_entry = False
                            json.dump(item, f, ensure_ascii=False, indent=2)
                
                # Memória tisztítás fejezetenként
                del chapter_results
                gc.collect()
            
            print()

        with open(OUTPUT_FILE, 'a', encoding='utf-8') as f:
            f.write('\n]')
            
        with open(FAILED_FILE, 'a', encoding='utf-8') as f:
            f.write('\n]')
        
        print(f"\n✅ Kész! Kimenet: {OUTPUT_FILE}")

if __name__ == "__main__":
    try:
        tagger = BibleTagger()
        tagger.process_bible()
    except KeyboardInterrupt:
        print("\n\n⚠ Megszakítva.")
        try:
            with open(OUTPUT_FILE, 'a') as f: f.write('\n]')
            with open(FAILED_FILE, 'a') as f: f.write('\n]')
        except: pass
        sys.exit(0)
    except Exception as e:
        print(f"\n\n❌ Kritikus hiba: {e}")
        sys.exit(1)