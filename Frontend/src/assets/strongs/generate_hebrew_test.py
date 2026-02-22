#!/usr/bin/env python3
"""
Generate `hebrew_test.json` from `StrongHebrewG.xml` using Ollama for translations.

Usage:
    python scripts/generate_hebrew_test.py \
        --xml StrongHebrewG.xml \
        --out hebrew_test.json \
        --model <ollama-model-name>

Environment:
  OLLAMA_URL (optional) - default: http://localhost:11434

Notes:
  - Requires `requests` and `lxml` (pip install requests lxml)
  - Ollama must be running locally and the model must be available.
  - The script first builds English JSON for every <div type="entry"> then (optionally)
    calls Ollama to produce `senses_<lang>` and `notes_<lang>.translation` for hu/es/de.
"""

import argparse
import json
import time
import requests
import os
from collections import defaultdict
from lxml import etree


def parse_osis(xml_path):
    ns = { 'osis': 'http://www.bibletechnologies.net/2003/OSIS/namespace' }
    parser = etree.XMLParser(remove_comments=True, recover=True)
    tree = etree.parse(xml_path, parser)
    root = tree.getroot()
    entries = {}
    for entry in root.findall('.//{http://www.bibletechnologies.net/2003/OSIS/namespace}div[@type="entry"]'):
        n = entry.get('n')
        obj = {}
        # primary <w>
        w = entry.find('{http://www.bibletechnologies.net/2003/OSIS/namespace}w')
        if w is not None:
            obj['id'] = w.get('ID') or f'H{n}'
            obj['n'] = n
            obj['lemma'] = w.get('lemma')
            obj['xlit'] = w.get('xlit')
            obj['gloss'] = w.get('gloss')
            obj['morph'] = w.get('morph')
            obj['POS'] = w.get('POS')
            obj['lang'] = w.get('{http://www.w3.org/XML/1998/namespace}lang')
            obj['word'] = (w.text or '').strip()
        else:
            obj['id'] = f'H{n}'
            obj['n'] = n
        # foreign grc
        foreign = {}
        fr = entry.find('{http://www.bibletechnologies.net/2003/OSIS/namespace}foreign')
        if fr is not None:
            lang = fr.get('{http://www.w3.org/XML/1998/namespace}lang') or 'grc'
            foreign[lang] = [x.get('gloss') for x in fr.findall('{http://www.bibletechnologies.net/2003/OSIS/namespace}w') if x.get('gloss')]
            if foreign[lang]:
                obj['foreign'] = foreign
        # list -> senses
        senses = []
        lst = entry.find('{http://www.bibletechnologies.net/2003/OSIS/namespace}list')
        if lst is not None:
            for item in lst.findall('{http://www.bibletechnologies.net/2003/OSIS/namespace}item'):
                text = ''.join(item.itertext()).strip()
                if text:
                    senses.append(text)
        if senses:
            obj['senses'] = senses
        # notes grouped by @type
        notes = defaultdict(list)
        for note in entry.findall('{http://www.bibletechnologies.net/2003/OSIS/namespace}note'):
            t = note.get('type') or 'note'
            text = ''.join(note.itertext()).strip()
            if text:
                notes[t].append(text)
        if notes:
            obj['notes'] = dict(notes)
            # canonicalize translation note as single string if exists
            if 'translation' in obj['notes']:
                # join multiple translation notes with space
                obj['notes']['translation'] = ' '.join(obj['notes']['translation'])
        entries[obj['id'] or f'H{n}'] = obj
    return entries


def call_ollama_translate(ollama_url, model, texts, target_lang_code, out=None, out_path=None):
    """texts: dict of id -> {'senses': [...], 'notes_translation': str}
       returns dict of id -> {'senses_<code>': [...], 'notes_<code>': {'translation': str}}
    """
    results = {}
    processed_count = 0
    for _id, payload in texts.items():
        # Construct a compact prompt asking for JSON output only
        prompt = {
            'role': 'user',
            'content': (
                f"Translate the following into {target_lang_code} (only return JSON):\\n"
                f"{{\n  \"senses\": {json.dumps(payload.get('senses', []), ensure_ascii=False)},\n  \"notes_translation\": {json.dumps(payload.get('notes_translation',''), ensure_ascii=False)}\n}}\n"
                "Return a JSON object with keys: \"senses_<code>\" (array) and \"notes_<code>\" (object with key \"translation\")."
            )
        }
        # Some Ollama models expect a simple `prompt` string rather than `messages`.
        prompt_content = prompt['content']
        body = {
            'model': model,
            'prompt': prompt_content,
            'max_tokens': 1000,
        }
        try:
            r = requests.post(f"{ollama_url}/api/generate", json=body, timeout=60)
            # log non-200 for diagnostics
            if r.status_code != 200:
                print(f"  Ollama HTTP {r.status_code} for id={_id}; response: {r.text[:200]}")
            r.raise_for_status()
            data = r.json()
            # Ollama returns 'response' streaming or 'choices' depending on model; try to extract text
            text = ''
            if isinstance(data, dict):
                # new API shape: data.get('result') or data.get('content')
                if 'response' in data:
                    text = data['response']
                elif 'choices' in data and data['choices']:
                    parts = []
                    for c in data['choices']:
                        # handle several possible keys depending on Ollama/model
                        parts.append(c.get('content') or c.get('text') or c.get('message', {}).get('content',''))
                    text = ''.join([p for p in parts if p])
                else:
                    text = json.dumps(data)
            else:
                text = str(data)
            # attempt to find first JSON object in response
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1 and end > start:
                jtxt = text[start:end+1]
                try:
                    parsed = json.loads(jtxt)
                except Exception:
                    parsed = {}
            else:
                parsed = {}
            # Normalize keys
            code = target_lang_code
            senses_key = f'senses_{code}'
            notes_key = f'notes_{code}'
            res_out = {}
            if senses_key in parsed:
                res_out[senses_key] = parsed[senses_key]
            elif 'senses' in parsed:
                res_out[senses_key] = parsed['senses']
            else:
                res_out[senses_key] = payload.get('senses', [])
            if notes_key in parsed and isinstance(parsed[notes_key], dict):
                res_out[notes_key] = parsed[notes_key]
            elif 'notes' in parsed and isinstance(parsed['notes'], dict):
                res_out[notes_key] = parsed['notes']
            else:
                res_out[notes_key] = {'translation': parsed.get('translation') or payload.get('notes_translation','')}
            results[_id] = res_out
            # Merge into provided out dict (for in-memory tracking)
            if out is not None:
                out.setdefault(_id, {})
                out[_id].update(res_out)
            processed_count += 1
            # periodic progress logging and save every 10 entries
            if processed_count % 10 == 0:
                if out_path:
                    try:
                        tmp = out_path + '.tmp'
                        with open(tmp, 'w', encoding='utf-8') as wf:
                            json.dump(out, wf, ensure_ascii=False, indent=2)
                        os.replace(tmp, out_path)
                        print(f'  ... processed {processed_count} entries — saved to {out_path}')
                    except Exception as e:
                        print(f'  ... processed {processed_count} entries — save failed: {e}')
                else:
                    print(f'  ... processed {processed_count} entries')
        except Exception as e:
            # on error, fall back to copying source
            fallback = {f"senses_{target_lang_code}": payload.get('senses', []), f"notes_{target_lang_code}": {'translation': payload.get('notes_translation','')}}
            results[_id] = fallback
            if out is not None:
                out.setdefault(_id, {})
                out[_id].update(fallback)
            processed_count += 1
            if processed_count % 10 == 0:
                if out_path:
                    try:
                        tmp = out_path + '.tmp'
                        with open(tmp, 'w', encoding='utf-8') as wf:
                            json.dump(out, wf, ensure_ascii=False, indent=2)
                        os.replace(tmp, out_path)
                        print(f'  ... processed {processed_count} entries (with errors) — saved to {out_path}')
                    except Exception as e2:
                        print(f'  ... processed {processed_count} entries (with errors) — save failed: {e2}')
                else:
                    print(f'  ... processed {processed_count} entries (with errors)')
        time.sleep(0.1)
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xml', default='StrongHebrewG.xml')
    ap.add_argument('--out', default='hebrew_test.json')
    ap.add_argument('--model', required=True, help='ollama model name to use for translations')
    ap.add_argument('--ollama-url', default=None)
    ap.add_argument('--translate', action='store_true', help='call Ollama to produce HU/ES/DE translations')
    args = ap.parse_args()

    ollama_url = args.ollama_url or ('http://localhost:11434')

    def wait_for_ollama(url, timeout=60, interval=2):
        """Wait for Ollama to respond on common endpoints. Returns True if up."""
        import time as _t
        deadline = time.time() + timeout
        endpoints = ['/', '/api/status', '/api/models', '/api/generate']
        while time.time() < deadline:
            for ep in endpoints:
                try:
                    r = requests.get(url.rstrip('/') + ep, timeout=5)
                    # 200 or 405/401/403 mean the service is responding
                    if r.status_code in (200, 401, 403, 405):
                        return True
                except Exception:
                    pass
            print(f'Waiting for Ollama at {url}...')
            _t.sleep(interval)
        return False

    # Check Ollama before attempting translations
    if args.translate:
        print(f'Checking Ollama at {ollama_url}...')
        ok = wait_for_ollama(ollama_url, timeout=30, interval=2)
        if not ok:
            print(f'Warning: Ollama not reachable at {ollama_url}. Translations may fail (404/page not found).')
        else:
            # debug: list models via API
            try:
                resp = requests.get(f"{ollama_url.rstrip('/')}/api/models", timeout=10)
                print(f"API /api/models status {resp.status_code}")
                try:
                    models_data = resp.json()
                    print("API models response:", models_data)
                except Exception as ex:
                    print("Could not parse models JSON:", ex, resp.text)
            except Exception as ex:
                print("Error querying /api/models:", ex)

    print('Parsing XML...')
    
    entries = parse_osis(args.xml)

    print(f'Parsed {len(entries)} entries from XML')

    # Prepare English base JSON
    out = entries.copy()

    # Write English base first (atomic write)
    print(f'Writing English base to {args.out}...')
    tmp_path = args.out + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    try:
        os.replace(tmp_path, args.out)
    except Exception as e:
        print(f'Warning: could not atomically replace {args.out}: {e}')

    if args.translate:
        # Prepare payloads for translation: include senses and notes.translation
        texts = {}
        for _id, item in out.items():
            texts[_id] = {
                'senses': item.get('senses', []),
                'notes_translation': item.get('notes', {}).get('translation','')
            }

        for code in ['hu','es','de']:
            print(f'Translating to {code} via Ollama model {args.model}...')
            tr = call_ollama_translate(ollama_url, args.model, texts, code, out=out, out_path=args.out)
            # Merge results into out
            for _id, v in tr.items():
                out[_id].update(v)

        # Ensure keys for each target language exist for every entry
        for _id, item in out.items():
            for code in ['hu', 'es', 'de']:
                s_key = f'senses_{code}'
                n_key = f'notes_{code}'
                if s_key not in item:
                    item[s_key] = texts.get(_id, {}).get('senses', [])
                if n_key not in item:
                    item[n_key] = { 'translation': texts.get(_id, {}).get('notes_translation','') }

        # Final write after all translations
        print(f'Writing complete output with translations to {args.out}...')
        tmp_path = args.out + '.tmp'
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        try:
            os.replace(tmp_path, args.out)
        except Exception as e:
            print(f'Warning: could not atomically replace {args.out}: {e}')

    print('Done.')


if __name__ == '__main__':
    main()
