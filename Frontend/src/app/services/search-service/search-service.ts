import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';

export interface SearchResult {
  word: string;
  verseIds: string[]; // truncated preview of verse IDs (for UI previews)
  totalCount?: number; // true total occurrences for the word (may be greater than verseIds.length)
}

export interface SearchIndexManifest {
  translation: string;
  totalWords: number;
  totalVerses: number;
  buckets: { bucket: string; file: string; wordCount: number }[];
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  /** Cache of loaded buckets: translation -> bucket letter -> word map */
  private bucketCache = new Map<string, Record<string, string[]>>();

  /** Cache of which translations have a search index */
  private indexAvailabilityCache = new Map<string, boolean>();

  private get baseUrl(): string {
    return isPlatformBrowser(this.platformId) ? '/assets' : 'http://127.0.0.1:4200/assets';
  }

  /**
   * Check if a search index exists for a given translation.
   */
  async hasIndex(translation: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;
    if (this.indexAvailabilityCache.has(translation)) {
      return this.indexAvailabilityCache.get(translation)!;
    }
    const url = `${this.baseUrl}/index/search/${translation}/index.json`;
    try {
      await firstValueFrom(this.http.get(url));
      this.indexAvailabilityCache.set(translation, true);
      return true;
    } catch {
      this.indexAvailabilityCache.set(translation, false);
      return false;
    }
  }

  /**
   * Search for a word in a given translation's pregenerated index.
   * Returns matching words (prefix match) and their verse IDs.
   */
  async search(query: string, translation: string, maxResults = 200): Promise<SearchResult[]> {
    if (!isPlatformBrowser(this.platformId)) return [];
    if (!query || query.length < 2) return [];

    const normalizedQuery = query.toLowerCase().trim();
    const bucket = this.getBucket(normalizedQuery);

    // Load the bucket file
    const words = await this.loadBucket(translation, bucket);
    if (!words) return [];

    // Find exact and prefix matches
    const results: SearchResult[] = [];

    for (const [word, verseIds] of Object.entries(words)) {
      if (word === normalizedQuery || word.startsWith(normalizedQuery)) {
        results.push({ word, verseIds: verseIds.slice(0, maxResults), totalCount: verseIds.length });
      }
      if (results.length >= 50) break; // Cap word matches
    }

    // Sort: exact match first, then by number of occurrences (use totalCount when available)
    results.sort((a, b) => {
      if (a.word === normalizedQuery) return -1;
      if (b.word === normalizedQuery) return 1;
      const aCount = a.totalCount ?? a.verseIds.length;
      const bCount = b.totalCount ?? b.verseIds.length;
      return bCount - aCount;
    });

    return results;
  }

  private async loadBucket(
    translation: string,
    bucket: string
  ): Promise<Record<string, string[]> | null> {
    const cacheKey = `${translation}_${bucket}`;
    if (this.bucketCache.has(cacheKey)) return this.bucketCache.get(cacheKey)!;

    const url = `${this.baseUrl}/index/search/${translation}/${bucket}.json`;
    try {
      const data = await firstValueFrom(
        this.http.get<Record<string, string[]>>(url)
      );
      this.bucketCache.set(cacheKey, data);
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Return all verse IDs for a given word in a translation (not truncated).
   * Useful when the UI needs exact counts or to paginate through all occurrences.
   * NOTE: prefer getUniqueVerseIdsPage for paged unique-verse access.
   */
  async getAllVerseIds(word: string, translation: string): Promise<string[] | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    const bucket = this.getBucket(word.toLowerCase());
    const words = await this.loadBucket(translation, bucket);
    if (!words) return null;
    const normalized = word.toLowerCase();
    return words[normalized] ?? null;
  }

  /**
   * Smart paged endpoint for unique verse IDs. Attempts to call server `/api/search/...`.
   * Falls back to client-side bucket load + dedupe + slice if server endpoint isn't available.
   */
  async getUniqueVerseIdsPage(
    word: string,
    translation: string,
    offset = 0,
    limit = 20,
  ): Promise<{ uniqueVerseIds: string[]; totalOccurrences: number; totalUniqueVerses: number } | null> {
    const normalized = word.toLowerCase();

    // Try server API first (works when using the Node SSR server)
    const apiUrl = `/api/search/${encodeURIComponent(translation)}/${encodeURIComponent(normalized)}?offset=${offset}&limit=${limit}`;
    try {
      const resp = await firstValueFrom(this.http.get<any>(apiUrl));

      // Validate server response: reject obviously inconsistent responses so client falls back.
      if (resp && Array.isArray(resp.uniqueVerseIds)) {
        const totalOccurrences = Number(resp.totalOccurrences || 0);
        const totalUniqueVerses = Number(resp.totalUniqueVerses || resp.uniqueVerseIds.length || 0);

        const serverIsConsistent = (totalOccurrences === 0 && totalUniqueVerses === 0 && resp.uniqueVerseIds.length === 0)
          || (totalOccurrences > 0 && totalUniqueVerses > 0 && resp.uniqueVerseIds.length >= 0)
          || (resp.uniqueVerseIds.length > 0);

        if (!serverIsConsistent) {
          console.warn('[SearchService] ignoring inconsistent paged API response — falling back to client bucket', resp);
        } else {
          return {
            uniqueVerseIds: resp.uniqueVerseIds,
            totalOccurrences,
            totalUniqueVerses,
          };
        }
      }
    } catch (err) {
      // fall through to client-side fallback
      console.debug('[SearchService] paged API unavailable or failed:', err);
    }

    // Client-side fallback: load bucket and perform dedupe + slice
    if (!isPlatformBrowser(this.platformId)) return null;
    const bucket = this.getBucket(normalized);
    const words = await this.loadBucket(translation, bucket);
    if (!words) return { uniqueVerseIds: [], totalOccurrences: 0, totalUniqueVerses: 0 };

    const occurrences = words[normalized] ?? [];
    const totalOccurrences = occurrences.length;
    const uniqueMap = new Map<string, boolean>();
    for (const v of occurrences) {
      if (!uniqueMap.has(v)) uniqueMap.set(v, true);
    }
    const uniqueAll = Array.from(uniqueMap.keys());
    const totalUniqueVerses = uniqueAll.length;
    const slice = uniqueAll.slice(offset, offset + limit);
    return { uniqueVerseIds: slice, totalOccurrences, totalUniqueVerses };
  }

  private getBucket(word: string): string {
    const first = word.charAt(0);
    if (/\d/.test(first)) return '#';
    return first.toLowerCase();
  }
}
