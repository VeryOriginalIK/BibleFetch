import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { StrongDefinition } from '../../models/strong-definition-model';

interface GreekSummaryEntry {
  strongs?: number;
  original_word?: string;
  transliteration?: string;
  definition?: { en?: string; hu?: string };
}

export interface StrongsSearchResult {
  code: string;        // e.g. "H1", "G26"
  lemma: string;       // Original script
  translit: string;    // English transliteration
  shortDef: string;    // Short definition
  language: 'Hebrew' | 'Greek';
}

/**
 * Service that provides search over Strong's concordance entries
 * using English transliteration. This allows users to find Hebrew,
 * Greek, and Aramaic words regardless of the current Bible translation.
 */
@Injectable({ providedIn: 'root' })
export class StrongsSearchService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  // Full index of all Strong's entries (loaded lazily)
  private hebrewIndex: StrongsSearchResult[] | null = null;
  private greekIndex: StrongsSearchResult[] | null = null;
  private loadPromise: Promise<void> | null = null;

  /** Cache for pre-generated original-language index bucket files */
  private originalLangCache = new Map<string, Record<string, string[]> | null>();
  private readonly ORIGINAL_LANG_TRANSLATION = 'asvs';

  /** Cached-load of the full bibleTexts/kjv_strongs.json (fallback only) */
  private kjvStrongsLoadPromise: Promise<Record<string, string> | null> | null = null;

  private get baseUrl(): string {
    return isPlatformBrowser(this.platformId) ? '/assets' : 'http://127.0.0.1:4200/assets';
  }

  /**
   * Search Strong's entries by transliteration prefix match.
   * Returns matching entries from both Hebrew and Greek.
   */
  async search(query: string, maxResults = 20): Promise<StrongsSearchResult[]> {
    if (!isPlatformBrowser(this.platformId)) return [];
    if (!query || query.length < 2) return [];

    await this.ensureLoaded();

    const qRaw = query.trim();
    const q = qRaw.toLowerCase();
    const qNormalized = this.normalize(qRaw);
    const results: StrongsSearchResult[] = [];

    // Search both Hebrew and Greek indices
    for (const entry of this.hebrewIndex || []) {
      const translitNormalized = this.normalize(entry.translit);
      const shortDefNormalized = this.normalize(entry.shortDef);
      if (entry.lemma.includes(qRaw) ||
          entry.translit.toLowerCase().startsWith(q) ||
          translitNormalized.startsWith(qNormalized) ||
          entry.shortDef.toLowerCase().includes(q) ||
          shortDefNormalized.includes(qNormalized) ||
          entry.code.toLowerCase() === q) {
        results.push(entry);
        if (results.length >= maxResults) break;
      }
    }

    if (results.length < maxResults) {
      for (const entry of this.greekIndex || []) {
        const translitNormalized = this.normalize(entry.translit);
        const shortDefNormalized = this.normalize(entry.shortDef);
        if (entry.lemma.includes(qRaw) ||
            entry.translit.toLowerCase().startsWith(q) ||
            translitNormalized.startsWith(qNormalized) ||
            entry.shortDef.toLowerCase().includes(q) ||
            shortDefNormalized.includes(qNormalized) ||
            entry.code.toLowerCase() === q) {
          results.push(entry);
          if (results.length >= maxResults) break;
        }
      }
    }

    // Sort: exact transliteration match first, then prefix, then definition matches
    results.sort((a, b) => {
      const aExact = a.translit.toLowerCase() === q ? 0 : 1;
      const bExact = b.translit.toLowerCase() === q ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      const aPrefix = a.translit.toLowerCase().startsWith(q) ? 0 : 1;
      const bPrefix = b.translit.toLowerCase().startsWith(q) ? 0 : 1;
      return aPrefix - bPrefix;
    });

    return results.slice(0, maxResults);
  }

  private normalize(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Get all verse IDs that contain a specific Strong's code.
   * Uses the pre-generated original-language index for fast lookup.
   * Falls back to scanning bibleTexts/kjv_strongs.json (cached) if the index is unavailable.
   */
  async findVersesWithStrong(strongCode: string): Promise<string[]> {
    if (!isPlatformBrowser(this.platformId)) return [];

    // Normalize: "H7965" → "h7965"; bucket is the first character ("h" or "g")
    const normalized = strongCode.toLowerCase().trim();
    const bucket = normalized.charAt(0) || '#';

    // 1. Try the pre-generated original-language index (instant, cached per bucket)
    const indexResult = await this.lookupOriginalLangIndex(normalized, bucket);
    if (indexResult && indexResult.length > 0) {
      return indexResult;
    }

    // 2. Fallback: scan full kjv_strongs.json (downloads once, then cached)
    return this.scanKjvStrongs(strongCode);
  }

  /** Load a bucket from the pre-generated original-language index. Returns null on failure. */
  private async lookupOriginalLangIndex(normalizedCode: string, bucket: string): Promise<string[] | null> {
    const cacheKey = `orig_${bucket}`;
    if (!this.originalLangCache.has(cacheKey)) {
      const url = `${this.baseUrl}/index/original-language/${this.ORIGINAL_LANG_TRANSLATION}/${encodeURIComponent(bucket)}.json`;
      try {
        const data = await firstValueFrom(this.http.get<Record<string, string[]>>(url));
        this.originalLangCache.set(cacheKey, data);
      } catch {
        this.originalLangCache.set(cacheKey, null);
      }
    }

    const bucketData = this.originalLangCache.get(cacheKey);
    if (!bucketData) return null;
    return bucketData[normalizedCode] ?? null;
  }

  /** Load (and cache) the full bibleTexts/kjv_strongs.json, then find verses by code pattern. */
  private async scanKjvStrongs(strongCode: string): Promise<string[]> {
    if (!this.kjvStrongsLoadPromise) {
      const url = `${this.baseUrl}/bibleTexts/kjv_strongs.json`;
      this.kjvStrongsLoadPromise = firstValueFrom(
        this.http.get<Record<string, string>>(url)
      ).catch(() => null);
    }

    const data = await this.kjvStrongsLoadPromise;
    if (!data) {
      console.warn('[StrongsSearchService] Failed to load kjv_strongs fallback text');
      return [];
    }

    const codePattern = `{${strongCode}}`.toLowerCase();
    const verseIds: string[] = [];
    for (const [verseId, text] of Object.entries(data)) {
      if (String(text).toLowerCase().includes(codePattern)) {
        verseIds.push(verseId);
      }
    }
    return verseIds;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.hebrewIndex && this.greekIndex) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this._loadAll();
    await this.loadPromise;
  }

  private async _loadAll(): Promise<void> {
    try {
      // Load Hebrew and Greek summary files
      const [hebrew, greek] = await Promise.all([
        this.loadLanguageSummary('hebrew', 'H'),
        this.loadLanguageSummary('greek', 'G'),
      ]);

      this.hebrewIndex = hebrew;
      this.greekIndex = greek;
    } catch (err) {
      console.error('[StrongsSearchService] Failed to load Strong\'s indices:', err);
      this.hebrewIndex = [];
      this.greekIndex = [];
    }
  }

  private async loadLanguageSummary(
    lang: 'hebrew' | 'greek',
    prefix: string
  ): Promise<StrongsSearchResult[]> {
    // Load the full summary file (e.g. /assets/strongs/hebrew.json or /assets/strongs/greek.json)
    const url = `${this.baseUrl}/strongs/${lang}.json`;
    try {
      const data = await firstValueFrom(this.http.get<Record<string, any>>(url));

      const results: StrongsSearchResult[] = [];
      for (const [code, raw] of Object.entries(data)) {
        if (!raw) continue;

        // Hebrew summary uses StrongDefinition-like schema
        const strongDef = raw as StrongDefinition;
        if (strongDef.translit) {
          results.push({
            code: strongDef.id || code,
            lemma: strongDef.lemma || '',
            translit: strongDef.translit || '',
            shortDef: (strongDef.defs?.en || strongDef.defs?.hu || '').substring(0, 80),
            language: lang === 'hebrew' ? 'Hebrew' : 'Greek',
          });
          continue;
        }

        // Greek summary uses { strongs, original_word, transliteration, definition }
        const greekDef = raw as GreekSummaryEntry;
        if (!greekDef.transliteration) continue;

        const greekCode = greekDef.strongs ? `${prefix}${greekDef.strongs}` : code;
        results.push({
          code: greekCode,
          lemma: greekDef.original_word || '',
          translit: greekDef.transliteration || '',
          shortDef: (greekDef.definition?.en || greekDef.definition?.hu || '').substring(0, 80),
          language: lang === 'hebrew' ? 'Hebrew' : 'Greek',
        });
      }
      return results;
    } catch {
      // Fallback: load individual chunk files
      return this.loadFromChunks(lang, prefix);
    }
  }

  private async loadFromChunks(
    lang: 'hebrew' | 'greek',
    prefix: string
  ): Promise<StrongsSearchResult[]> {
    // Determine chunk files based on known ranges
    const maxNum = lang === 'hebrew' ? 9600 : 5600;
    const blockSize = 400;
    const results: StrongsSearchResult[] = [];

    const promises: Promise<void>[] = [];

    for (let start = 1; start <= maxNum; start += blockSize) {
      const end = start + blockSize - 1;
      const url = `${this.baseUrl}/strongs/${lang}/${start}-${end}.json`;

      promises.push(
        firstValueFrom(this.http.get<Record<string, StrongDefinition>>(url))
          .then((data) => {
            for (const [code, def] of Object.entries(data)) {
              if (!def || !def.translit) continue;
              results.push({
                code: def.id || code,
                lemma: def.lemma || '',
                translit: def.translit || '',
                shortDef: (def.defs?.en || def.defs?.hu || '').substring(0, 80),
                language: lang === 'hebrew' ? 'Hebrew' : 'Greek',
              });
            }
          })
          .catch(() => {
            // Chunk doesn't exist, skip
          })
      );
    }

    await Promise.all(promises);
    return results;
  }
}
