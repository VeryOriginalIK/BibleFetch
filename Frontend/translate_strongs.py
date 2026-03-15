#!/usr/bin/env python3
"""
Add multilingual translations to Strong's Concordance definition files.

Reads greek.json and hebrew.json, uses Ollama to translate the English definitions
into multiple target languages, and writes the updated files back.

Supports resuming (saves progress after each batch).

Usage:
  python translate_strongs.py [--model MODEL] [--languages LANG1,LANG2,...] [--resume] [--file hebrew|greek|both]

Requirements:
  pip install requests
  Ollama running locally (default http://localhost:11434)
"""

import os
import sys
import json
import argparse
import time
import logging
import copy
from pathlib import Path
from typing import Dict, List, Optional

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)


# ============================================================================
# CONFIGURATION
# ============================================================================

BASE_DIR = Path(__file__).parent
STRONGS_DIR = BASE_DIR / "src" / "assets" / "strongs"
HEBREW_FILE = STRONGS_DIR / "hebrew.json"
GREEK_FILE = STRONGS_DIR / "greek.json"
PROGRESS_FILE = BASE_DIR / ".strongs_translate_progress.json"

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "gemma3:12b"

# Target languages with their ISO codes and native names
TARGET_LANGUAGES = {
    "es": {"name": "Spanish", "native": "Español"},
    "de": {"name": "German", "native": "Deutsch"},
    "af": {"name": "Afrikaans", "native": "Afrikaans"},
    "ko": {"name": "Korean", "native": "한국어"},
    "mi": {"name": "Maori", "native": "Te Reo Māori"},
    "sv": {"name": "Swedish", "native": "Svenska"},
    "pt": {"name": "Portuguese", "native": "Português"},
    "ro": {"name": "Romanian", "native": "Română"},
    "ru": {"name": "Russian", "native": "Русский"},
    "ar": {"name": "Arabic", "native": "العربية"},
    "zh": {"name": "Chinese (Simplified)", "native": "简体中文"},
    "cs": {"name": "Czech", "native": "Čeština"},
    "so": {"name": "Somali", "native": "Soomaali"},
    "fr": {"name": "French", "native": "Français"},
    "it": {"name": "Italian", "native": "Italiano"},
    "ja": {"name": "Japanese", "native": "日本語"},
    "pl": {"name": "Polish", "native": "Polski"},
    "tr": {"name": "Turkish", "native": "Türkçe"},
}

BATCH_SIZE = 5  # Entries per LLM call
MAX_RETRIES = 2
REQUEST_TIMEOUT = 90
NUM_PREDICT = 1024

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("strongs_translate")


# ============================================================================
# PROGRESS TRACKING
# ============================================================================

def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_progress(progress: dict):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2)


def is_entry_done(progress: dict, file_type: str, entry_id: str, lang: str) -> bool:
    key = f"{file_type}/{entry_id}/{lang}"
    return progress.get(key, False)


def mark_batch_done(progress: dict, file_type: str, entry_ids: List[str], lang: str):
    for eid in entry_ids:
        key = f"{file_type}/{eid}/{lang}"
        progress[key] = True
    save_progress(progress)


# ============================================================================
# OLLAMA CLIENT
# ============================================================================

class OllamaClient:
    def __init__(
        self,
        model: str,
        url: str = OLLAMA_URL,
        request_timeout: int = REQUEST_TIMEOUT,
        num_predict: int = NUM_PREDICT,
    ):
        self.model = model
        self.url = url
        self.request_timeout = request_timeout
        self.num_predict = num_predict

    def is_available(self) -> bool:
        try:
            resp = requests.get(
                self.url.replace("/api/generate", "/api/tags"),
                timeout=5,
            )
            return resp.status_code == 200
        except Exception:
            return False

    def translate_batch(
        self,
        entries: List[dict],
        target_lang_code: str,
        target_lang_name: str,
    ) -> Dict[str, str]:
        """
        Translate a batch of Strong's definitions into the target language.

        entries: [{"id": "H1", "en": "father", "lemma": "אָב"}, ...]
        Returns: {"H1": "translated definition", ...}
        """
        # Build compact input
        items = []
        for e in entries:
            en_def = e.get("en", "")
            if not en_def:
                continue
            # Strip HTML tags for cleaner translation
            import re
            clean_def = re.sub(r"<[^>]+>", " ", en_def).strip()
            # Truncate very long definitions for efficiency
            if len(clean_def) > 500:
                clean_def = clean_def[:500] + "..."
            items.append({"id": e["id"], "def": clean_def})

        if not items:
            return {}

        prompt = self._build_prompt(items, target_lang_code, target_lang_name)

        for attempt in range(MAX_RETRIES + 1):
            try:
                payload = {
                    "model": self.model,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": self.num_predict,
                    },
                }

                resp = requests.post(self.url, json=payload, timeout=self.request_timeout)
                resp.raise_for_status()
                result = resp.json()
                response_text = result.get("response", "")

                parsed = json.loads(response_text)
                translations = self._extract_results(parsed)

                if translations:
                    return translations

            except (json.JSONDecodeError, requests.RequestException, KeyError) as e:
                if attempt < MAX_RETRIES:
                    log.warning(f"  Attempt {attempt+1} failed: {e}. Retrying...")
                    time.sleep(2)
                else:
                    log.error(f"  All attempts failed for batch: {e}")

        return {}

    def _build_prompt(
        self,
        items: List[dict],
        lang_code: str,
        lang_name: str,
    ) -> str:
        data = json.dumps(items, ensure_ascii=False, indent=None)

        return (
            f"You are a biblical lexicon translator. "
            f"Translate these Strong's concordance definitions from English to {lang_name}.\n\n"
            "RULES:\n"
            "1. Translate ONLY the definition text. Keep it concise and accurate.\n"
            "2. Use proper biblical/theological terminology in the target language.\n"
            "3. Preserve numbered sub-definitions (1), 2), etc.) if present.\n"
            "4. Do NOT include the original English text.\n"
            "5. Keep transliterations and proper nouns as-is.\n\n"
            "OUTPUT: JSON object where keys are the entry IDs and values are the "
            f"translated definition strings in {lang_name}.\n"
            f'Example: {{"H1": "translated definition in {lang_name}"}}\n\n'
            f"DATA:\n{data}"
        )

    def _extract_results(self, parsed: any) -> Dict[str, str]:
        """Extract translation results from LLM response."""
        if isinstance(parsed, dict):
            # Could be {"translations": {...}} or direct {"H1": "def", ...}
            if "translations" in parsed:
                return parsed["translations"]
            # Check if keys look like Strong's IDs
            sample_key = next(iter(parsed), "")
            if sample_key.startswith(("H", "G", "sw-")):
                return {k: v for k, v in parsed.items() if isinstance(v, str)}
        return {}


# ============================================================================
# FILE PROCESSING
# ============================================================================

def process_hebrew(
    data: dict,
    client: OllamaClient,
    lang_code: str,
    lang_name: str,
    progress: dict,
    resume: bool,
    output_file: Path,
    max_batches: Optional[int] = None,
) -> dict:
    """Add translations to hebrew.json entries."""
    entries_to_translate = []

    for entry_id, entry in data.items():
        # Skip if already has this language
        defs = entry.get("defs", {})
        if lang_code in defs and defs[lang_code]:
            continue

        # Skip if done in progress
        if resume and is_entry_done(progress, "hebrew", entry_id, lang_code):
            continue

        en_def = defs.get("en", "")
        if not en_def:
            continue

        entries_to_translate.append({
            "id": entry_id,
            "en": en_def,
            "lemma": entry.get("lemma", ""),
        })

    total = len(entries_to_translate)
    if total == 0:
        log.info(f"  Hebrew [{lang_code}]: All entries already translated.")
        return data

    log.info(f"  Hebrew [{lang_code}]: {total} entries to translate")

    processed = 0
    batches_run = 0
    for i in range(0, total, BATCH_SIZE):
        if max_batches is not None and batches_run >= max_batches:
            log.info(f"    Hebrew [{lang_code}]: reached --max-batches={max_batches}, stopping this run")
            break
        batch = entries_to_translate[i: i + BATCH_SIZE]
        translations = client.translate_batch(batch, lang_code, lang_name)

        completed_ids = []
        for entry_info in batch:
            eid = entry_info["id"]
            if eid in translations and translations[eid]:
                if "defs" not in data[eid]:
                    data[eid]["defs"] = {}
                data[eid]["defs"][lang_code] = translations[eid]
                completed_ids.append(eid)

        if completed_ids:
            mark_batch_done(progress, "hebrew", completed_ids, lang_code)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        processed += len(batch)
        batches_run += 1
        log.info(f"    Hebrew [{lang_code}]: {processed}/{total} (saved {len(completed_ids)}/{len(batch)})")

    return data


def process_greek(
    data: dict,
    client: OllamaClient,
    lang_code: str,
    lang_name: str,
    progress: dict,
    resume: bool,
    output_file: Path,
    max_batches: Optional[int] = None,
) -> dict:
    """Add translations to greek.json entries."""
    entries_to_translate = []

    for entry_id, entry in data.items():
        # Greek uses "definition" instead of "defs"
        defs = entry.get("definition", {})
        if lang_code in defs and defs[lang_code]:
            continue

        if resume and is_entry_done(progress, "greek", entry_id, lang_code):
            continue

        en_def = defs.get("en", "")
        if not en_def:
            continue

        entries_to_translate.append({
            "id": entry_id,
            "en": en_def,
            "lemma": entry.get("original_word", ""),
        })

    total = len(entries_to_translate)
    if total == 0:
        log.info(f"  Greek [{lang_code}]: All entries already translated.")
        return data

    log.info(f"  Greek [{lang_code}]: {total} entries to translate")

    processed = 0
    batches_run = 0
    for i in range(0, total, BATCH_SIZE):
        if max_batches is not None and batches_run >= max_batches:
            log.info(f"    Greek [{lang_code}]: reached --max-batches={max_batches}, stopping this run")
            break
        batch = entries_to_translate[i: i + BATCH_SIZE]
        translations = client.translate_batch(batch, lang_code, lang_name)

        completed_ids = []
        for entry_info in batch:
            eid = entry_info["id"]
            if eid in translations and translations[eid]:
                if "definition" not in data[eid]:
                    data[eid]["definition"] = {}
                data[eid]["definition"][lang_code] = translations[eid]
                completed_ids.append(eid)

        if completed_ids:
            mark_batch_done(progress, "greek", completed_ids, lang_code)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        processed += len(batch)
        batches_run += 1
        log.info(f"    Greek [{lang_code}]: {processed}/{total} (saved {len(completed_ids)}/{len(batch)})")

    return data


# ============================================================================
# MAIN
# ============================================================================

def main():
    global BATCH_SIZE

    parser = argparse.ArgumentParser(
        description="Translate Strong's concordance definitions into multiple languages using Ollama"
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL,
        help=f"Ollama model name (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--languages", default="",
        help="Comma-separated language codes to translate (default: all). "
             f"Available: {', '.join(TARGET_LANGUAGES.keys())}"
    )
    parser.add_argument(
        "--file", default="both", choices=["hebrew", "greek", "both"],
        help="Which file to process (default: both)"
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Resume from last progress checkpoint"
    )
    parser.add_argument(
        "--batch-size", type=int, default=BATCH_SIZE,
        help=f"Entries per LLM batch (default: {BATCH_SIZE})"
    )
    parser.add_argument(
        "--request-timeout", type=int, default=REQUEST_TIMEOUT,
        help=f"HTTP timeout per Ollama request in seconds (default: {REQUEST_TIMEOUT})"
    )
    parser.add_argument(
        "--num-predict", type=int, default=NUM_PREDICT,
        help=f"Max tokens to generate per request (default: {NUM_PREDICT})"
    )
    parser.add_argument(
        "--max-batches", type=int, default=0,
        help="Maximum batches to run per language in this execution (0 = unlimited)"
    )
    parser.add_argument(
        "--list-languages", action="store_true",
        help="List available target languages and exit"
    )
    args = parser.parse_args()

    if args.list_languages:
        print("Available target languages:")
        for code, info in sorted(TARGET_LANGUAGES.items()):
            print(f"  {code:4s}  {info['name']:25s} ({info['native']})")
        return

    BATCH_SIZE = args.batch_size

    # Determine target languages
    if args.languages:
        lang_codes = [l.strip() for l in args.languages.split(",")]
        for lc in lang_codes:
            if lc not in TARGET_LANGUAGES:
                log.error(f"Unknown language code: {lc}")
                log.error(f"Available: {', '.join(TARGET_LANGUAGES.keys())}")
                sys.exit(1)
    else:
        lang_codes = list(TARGET_LANGUAGES.keys())

    max_batches = args.max_batches if args.max_batches > 0 else None

    # Check Ollama
    client = OllamaClient(
        model=args.model,
        request_timeout=args.request_timeout,
        num_predict=args.num_predict,
    )
    if not client.is_available():
        log.error("Ollama is not running. Start it with: ollama serve")
        log.error(f"Then pull a model: ollama pull {args.model}")
        sys.exit(1)

    log.info(f"Using Ollama model: {args.model}")
    log.info(f"Target languages: {', '.join(lang_codes)}")

    # Load progress
    progress = load_progress() if args.resume else {}

    # Process Hebrew
    if args.file in ("hebrew", "both"):
        if not HEBREW_FILE.exists():
            log.error(f"Hebrew file not found: {HEBREW_FILE}")
        else:
            log.info(f"\nLoading {HEBREW_FILE}...")
            with open(HEBREW_FILE, "r", encoding="utf-8") as f:
                hebrew_data = json.load(f)
            log.info(f"  Loaded {len(hebrew_data)} Hebrew entries")

            for lang_code in lang_codes:
                lang_name = TARGET_LANGUAGES[lang_code]["name"]
                log.info(f"\n--- Hebrew → {lang_name} ({lang_code}) ---")
                hebrew_data = process_hebrew(
                    hebrew_data, client, lang_code, lang_name, progress, args.resume, HEBREW_FILE, max_batches
                )

            # Save updated Hebrew file
            log.info(f"\nSaving updated Hebrew file...")
            with open(HEBREW_FILE, "w", encoding="utf-8") as f:
                json.dump(hebrew_data, f, ensure_ascii=False, indent=2)
            log.info(f"  Saved {HEBREW_FILE}")

    # Process Greek
    if args.file in ("greek", "both"):
        if not GREEK_FILE.exists():
            log.error(f"Greek file not found: {GREEK_FILE}")
        else:
            log.info(f"\nLoading {GREEK_FILE}...")
            with open(GREEK_FILE, "r", encoding="utf-8") as f:
                greek_data = json.load(f)
            log.info(f"  Loaded {len(greek_data)} Greek entries")

            for lang_code in lang_codes:
                lang_name = TARGET_LANGUAGES[lang_code]["name"]
                log.info(f"\n--- Greek → {lang_name} ({lang_code}) ---")
                greek_data = process_greek(
                    greek_data, client, lang_code, lang_name, progress, args.resume, GREEK_FILE, max_batches
                )

            # Save updated Greek file
            log.info(f"\nSaving updated Greek file...")
            with open(GREEK_FILE, "w", encoding="utf-8") as f:
                json.dump(greek_data, f, ensure_ascii=False, indent=2)
            log.info(f"  Saved {GREEK_FILE}")

    log.info("\n" + "=" * 60)
    log.info("Translation complete!")
    log.info("Run 'node generate/generate-strongs.js' to regenerate chunked files.")


if __name__ == "__main__":
    main()
