import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StrongDefinition } from '../../models/strong-definition-model';

@Injectable({ providedIn: 'root' })
export class StrongsDataService {
  private http = inject(HttpClient);
  private cache = new Map<string, { [key: string]: StrongDefinition }>();

  async getDefinition(fullCode: string): Promise<StrongDefinition | null> {
    const { lang, num } = this.parseCode(fullCode);
    if (!lang || !num) return null;

    const filename = this.calculateChunkFileName(num);
    const cacheKey = `${lang}/${filename}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)![fullCode] || null;
    }

    const url = `/assets/strongs/${lang}/${filename}`;
    try {
      const chunk = await firstValueFrom(this.http.get<{ [key: string]: StrongDefinition }>(url));
      this.cache.set(cacheKey, chunk);
      return chunk[fullCode] || null;
    } catch {
      console.warn(`[StrongsDataService] Could not load definition for ${fullCode}`);
      return null;
    }
  }

  private parseCode(code: string): { lang: string | null; num: number } {
    const prefix = code.charAt(0).toUpperCase();
    const num = parseInt(code.substring(1), 10);
    let lang: string | null = null;
    if (prefix === 'H') lang = 'hebrew';
    else if (prefix === 'G') lang = 'greek';
    else if (prefix === 'A') lang = 'aramaic'; // Aramaic (Daniel, Ezra)
    return { lang, num };
  }

  private calculateChunkFileName(num: number): string {
    const blockSize = 400;
    const start = Math.floor((num - 1) / blockSize) * blockSize + 1;
    return `${start}-${start + blockSize - 1}.json`;
  }
}
