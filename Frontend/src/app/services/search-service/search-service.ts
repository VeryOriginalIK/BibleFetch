import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';

export interface SearchResult {
  word: string;
  verseIds: string[];
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
        results.push({ word, verseIds: verseIds.slice(0, maxResults) });
      }
      if (results.length >= 50) break; // Cap word matches
    }

    // Sort: exact match first, then by number of occurrences
    results.sort((a, b) => {
      if (a.word === normalizedQuery) return -1;
      if (b.word === normalizedQuery) return 1;
      return b.verseIds.length - a.verseIds.length;
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

  private getBucket(word: string): string {
    const first = word.charAt(0);
    if (/\d/.test(first)) return '#';
    return first.toLowerCase();
  }
}
