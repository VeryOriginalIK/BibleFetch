from logging import root
import xml
import xml.etree.ElementTree as ET
import json
import os

INPUT_FILE = "SF_2012-04-21_HEB_OSMHB_(OPEN SCRIPTURES MORPHOLOGICAL HEBREW BIBLE).xml"
OUTPUT_DIR = "bibles/heb_OSMHB"
VERSION_NAME = "MORPHOLOGICAL HEBREW BIBLE"
LANG_CODE = "heb"

book_mapping = {
    "1": "gen", "2": "ex", "3": "lev", "4": "num", "5": "deut",
    "6": "josh", "7": "judg", "8": "ruth", "9": "1sam", "10": "2sam",
    "11": "1kings", "12": "2kings", "13": "1chron", "14": "2chron", "15": "ezra",
    "16": "neh", "17": "esth", "18": "job", "19": "ps", "20": "prov",
    "21": "eccl", "22": "song", "23": "isa", "24": "jer", "25": "lam",
    "26": "ezek", "27": "dan", "28": "hos", "29": "joel", "30": "amos",
    "31": "obad", "32": "jonah", "33": "mic", "34": "nah", "35": "hab",
    "36": "zeph", "37": "hag", "38": "zech", "39": "mal",
    "40": "mat", "41": "mark", "42": "luke", "43": "john", "44": "acts",
    "45": "rom", "46": "1cor", "47": "2cor", "48": "gal", "49": "eph",
    "50": "phil", "51": "col", "52": "1thess", "53": "2thess", "54": "1tim",
    "55": "2tim", "56": "titus", "57": "philem", "58": "heb", "59": "jam",
    "60": "1pet", "61": "2pet", "62": "1jn", "63": "2jn", "64": "3jn",
    "65": "jude", "66": "rev"
}

def convert_xml_to_json():
    # Mappa létrehozása
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Mappa létrehozva: {OUTPUT_DIR}")

    print("XML elemzése... (ez eltarthat egy pillanatig)")
    with open(INPUT_FILE, 'r', encoding='utf-8-sig') as f:
        xml_content = f.read()
        root = ET.fromstring(xml_content)

        # Végigmegyünk minden könyvön
        for book in root.findall('BIBLEBOOK'):
            b_number = book.get('bnumber')

            # Megkeressük az ID-t (pl. "gen")
            if b_number not in book_mapping:
                print(f"Figyelem: Ismeretlen könyv ID: {b_number}, kihagyva.")
                continue

            book_id = book_mapping[b_number]
            print(f"Feldolgozás: {book_id}...")

            for chapter in book.findall('CHAPTER'):
                c_number = chapter.get('cnumber')

                json_content = {
                    "version_meta": {
                        "name": VERSION_NAME,
                        "lang": LANG_CODE
                    },
                    "verses": {}
                }
                for verse in chapter.findall('VERS'):
                    v_number = verse.get('vnumber')
                    words = []
                    for gr in verse.findall('gr'):
                        if gr.text:
                            words.append(gr.text)
                    
                    verse_text = " ".join(words)

                    if verse_text:
                        verse_text = verse_text.replace('\n', ' ').strip()


                        key = f"{book_id}-{c_number}-{v_number}"
                        json_content["verses"][key] = verse_text

                filename = f"{book_id}_{c_number}.json"
                filepath = os.path.join(OUTPUT_DIR, filename)

                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(json_content, f, ensure_ascii=False, indent=2)

        print("Kész! Az összes JSON fájl generálva.")

if __name__ == "__main__":
    try:
        convert_xml_to_json()
    except FileNotFoundError:
        print(f"HIBA: Nem találom a fájlt: {INPUT_FILE}")
        print("Kérlek ellenőrizd, hogy a Python script mellett van-e az XML fájl!")