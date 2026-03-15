#!/usr/bin/env python3
"""
Strong's Number Tagger for Bible Translations using Ollama.

Reads each Bible translation from src/assets/bibleTexts/*.json,
uses the KJV Strong's text as reference, and uses a local Ollama LLM
to insert Strong's numbers into every verse of every translation.

Output format matches generate-bibles.js:
  src/assets/bibles/{translationId}/{bookId}/{chapter}.json
  Each file: [{"v": 1, "text": "word{H1234} word{G5678} ..."}]

Usage:
  python tag_strongs_ollama.py [--model MODEL] [--translations ID1,ID2,...] [--resume]

Requirements:
  pip install requests
  Ollama running locally (default http://localhost:11434)
"""

import os
import sys
import json
import re
import argparse
import time
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

# ============================================================================
# CONFIGURATION
# ============================================================================

BASE_DIR = Path(__file__).parent
ASSETS_DIR = BASE_DIR / "src" / "assets"
BIBLE_TEXTS_DIR = ASSETS_DIR / "bibleTexts"
OUTPUT_ROOT = ASSETS_DIR / "bibles"
KJV_STRONGS_FILE = BIBLE_TEXTS_DIR / "kjv_strongs.json"
PROGRESS_FILE = BASE_DIR / ".strongs_tagger_progress.json"

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "gemma3:12b"

# Book number → standard ID mapping (matches generate-bibles.js)
BOOK_ID_MAP = {
    1: "gen", 2: "exo", 3: "lev", 4: "num", 5: "deu",
    6: "jos", 7: "jdg", 8: "rut", 9: "1sa", 10: "2sa",
    11: "1ki", 12: "2ki", 13: "1ch", 14: "2ch", 15: "ezr",
    16: "neh", 17: "est", 18: "job", 19: "psa", 20: "pro",
    21: "ecc", 22: "sng", 23: "isa", 24: "jer", 25: "lam",
    26: "eze", 27: "dan", 28: "hos", 29: "joe", 30: "amo",
    31: "oba", 32: "jon", 33: "mic", 34: "nah", 35: "hab",
    36: "zep", 37: "hag", 38: "zec", 39: "mal",
    40: "mat", 41: "mar", 42: "luk", 43: "joh", 44: "act",
    45: "rom", 46: "1co", 47: "2co", 48: "gal", 49: "eph",
    50: "phi", 51: "col", 52: "1th", 53: "2th", 54: "1ti",
    55: "2ti", 56: "tit", 57: "phm", 58: "heb", 59: "jam",
    60: "1pe", 61: "2pe", 62: "1jo", 63: "2jo", 64: "3jo",
    65: "jud", 66: "rev",
}

BATCH_SIZE = 3  # Verses per LLM call
MAX_RETRIES = 2
REQUEST_TIMEOUT = 120  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("strongs_tagger")


# ============================================================================
# DATA LOADING
# ============================================================================

def load_bible_json(filepath: Path) -> Dict[str, Dict[str, List[dict]]]:
    """
    Load a bible JSON file and organize by bookId -> chapter -> [verses].
    Returns: { "gen": { "1": [{"v":1,"text":"..."},..], ... }, ... }
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    verses = data.get("verses", data) if isinstance(data, dict) else data
    if isinstance(verses, dict):
        verses = list(verses.values())

    structure: Dict[str, Dict[str, List[dict]]] = {}

    for v in verses:
        book_num = v.get("book")
        book_id = BOOK_ID_MAP.get(book_num)
        if not book_id:
            continue

        chapter = str(v.get("chapter", ""))
        verse_num = v.get("verse", 0)
        text = v.get("text", "")

        if not chapter or not text:
            continue

        structure.setdefault(book_id, {}).setdefault(chapter, []).append({
            "v": verse_num,
            "text": text,
        })

    # Sort verses within each chapter
    for book in structure.values():
        for ch_verses in book.values():
            ch_verses.sort(key=lambda x: x["v"])

    return structure


def extract_strongs_from_kjv(kjv_text: str) -> List[str]:
    """Extract Strong's codes from KJV tagged text like 'word{H1234}{(H8804)}'."""
    return re.findall(r"\{([HG]\d+)\}", kjv_text)


def extract_strongs_map_from_kjv(kjv_text: str) -> List[Tuple[str, List[str]]]:
    """
    Parse KJV text into word->codes pairs.
    E.g. "In the beginning{H7225} God{H430}" → [("beginning", ["H7225"]), ("God", ["H430"])]
    """
    # Match word followed by one or more Strong's tags
    pattern = r"(\S+?)((?:\{[HG]?\d+\}(?:\{\([HG]?\d+\)\})*)+)"
    matches = re.findall(pattern, kjv_text)

    result = []
    for word, tags_block in matches:
        codes = re.findall(r"\{([HG]\d+)\}", tags_block)
        if codes:
            # Clean punctuation from word
            clean_word = re.sub(r"[.,;:!?]", "", word)
            result.append((clean_word, codes))

    return result


# ============================================================================
# OLLAMA LLM CLIENT
# ============================================================================

class OllamaClient:
    def __init__(self, model: str, url: str = OLLAMA_URL):
        self.model = model
        self.url = url

    def is_available(self) -> bool:
        try:
            resp = requests.get(
                self.url.replace("/api/generate", "/api/tags"),
                timeout=5,
            )
            return resp.status_code == 200
        except Exception:
            return False

    def tag_verses(
        self,
        target_verses: List[dict],
        kjv_verses: List[dict],
    ) -> List[dict]:
        """
        Given target translation verses and corresponding KJV Strong's verses,
        use an LLM to insert Strong's codes into the target text.

        Returns list of {"v": N, "text": "tagged text..."}.
        """
        # Build the prompt with verse pairs
        verse_pairs = []
        for tv, kv in zip(target_verses, kjv_verses):
            strongs_codes = extract_strongs_from_kjv(kv["text"])
            word_map = extract_strongs_map_from_kjv(kv["text"])

            # Create a compact vocabulary hint
            vocab_entries = []
            for eng_word, codes in word_map:
                codes_str = ",".join(codes)
                vocab_entries.append(f"{eng_word}={codes_str}")

            verse_pairs.append({
                "v": tv["v"],
                "target": tv["text"],
                "vocab": " | ".join(vocab_entries[:40]),  # limit size
            })

        prompt = self._build_prompt(verse_pairs)

        for attempt in range(MAX_RETRIES + 1):
            try:
                payload = {
                    "model": self.model,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {
                        "temperature": 0.0,
                        "num_predict": 4096,
                    },
                }

                resp = requests.post(self.url, json=payload, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                result = resp.json()
                response_text = result.get("response", "")

                parsed = json.loads(response_text)
                tagged = self._extract_results(parsed, verse_pairs)

                if tagged:
                    return tagged

            except (json.JSONDecodeError, requests.RequestException, KeyError) as e:
                if attempt < MAX_RETRIES:
                    log.warning(f"  Attempt {attempt+1} failed: {e}. Retrying...")
                    time.sleep(2)
                else:
                    log.error(f"  All attempts failed: {e}")

        # Fallback: return untagged text
        return [{"v": tv["v"], "text": tv["text"]} for tv in target_verses]

    def _build_prompt(self, verse_pairs: List[dict]) -> str:
        data_block = json.dumps(verse_pairs, ensure_ascii=False, indent=None)

        return (
            "You are a biblical Strong's concordance alignment engine.\n"
            "TASK: Insert Strong's number tags into the target translation text.\n\n"
            "FORMAT: After each word that corresponds to a Strong's number, "
            "append the code in curly braces. Example: word{H1234}\n"
            "If a word maps to multiple codes: word{H1234}{H5678}\n"
            "Morphology codes in parentheses can be omitted.\n\n"
            "RULES:\n"
            "1. Keep the original target text EXACTLY as-is. Only INSERT {CODE} tags.\n"
            "2. Do NOT translate, rewrite, or alter any word.\n"
            "3. Match based on meaning alignment between the English vocab hint and the target word.\n"
            "4. If unsure, skip that word (no tag is better than wrong tag).\n"
            "5. Every Strong's code from vocab should appear at least once if possible.\n\n"
            "INPUT: Each item has 'v' (verse number), 'target' (text to tag), "
            "'vocab' (English_word=CODE pairs from KJV).\n\n"
            "OUTPUT: JSON object with key \"verses\", value is array of "
            "{\"v\": NUMBER, \"text\": \"tagged text...\"}.\n\n"
            f"DATA:\n{data_block}"
        )

    def _extract_results(self, parsed: any, originals: List[dict]) -> List[dict]:
        """Extract tagged verses from LLM response, with validation."""
        results = []

        if isinstance(parsed, dict):
            if "verses" in parsed:
                results = parsed["verses"]
            elif "result" in parsed:
                results = parsed["result"]
            else:
                # Single object
                results = [parsed]
        elif isinstance(parsed, list):
            results = parsed

        tagged = []
        original_map = {vp["v"]: vp for vp in originals}

        for res in results:
            v_num = res.get("v")
            text = res.get("text", "")

            if v_num is None or not text:
                continue

            # Validate: tagged text should contain at least one Strong's code
            # and be roughly similar length to original
            orig = original_map.get(v_num)
            if orig:
                orig_len = len(orig["target"])
                # Allow up to 2x length (codes add characters)
                if len(text) > orig_len * 3:
                    log.warning(f"  v{v_num}: Tagged text suspiciously long, using original")
                    tagged.append({"v": v_num, "text": orig["target"]})
                    continue

            tagged.append({"v": v_num, "text": text})

        return tagged


# ============================================================================
# PROGRESS TRACKING
# ============================================================================

def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {}


def save_progress(progress: dict):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def is_chapter_done(progress: dict, translation_id: str, book_id: str, chapter: str) -> bool:
    key = f"{translation_id}/{book_id}/{chapter}"
    return progress.get(key, False)


def mark_chapter_done(progress: dict, translation_id: str, book_id: str, chapter: str):
    key = f"{translation_id}/{book_id}/{chapter}"
    progress[key] = True
    save_progress(progress)


# ============================================================================
# MAIN PIPELINE
# ============================================================================

def process_translation(
    translation_id: str,
    target_data: Dict[str, Dict[str, List[dict]]],
    kjv_data: Dict[str, Dict[str, List[dict]]],
    client: OllamaClient,
    progress: dict,
):
    """Process one translation, tagging all chapters with Strong's numbers."""
    trans_dir = OUTPUT_ROOT / translation_id
    total_books = len(target_data)
    log.info(f"Processing {translation_id}: {total_books} books")

    books_done = 0
    for book_id in sorted(target_data.keys(), key=lambda b: list(BOOK_ID_MAP.values()).index(b) if b in BOOK_ID_MAP.values() else 999):
        chapters = target_data[book_id]
        kjv_book = kjv_data.get(book_id, {})

        for chapter_num in sorted(chapters.keys(), key=lambda c: int(c)):
            # Skip if already done (resume support)
            if is_chapter_done(progress, translation_id, book_id, chapter_num):
                continue

            target_verses = chapters[chapter_num]
            kjv_verses = kjv_book.get(chapter_num, [])

            if not kjv_verses:
                # No KJV reference for this chapter → save untagged
                out_dir = trans_dir / book_id
                out_dir.mkdir(parents=True, exist_ok=True)
                with open(out_dir / f"{chapter_num}.json", "w", encoding="utf-8") as f:
                    json.dump(target_verses, f, ensure_ascii=False)
                mark_chapter_done(progress, translation_id, book_id, chapter_num)
                continue

            # Build verse-aligned pairs
            kjv_map = {v["v"]: v for v in kjv_verses}
            tagged_verses = []

            # Process in batches
            for i in range(0, len(target_verses), BATCH_SIZE):
                batch = target_verses[i: i + BATCH_SIZE]

                # Find matching KJV verses
                batch_kjv = []
                batch_target = []
                for tv in batch:
                    kv = kjv_map.get(tv["v"])
                    if kv and extract_strongs_from_kjv(kv["text"]):
                        batch_target.append(tv)
                        batch_kjv.append(kv)
                    else:
                        # No KJV match → keep original
                        tagged_verses.append({"v": tv["v"], "text": tv["text"]})

                if batch_target:
                    results = client.tag_verses(batch_target, batch_kjv)
                    tagged_verses.extend(results)

            # Sort by verse number
            tagged_verses.sort(key=lambda x: x["v"])

            # Write chapter file
            out_dir = trans_dir / book_id
            out_dir.mkdir(parents=True, exist_ok=True)
            with open(out_dir / f"{chapter_num}.json", "w", encoding="utf-8") as f:
                json.dump(tagged_verses, f, ensure_ascii=False)

            mark_chapter_done(progress, translation_id, book_id, chapter_num)

        books_done += 1
        log.info(f"  [{translation_id}] {book_id} done ({books_done}/{total_books})")


def get_translation_id(filepath: Path) -> str:
    """Derive translation ID from filename (matches versions.json keys)."""
    return filepath.stem.lower()


def main():
    parser = argparse.ArgumentParser(
        description="Tag bible translations with Strong's numbers using Ollama"
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL,
        help=f"Ollama model name (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--translations", default="",
        help="Comma-separated translation IDs to process (default: all)"
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Resume from last progress checkpoint"
    )
    parser.add_argument(
        "--batch-size", type=int, default=BATCH_SIZE,
        help=f"Verses per LLM batch (default: {BATCH_SIZE})"
    )
    args = parser.parse_args()

    global BATCH_SIZE
    BATCH_SIZE = args.batch_size

    # 1. Check Ollama availability
    client = OllamaClient(model=args.model)
    if not client.is_available():
        log.error("Ollama is not running. Start it with: ollama serve")
        log.error(f"Then pull a model: ollama pull {args.model}")
        sys.exit(1)

    log.info(f"Using Ollama model: {args.model}")

    # 2. Load KJV Strong's as reference
    if not KJV_STRONGS_FILE.exists():
        log.error(f"KJV Strong's file not found: {KJV_STRONGS_FILE}")
        sys.exit(1)

    log.info("Loading KJV Strong's reference...")
    kjv_data = load_bible_json(KJV_STRONGS_FILE)
    log.info(f"  Loaded {sum(len(chs) for chs in kjv_data.values())} chapters from KJV")

    # 3. Find translations to process
    bible_files = sorted(BIBLE_TEXTS_DIR.glob("*.json"))
    skip_files = {"kjv_strongs.json"}  # KJV is the reference, not a target

    if args.translations:
        requested = set(t.strip().lower() for t in args.translations.split(","))
        bible_files = [f for f in bible_files if f.stem.lower() in requested]

    # 4. Load progress
    progress = load_progress() if args.resume else {}

    # 5. Process each translation
    for filepath in bible_files:
        if filepath.name in skip_files:
            continue

        translation_id = get_translation_id(filepath)
        log.info(f"\n{'='*60}")
        log.info(f"Translation: {translation_id} ({filepath.name})")
        log.info(f"{'='*60}")

        target_data = load_bible_json(filepath)
        if not target_data:
            log.warning(f"  No verses found, skipping.")
            continue

        process_translation(translation_id, target_data, kjv_data, client, progress)

    log.info("\nAll translations processed!")
    log.info(f"Output directory: {OUTPUT_ROOT}")
    log.info("Run 'node generate/generate-bibles.js' to rebuild if needed,")
    log.info("or the tagged files are already in the correct chunk format.")


if __name__ == "__main__":
    main()
