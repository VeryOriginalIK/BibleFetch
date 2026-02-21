import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BibleDataService } from '../../services/data-service/data-service';
import { StateService } from '../../services/state-service/state-service';
import { Version } from '../../models/version-model';

interface LanguageGroup {
  lang: string;
  versions: Version[];
}

/**
 * Compact translation selector that can be placed in any navbar/header.
 * Shows a pill button; clicking opens a full-screen drawer with grouped versions.
 */
@Component({
  selector: 'app-version-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Pill button -->
    <button
      (click)="open($event)"
      class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold
             bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
             hover:border-blue-400 hover:text-blue-600 transition-colors truncate
             max-w-[80px] sm:max-w-[100px] min-h-[32px] sm:min-h-[36px]"
      [title]="currentVersionName()">
      <svg class="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
      </svg>
      <span class="truncate">{{ currentVersionName() }}</span>
    </button>

    <!-- Drawer -->
    @if (drawerOpen()) {
      <div class="fixed inset-0 z-[60] flex sm:items-center sm:justify-center">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" (click)="drawerOpen.set(false)"></div>
        <div class="relative z-10 w-full sm:max-w-md bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto
                    h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl animate-slide-in-right sm:animate-fade-in"
             style="padding-bottom: env(safe-area-inset-bottom);">
          <div class="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
            <h2 class="text-lg font-bold">
              {{ state.lang() === 'hu' ? 'Fordítás választása' : 'Choose Translation' }}
            </h2>
            <button (click)="drawerOpen.set(false)"
                    class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">✕</button>
          </div>
          <div class="p-3 space-y-4">
            @for (group of groupedVersions(); track group.lang) {
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 px-2">{{ group.lang }}</h3>
                <div class="space-y-1">
                  @for (v of group.versions; track v.id) {
                    <button (click)="selectVersion(v.id)"
                            class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors"
                            [class]="v.id === state.currentBibleVersion()
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700 font-semibold'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'">
                      {{ v.name }}
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class VersionSelectorComponent implements OnInit {
  private data = inject(BibleDataService);
  public state = inject(StateService);

  drawerOpen = signal(false);
  groupedVersions = signal<LanguageGroup[]>([]);

  currentVersionName = computed(() => {
    const id = this.state.currentBibleVersion();
    for (const g of this.groupedVersions()) {
      const v = g.versions.find((ver) => ver.id === id);
      if (v) return v.name;
    }
    return id;
  });

  async ngOnInit() {
    const versions = await this.data.getAvailableVersions();
    const map = new Map<string, Version[]>();
    for (const v of versions) {
      const lang = v.lang || 'Other';
      if (!map.has(lang)) map.set(lang, []);
      map.get(lang)!.push(v);
    }
    const groups: LanguageGroup[] = [];
    for (const [lang, vers] of map) {
      groups.push({ lang, versions: vers.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    groups.sort((a, b) => a.lang.localeCompare(b.lang));
    this.groupedVersions.set(groups);
  }

  open(event: Event) {
    event.stopPropagation();
    this.drawerOpen.set(true);
  }

  selectVersion(versionId: string) {
    this.state.setVersion(versionId);
    this.drawerOpen.set(false);
  }
}
