import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError, firstValueFrom } from 'rxjs';
import { Topic } from '../../models/topic-model';
import { VerseChunk } from '../../models/verse-chunk-model';
import { StrongDefinition } from '../../models/strong-definition-model';

@Injectable({
  providedIn: 'root',
})
export class BibleDataService {
  private http = inject(HttpClient);

  // CACHE
  private chunkCache = new Map<string, VerseChunk>();
  private definitionCache = new Map<string, StrongDefinition>();
  private topicsCache: Topic[] | null = null;

  private readonly BASE_URL = '/assets';

  // --- TOPICS ---
  getTopics(): Observable<Topic[]> {
    if (this.topicsCache) return of(this.topicsCache);

    return this.http.get<Topic[]>(`${this.BASE_URL}/topics.json`).pipe(
      tap((topics) => (this.topicsCache = topics)),
      catchError((err) => {
        console.error('Hiba a témák betöltésekor:', err);
        return of([]);
      })
    );
  }

  // --- VERSEK ---
  async getVerseText(verseId: string, version: string): Promise<string> {
    const parts = verseId.split('-');
    if (parts.length < 3) return '[Hibás ID]';

    const book = parts[0];
    const chapter = parts[1];
    const chunkId = `${book}_${chapter}`;

    try {
      const chunk = await this.ensureChunkLoaded(chunkId, version);
      return chunk?.verses[verseId] || '[Vers nem található]';
    } catch (error) {
      console.error(`Hiba a vers betöltésekor (${verseId}):`, error);
      return '[Betöltési hiba]';
    }
  }

  // --- DEFINÍCIÓK (Strong's) ---
  async getDefinition(strongId: string): Promise<StrongDefinition | null> {
    // 1. Cache ellenőrzése
    if (this.definitionCache.has(strongId)) {
      return this.definitionCache.get(strongId)!;
    }

    // 2. Fájlnév és útvonal meghatározása
    const filename = this.getStrongFilename(strongId);
    const langFolder = strongId.startsWith('H') ? 'hebrew' : 'greek';
    const url = `${this.BASE_URL}/strongs/${langFolder}/${filename}`;

    try {
      // 3. A JSON betöltése (Dictionary: { "H1": {...}, "H2": {...} })
      const definitionsMap = await firstValueFrom(
        this.http.get<{ [key: string]: StrongDefinition }>(url)
      );

      // 4. A fájlban lévő ÖSSZES definíciót betesszük a cache-be
      // Így ha a H1 után a H2 kell, az már nem indít új kérést.
      Object.values(definitionsMap).forEach((def) => {
        this.definitionCache.set(def.id, def);
      });

      // 5. Visszaadjuk a kért elemet
      const result = this.definitionCache.get(strongId);
      if (!result) {
        console.warn(
          `[BibleDataService] A fájl (${filename}) betöltődött, de a '${strongId}' nincs benne.`
        );
      }
      return result || null;
    } catch (e) {
      console.warn(`Nem található definíció fájl: ${url}`, e);
      return null;
    }
  }

  // --- PRIVÁT SEGÉDFÜGGVÉNYEK ---

  private async ensureChunkLoaded(chunkId: string, version: string): Promise<VerseChunk | null> {
    const cacheKey = `${chunkId}`; // Ha több verzió lesz: `${version}/${chunkId}`
    if (this.chunkCache.has(cacheKey)) {
      return this.chunkCache.get(cacheKey)!;
    }

    const url = `${this.BASE_URL}/bible/${chunkId}.json`;
    try {
      const chunk = await firstValueFrom(this.http.get<VerseChunk>(url));
      this.chunkCache.set(cacheKey, chunk);
      return chunk;
    } catch (e) {
      throw e;
    }
  }

  /**
   * Kiszámolja, melyik JSON fájlban van az adott Strong szám.
   * A "tree.txt" alapján:
   * - Héber: 350-es lépésköz (h1, h351, h701...)
   * - Görög: g1 (450 db), utána g451-től 350-es lépésköz (g451, g801, g1151...)
   */
  private getStrongFilename(id: string): string {
    const type = id.charAt(0).toUpperCase(); // 'H' vagy 'G'
    const num = parseInt(id.substring(1), 10); // A szám (pl. 7225)

    if (isNaN(num)) return 'error.json';

    let bucket = 1;

    if (type === 'H') {
      // Héber: Tiszta matematika (350-es blokkok)
      // Pl. 1 -> 1, 350 -> 1, 351 -> 351
      bucket = Math.floor((num - 1) / 350) * 350 + 1;
      return `strongs_h${bucket}.json`;
    } else {
      // Görög: "Irregular" start
      // g1 -> 1-450 (450 db)
      // g451 -> 451-800 (350 db)
      // g801 -> 801-1150 (350 db)

      if (num < 451) {
        bucket = 1;
      } else {
        // A 451-et alapul véve számolunk 350-es blokkokat
        bucket = 451 + Math.floor((num - 451) / 350) * 350;
      }
      return `strongs_g${bucket}.json`;
    }
  }
}
