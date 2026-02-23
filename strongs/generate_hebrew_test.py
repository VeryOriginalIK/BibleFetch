"""
Unified Strong's Dictionary Generator
Features:
- Deep XML parsing (senses, foreign words, glosses, morphology)
- LLM-based adaptive consensus mapping for Hungarian verses
- emmorphpy strict dictionary root lemmatization
- JSON-forced structured translation for dictionary senses
- Atomic checkpointing and robust resumability
"""

import argparse
import json
import os
import re
from collections import defaultdict, Counter
from typing import Dict, Any, List, Optional, Tuple
from lxml import etree
from ollama import Client
from emmorphpy import EmMorphPy

print("Initializing emMorph dictionary...")
emmorph_analyzer = EmMorphPy()

# ---------------------------------------------------------
DEFAULT_MODEL = "qwen2.5:32b-instruct-q4_K_M"  # Or your preferred model
DEFAULT_OLLAMA_URL = "http://localhost:11434"

CONFIDENCE_THRESHOLD = 0.95
INITIAL_SAMPLE = 3
MAX_VERSES = 30
CHECKPOINT_EVERY = 50 
# ---------------------------------------------------------

# =========================================================
# Argument Parsing
# =========================================================
def parse_arguments():
    parser = argparse.ArgumentParser(description="Generate deep Hebrew-Hungarian Strong's mapping.")
    parser.add_argument('--xml', required=True, help="StrongHebrewG.xml")
    parser.add_argument('--kjv', required=True, help="kjv_strongs.json")
    parser.add_argument('--hun', required=True, help="HungarianBible.xml")
    parser.add_argument('--out', default='hebrew_test.json')
    parser.add_argument('--map', default='hungarian_strongs_mapping.json')
    parser.add_argument('--model', default=DEFAULT_MODEL)
    parser.add_argument('--limit', type=int, default=0, help="Process only this many entries (0 = all).")
    return parser.parse_args()


# =========================================================
# Utility & Lemmatization Functions
# =========================================================
def normalize_strongs_id(raw_id: str) -> str:
    """Standardizes IDs to an unpadded format (e.g., 'H0430' -> 'H430', '0001' -> 'H1')."""
    match = re.match(r'^([HG]?)0*(\d+)$', raw_id, flags=re.IGNORECASE)
    if match:
        prefix = match.group(1).upper() or 'H'
        return f"{prefix}{match.group(2)}"
    return raw_id

def normalise_lemma(raw: str) -> str:
    """Strips punctuation (preserving hyphens) and applies strict Unicode case-folding."""
    stripped = re.sub(r'[^\w\s\-]', '', raw, flags=re.UNICODE).strip()
    return stripped.casefold()

def emmorph_lemmatize(word: str) -> str:
    """Uses emmorphpy to get the strict dictionary root. Fallback to normalisation."""
    cleaned = normalise_lemma(word)
    if not cleaned: return ""
    
    lemmas = []
    for w in cleaned.split():
        stems = emmorph_analyzer.stem(w)
        if stems:
            lemmas.append(stems[0][0])  # Grab most likely stem
        else:
            lemmas.append(w)
    return " ".join(lemmas).casefold()

def extract_eng_target(kjv_text: str, formatted_id: str) -> str:
    """Robust bidirectional matching, handles hyphens and apostrophes."""
    escaped = re.escape(formatted_id)
    # Word before tag
    before = re.search(rf"([A-Za-z\-']+)[^A-Za-z\-'{{}}]{{0,5}}\{{{escaped}\}}", kjv_text)
    if before: return before.group(1)
    # Word after tag
    after = re.search(rf"\{{{escaped}\}}[^A-Za-z\-'{{}}]{{0,5}}([A-Za-z\-']+)", kjv_text)
    if after: return after.group(1)
    return "Unknown"


# =========================================================
# Safe Checkpointing
# =========================================================
def load_checkpoint(file_path: str) -> Dict[str, Any]:
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            print(f"Resuming from {file_path}: {len(data)} entries found.")
            return data
        except Exception as e:
            print(f"Warning: could not read '{file_path}': {e}")
    return {}

def save_checkpoint(data: Dict[str, Any], file_path: str) -> None:
    tmp_path = file_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, file_path)


# =========================================================
# Deep XML Parsing & Bible Loading
# =========================================================
def parse_strongs_xml(xml_path: str, limit: int = 0) -> Dict[str, Dict[str, Any]]:
    print("Parsing Strong's XML for deep dictionary details...")
    tree = etree.parse(xml_path)
    root = tree.getroot()
    entries = {}
    count = 0

    for div in root.xpath('//*[local-name()="div" and @type="entry"]'):
        if limit and count >= limit: break

        entry_n = div.get('n')
        word_elements = div.xpath('./*[local-name()="w"]')
        if not word_elements: continue
        word_elem = word_elements[0]

        raw_id = word_elem.get('ID', f"H{entry_n}") 
        std_id = normalize_strongs_id(raw_id)
        
        entry_data = {
            'id': std_id,
            'word': word_elem.text,
            'lemma': word_elem.get('lemma', ''),
            'xlit': word_elem.get('xlit', ''),
            'morph': word_elem.get('morph', ''),
            'pos': word_elem.get('POS', '')
        }
        
        if word_elem.get('gloss'): entry_data['gloss'] = word_elem.get('gloss')

        # Deep Senses parsing
        senses = []
        for item in div.xpath('./*[local-name()="list"]/*[local-name()="item"]'):
            text = "".join(item.itertext()).strip()
            if text: senses.append(text)
        if senses: entry_data['senses'] = senses

        # Base English Definition / Notes
        for note in div.xpath('./*[local-name()="note"]'):
            if note.get('type') == 'translation':
                entry_data['definition'] = "".join(note.itertext()).strip()
                break

        entries[std_id] = entry_data
        count += 1

    print(f"Parsed {len(entries)} deep Strong's entries.")
    return entries

def load_parallel_bibles(kjv_path: str, hun_path: str):
    print("Loading and indexing parallel Bibles...")
    aligned = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    strongs_index: Dict[str, List[Tuple[int, int, int]]] = defaultdict(list)
    strongs_pattern = re.compile(r'\{(H\d+|G\d+)\}')

    with open(kjv_path, 'r', encoding='utf-8') as f:
        kjv_data = json.load(f)

    for verse in kjv_data.get('verses', []):
        try:
            b, c, v = int(verse['book']), int(verse['chapter']), int(verse['verse'])
        except ValueError: continue
        
        text = verse['text']
        aligned[b][c][v]['kjv'] = text

        for match in strongs_pattern.findall(text):
            std_match = normalize_strongs_id(match)
            strongs_index[std_match].append((b, c, v))

    tree = etree.parse(hun_path)
    for book in tree.getroot().findall('.//book'):
        b_num = int(book.get('number', 0))
        for chapter in book.findall('.//chapter'):
            c_num = int(chapter.get('number', 0))
            for verse in chapter.findall('.//verse'):
                v_num = int(verse.get('number', 0))
                aligned[b_num][c_num][v_num]['hun'] = "".join(verse.itertext()).strip()

    return aligned, strongs_index


# =========================================================
# Adaptive Consensus Engine
# =========================================================
def generate_adaptive_consensus_mapping(entries, aligned, strongs_index, model_name, map_path):
    print("Starting ADAPTIVE CONSENSUS engine for Hungarian alignment...")
    client = Client(host=DEFAULT_OLLAMA_URL)
    mapping = load_checkpoint(map_path)
    entries_since_check = 0
    EXPAND_STEP = 2

    system_prompt = (
        "You are an expert computational linguist. "
        "Find the exact Hungarian translation for the English Target Word in the provided verse. "
        "Return ONLY the Hungarian dictionary root (lemma / nominative singular). "
        "If it is a compound concept, return both words (e.g., 'Szent Lélek'). "
        "No explanations, no punctuation."
    )

    for entry_id, data in entries.items():
        if entry_id in mapping: continue
        verse_refs = strongs_index.get(entry_id, [])
        if not verse_refs: continue

        candidate_pool, verse_pointer, fetch_size = [], 0, INITIAL_SAMPLE

        while verse_pointer < len(verse_refs) and len(candidate_pool) < MAX_VERSES:
            actual_fetch = min(fetch_size, len(verse_refs) - verse_pointer, MAX_VERSES - len(candidate_pool))
            batch = verse_refs[verse_pointer: verse_pointer + actual_fetch]
            verse_pointer += actual_fetch 

            for (b, c, v) in batch:
                verse_data = aligned[b][c][v]
                if not verse_data.get('hun', '').strip() or len(candidate_pool) >= MAX_VERSES:
                    continue

                eng_verse = verse_data.get('kjv', '')
                hun_verse = verse_data.get('hun', '')
                eng_target = extract_eng_target(eng_verse, entry_id)

                user_prompt = f'English Verse: "{eng_verse}"\nHungarian Verse: "{hun_verse}"\nEnglish Target Word: "{eng_target}"\n\nHungarian lemma:'
                try:
                    response = client.chat(
                        model=model_name,
                        messages=[{'role': 'system', 'content': system_prompt}, {'role': 'user', 'content': user_prompt}],
                        options={'temperature': 0.0, 'num_ctx': 2048}
                    )
                    raw_word = response['message']['content'].strip()
                    # Apply emmorphpy here
                    lemma = emmorph_lemmatize(raw_word) 
                    if lemma: candidate_pool.append(lemma)
                except Exception as e:
                    pass 

            if not candidate_pool:
                fetch_size = EXPAND_STEP
                continue

            counts = Counter(candidate_pool)
            top_lemma, top_freq = counts.most_common(1)[0]
            confidence = top_freq / len(candidate_pool)

            if confidence >= CONFIDENCE_THRESHOLD: break 
            fetch_size = EXPAND_STEP

        if candidate_pool:
            counts = Counter(candidate_pool)
            top_lemma, top_freq = counts.most_common(1)[0]
            confidence = top_freq / len(candidate_pool)

            mapping[entry_id] = {
                'hungarian_lemma': top_lemma,
                'confidence': round(confidence, 4),
                'evidence_count': len(candidate_pool)
            }
            print(f"{entry_id} → {top_lemma} (conf={confidence:.2f}, ev={len(candidate_pool)})")

            entries_since_check += 1
            if entries_since_check >= CHECKPOINT_EVERY:
                save_checkpoint(mapping, map_path)
                entries_since_check = 0

    save_checkpoint(mapping, map_path)
    return mapping


# =========================================================
# JSON-Forced Dictionary Translation
# =========================================================
def translate_dictionary_arrays(entries: Dict[str, Any], model_name: str, out_path: str):
    print("\nStarting JSON-forced translation for dictionary senses...")
    client = Client(host=DEFAULT_OLLAMA_URL)
    translated_count = 0

    for i, (entry_id, data) in enumerate(entries.items()):
        # Skip if no deep data, or if it's already been translated in a previous run
        if 'senses' not in data and 'definition' not in data: continue
        if 'hu_senses' in data or 'hu_definition' in data: continue

        payload = {}
        if 'definition' in data: payload['definition'] = data['definition']
        if 'senses' in data: payload['senses'] = data['senses']
        
        prompt = f"""Translate the following Bible dictionary entry strictly into Hungarian.
Return ONLY valid JSON. Keep the exact same JSON keys.
English Input:
{json.dumps(payload, ensure_ascii=False, indent=2)}
"""
        try:
            response = client.chat(
                model=model_name,
                messages=[{'role': 'user', 'content': prompt}],
                format='json',  # Force structural JSON output
                options={'temperature': 0.1}
            )
            translated_data = json.loads(response['message']['content'])
            
            if 'definition' in translated_data: entries[entry_id]['hu_definition'] = translated_data['definition']
            if 'senses' in translated_data: entries[entry_id]['hu_senses'] = translated_data['senses']
            translated_count += 1
            print(f"  Translated arrays for {entry_id}")

        except Exception as e:
            print(f"  [!] Translation error on {entry_id}: {e}")

        # Atomic checkpointing for the main output file
        if translated_count > 0 and translated_count % CHECKPOINT_EVERY == 0:
            save_checkpoint(entries, out_path)

    print(f"Finished dictionary array translations. Processed {translated_count} new entries.")


# =========================================================
# Main Execution
# =========================================================
def main():
    args = parse_arguments()

    # 1. Load Texts & XML
    aligned, strongs_index = load_parallel_bibles(args.kjv, args.hun)
    entries = parse_strongs_xml(args.xml, limit=args.limit)

    # 2. Resumability: Load existing output to prevent re-translating arrays
    existing_out = load_checkpoint(args.out)
    for entry_id, ext_data in existing_out.items():
        if entry_id in entries:
            # Merge translated keys back into memory
            if 'hu_senses' in ext_data: entries[entry_id]['hu_senses'] = ext_data['hu_senses']
            if 'hu_definition' in ext_data: entries[entry_id]['hu_definition'] = ext_data['hu_definition']
            if 'notes_hu' in ext_data: entries[entry_id]['notes_hu'] = ext_data['notes_hu']
            if 'hu_confidence' in ext_data: entries[entry_id]['hu_confidence'] = ext_data['hu_confidence']

    # 3. Run Hungarian Parallel Alignment Engine
    mapping = generate_adaptive_consensus_mapping(entries, aligned, strongs_index, args.model, args.map)

    # 4. Integrate Hungarian mapped words into main dictionary
    for entry_id, map_data in mapping.items():
        entries[entry_id]['notes_hu'] = map_data['hungarian_lemma']
        entries[entry_id]['hu_confidence'] = map_data['confidence']

    # 5. Run JSON structured translations for deep dictionary elements
    translate_dictionary_arrays(entries, args.model, args.out)

    # 6. Save final integrated JSON
    save_checkpoint(entries, args.out)
    print(f"Finished! Master dictionary saved safely to {args.out}")

if __name__ == "__main__":
    main()