import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SearchService, SearchResult } from '../../services/search-service/search-service';
import { StateService } from '../../services/state-service/state-service';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';
import { BibleDataService } from '../../services/data-service/data-service';
import { Version } from '../../models/version-model';
import { StrongsSearchService, StrongsSearchResult } from '../../services/strongs-search-service/strongs-search.service';

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
  private strongsSearch = inject(StrongsSearchService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  state = inject(StateService);

  query = signal('');
  results = signal<SearchResult[]>([]);
  previews = signal<VersePreview[]>([]);
  isSearching = signal(false);
  selectedWord = signal<string | null>(null);
  isLoadingPreviews = signal(false);

  // Strong's concordance search results
  strongsResults = signal<StrongsSearchResult[]>([]);
  selectedStrong = signal<StrongsSearchResult | null>(null);
  isLoadingStrongsVerses = signal(false);

  // Pagination for verse previews
  private readonly PREVIEW_PAGE_SIZE = 20;
  private previewLimit = signal(this.PREVIEW_PAGE_SIZE);
  /** Unique verse id list for the currently selected word (preserves order) */
  private currentUniqueVerseIds: string[] = [];
  private currentUniqueVerseCount = 0;

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

    this.route.queryParamMap.subscribe((params) => {
      const raw = params.get('q') || '';
      const q = raw.trim();

      if (!q) return;

      this.query.set(q);
      clearTimeout(this.debounceTimer);

      // Always run search — Strong's concordance works regardless of translation index
      this.doSearch();
    });
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
    this.selectedStrong.set(null);
    try {
      const version = this.state.currentBibleVersion();

      // Run text search and Strong's transliteration search in parallel
      const [res, strongsRes] = await Promise.all([
        this.searchService.search(q, version),
        this.strongsSearch.search(q, 15),
      ]);

      this.results.set(res);
      this.strongsResults.set(strongsRes);

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

    const version = this.state.currentBibleVersion();

    // 1) Request the first page of unique verse IDs (server-assisted if available)
    const firstPage = await this.searchService.getUniqueVerseIdsPage(result.word, version, 0, this.PREVIEW_PAGE_SIZE);

    if (firstPage) {
      this.currentUniqueVerseIds = firstPage.uniqueVerseIds;
      this.currentUniqueVerseCount = firstPage.totalUniqueVerses;

      // Defensive fallback: if API reports occurrences but zero unique verses, compute unique count locally
      if (firstPage.totalOccurrences > 0 && firstPage.totalUniqueVerses === 0) {
        try {
          const all = await this.searchService.getAllVerseIds(result.word, version);
          if (all && all.length > 0) {
            const uniqueAll = Array.from(new Set(all));
            this.currentUniqueVerseCount = uniqueAll.length;
            // ensure we have at least the first page of unique IDs
            this.currentUniqueVerseIds = uniqueAll.slice(0, this.PREVIEW_PAGE_SIZE);
          }
        } catch (err) {
          console.warn('Failed to compute unique verse fallback:', err);
        }
      }
    } else {
      // Fallback: use truncated result.verseIds deduped
      this.currentUniqueVerseIds = Array.from(new Set(result.verseIds));
      this.currentUniqueVerseCount = this.currentUniqueVerseIds.length;
    }

    this.previewLimit.set(this.PREVIEW_PAGE_SIZE);
    await this.loadPreviews();
  }

  private async loadPreviews() {
    this.isLoadingPreviews.set(true);
    const version = this.state.currentBibleVersion();

    const limit = this.previewLimit();

    // Ensure we have enough unique verse IDs locally to satisfy the requested limit.
    // If not, request additional pages from SearchService (server-assisted when possible).
    while (this.currentUniqueVerseIds.length < limit && this.selectedWord()) {
      const offset = this.currentUniqueVerseIds.length;
      const page = await this.searchService.getUniqueVerseIdsPage(this.selectedWord()!, version, offset, this.PREVIEW_PAGE_SIZE);
      if (!page || page.uniqueVerseIds.length === 0) break;
      this.currentUniqueVerseIds = this.currentUniqueVerseIds.concat(page.uniqueVerseIds);
      this.currentUniqueVerseCount = page.totalUniqueVerses;
      // stop if fewer items returned than page size
      if (page.uniqueVerseIds.length < this.PREVIEW_PAGE_SIZE) break;
    }

    const idsToLoad = this.currentUniqueVerseIds.slice(0, limit);

    // Load verse texts in parallel but preserve order
    const textPromises = idsToLoad.map(async (verseId) => {
      try {
        const textRaw = await this.dataService.getVerseText(verseId, version);
        const text = textRaw || '';
        const parts = verseId.split('-');
        const label = parts.length >= 3 ? `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}` : verseId;

        if (!text) {
          console.warn('[SearchBar] missing verse text — will show placeholder:', verseId, 'version', version);
        }

        return { verseId, label, text: text || '[text unavailable]' } as VersePreview;
      } catch (err) {
        console.warn('[SearchBar] error loading verse text, showing placeholder:', verseId, 'version', version, err);
        const parts = verseId.split('-');
        const label = parts.length >= 3 ? `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}` : verseId;
        return { verseId, label, text: '[text unavailable]' } as VersePreview;
      }
    });

    const resolved = await Promise.all(textPromises);
    const previews = resolved.filter((p): p is VersePreview => !!p);
    this.previews.set(previews);
    this.isLoadingPreviews.set(false);
  }

  async loadMorePreviews(event?: Event) {
    // determine where the newly-loaded previews will start (0-based index)
    const oldLimit = this.previewLimit();
    const newLimit = Math.min(oldLimit + this.PREVIEW_PAGE_SIZE, this.currentUniqueVerseCount);
    this.previewLimit.set(newLimit);

    // load previews, then smoothly scroll the first newly-loaded preview into view
    await this.loadPreviews();

    const firstNewIndex = oldLimit;
    if (firstNewIndex < this.currentUniqueVerseIds.length) {
      const firstNewId = this.currentUniqueVerseIds[firstNewIndex];
      // DOM update may not be synchronous; use rAF to ensure element exists
      requestAnimationFrame(() => {
        const el = document.getElementById(`preview-${firstNewId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    // prevent default form/button behavior if event provided
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  }

  clearSelection() {
    this.selectedWord.set(null);
    this.selectedStrong.set(null);
    this.previews.set([]);
    this.previewLimit.set(this.PREVIEW_PAGE_SIZE);
    this.currentUniqueVerseIds = [];
    this.currentUniqueVerseCount = 0;
    this.isLoadingPreviews.set(false);
  }

  /**
   * Select a Strong's concordance entry and load all verses containing that code.
   */
  async selectStrongsEntry(entry: StrongsSearchResult) {
    this.selectedStrong.set(entry);
    this.selectedWord.set(null);
    this.isLoadingStrongsVerses.set(true);
    this.previews.set([]);

    try {
      const verseIds = await this.strongsSearch.findVersesWithStrong(entry.code);
      this.currentUniqueVerseIds = verseIds;
      this.currentUniqueVerseCount = verseIds.length;
      this.previewLimit.set(this.PREVIEW_PAGE_SIZE);
      await this.loadStrongsPreviews();
    } finally {
      this.isLoadingStrongsVerses.set(false);
    }
  }

  private async loadStrongsPreviews() {
    this.isLoadingPreviews.set(true);
    // Use asvs — the translation the original-language index was built from
    const version = 'asvs';
    const limit = this.previewLimit();
    const idsToLoad = this.currentUniqueVerseIds.slice(0, limit);

    const textPromises = idsToLoad.map(async (verseId) => {
      try {
        const textRaw = await this.dataService.getVerseText(verseId, version);
        const text = textRaw || '';
        const parts = verseId.split('-');
        const label = parts.length >= 3 ? `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}` : verseId;
        return { verseId, label, text: text || '[text unavailable]' } as VersePreview;
      } catch {
        const parts = verseId.split('-');
        const label = parts.length >= 3 ? `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}` : verseId;
        return { verseId, label, text: '[text unavailable]' } as VersePreview;
      }
    });

    const resolved = await Promise.all(textPromises);
    this.previews.set(resolved.filter((p): p is VersePreview => !!p));
    this.isLoadingPreviews.set(false);
  }

  getUniqueVerseCount(): number {
    return this.currentUniqueVerseCount;
  }

  getRemainingPreviewCount(): number {
    return Math.max(0, this.currentUniqueVerseCount - this.previews().length);
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
    return r ? (r.totalCount ?? r.verseIds.length) : 0;
  }

  async selectVersion(versionId: string) {
    this.state.setVersion(versionId);
    this.versionPickerOpen.set(false);

    // Reset search state
    this.results.set([]);
    this.previews.set([]);
    this.selectedWord.set(null);
    this.selectedStrong.set(null);
    this.strongsResults.set([]);

    // Check if new version has a search index
    await this.checkIndex();

    // Re-run search if query is present
    if (this.query().length >= 2 && this.hasSearchIndex()) {
      await this.doSearch();
    }
  }

  async loadMoreStrongsPreviews(event?: Event) {
    const newLimit = Math.min(this.previewLimit() + this.PREVIEW_PAGE_SIZE, this.currentUniqueVerseCount);
    this.previewLimit.set(newLimit);
    await this.loadStrongsPreviews();
    if (event && typeof (event as any).preventDefault === 'function') (event as any).preventDefault();
  }
}

