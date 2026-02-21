import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { StrongDefinition } from '../../models/strong-definition-model';

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
  private loading = false;
  private loadPromise: Promise<void> | null = null;

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

    const q = query.toLowerCase().trim();
    const results: StrongsSearchResult[] = [];

    // Search both Hebrew and Greek indices
    for (const entry of this.hebrewIndex || []) {
      if (entry.translit.toLowerCase().startsWith(q) ||
          entry.shortDef.toLowerCase().includes(q) ||
          entry.code.toLowerCase() === q) {
        results.push(entry);
        if (results.length >= maxResults) break;
      }
    }

    if (results.length < maxResults) {
      for (const entry of this.greekIndex || []) {
        if (entry.translit.toLowerCase().startsWith(q) ||
            entry.shortDef.toLowerCase().includes(q) ||
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

  /**
   * Get all verse IDs that contain a specific Strong's code in kjv_strongs.
   * Scans the full Bible text looking for {CODE} patterns.
   */
  async findVersesWithStrong(strongCode: string): Promise<string[]> {
    if (!isPlatformBrowser(this.platformId)) return [];

    // Load the full kjv_strongs text to search for Strong's codes
    const url = `${this.baseUrl}/bibleTexts/kjv_strongs.json`;
    try {
      const data = await firstValueFrom(
        this.http.get<Record<string, string>>(url)
      );

      const verseIds: string[] = [];
      const codePattern = `{${strongCode}}`;
      const codeLower = codePattern.toLowerCase();

      for (const [verseId, text] of Object.entries(data)) {
        if (text.toLowerCase().includes(codeLower)) {
          verseIds.push(verseId);
        }
      }

      return verseIds;
    } catch (err) {
      console.warn('[StrongsSearchService] Failed to load kjv_strongs text:', err);
      return [];
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.hebrewIndex && this.greekIndex) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this._loadAll();
    await this.loadPromise;
  }

  private async _loadAll(): Promise<void> {
    this.loading = true;

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
    } finally {
      this.loading = false;
    }
  }

  private async loadLanguageSummary(
    lang: 'hebrew' | 'greek',
    prefix: string
  ): Promise<StrongsSearchResult[]> {
    // Load the full summary file (e.g. /assets/strongs/hebrew.json or /assets/strongs/greek.json)
    const url = `${this.baseUrl}/strongs/${lang}.json`;
    try {
      const data = await firstValueFrom(
        this.http.get<Record<string, StrongDefinition>>(url)
      );

      const results: StrongsSearchResult[] = [];
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
