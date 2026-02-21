import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type AppTheme = 'light' | 'dark';
export type AppLang = 'hu' | 'en';

@Injectable({
  providedIn: 'root',
})
export class StateService {
  private platformId = inject(PLATFORM_ID);

  // --- SIGNALS ---
  readonly lang = signal<AppLang>('hu');
  readonly theme = signal<AppTheme>('light');
  readonly currentBibleVersion = signal<string>('karoli');
  readonly selectedStrongId = signal<string | null>(null);

  // Last reading position (persisted)
  readonly lastBook = signal<string>('gen');
  readonly lastChapter = signal<number>(1);

  constructor() {
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        const t = this.theme();
        document.documentElement.classList.toggle('dark', t === 'dark');
      }
    });

    this.loadSettings();
  }

  // --- ACTIONS ---

  toggleLanguage() {
    const next: AppLang = this.lang() === 'hu' ? 'en' : 'hu';
    this.lang.set(next);
    this.persist('pref_lang', next);
  }

  setLang(lang: AppLang) {
    this.lang.set(lang);
    this.persist('pref_lang', lang);
  }

  setTheme(theme: AppTheme) {
    this.theme.set(theme);
    this.persist('pref_theme', theme);
  }

  setVersion(version: string) {
    this.currentBibleVersion.set(version);
    this.persist('bible_version', version);
  }

  openDefinition(strongId: string) {
    this.selectedStrongId.set(strongId);
  }

  closeDefinition() {
    this.selectedStrongId.set(null);
  }

  setReadingPosition(book: string, chapter: number) {
    this.lastBook.set(book);
    this.lastChapter.set(chapter);
    this.persist('last_book', book);
    this.persist('last_chapter', chapter.toString());
  }

  // --- PERSISTENCE ---

  private persist(key: string, value: string) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(key, value);
    }
  }

  private loadSettings() {
    if (isPlatformBrowser(this.platformId)) {
      const savedLang = localStorage.getItem('pref_lang') as AppLang;
      if (savedLang) this.lang.set(savedLang);

      const savedTheme = localStorage.getItem('pref_theme') as AppTheme;
      if (savedTheme) this.theme.set(savedTheme);

      const savedVersion = localStorage.getItem('bible_version');
      if (savedVersion) {
        // Migration: hu_karoli → karoli (match versions.json keys)
        const migrated = savedVersion === 'hu_karoli' ? 'karoli' : savedVersion;
        this.currentBibleVersion.set(migrated);
        if (migrated !== savedVersion) this.persist('bible_version', migrated);
      }

      // Restore last reading position
      const savedBook = localStorage.getItem('last_book');
      if (savedBook) this.lastBook.set(savedBook);
      const savedChapter = localStorage.getItem('last_chapter');
      if (savedChapter) this.lastChapter.set(parseInt(savedChapter, 10) || 1);
    }
  }
}
