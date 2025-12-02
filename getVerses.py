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
    return f"{book_name_url}{reference}".strip().replace('.', '')

# The complete list of verses you provided
VERSE_LIST_RAW = """
Gen 20:17
Exod 15:26
Exod 21:19
Lev 13:18
Lev 13:37
Lev 14:3
Lev 14:48
2 Sam 12:15
1 Kgs 18:30
2 Kgs 2:21
2 Kgs 8:29
2 Kgs 9:15
2 Kgs 20:5
2 Kgs 20:8
2 Chr 7:14
2 Chr 22:6
2 Chr 30:20
2 Chr 36:16
Job 5:18
Ps 6:2
Ps 30:2
Ps 41:4
Ps 60:2
Ps 103:3
Ps 107:20
Ps 147:3
Prov 3:8
Prov 4:22
Prov 12:18
Prov 13:17
Prov 14:30
Prov 15:4
Prov 16:24
Prov 29:1
Eccl 3:3
Isa 1:6
Isa 6:10
Isa 19:22
Isa 30:26
Isa 53:5
Isa 57:18
Isa 57:19
Isa 58:8
Isa 61:1
Jer 3:22
Jer 6:14
Jer 8:11
Jer 8:15
Jer 8:22
Jer 11:19
Jer 14:19
Jer 15:18
Jer 17:14
Jer 19:11
Jer 30:13
Jer 30:17
Jer 33:6
Jer 46:11
Lam 2:13
Ezek 30:21
Ezek 30:22
Ezek 34:4
Ezek 34:16
Ezek 47:12
Hos 5:13
Hos 6:1
Hos 7:1
Nah 3:19
Zech 11:16
Mal 4:2
Matt 4:23
Matt 4:24
Matt 8:2
Matt 8:3
Matt 8:7
Matt 8:8
Matt 9:18
Matt 9:21
Matt 9:22
Matt 9:25
Matt 9:35
Matt 10:1
Matt 10:8
Matt 11:5
Matt 12:10
Matt 12:13
Matt 12:15
Matt 14:14
Matt 14:30
Matt 15:30
Matt 17:16
Matt 20:34
Mark 1:31
Mark 1:34
Mark 1:40
Mark 1:41
Mark 1:42
Mark 3:2
Mark 3:5
Mark 3:10
Mark 5:23
Mark 5:28
Mark 5:34
Mark 5:41
Mark 6:13
Mark 6:56
Mark 7:32
Mark 7:34-35
Mark 8:23
Mark 8:25
Mark 9:12
Mark 9:27
Mark 10:51
Mark 10:52

Luke 4:18
Luke 4:23
Luke 4:27
Luke 4:40
Luke 5:12
Luke 5:13
Luke 5:15
Luke 5:17
Luke 5:18
Luke 5:31
Luke 7:7
Luke 7:10
Luke 7:14
Luke 7:21
Luke 7:22
Luke 7:50
Luke 8:36
Luke 8:47
Luke 8:48
Luke 8:50
Luke 8:54
Luke 9:1
Luke 9:2
Luke 9:6
Luke 9:11
Luke 10:9
Luke 13:12
Luke 13:13
Luke 13:14
Luke 13:32
Luke 15:27
Luke 17:14
Luke 17:15
Luke 17:17
Luke 17:19
Luke 18:41
Luke 18:42
Luke 18:43
Luke 24:31
John 4:47
John 5:6
John 5:8
John 5:9
John 5:10
John 5:13
John 5:21
John 7:23
John 9:10
John 9:11
John 9:14
John 9:15
John 9:17
John 9:18
John 9:21
John 9:25
John 9:26
John 9:30-32
John 9:39
John 12:40
Acts 3:7
Acts 3:16
Acts 4:10
Acts 4:14
Acts 4:22
Acts 5:16
Acts 8:7
Acts 9:12
Acts 9:17
Acts 9:34
Acts 10:15
Acts 10:38
Acts 11:9
Acts 14:9
Acts 27:20
Acts 27:34
Acts 28:8
1 Cor 15:15-16
Tit 1:9
Tit 1:13
Tit 2:2
Tit 2:8
Heb 12:13
Jas 5:15
Jas 5:16
1 Pet 2:24
3 John 2
Rev 13:3
Rev 13:12
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
    """Main function to fetch verses and save them to files."""
    print("Starting verse fetching process using bible-api.com...")

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
    
    # Save to Excel
    excel_file = "bible_verses_bible-api.xlsx"
    df.to_excel(excel_file, index=False, engine='openpyxl')
    print(f"✅ Successfully created Excel file: {excel_file}")

    # Save to CSV
    csv_file = "bible_verses_bible-api.csv"
    df.to_csv(csv_file, index=False, encoding='utf-8-sig')
    print(f"✅ Successfully created CSV file: {csv_file}")
    
    print("\nDone.")


if __name__ == "__main__":
    main()