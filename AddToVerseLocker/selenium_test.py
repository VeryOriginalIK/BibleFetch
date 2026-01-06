from gettext import translation
import dotenv
import os
import re
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


dotenv.load_dotenv()
collection = "teszt"
# --- CONFIGURATION ---
EMAIL = os.getenv('EMAIL')
PASSWORD = os.getenv('PASSWORD')

# List of verses to add
VERSES_TO_ADD = [
    "John 11:35",
    "Philippians 4:13",
    "Genesis 1:1"
]

# --- CONSTANTS ---
LOGIN_URL = "https://scripturememory.com/verselocker/login/"
ADD_URL = "https://scripturememory.com/verselocker/addverse"

def login(driver):
    print("Logging in...")
    driver.maximize_window() # Maximize to reduce overlapping
    driver.get(LOGIN_URL)
    
    wait = WebDriverWait(driver, 10)

    # 1. Fill Username/Email
    email_box = wait.until(EC.presence_of_element_located((By.NAME, "username")))
    email_box.send_keys(EMAIL)

    # 2. Fill Password
    pass_box = driver.find_element(By.NAME, "password")
    pass_box.send_keys(PASSWORD)

    # 3. MANUAL CAPTCHA PAUSE
    print("------------------------------------------------")
    print("ACTION REQUIRED: Please solve the Captcha in the browser window.")
    print("Once you see the green checkmark, click back here and PRESS ENTER.")
    print("------------------------------------------------")
    input() # The script waits here forever until you press Enter

    # 4. Click Login (Force Click via JavaScript)
    login_btn = driver.find_element(By.XPATH, "//input[contains(@value,'Login')]")
    driver.execute_script("arguments[0].click();", login_btn)
    
    print("Login clicked. Waiting for dashboard...")
    time.sleep(5)

def parse_reference(ref):
    # Splits "John 3:16" into ("John", "3", "16")
    match = re.match(r"(.+)\s+(\d+):(\d+)", ref)
    if match:
        return match.groups()
    return None, None, None

def add_single_verse(driver, full_ref):
    book, chapter, verse = parse_reference(full_ref)
    
    if not book:
        print(f"Skipping invalid format: {full_ref}")
        return

    print(f"Adding: {book} {chapter}:{verse}")
    driver.get(ADD_URL)
    wait = WebDriverWait(driver, 5)
    add_btn = driver.find_element(By.ID, "addverse")

    # 1. SELECT BOOK
    filter_box = wait.until(EC.visibility_of_element_located((By.ID, "filter")))
    filter_box.clear()
    filter_box.send_keys(book)
    time.sleep(0.1) 
    
    # Click Book Name
    book_xpath = f"//div[contains(@class, 'book-name') and normalize-space(text())='{book}']"
    driver.find_element(By.XPATH, book_xpath).click()

    # 2. SELECT CHAPTER
    wait.until(EC.visibility_of_element_located((By.ID, "chapterpicker")))
    time.sleep(0.2)
    
    chapter_xpath = f"//div[@id='chapterpicker']//div[contains(@class, 'rightword') and normalize-space(text())='{chapter}']"
    driver.find_element(By.XPATH, chapter_xpath).click()

    # 3. SELECT START VERSE
    wait.until(EC.visibility_of_element_located((By.ID, "versepicker")))
    
    verse_xpath = f"//div[@id='versepicker']//div[contains(@class, 'rightword') and normalize-space(text())='{verse}']"
    driver.find_element(By.XPATH, verse_xpath).click()

    # 4. SELECT END VERSE (FIXED)
    # Based on the HTML you shared, the single verse button has id="singleverse"
    wait.until(EC.visibility_of_element_located((By.ID, "versepicker2")))
    
    try:
        # This clicks the "Just Verse X" button
        driver.find_element(By.ID, "singleverse").click()
    except Exception as e:
        print(f"Error clicking 'Just Verse' button: {e}")

    
    # 5. Add text
    try:
        if text:
            ## Select custom translation
            translation_dropdown = wait.until(EC.element_to_be_clickable((By.NAME, "translation")))
            translation_dropdown.click()
            translation_option_xpath = f"//select[@name='translation']/option[@value='OTHER']"
            driver.find_element(By.XPATH, translation_option_xpath).click()
            ##add custom translation text
            text_field = driver.find_element(By.ID, "versetextfield")
            text_field.clear()
            text_field.send_keys(text)
            time.sleep(0.1)  # Wait for text to be processed
    except:
        ## Wait for button to enable (meaning text was fetched)
        
        for _ in range(10):
         if add_btn.is_enabled():
            break
        time.sleep(0.5)


    # 7. HANDLE COLLECTION SELECTION
    if collection:
        try:
            # Check if the "Include in Collections" toggle is ON.
            # The HTML uses a checkbox with ID 'iinp'. If it's not checked, we click the label to toggle it.
            toggle_input = driver.find_element(By.ID, "iinp")
            if not toggle_input.is_selected():
                print("Opening Collections list...")
                driver.find_element(By.XPATH, "//label[@for='iinp']").click()
                time.sleep(0.3) # Wait for animation

            # Find the checkbox/label for the specific collection name
            # We look for a <label> that contains the text 'Hit', 'Öröm', etc.
            print(f"Selecting collection: {collection}")
            collection_xpath = f"//div[@id='newtoplaylistcontainer']//label[contains(., '{collection}')]"
            driver.find_element(By.XPATH, collection_xpath).click()
            
        except Exception as e:
            print(f"Warning: Could not select collection '{collection}'. Error: {e}")



    # 8. CLICK ADD BUTTON
    
    if add_btn.is_enabled():
        add_btn.click()
        print("Success! Verse added.")
        time.sleep(0.3) # Wait for save confirmation/redirect
    else:
        print("Error: Add button never enabled (text didn't load?).")

def main():
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    try:
        login(driver)
        
        for ref in VERSES_TO_ADD:
            add_single_verse(driver, ref)
            
        print("All Done!")
        
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        time.sleep(5)
        driver.quit()

if __name__ == "__main__":
    main()