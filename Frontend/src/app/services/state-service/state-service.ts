import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type AppTheme = 'light' | 'dark';
export type AppLang = 'hu' | 'en';

@Injectable({
  providedIn: 'root',
})
export class StateService {
  lang = signal<'hu' | 'en'>('hu');
  private platformId = inject(PLATFORM_ID);

  // --- SIGNALS ---
  readonly currentLang = signal<AppLang>('hu');
  readonly theme = signal<AppTheme>('light');

  // VÁLTOZÁS: Ez most már egy írható signal, nem computed.
  // Alapértelmezett érték: 'hu_karoli' (vagy ami a versions.json-ben van)
  readonly currentBibleVersion = signal<string>('hu_karoli');

  // A kiválasztott Strong szám (pl. "H7225" vagy null, ha nincs nyitva semmi)
  readonly selectedStrongId = signal<string | null>(null);

  // Modal állapota (hogy a UI tudja, nyitva van-e)
  readonly definitionModalOpen = signal<boolean>(false);
  toggleLanguage() {
    this.lang.update((current) => (current === 'hu' ? 'en' : 'hu'));
  }

  setLanguage(language: 'hu' | 'en') {
    this.lang.set(language);
  }
  constructor() {
    // Téma figyelése és alkalmazása (CSS class)
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        const t = this.theme();
        if (t === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    });

    this.loadSettings();
  }

  // --- ACTIONS ---

  setLang(lang: AppLang) {
    this.currentLang.set(lang);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('pref_lang', lang);
    }
  }

  setTheme(theme: AppTheme) {
    this.theme.set(theme);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('pref_theme', theme);
    }
  }

  // ÚJ: Verzió beállítása (ezt hívja a Header dropdown)
  setVersion(version: string) {
    this.currentBibleVersion.set(version);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('bible_version', version);
    }
  }

  // Modal megnyitása
  openDefinition(strongId: string) {
    this.selectedStrongId.set(strongId);
    this.definitionModalOpen.set(true);
  }

  // Modal bezárása
  closeDefinition() {
    this.definitionModalOpen.set(false);
    this.selectedStrongId.set(null);
  }

  // --- PERSISTENCE ---

  private loadSettings() {
    if (isPlatformBrowser(this.platformId)) {
      // Nyelv betöltése
      const savedLang = localStorage.getItem('pref_lang') as AppLang;
      if (savedLang) this.currentLang.set(savedLang);

      // Téma betöltése
      const savedTheme = localStorage.getItem('pref_theme') as AppTheme;
      if (savedTheme) this.theme.set(savedTheme);

      // ÚJ: Verzió betöltése
      const savedVersion = localStorage.getItem('bible_version');
      if (savedVersion) {
        this.currentBibleVersion.set(savedVersion);
      }
    }
  }
}
