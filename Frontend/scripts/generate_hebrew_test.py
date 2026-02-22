#!/usr/bin/env python3
"""
Generate `hebrew_test.json` from `StrongHebrewG.xml` using Ollama for translations.

Usage:
  python scripts/generate_hebrew_test.py \
    --xml src/assets/strongs/StrongHebrewG.xml \
    --out src/assets/strongs/hebrew_test.json \
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


def call_ollama_translate(ollama_url, model, texts, target_lang_code, batch_size=50):
    """Batch translate using Ollama.
    texts: dict of id -> {'senses': [...], 'notes_translation': str}
    returns dict of id -> {'senses_<code>': [...], 'notes_<code>': {'translation': str}}
    """
    ids = list(texts.keys())
    results = {}
    for i in range(0, len(ids), batch_size):
        batch_ids = ids[i:i+batch_size]
        payload_list = []
        for _id in batch_ids:
            payload_list.append({
                'id': _id,
                'senses': texts[_id].get('senses', []),
                'notes_translation': texts[_id].get('notes_translation','')
            })
        prompt_text = (
            f"Translate the following list of entries into {target_lang_code}. "
            "Return ONLY a JSON object mapping each id to an object with keys "
            f"\"senses_{target_lang_code}\" (array) and \"notes_{target_lang_code}\" (object with key \"translation\").\\n"
            + json.dumps({'entries': payload_list}, ensure_ascii=False)
        )
        prompt = {'role': 'user', 'content': prompt_text}
        body = {'model': model, 'messages': [prompt], 'max_tokens': 4000}
        try:
            r = requests.post(f"{ollama_url}/api/generate", json=body, timeout=120)
            r.raise_for_status()
            data = r.json()
            text = ''
            if isinstance(data, dict):
                if 'response' in data:
                    text = data['response']
                elif 'choices' in data and data['choices']:
                    text = ''.join([c.get('message', {}).get('content','') for c in data['choices']])
                else:
                    text = json.dumps(data)
            else:
                text = str(data)
            # extract JSON object
            start = text.find('{')
            end = text.rfind('}')
            parsed = {}
            if start != -1 and end != -1 and end > start:
                jtxt = text[start:end+1]
                try:
                    parsed = json.loads(jtxt)
                except Exception:
                    parsed = {}
            # Merge parsed results or fallback per-entry
            for _id in batch_ids:
                code = target_lang_code
                senses_key = f'senses_{code}'
                notes_key = f'notes_{code}'
                entry_out = {}
                if _id in parsed and isinstance(parsed[_id], dict):
                    p = parsed[_id]
                    entry_out[senses_key] = p.get(senses_key) or p.get('senses') or texts[_id].get('senses', [])
                    nt = p.get(notes_key) or p.get('notes') or {}
                    entry_out[notes_key] = {'translation': nt.get('translation') if isinstance(nt, dict) else (nt or texts[_id].get('notes_translation',''))}
                else:
                    # attempt to read top-level keys
                    entry_out[senses_key] = parsed.get(senses_key) or parsed.get('senses') or texts[_id].get('senses', [])
                    nt = parsed.get(notes_key) or parsed.get('notes') or {}
                    entry_out[notes_key] = {'translation': nt.get('translation') if isinstance(nt, dict) else (nt or texts[_id].get('notes_translation',''))}
                results[_id] = entry_out
        except Exception:
            # fallback: copy source
            for _id in batch_ids:
                results[_id] = {f'senses_{target_lang_code}': texts[_id].get('senses', []), f'notes_{target_lang_code}': {'translation': texts[_id].get('notes_translation','')}}
        time.sleep(0.5)
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xml', default='src/assets/strongs/StrongHebrewG.xml')
    ap.add_argument('--out', default='src/assets/strongs/hebrew_test.json')
    ap.add_argument('--model', required=True, help='ollama model name to use for translations')
    ap.add_argument('--ollama-url', default=None)
    ap.add_argument('--translate', action='store_true', help='call Ollama to produce HU/ES/DE translations')
    ap.add_argument('--batch-size', type=int, default=50, help='number of entries per translation batch')
    args = ap.parse_args()

    ollama_url = args.ollama_url or ('http://localhost:11434')

    print('Parsing XML...')
    entries = parse_osis(args.xml)

    # Prepare English base JSON
    out = entries.copy()

    if args.translate:
        # Prepare payloads for translation: include senses and notes.translation
        texts = {}
        for _id, item in out.items():
            texts[_id] = {
                'senses': item.get('senses', []),
                'notes_translation': item.get('notes', {}).get('translation','')
            }

        for code in ['hu','es','de']:
            print(f'Translating to {code} via Ollama model {args.model} in batches of {args.batch_size}...')
            tr = call_ollama_translate(ollama_url, args.model, texts, code, batch_size=args.batch_size)
            # merge results into out
            for _id, v in tr.items():
                out[_id].update(v)

    # write output
    print('Writing output to', args.out)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print('Done.')


if __name__ == '__main__':
    main()
