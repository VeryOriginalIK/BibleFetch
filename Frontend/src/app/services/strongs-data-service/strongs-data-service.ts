import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StrongDefinition } from '../../models/strong-definition-model';

@Injectable({
  providedIn: 'root'
})
export class StrongsDataService {
  private http = inject(HttpClient);

  // Cache
  private cache = new Map<string, { [key: string]: StrongDefinition }>();

  constructor() {}

  async getDefinition(fullCode: string): Promise<StrongDefinition | null> {
    const { lang, num } = this.parseCode(fullCode);

    if (!lang || !num) return null;

    const filename = this.calculateChunkFileName(num);
    const cacheKey = `${lang}/${filename}`;

    // Ha már megvan a cache-ben
    if (this.cache.has(cacheKey)) {
      const chunk = this.cache.get(cacheKey)!;
      // FONTOS JAVÍTÁS: A te JSON-odban a kulcs "H1" és nem "1",
      // ezért a fullCode-ot használjuk a kereséshez!
      return chunk[fullCode] || null;
    }

    const url = `/assets/strongs/${lang}/${filename}`;

    try {
      const chunk = await firstValueFrom(this.http.get<{ [key: string]: StrongDefinition }>(url));
      this.cache.set(cacheKey, chunk);

      // FONTOS JAVÍTÁS: Itt is fullCode kell
      return chunk[fullCode] || null;
    } catch (error) {
      console.warn(`Hiba a betöltésnél: ${fullCode} -> ${url}`);
      return null;
    }
  }

  private parseCode(code: string): { lang: string | null, num: number } {
    const prefix = code.charAt(0).toUpperCase();
    const numStr = code.substring(1);
    const num = parseInt(numStr, 10); // A zárójeleket már levágtuk a komponensben

    let lang = null;
    if (prefix === 'H') lang = 'hebrew';
    if (prefix === 'G') lang = 'greek';

    return { lang, num };
  }

  private calculateChunkFileName(num: number): string {
    const blockSize = 400;
    const blockIndex = Math.floor((num - 1) / blockSize);
    const start = blockIndex * blockSize + 1;
    const end = start + blockSize - 1;
    return `${start}-${end}.json`;
  }
}
