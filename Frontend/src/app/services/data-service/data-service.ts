import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, firstValueFrom, forkJoin } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Book } from '../../models/book-model';
import { Version } from '../../models/version-model';
import { StructureMap } from '../../models/structure-map-model';
import { VersionConfig } from '../../models/version-config-model';
import { VerseChunk } from '../../models/verse-item-model';
import { TopicSummary } from '../../models/topic-summary-model';
import { StrongDefinition } from '../../models/strong-definition-model';
import { TopicDetail } from '../../models/topic-detail-model';

@Injectable({ providedIn: 'root' })
export class BibleDataService {
  private http = inject(HttpClient);
  private readonly BASE_URL = 'assets'; // Relatív útvonal javítva (perjel nélkül biztosabb)

  // === CACHE VÁLTOZÓK ===

  // 1. Metaadatok (Könyvek, Verziók, Struktúra)
  private booksBaseCache: Book[] | null = null;
  private structuresCache: { [key: string]: StructureMap } | null = null;
  private versionsCache: { [key: string]: VersionConfig } | null = null;

  // 2. Témák (Topics)
  private topicListCache: TopicSummary[] | null = null;
  // A részleteket ID alapján tároljuk
  private topicDetailsCache = new Map<string, TopicDetail>();

  // 3. Biblia Szöveg (Chunkok) és Szótár (Strongs)
  private chunkCache = new Map<string, VerseChunk>();
  private definitionCache = new Map<string, StrongDefinition>();

  // ==========================================================
  // 1. METAADATOK BETÖLTÉSE (Változatlan)
  // ==========================================================

  private async loadMetadata(): Promise<void> {
    // Ha már minden cache-ben van, nem töltjük újra
    if (this.booksBaseCache && this.structuresCache && this.versionsCache) {
      return;
    }

    const META_URL = `${this.BASE_URL}/translations_structures`;

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
      console.error('KRITIKUS HIBA: Nem sikerült betölteni a metaadatokat!', error);
      // Fallback értékek, hogy az alkalmazás ne omoljon össze teljesen
      this.booksBaseCache = [];
      this.structuresCache = { standard: {} };
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
    const structureKey = versionConfig?.structure || 'standard';
    const structure = this.structuresCache[structureKey] || this.structuresCache['standard'];

    return this.booksBaseCache.map((book) => ({
      ...book,
      chapterCount: structure[book.id] || 0,
    }));
  }

  // ==========================================================
  // 2. BIBLIA TARTALOM (TEXT) KEZELÉSE (Változatlan)
  // ==========================================================

  private async ensureChunkLoaded(
    bookId: string,
    chapter: string,
    versionId: string
  ): Promise<VerseChunk | null> {
    const cacheKey = `${versionId}_${bookId}_${chapter}`;
    if (this.chunkCache.has(cacheKey)) return this.chunkCache.get(cacheKey)!;

    // FONTOS: Megvárjuk a metaadatokat, hogy tudjuk a helyes mappa nevet (path)
    await this.loadMetadata();

    // Mappa név keresése a configból
    const config = this.versionsCache ? this.versionsCache[versionId] : null;
    // Ha van "path" megadva a JSON-ben, azt használjuk, ha nincs, akkor az ID-t
    const folderName = config?.path || versionId;

    if (!config) {
      console.warn(`Figyelem: A verzió (${versionId}) nem található a konfigurációban.`);
    }

    const url = `${this.BASE_URL}/bibles/${folderName}/${bookId}/${chapter}.json`;

    try {
      // VerseChunk = VerseItem[] (Tömböt várunk)
      const chunk = await firstValueFrom(this.http.get<VerseChunk>(url));
      this.chunkCache.set(cacheKey, chunk);
      return chunk;
    } catch (e) {
      console.warn(`A fájl nem található: ${url}`);
      return null;
    }
  }

  /**
   * Fejezet tartalom lekérése és átalakítása UI-barát formátumra
   */
  async getChapterContent(
    bookId: string,
    chapter: string,
    version: string
  ): Promise<{ id: string; text: string }[]> {
    try {
      const chunk = await this.ensureChunkLoaded(bookId, chapter, version);

      // Ellenőrizzük, hogy valóban tömb jött-e vissza
      if (!chunk || !Array.isArray(chunk)) return [];

      return chunk.map((item) => ({
        id: `${bookId}-${chapter}-${item.v}`, // pl. "gen-1-1"
        text: item.text,
      }));
    } catch (error) {
      console.error('Hiba a fejezet feldolgozásakor:', error);
      return [];
    }
  }

  /**
   * Egy konkrét vers szövegének lekérése
   */
  async getVerseText(verseId: string, version: string): Promise<string> {
    const parts = verseId.split('-'); // pl. "gen-1-5"
    if (parts.length < 3) return '';

    const bookId = parts[0];
    const chapter = parts[1];
    const verseNum = parseInt(parts[2], 10);

    try {
      const chunk = await this.ensureChunkLoaded(bookId, chapter, version);
      if (!chunk || !Array.isArray(chunk)) return '[Hiba]';

      const verseItem = chunk.find((item) => item.v === verseNum);
      return verseItem ? verseItem.text : '[Szöveg nem elérhető]';
    } catch {
      return '[Hiba]';
    }
  }

  // ==========================================================
  // 3. TÉMÁK (TOPICS) KEZELÉSE (FRISSÍTVE: Lazy Loading)
  // ==========================================================

  /**
   * 1. FŐLISTA LEKÉRÉSE (Home oldal)
   * Csak az alap adatokat tölti be (Cím, Ikon, Kategória, Versszám)
   */
  getTopicList(): Observable<TopicSummary[]> {
    // Ha már be van töltve, ne töltsük le újra (Cache)
    if (this.topicListCache) {
      return of(this.topicListCache);
    }

    const url = `${this.BASE_URL}/topics/index.json`;
    return this.http.get<TopicSummary[]>(url).pipe(
      tap((data) => (this.topicListCache = data)),
      catchError((error) => {
        console.error('Hiba a topik lista betöltésekor:', error);
        return of([]);
      })
    );
  }

  /**
   * 2. RÉSZLETES ADATOK LEKÉRÉSE (TopicViewer oldal)
   * Ez a függvény a mappából tölti be a konkrét fájlt: assets/topics/{id}.json
   */
  async getTopicDetail(topicId: string): Promise<TopicDetail | null> {
    // 1. Cache ellenőrzés: Ha már láttuk ezt a témát, ne töltsük le újra
    if (this.topicDetailsCache.has(topicId)) {
      return this.topicDetailsCache.get(topicId)!;
    }

    // 2. URL összerakása dinamikusan
    // pl. assets/topics/creation.json
    const url = `${this.BASE_URL}/topics/${topicId}.json`;

    try {
      // Letöltjük a részletes JSON-t
      const detail = await firstValueFrom(this.http.get<TopicDetail>(url));

      // 3. Cache-eljük a jövőre nézve
      this.topicDetailsCache.set(topicId, detail);

      return detail;
    } catch (e) {
      console.error(`Nem található vagy sérült a téma fájl: ${url}`, e);
      // Ha 404 (nincs ilyen fájl), null-t adunk vissza
      return null;
    }
  }

  // ==========================================================
  // 4. STRONGS DEFINÍCIÓK (Változatlan)
  // ==========================================================

  async getDefinition(strongId: string): Promise<StrongDefinition | null> {
    if (this.definitionCache.has(strongId)) {
      return this.definitionCache.get(strongId)!;
    }

    const filename = this.getStrongFilename(strongId);
    const lang = strongId.startsWith('H') ? 'hebrew' : 'greek';
    const url = `${this.BASE_URL}/strongs/${lang}/${filename}`;

    try {
      const defs = await firstValueFrom(this.http.get<{ [key: string]: StrongDefinition }>(url));

      // Batch betöltés: mindent elmentünk a cache-be, ami a fájlban volt
      Object.values(defs).forEach((d) => this.definitionCache.set(d.id, d));

      return this.definitionCache.get(strongId) || null;
    } catch {
      console.warn(`Nem található Strong definíció: ${strongId}`);
      return null;
    }
  }

  private getStrongFilename(id: string): string {
    const type = id.charAt(0).toUpperCase();
    const num = parseInt(id.substring(1), 10);
    let bucket = 1;

    if (type === 'H') {
      bucket = Math.floor((num - 1) / 350) * 350 + 1;
    } else {
      bucket = num < 451 ? 1 : 451 + Math.floor((num - 451) / 350) * 350;
    }

    return `strongs_${type.toLowerCase()}${bucket}.json`;
  }
}
