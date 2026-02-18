import { Injectable, inject, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, firstValueFrom, forkJoin, from } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { Book } from '../../models/book-model';
import { Version } from '../../models/version-model';
import { StructureMap } from '../../models/structure-map-model';
import { VersionConfig } from '../../models/version-config-model';
import { VerseChunk } from '../../models/bible-verse-model';
import { TopicSummary } from '../../models/topic-summary-model';
import { TopicDetail } from '../../models/topic-detail-model';

@Injectable({ providedIn: 'root' })
export class BibleDataService {
  private http = inject(HttpClient);
  private booksBaseCache: Book[] | null = null;
  private structuresCache: { [key: string]: StructureMap } | null = null;
  private versionsCache: { [key: string]: VersionConfig } | null = null;

  // Téma és definíció cache
  private topicListCache: TopicSummary[] | null = null;
  private topicDetailsCache = new Map<string, TopicDetail>();
  private chunkCache = new Map<string, VerseChunk>();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  // === URL KEZELÉS (A JAVÍTÁS LÉNYEGE) ===
  private get baseUrl(): string {
    if (isPlatformBrowser(this.platformId)) {
      // Böngészőben relatív útvonal
      return '/assets';
    } else {
      // SSR (Szerver) oldalon explicit IPv4 cím kell a localhost helyett
      return 'http://127.0.0.1:4200/assets';
    }
  }

  // ==========================================================
  // 1. METAADATOK BETÖLTÉSE
  // ==========================================================

  private async loadMetadata(): Promise<void> {
    if (this.booksBaseCache && this.structuresCache && this.versionsCache) {
      return;
    }

    // JAVÍTÁS: A fájl-fád alapján 'translation_structures' (egyes szám)
    const META_URL = `${this.baseUrl}/translation_structures`;

    try {
      const data = await firstValueFrom(
        forkJoin({
          books: this.http.get<Book[]>(`${META_URL}/books.json`),
          structures: this.http.get<{ [key: string]: StructureMap }>(`${META_URL}/structures.json`),
          versions: this.http.get<{ [key: string]: VersionConfig }>(`${META_URL}/versions.json`),
        })
      );

      this.booksBaseCache = data.books;
      this.structuresCache = data.structures;
      this.versionsCache = data.versions;
    } catch (error) {
      console.error(`[BibleDataService] Metaadat betöltési hiba (${META_URL}):`, error);
      // Fallback, hogy ne omoljon össze az app
      this.booksBaseCache = [];
      this.structuresCache = {};
      this.versionsCache = {};
    }
  }

  async getAvailableVersions(): Promise<Version[]> {
    await this.loadMetadata();
    if (!this.versionsCache) return [];

    return Object.entries(this.versionsCache).map(([id, config]) => ({
      id: id,
      name: config.name,
      lang: config.lang,
      structure: config.structure,
    }));
  }

  async getBooks(versionId: string): Promise<Book[]> {
    await this.loadMetadata();
    if (!this.booksBaseCache || !this.structuresCache || !this.versionsCache) return [];

    const versionConfig = this.versionsCache[versionId];
    // Ha nincs config, standard struktúrát használunk
    const structureKey = versionConfig?.structure || 'standard';
    const structure = this.structuresCache[structureKey] || this.structuresCache['standard'] || {};

    return this.booksBaseCache.map((book) => ({
      ...book,
      chapterCount: structure[book.id] || 0,
    }));
  }

  // ==========================================================
  // 2. BIBLIA TARTALOM (Chunk loading)
  // ==========================================================

  private async ensureChunkLoaded(
    bookId: string,
    chapter: string,
    versionId: string
  ): Promise<VerseChunk | null> {
    const cacheKey = `${versionId}_${bookId}_${chapter}`;
    if (this.chunkCache.has(cacheKey)) return this.chunkCache.get(cacheKey)!;

    await this.loadMetadata();

    const config = this.versionsCache ? this.versionsCache[versionId] : null;
    const folderName = config?.path || versionId;

    // Server-side: read JSON directly from disk so SSG/SSR can pre-render content.
    if (!isPlatformBrowser(this.platformId)) {
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');

        // Try production build location first, then source assets (dev)
        const candidates = [
          path.join(process.cwd(), 'dist', 'frontend', 'browser', 'assets', 'bibles', folderName, bookId, `${chapter}.json`),
          path.join(process.cwd(), 'src', 'assets', 'bibles', folderName, bookId, `${chapter}.json`),
        ];

        for (const p of candidates) {
          try {
            const raw = await fs.readFile(p, 'utf-8');
            const chunk = JSON.parse(raw);
            this.chunkCache.set(cacheKey, chunk);
            console.debug('[Server] Loaded chunk from disk:', p);
            return chunk;
          } catch {
            // continue to next candidate
          }
        }

        // Not found on disk — return null to keep behavior safe for server.
        console.warn(`[Server] chunk file not found for ${folderName}/${bookId}/${chapter}`);
        return null;
      } catch (err) {
        console.error('[Server] failed to read chunk from disk', err);
        return null;
      }
    }

    // Browser: load via HTTP from the assets folder
    const url = `${this.baseUrl}/bibles/${folderName}/${bookId}/${chapter}.json`;
    console.debug(`[DataService] Loading verse chunk from: ${url}`);

    try {
      const chunk = await firstValueFrom(this.http.get<VerseChunk>(url));
      if (!chunk || !Array.isArray(chunk)) {
        console.warn('[DataService] Invalid chunk response (not an array):', url, chunk);
        return null;
      }
      this.chunkCache.set(cacheKey, chunk);
      console.debug(`[DataService] Successfully cached ${chunk.length} verses for ${versionId}/${bookId}/${chapter}`);
      return chunk;
    } catch (e) {
      console.error('[DataService] Failed to load chapter', url, e);
      return null;
    }
  }

  // ReaderComponent számára (Observable wrapper)
  getChapter(versionId: string, bookId: string, chapter: string | number): Observable<any[]> {
    return from(
      this.ensureChunkLoaded(bookId, chapter.toString(), versionId).then((chunk) => chunk || [])
    );
  }

  // Szöveg kinyerése fejezetenként
  async getChapterContent(
    bookId: string,
    chapter: string,
    version: string
  ): Promise<{ id: string; text: string }[]> {
    try {
      const chunk = await this.ensureChunkLoaded(bookId, chapter, version);
      if (!chunk || !Array.isArray(chunk)) return [];
      return chunk.map((item) => ({
        id: `${bookId}-${chapter}-${item.v}`,
        text: item.text,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Parse a verse reference string into its components.
   * Handles both single ("gen-1-1") and span ("exo-3-14-15") formats.
   */
  parseVerseRef(verseId: string): { bookId: string; chapter: string; verseStart: number; verseEnd: number } | null {
    const parts = verseId.split('-');
    if (parts.length < 3 || parts.length > 4) return null;

    const bookId = parts[0];
    const chapter = parts[1];
    const verseStart = parseInt(parts[2], 10);
    const verseEnd = parts.length === 4 ? parseInt(parts[3], 10) : verseStart;

    if (isNaN(verseStart) || isNaN(verseEnd)) return null;
    return { bookId, chapter, verseStart, verseEnd };
  }

  /**
   * Get text for a single verse or a verse range.
   * Supports both "gen-1-1" (single) and "exo-3-14-15" (range) formats.
   */
  async getVerseText(verseId: string, version: string): Promise<string> {
    const ref = this.parseVerseRef(verseId);
    if (!ref) {
      console.warn('[DataService] Failed to parse verseId:', verseId);
      return '';
    }

    try {
      const chunk = await this.ensureChunkLoaded(ref.bookId, ref.chapter, version);
      if (!chunk) {
        console.warn('[DataService] No chunk loaded for:', ref.bookId, ref.chapter, version);
        return '';
      }

      if (ref.verseStart === ref.verseEnd) {
        const verseItem = chunk.find((item) => item.v === ref.verseStart);
        const text = verseItem ? verseItem.text : '';
        if (!text) {
          console.warn('[DataService] Verse not found in chunk:', verseId, 'chunk size:', chunk.length);
        }
        return text;
      }

      // Range: collect all verses in the span
      const verses = chunk
        .filter((item) => item.v >= ref.verseStart && item.v <= ref.verseEnd)
        .sort((a, b) => a.v - b.v);
      return verses.map((v) => v.text).join(' ');
    } catch {
      return '';
    }
  }

  /**
   * Get structured verse data for a reference (single or range).
   * Returns individual verse objects with their numbers.
   */
  async getVerseRange(
    verseId: string,
    version: string
  ): Promise<{ id: string; v: number; text: string }[]> {
    const ref = this.parseVerseRef(verseId);
    if (!ref) return [];

    try {
      const chunk = await this.ensureChunkLoaded(ref.bookId, ref.chapter, version);
      if (!chunk) return [];

      return chunk
        .filter((item) => item.v >= ref.verseStart && item.v <= ref.verseEnd)
        .sort((a, b) => a.v - b.v)
        .map((item) => ({
          id: `${ref.bookId}-${ref.chapter}-${item.v}`,
          v: item.v,
          text: item.text,
        }));
    } catch {
      return [];
    }
  }

  // ==========================================================
  // 3. TÉMÁK (Topics) - Eredeti funkcionalitás
  // ==========================================================

  getTopicList(): Observable<TopicSummary[]> {
    if (this.topicListCache) return of(this.topicListCache);

    const url = `${this.baseUrl}/topics/index.json`;
    return this.http.get<TopicSummary[]>(url).pipe(
      tap((data) => (this.topicListCache = data)),
      catchError((err) => {
        console.error('Hiba a témák betöltésekor:', err);
        return of([]);
      })
    );
  }

  async getTopicDetail(topicId: string): Promise<TopicDetail | null> {
    if (this.topicDetailsCache.has(topicId)) return this.topicDetailsCache.get(topicId)!;

    const url = `${this.baseUrl}/topics/${topicId}.json`;
    try {
      const detail = await firstValueFrom(this.http.get<TopicDetail>(url));
      this.topicDetailsCache.set(topicId, detail);
      return detail;
    } catch (err) {
      console.error(`Téma részletek nem találhatók: ${topicId}`, err);
      return null;
    }
  }
}
