from hmac import new
import os
import xml.etree.ElementTree as ET
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import dotenv

# --- CONFIGURATION ---
dotenv.load_dotenv()
EMAIL = os.getenv('EMAIL')
PASSWORD = os.getenv('PASSWORD')
XML_FILE = "SF_2005-03-10_HUN_HUNUJ_(MAGYAR ÚJFORDÍTÁSÚ BIBLIA).xml"
BATCH_SIZE = 6

# *** LIST THE BOOKS YOU WANT TO ADD HERE ***
BOOKS_TO_PROCESS = [
    "Revelation",
]

# Mapping English Book names to XML names
BOOK_MAP = {
    "Proverbs": "Példabeszédek",
    "Genesis": "1 Mózes", "Exodus": "2 Mózes", "Leviticus": "3 Mózes", "Numbers": "4 Mózes", "Deuteronomy": "5 Mózes",
    "Joshua": "Józsué", "Judges": "Bírák", "Ruth": "Ruth", "1 Samuel": "1 Sámuel", "2 Samuel": "2 Sámuel",
    "1 Kings": "1 Királyok", "2 Kings": "2 Királyok", "1 Chronicles": "1 Krónikák", "2 Chronicles": "2 Krónika",
    "Ezra": "Ezsdrás", "Nehemiah": "Nehemiás", "Esther": "Eszter", "Job": "Jób", "Psalm": "Zsoltárok", "Psalm": "Zsoltárok",
    "Ecclesiastes": "Prédikátor", "Song of Solomon": "Énekek éneke", "Isaiah": "Ézsaiás",
    "Jeremiah": "Jeremiás", "Lamentations": "Jeremiás siralmai", "Ezekiel": "Ezékiel", "Daniel": "Dániel", "Hosea": "Hóseás",
    "Joel": "Jóel", "Amos": "Ámósz", "Obadiah": "Abdiás", "Jonah": "Jónás", "Micah": "Mikeás", "Nahum": "Náhum",
    "Habakkuk": "Habakuk", "Zephaniah": "Zofóniás", "Haggai": "Haggeus", "Zechariah": "Zakariás", "Malachi": "Malakiás",
    "Matthew": "Máté", "Mark": "Márk", "Luke": "Lukács", "John": "János", "Acts": "Apostolok cselekedetei",
    "Romans": "Rómaiakhoz", "1 Corinthians": "1 Korintusi", "2 Corinthians": "2 Korintusi", "Galatians": "Galatákhoz",
    "Ephesians": "Efézusiakhoz", "Philippians": "Filippiekhez", "Colossians": "Kolosséiakhoz", "1 Thessalonians": "1 Thesszalonika",
    "2 Thessalonians": "2 Thesszalonika", "1 Timothy": "1 Timóteushoz", "2 Timothy": "2 Timóteushoz", "Titus": "Tituszhoz",
    "Philemon": "Filemonhoz", "Hebrews": "Zsidókhoz", "James": "Jakab", "1 Peter": "1 Péter", "2 Peter": "2 Péter",
    "1 John": "1 János", "2 John": "2 János", "3 John": "3 János", "Jude": "Júdás", "Revelation": "Jelenések"
}

class BibleIndexer:
    def __init__(self, xml_path):
        print(f"Loading and indexing XML: {xml_path}...")
        self.data = {}
        try:
            tree = ET.parse(xml_path)
            for book in tree.findall("BIBLEBOOK"):
                b_name = book.get("bname")
                self.data[b_name] = {}
                for chap in book.findall("CHAPTER"):
                    c_num = int(chap.get("cnumber"))
                    self.data[b_name][c_num] = {}
                    for verse in chap.findall("VERS"):
                        v_num = int(verse.get("vnumber"))
                        if verse.text:
                            self.data[b_name][c_num][v_num] = verse.text.strip()
            print("Indexing complete.")
        except Exception as e:
            print(f"CRITICAL ERROR loading XML: {e}")

    def get_text_for_range(self, book_hu, chapter, start, end):
        texts = []
        chap_data = self.data.get(book_hu, {}).get(chapter, {})
        for v in range(start, end + 1):
            if v in chap_data:
                texts.append(f"{v} {chap_data[v]}")
        return " ".join(texts) if texts else None

    def generate_batches_for_book(self, book_en, batch_size):
        book_hu = BOOK_MAP.get(book_en, book_en)
        batches = []
        
        if book_hu not in self.data:
            print(f"Book '{book_hu}' not found in XML.")
            return []

        for chap_num in sorted(self.data[book_hu].keys()):
            verses = sorted(self.data[book_hu][chap_num].keys())
            if not verses: continue
            
            total_verses = len(verses)
            for i in range(0, total_verses, batch_size):
                chunk = verses[i : i + batch_size]
                
                # If remaining verses < batch_size, add them to this chunk
                if 0 < (total_verses - (i + batch_size)) < batch_size:
                    chunk = verses[i:] 
                    start_v = chunk[0]
                    end_v = chunk[-1]
                    batches.append((book_en, chap_num, start_v, end_v))
                    break 
                
                start_v = chunk[0]
                end_v = chunk[-1]
                batches.append((book_en, chap_num, start_v, end_v))

        return batches

def click_list_item(wait, container_id, item_text):
    xpath = f"//div[@id='{container_id}']//div[contains(@class, 'rightword') and normalize-space(text())='{item_text}']"
    wait.until(EC.element_to_be_clickable((By.XPATH, xpath))).click()

def main():
    bible = BibleIndexer(XML_FILE)
    
    # 1. SETUP BROWSER
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service)
    wait = WebDriverWait(driver, 10)

    try:
        # 2. LOGIN
        driver.maximize_window()
        driver.get("https://scripturememory.com/verselocker/login/")
        wait.until(EC.presence_of_element_located((By.NAME, "username"))).send_keys(EMAIL)
        driver.find_element(By.NAME, "password").send_keys(PASSWORD)

        print("\n" + "="*50)
        print(" PAUSED: SOLVE CAPTCHA & PRESS ENTER HERE")
        print("="*50 + "\n")
        input() 

        driver.find_element(By.CSS_SELECTOR, "input[value*='Login']").click()
        wait.until(EC.url_contains("dashboard"))

        # 3. PROCESS EACH BOOK IN THE LIST
        for current_book in BOOKS_TO_PROCESS:
            print(f"--- Processing Book: {current_book} ---")
            
            # Generate all batches for this book
            upload_queue = bible.generate_batches_for_book(current_book, BATCH_SIZE)
            print(f"Found {len(upload_queue)} batches for {current_book}.")

            for (book_en, chap, start_v, end_v) in upload_queue:
                book_hu = BOOK_MAP.get(book_en, book_en)
                text_content = bible.get_text_for_range(book_hu, chap, start_v, end_v)
                
                if not text_content: continue

                # Define the Collection Name for the website (Book + Chapter)
                playlist_name = f"{book_hu} {chap}"

                print(f"Uploading: {book_en} {chap}:{start_v}-{end_v} -> Playlist: '{playlist_name}'")
                
                driver.get("https://scripturememory.com/verselocker/addverse")
                
                # A. Select Book
                f_box = wait.until(EC.visibility_of_element_located((By.ID, "filter")))
                f_box.clear()
                f_box.send_keys(book_en)
                book_xpath = f"//div[contains(@class,'book-name') and normalize-space(text())='{book_en}']"
                wait.until(EC.element_to_be_clickable((By.XPATH, book_xpath))).click()

                # B. Select Chapter & Verses
                click_list_item(wait, "chapterpicker", chap)
                click_list_item(wait, "versepicker", start_v)
                
                wait.until(EC.visibility_of_element_located((By.ID, "versepicker2")))
                if start_v == end_v:
                    driver.find_element(By.ID, "singleverse").click()
                else:
                    click_list_item(wait, "versepicker2", end_v)

                # C. Enter Text
                try:
                    trans_select = wait.until(EC.element_to_be_clickable((By.NAME, "translation")))
                    wait.until(EC.visibility_of_element_located((By.ID,"doneimporting")))
                    Select(trans_select).select_by_value("OTHER")
                    txt_field = wait.until(EC.visibility_of_element_located((By.ID, "versetextfield")))
                    txt_field.clear()
                    txt_field.send_keys(text_content)
                except Exception:
                    print("  -> Error entering text.")
                    continue

                # D. Select/Create Collection (Playlist)
                try:
                    # Open the dropdown
                    chk = driver.find_element(By.ID, "iinp")
                    if not chk.is_selected():
                        driver.find_element(By.CSS_SELECTOR, "label[for='iinp']").click()
                        wait.until(EC.visibility_of_element_located((By.ID, "newtoplaylistcontainer")))

                    # Try to click existing collection
                    coll_xpath = f"//div[@id='newtoplaylistcontainer']//label[contains(., '{playlist_name}')]"
                    try:
                        driver.find_element(By.XPATH, coll_xpath).click()
                    except Exception:
                        # If not found, create it
                        print(f"  -> Creating new playlist: '{playlist_name}'")
                        try:
                            # Note: Adjust ID if 'newplaylistname' is incorrect on live site
                            new_collection_btn = driver.find_element(By.ID, "activate_creator")
                            new_collection_btn.click()
                            time.sleep(0.1)
                            new_input = driver.find_element(By.ID, "newItemInput") 
                            new_input.clear()
                            new_input.send_keys(playlist_name)
                            new_input.send_keys("\n")
                            time.sleep(1.5) # Wait for ajax save

                        except:
                            print("  -> Failed to create playlist. Proceeding without it.")

                except Exception as e:
                    print(f"  -> Collection selection error: {e}")

                # E. Save
                save_btn = driver.find_element(By.ID, "addverse")
                wait.until(lambda d: save_btn.is_enabled())
                save_btn.click()

    except Exception as e:
        print(f"Error: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    main()