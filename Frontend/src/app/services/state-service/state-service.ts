import { Injectable, signal, computed, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type AppTheme = 'light' | 'dark';
export type AppLang = 'hu' | 'en';

@Injectable({
  providedIn: 'root',
})
export class StateService {
  private platformId = inject(PLATFORM_ID);

  // --- SIGNALS ---
  readonly currentLang = signal<AppLang>('hu');
  readonly theme = signal<AppTheme>('light');

  readonly activeVersions = signal<{ [key in AppLang]: string }>({
    hu: 'hu_karoli',
    en: 'en_niv',
  });

  // ÚJ: A kiválasztott Strong szám (pl. "H7225" vagy null, ha nincs nyitva semmi)
  readonly selectedStrongId = signal<string | null>(null);

  readonly currentBibleVersion = computed(() => {
    return this.activeVersions()[this.currentLang()];
  });

  constructor() {
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

  setLang(lang: AppLang) {
    this.currentLang.set(lang);
    if (isPlatformBrowser(this.platformId)) localStorage.setItem('pref_lang', lang);
  }

  setTheme(theme: AppTheme) {
    this.theme.set(theme);
    if (isPlatformBrowser(this.platformId)) localStorage.setItem('pref_theme', theme);
  }

  // ÚJ: Modal megnyitása
  openDefinition(strongId: string) {
    this.selectedStrongId.set(strongId);
  }

  // ÚJ: Modal bezárása
  closeDefinition() {
    this.selectedStrongId.set(null);
  }

  private loadSettings() {
    if (isPlatformBrowser(this.platformId)) {
      const savedLang = localStorage.getItem('pref_lang') as AppLang;
      if (savedLang) this.currentLang.set(savedLang);
      const savedTheme = localStorage.getItem('pref_theme') as AppTheme;
      if (savedTheme) this.theme.set(savedTheme);
    }
  }
}
