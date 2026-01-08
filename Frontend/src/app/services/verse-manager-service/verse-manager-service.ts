import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class VerseManagerService {
  private readonly STORAGE_KEY = 'user_hidden_verses';

  // Reaktív állapot: a komponensek feliratkozhatnak rá
  private hiddenVersesSubject = new BehaviorSubject<Set<string>>(new Set());
  public hiddenVerses$ = this.hiddenVersesSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.loadFromStorage();
  }

  // Betöltés localStorage-ból (csak böngészőben)
  private loadFromStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        // JSON tömböt Set-té alakítunk a gyors kereséshez
        this.hiddenVersesSubject.next(new Set(parsed));
      } catch (e) {
        this.hiddenVersesSubject.next(new Set());
      }
    }
  }

  // Mentés localStorage-ba
  private saveToStorage(currentSet: Set<string>): void {
    if (isPlatformBrowser(this.platformId)) {
      // A Set nem szerializálható közvetlenül JSON-ba, tömbbé kell alakítani
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify([...currentSet]));
    }
  }

  // Vers elrejtése/megjelenítése
  toggleVerseVisibility(bookId: string, chapter: string | number, verse: number): void {
    const id = `${bookId}-${chapter}-${verse}`;
    const currentSet = new Set(this.hiddenVersesSubject.value);

    if (currentSet.has(id)) {
      currentSet.delete(id); // Visszaállítás (unhide)
    } else {
      currentSet.add(id); // Elrejtés (hide)
    }

    this.hiddenVersesSubject.next(currentSet);
    this.saveToStorage(currentSet);
  }

  // Ellenőrzés: rejtett-e a vers?
  isVerseHidden(bookId: string, chapter: string | number, verse: number): boolean {
    const id = `${bookId}-${chapter}-${verse}`;
    return this.hiddenVersesSubject.value.has(id);
  }
}
