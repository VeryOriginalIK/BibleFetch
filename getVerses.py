import requests
import pandas as pd
import re
import time
from typing import List, Set, Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

BOOK_MAP = {
    "Gen": "GEN", "Exod": "EXO", "Lev": "LEV", "2 Sam": "2SA", "1 Kgs": "1KI",
    "2 Kgs": "2KI", "2 Chr": "2CH", "Job": "JOB", "Ps": "PSA", "Prov": "PRO",
    "Eccl": "ECC", "Isa": "ISA", "Jer": "JER", "Lam": "LAM", "Ezek": "EZK",
    "Hos": "HOS", "Nah": "NAM", "Zech": "ZEC", "Mal": "MAL", "Matt": "MAT",
    "Mark": "MRK", "Luke": "LUK", "John": "JHN", "Acts": "ACT", "Heb": "HEB",
    "Jas": "JAS", "1 Pet": "1PE", "Tit": "TIT", "3 John": "3JN", "1 Cor": "1CO",
    "Rev": "REV"
}

def process_verse_string(raw_text: str) -> List[str]:
    
    current_book = ""
    processed_verses = []
    
    # Split by semicolon or newline
    parts = re.split(r'[;\n]+', raw_text)
    
    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Regex to check if the part starts with a book name
        # (e.g., "Matt 8:8", "1 Pet 2:24", "Song of Solomon 1:1")
        # Group 1: Book (e.g., "Matt", "1 Pet")
        # Group 2: Reference (e.g., "8:8", "2:24")
        book_match = re.match(r'^([1-3]?\s?[A-Za-z\s]+)\s+([0-9]+:[0-9]+.*)', part)
        
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
    return f"{book_name_url}{reference}"

# The complete list of verses you provided
VERSE_LIST_RAW = """
Gen 20:17; Exod 15:26; 21:19; Lev 13:18; 13:37; 14:3; 14:48; 2 Sam 12:15; 1 Kgs 18:30; 2 Kgs 2:21; 2 Kgs 8:29; 2 Kgs 9:15; 2 Kgs 20:5; 20:8; 2 Chr 7:14; 22:6; 30:20; Job 5:18; Ps 6:2; 30:2; 41:4; 60:2; 103:3; 107:20; 147:3; Prov 3:8; 12:18; 13:17; 16:24; Eccl 3:3; Isa 6:10; 19:22; 30:26; 53:5; 57:18; 57:19; Jer 3:22; 6:14; 8:11; 8:22; 11:19; 14:19; 15:18; 17:14; 19:11; 30:17; 33:6; Lam 2:13; Ezek 34:4; 34:16; Hos 5:13; 6:1; 7:1; Nah 3:19; Zech 11:16.
2 Chr 36:16; Prov 4:22; 12:18; 13:17; 14:30; 15:4; 16:24; 29:1; Isa 58:8; Jer 8:15; 14:19; 30:13; 33:6; Ezek 30:21; 30:22; Mal 4:2.
Prov 12:18; Prov 15:4; Prov 29:1.
Jer 30:13; Jer 46:11.
Ezek 47:12.
2 Kgs 8:29; 2 Chr 22:6; Job 5:18; Ps 147:3; Isa 1:6; 30:26; 61:1; Jer 30:17; Ezek 34:4; 34:16; Hos 6:1; Nah 3:19.
Job 5:18; Isa 19:22.
Matt 8:8; 13:15; Mark 5:29; Luke 4:18; 5:17; 6:18; 7:7; 8:47; 9:2; 9:11; 17:15; John 4:47; 5:13; 12:40; Acts 4:14; 9:34; 10:38; 28:8; Heb 12:13; Jas 5:16; 1 Pet 2:24;
Matt 4:23; 4:24; 8:7; 9:35; 10:1; 10:8; 12:10; 12:15; 14:14; 15:30; 17:16; Mark 1:34; 3:2; 3:10; 6:13; Luke 4:23; 4:40; 5:15; 6:7; 6:18; 7:21; 9:1; 9:6; 10:9; 13:14; 14:3; John 5:10; Acts 4:14; 5:16; 8:7; 9:34; 10:38; Rev 13:3; 13:12.
Matt 9:21; 9:22; Mark 5:23; 5:28; 5:34; 6:56; 10:52; Luke 7:50; 8:36; 8:48; 17:19; 18:42; Acts 14:9; Jas 5:15.
Matt 12:13; Mark 5:34; John 5:6; 5:9; 7:23; Acts 3:16; 4:10; Tit 1:9; 1:13; 2:2; 2:8.
Luke 5:31; 7:10; 15:27; 3 John 2.
Luke 13:32; Acts 4:22.
Matt 8:2, 8:3; 10:8; 11:5
Mark 1:40, 1:41, 1:42
Luke 4:27; 5:12, 5:13; 7:22; 17:14, 17:17
Acts 10:15; 11:9
Matt 9:25; 10:8; 11:5
Mark 1:31; 5:41; 9:27
Luke 7:14; 8:54
John 5:8; 5:21
Acts 3:7; 9:40
1 Cor 15:15-16
Matt 11:5; 20:34
Mark 10:51; 10:52
Luke 7:22; 18:41; 18:43
John 9:11, 9:15, 9:18, 9:25, 9:39
Mark 7:34-35
Luke 24:31
John 9:10, 9:14, 9:17, 9:21, 9:26, 9:30-32
Matt 12:13
Mark 3:5
Mark 8:25
Matt 14:30; Luke 8:50; Acts 27:20; Acts 27:34.
Luke 13:13
Mark 9:12
Luke 13:12
Matt 9:18; Mark 5:23; 6:5; 7:32; 8:23, 8:25; Luke 4:40; 13:13; Acts 9:12, 9:17; 28:8.
"""

# ---------------------------------------------------------------------------
# SCRIPT LOGIC
# ---------------------------------------------------------------------------


def get_verse_text_bible_api(url):
    """Fetches a single verse from bible-api.com."""
    
    
    try:
        response = requests.get(url)
        # Check for 404 or other errors
        if response.status_code != 200:
            print(f"  -> HTTP Error for {url}: error={response.status_code}")
            if response.status_code == 429:
                print("Retrying..")
                time.sleep(5)
                return get_verse_text_bible_api(url)
            return f"HTTP Error: {response.status_code}"
            
        data = response.json()
        print(f"Success: {data['text']}")
        # Check for API-specific errors
        if 'error' in data:
            print(f"  -> API Error for {url}: {data['error']}")
            return f"API Error: {data['error']}"

        # The text is in the 'text' field
        return data['text'].strip()
        
    except Exception as e:
        print(f"  -> Error fetching {url}: {e}")
        return "Error"


def parse_verse_ref_for_bible_api(verse_ref: str) -> Optional[Tuple[str, str, str]]:
    """Parses 'Book Chapter:Verse' into parts. e.g., '2 Kgs 8:29'"""
    match = re.match(r'^(.*?)\s+(\d+):(\d+)$', verse_ref.strip())
    if not match:
        print(f"Warning: Could not parse reference: {verse_ref}")
        return None
        
    book_name = match.group(1).strip()
    chapter = match.group(2)
    verse = match.group(3)
    
    return (book_name, chapter, verse)

def main():
    """Main function to fetch verses and save them to files."""
    print("Starting verse fetching process using bible-api.com...")

    verses_to_fetch = process_verse_string(VERSE_LIST_RAW)
    print(f"Found {len(verses_to_fetch)} unique verses to fetch.")
    
    data_rows = []
    
    for i, ref in enumerate(verses_to_fetch):
        print(f"Fetching verse {i+1}/{len(verses_to_fetch)}: {ref}")
        
        parsed_ref = parse_verse_ref_for_bible_api(ref)
        print(parsed_ref)
        if not parsed_ref:
            continue
            
        book_name, chapter, verse = parsed_ref
        
        # 1. Create the Bible Gateway link
        bg_link = f"https://bible-api.com/{book_name}{chapter}:{verse}"
        
        # 3. Fetch verse text (KJV only)
        time.sleep(2) # Be polite to the API
        kjv_text = get_verse_text_bible_api(bg_link)
        
        # 4. Add data to our list
        data_rows.append({
            "Verse Reference": ref,
            "Bible Gateway Link (Chapter)": bg_link.split(':')[0]+bg_link.split(':')[1],
            "English (KJV)": kjv_text, # Added KJV
        })

    print("\nAll verses fetched. Creating output files...")
    
    # Create a Pandas DataFrame
    df = pd.DataFrame(data_rows)
    
    # Define column order
    columns = [
        "Verse Reference",
        "Bible Gateway Link (Chapter)",
        "English (KJV)"
    ]
    df = df[columns]
    
    # Save to Excel
    excel_file = "bible_verses_bible-api.xlsx"
    df.to_excel(excel_file, index=False, engine='openpyxl')
    print(f"✅ Successfully created Excel file: {excel_file}")

    # Save to CSV
    csv_file = "bible_verses_bible-api.csv"
    df.to_csv(csv_file, index=False, encoding='utf-8-sig')
    print(f"✅ Successfully created CSV file: {csv_file}")
    
    print("\nDone. Note that only English KJV text was fetched.")


if __name__ == "__main__":
    main()