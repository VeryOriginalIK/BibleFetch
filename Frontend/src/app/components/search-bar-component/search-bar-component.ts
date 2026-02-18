import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SearchService, SearchResult } from '../../services/search-service/search-service';
import { StateService } from '../../services/state-service/state-service';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';
import { BibleDataService } from '../../services/data-service/data-service';
import { Version } from '../../models/version-model';

interface VersePreview {
  verseId: string;
  label: string;
  text: string;
}

interface LanguageGroup {
  lang: string;
  versions: Version[];
}

@Component({
  selector: 'app-search-bar-component',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, VerseRendererComponent],
  templateUrl: './search-bar-component.html',
  styleUrl: './search-bar-component.css',
})
export class SearchBarComponent implements OnInit {
  private searchService = inject(SearchService);
  private dataService = inject(BibleDataService);
  private router = inject(Router);
  state = inject(StateService);

  query = signal('');
  results = signal<SearchResult[]>([]);
  previews = signal<VersePreview[]>([]);
  isSearching = signal(false);
  selectedWord = signal<string | null>(null);
  isLoadingPreviews = signal(false);

  // Version picker
  versionPickerOpen = signal(false);
  groupedVersions = signal<LanguageGroup[]>([]);
  hasSearchIndex = signal(true);
  checkingIndex = signal(false);

  // Computed: current version display name
  currentVersionName = computed(() => {
    const id = this.state.currentBibleVersion();
    const groups = this.groupedVersions();
    for (const g of groups) {
      const v = g.versions.find((ver) => ver.id === id);
      if (v) return v.name;
    }
    return id;
  });

  private debounceTimer: any;

  async ngOnInit() {
    const versions = await this.dataService.getAvailableVersions();
    // Group by language, sorted
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

    // Check if current version has a search index
    await this.checkIndex();
  }

  async checkIndex() {
    this.checkingIndex.set(true);
    const version = this.state.currentBibleVersion();
    const available = await this.searchService.hasIndex(version);
    this.hasSearchIndex.set(available);
    this.checkingIndex.set(false);
  }

  onInput(value: string) {
    this.query.set(value);
    this.selectedWord.set(null);
    this.previews.set([]);

    clearTimeout(this.debounceTimer);
    if (value.length < 2) {
      this.results.set([]);
      return;
    }

    this.debounceTimer = setTimeout(() => this.doSearch(), 300);
  }

  async doSearch() {
    const q = this.query();
    if (q.length < 2) return;

    this.isSearching.set(true);
    try {
      const version = this.state.currentBibleVersion();
      const res = await this.searchService.search(q, version);
      this.results.set(res);

      // Auto-select exact match if found
      const exact = res.find((r) => r.word === q.toLowerCase());
      if (exact) {
        this.selectWord(exact);
      }
    } finally {
      this.isSearching.set(false);
    }
  }

  async selectWord(result: SearchResult) {
    this.selectedWord.set(result.word);
    this.isLoadingPreviews.set(true);

    const version = this.state.currentBibleVersion();
    // Load first 20 verse previews
    const sliced = result.verseIds.slice(0, 20);
    const previews: VersePreview[] = [];

    for (const verseId of sliced) {
      const parts = verseId.split('-');
      if (parts.length < 3) continue;
      const label = `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}`;

      try {
        const text = await this.dataService.getVerseText(verseId, version);
        if (text) {
          previews.push({ verseId, label, text });
        }
      } catch {
        // skip
      }
    }

    this.previews.set(previews);
    this.isLoadingPreviews.set(false);
  }

  navigateToVerse(verseId: string) {
    const parts = verseId.split('-');
    if (parts.length >= 3) {
      this.router.navigate(['/bible', parts[0], parts[1]]);
    }
  }

  getTotalHits(): number {
    const sel = this.selectedWord();
    const r = this.results().find((x) => x.word === sel);
    return r ? r.verseIds.length : 0;
  }

  async selectVersion(versionId: string) {
    this.state.setVersion(versionId);
    this.versionPickerOpen.set(false);

    // Reset search state
    this.results.set([]);
    this.previews.set([]);
    this.selectedWord.set(null);

    // Check if new version has a search index
    await this.checkIndex();

    // Re-run search if query is present
    if (this.query().length >= 2 && this.hasSearchIndex()) {
      await this.doSearch();
    }
  }
}

