import json
import requests
import pandas as pd
import re
import time
from typing import List, Set, Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------
topic = ""
BOOK_MAP = {
    "Gen": "GEN", "Exod": "EXO", "Lev": "LEV", "2 Sam": "2SA", "1 Kgs": "1KI",
    "2 Kgs": "2KI", "2 Chr": "2CH", "Job": "JOB", "Ps": "PSA", "Prov": "PRO",
    "Eccl": "ECC", "Isa": "ISA", "Jer": "JER", "Lam": "LAM", "Ezek": "EZK",
    "Hos": "HOS", "Nah": "NAM", "Zech": "ZEC", "Mal": "MAL", "Matt": "MAT",
    "Mark": "MRK", "Luke": "LUK", "John": "JHN", "Acts": "ACT", "Heb": "HEB",
    "Jas": "JAS", "1 Pet": "1PE", "Tit": "TIT", "3 John": "3JN", "1 Cor": "1CO",
    "Rev": "REV"
}

def process_verse_string(verse_list_raw: List[str]) -> List[str]:
    
    current_book = ""
    processed_verses = []
    
    # Split by semicolon or newline
    for verse in verse_list_raw:
        parts = re.split(r'[;\n]+', verse)
        for part in parts:
            part = part.strip()
            if not part:
                continue

            # Regex to check if the part starts with a book name
            # (e.g., "Matt 8:8", "1 Pet 2:24", "Song of Solomon 1:1")
            # Group 1: Book (e.g., "Matt", "1 Pet")
            # Group 2: Reference (e.g., "8:8", "2:24")
            book_match = re.match(r'^([1-3]?\s?[A-Za-z\s\.]+)\s+([0-9]+:[0-9]+.*)$', part)

            if book_match:
                # A new book is specified
                current_book = book_match.group(1).strip()
                reference = book_match.group(2).strip()
                full_ref = f"{current_book} {reference}"
                processed_verses.append(full_ref)
                # print(f"  Found explicit ref: {full_ref}")

            else:
                # No book name, so it's an implied reference
                # (e.g., "13:15" or "5:17")
                if current_book:
                    reference = part
                    full_ref = f"{current_book} {reference}"
                    processed_verses.append(full_ref)
                    # print(f"  Found implied ref: {full_ref}")
                else:
                    print(f"  [Warning] Skipping '{part}': No book specified yet.")
                
    print(f"--- Processing Complete: Found {len(processed_verses)} verses ---")
    return processed_verses


def format_for_bible_api_com(full_ref: str) -> str:
    """
    Converts a full reference (e.g., 'Matt 8:8') into the
    format for bible-api.com (e.g., 'Matt+8:8').
    
    Returns 'FORMAT_ERROR' if conversion fails.
    """
    # Regex to parse the full reference
    match = re.match(r'^(.*?)\s+(\d+:\d+)$', full_ref.strip())
    if match:
         book_name = match.group(1)
         reference = match.group(2)
         
    else:
        match =  full_ref.split(' ', 1)
        if not match:
            return f"FORMAT_ERROR: Could not parse '{full_ref}'"
        else:
            book_name = match[0]
            reference = match[1]
    
    # URL-encode the book name (replace spaces with '+')
    book_name_url = book_name.replace(' ', '')
    return f"{book_name_url}{reference}".strip().replace('.', '')

# The complete list of verses you provided
# Load the topics JSON safely and extract verses for id = 1 (supports multiple possible structures)
try:
    with open("topics.json", "r", encoding="utf-8") as f:
        topics = json.load(f)
except FileNotFoundError:
    print("Error: topics.json not found.")
    topics = {}

# Prefer the exact key "id = 1" if present, otherwise try to find an item with id == 1

# ---------------------------------------------------------------------------
# SCRIPT LOGIC
# ---------------------------------------------------------------------------


def get_verse_text_bible_api(url):
    """Fetches a single verse from bible-api.com."""
    
    try:
        response = requests.get(url)
        # Check for 404 or other errors
        if response.status_code != 200:
            if ('ylt' in url):
                return "Verse not found in YLT translation."
            print(f"  -> HTTP Error for {url}: error={response.status_code}")
            if response.status_code == 429:
                print("Retrying..")
                time.sleep(5)
                return get_verse_text_bible_api(url)
            return f"HTTP Error: {response.status_code}"
            
        data = response.json()
        # Check for API-specific errors
        if 'error' in data:
            print(f"  -> API Error for {url}: {data['error']}")
            return f"API Error: {data['error']}"

        # The text is in the 'text' field
        return data
        
    except Exception as e:
        print(f"  -> Error fetching {url}: {e}")
        return "Error"

def main():
    for _topic in topics:
        topic = _topic['topic']
        VERSE_LIST_RAW = _topic['verses']
        
        verses_to_fetch = process_verse_string(VERSE_LIST_RAW)
        print(f"Found {len(verses_to_fetch)} unique verses to fetch.")
        
        data_rows = []
        translations = ["bbe","web","ylt"]
    
        for i, ref in enumerate(verses_to_fetch):
            data_row = {}
            parsed_ref = format_for_bible_api_com(ref)
            if not parsed_ref:
                continue
            for translation in translations:            
                # 1. Create the Bible Gateway link
                bg_link = f"https://bible-api.com/{parsed_ref}?translation={translation}"
    
                # 3. Fetch verse text
                time.sleep(1.7) # Be polite to the API
                verse_data = get_verse_text_bible_api(bg_link)
                if('Verse not found' in verse_data) or ('Error' in verse_data):
                    data_row[translation] = ""
                else:
                    data_row[translation] = verse_data['text'].strip()
    
            # 4. Add data to our list
            data_rows.append({
                "Verse Reference": ref,
                "Bible Gateway Link (Chapter)": parsed_ref,
                **data_row
            })
    
        print("\nAll verses fetched. Creating output files...")
        
        # Create a Pandas DataFrame
        df = pd.DataFrame(data_rows)
        
        # Define column order
        columns = [
            "Verse Reference",
            "Bible Gateway Link (Chapter)"
        ]
        for translation in translations:
            columns.append(translation)
    
        df = df[columns]
    
    
        # Save to CSV
        csv_file = f"bible verses about {topic}.csv"
        df.to_csv(csv_file, index=False, encoding='utf-8-sig')
        print(f"✅ Successfully created CSV file: {csv_file}")
        
        print("\nDone.")

    else:
        VERSE_LIST_RAW = []
        if isinstance(topics, list):
            found = next((item for item in topics if item.get("id") in (1, "1") or item.get("id") == "1"), None)
            if found:
                VERSE_LIST_RAW = found.get("verses", [])


        


if __name__ == "__main__":
    main()