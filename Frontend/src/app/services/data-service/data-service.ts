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
import { StrongDefinition } from '../../models/strong-definition-model';
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
  private definitionCache = new Map<string, StrongDefinition>();

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
    // === 1. JAVÍTÁS: SZERVER VÉDELEM ===
    // Ha szerver oldalon vagyunk (SSR), azonnal kilépünk.
    // Ezzel megszűnik a "fetch failed" és "ECONNREFUSED" hiba.
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    console.log(`[Browser] Kérés indítása: ${versionId}/${bookId}/${chapter}`);

    const cacheKey = `${versionId}_${bookId}_${chapter}`;
    if (this.chunkCache.has(cacheKey)) return this.chunkCache.get(cacheKey)!;

    await this.loadMetadata();

    const config = this.versionsCache ? this.versionsCache[versionId] : null;
    const folderName = config?.path || versionId;

    // Útvonal: assets/bibles/{verzio}/{konyv}/{fejezet}.json
    const url = `${this.baseUrl}/bibles/${folderName}/${bookId}/${chapter}.json`;

    try {
      const chunk = await firstValueFrom(this.http.get<VerseChunk>(url));
      this.chunkCache.set(cacheKey, chunk);
      return chunk;
    } catch (e) {
      // Csendesítjük a hibát, hogy ne szemetelje tele a konzolt, ha még nincs kész a fájl
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

  // Egy konkrét vers szövege
  async getVerseText(verseId: string, version: string): Promise<string> {
    const parts = verseId.split('-');
    if (parts.length < 3) return '';
    try {
      const chunk = await this.ensureChunkLoaded(parts[0], parts[1], version);
      const verseItem = chunk?.find((item) => item.v === parseInt(parts[2], 10));
      return verseItem ? verseItem.text : '';
    } catch {
      return '';
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

  // ==========================================================
  // 4. STRONGS DEFINÍCIÓK - Eredeti funkcionalitás
  // ==========================================================

  async getDefinition(strongId: string): Promise<StrongDefinition | null> {
    if (this.definitionCache.has(strongId)) return this.definitionCache.get(strongId)!;

    // A fájl-fa alapján a definíciók itt vannak: assets/index/strongs/G1.json
    // A logika feltételezi, hogy minden definíció külön fájlban van, VAGY a fájlnevek a strong ID-k.
    const url = `${this.baseUrl}/index/strongs/${strongId}.json`;

    try {
      // Megpróbáljuk betölteni a specifikus JSON-t
      const def = await firstValueFrom(this.http.get<StrongDefinition>(url));
      this.definitionCache.set(strongId, def);
      return def;
    } catch (err) {
      console.warn(`Strong definíció nem található: ${strongId} (${url})`);
      return null;
    }
  }
}
