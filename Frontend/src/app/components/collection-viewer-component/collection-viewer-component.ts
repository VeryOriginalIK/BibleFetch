import { Component, OnInit, OnDestroy, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CollectionService } from '../../services/collection-service/collection-service';
import { BibleDataService } from '../../services/data-service/data-service';
import { StateService } from '../../services/state-service/state-service';
import { UserCollection } from '../../models/user-collection-model';
import { AuthService } from '../../services/auth-service/auth.service';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';

@Component({
  standalone: true,
  selector: 'app-collection-viewer',
  imports: [CommonModule, RouterModule, FormsModule, VerseRendererComponent],
  templateUrl: './collection-viewer-component.html',
})
export class CollectionViewerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  public router = inject(Router);
  private collectionService = inject(CollectionService);
  private bibleService = inject(BibleDataService);
  public state = inject(StateService);
  public auth = inject(AuthService);

  collection = signal<UserCollection | null>(null);
  verses = signal<Array<{ id: string; text: string; book: string; chapter: string; verse: string; likeCount?: number }>>([]);
  isLoading = signal(true);
  showAddVerseModal = signal(false);
  errorMessage = signal<string | null>(null);
  verseLikeCounts = signal<Map<string, number>>(new Map());
  expandedVerseIds = signal<Set<string>>(new Set());
  private currentCollectionId = '';

  // Verse picker state
  showVersePicker = signal(false);
  pickerBook = signal<string>('gen');
  pickerChapter = signal<number>(1);
  pickerStartVerse = signal<number>(1);
  pickerEndVerse = signal<number>(1);
  allBooks = signal<Array<{id: string; name: string; chapterCount: number}>>([]);
  maxVerseInChapter = signal<number>(31);

  // computed: max chapters for currently selected picker book (used from template)
  pickerBookMaxChapters = computed(() => {
    const b = this.allBooks().find(x => x.id === this.pickerBook());
    return b?.chapterCount ?? 150;
  });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/']);
      return;
    }
    this.currentCollectionId = id;

    const col = this.collectionService.getCollection(id);
    if (!col) {
      this.router.navigate(['/']);
      return;
    }

    this.collection.set(col);
    await this.loadVerses();
    await this.loadBookList();
    this.restoreScrollPosition();
    setTimeout(() => this.restoreScrollPosition(), 50);
  }

  ngOnDestroy() {
    this.persistScrollPosition();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    this.persistScrollPosition();
  }

  async loadBookList() {
    try {
      const lang = this.state.lang();
      const books = await this.bibleService.getBooks(lang);
      this.allBooks.set(books.map(b => ({
        id: b.id,
        name: b.name[lang] || b.name['hu'] || b.name['en'] || b.id,
        chapterCount: b.chapterCount || 1
      })));
    } catch (err) {
      console.error('Failed to load books', err);
    }
  }

  async updateMaxVersesForChapter() {
    try {
      const verses = await firstValueFrom(
        this.bibleService.getChapter('kjv_strongs', this.pickerBook(), this.pickerChapter())
      );
      this.maxVerseInChapter.set(verses.length || 31);
      if (this.pickerStartVerse() > verses.length) this.pickerStartVerse.set(1);
      if (this.pickerEndVerse() > verses.length) this.pickerEndVerse.set(1);
    } catch {
      this.maxVerseInChapter.set(31);
    }
  }

  async loadVerses() {
    this.isLoading.set(true);
    const col = this.collection();
    if (!col) {
      this.isLoading.set(false);
      return;
    }

    const version = this.state.currentBibleVersion();

    // Get sorted verse IDs (liked first, then by like count for public collections)
    const sortedVerseIds = await this.collectionService.getSortedVerseIds(col.id);

    // Load like counts if public collection
    let likeCounts = new Map<string, number>();
    if (col.is_public) {
      try {
        likeCounts = await this.collectionService.getVerseLikeCounts(col.id);
        this.verseLikeCounts.set(likeCounts);
      } catch (err) {
        console.error('Failed to load like counts', err);
      }
    }

    const initial = sortedVerseIds.map((verseId) => {
      const ref = this.bibleService.parseVerseRef(verseId);
      const book = ref?.bookId || '';
      const chapter = ref?.chapter || '';
      const verse = ref
        ? ref.verseStart === ref.verseEnd
          ? String(ref.verseStart)
          : `${ref.verseStart}-${ref.verseEnd}`
        : '';

      return {
        id: verseId,
        text: '',
        book,
        chapter,
        verse,
        likeCount: likeCounts.get(verseId) || 0,
      };
    });

    this.verses.set(initial);

    const batchSize = 10;
    for (let i = 0; i < sortedVerseIds.length; i += batchSize) {
      const batch = sortedVerseIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (verseId) => {
          try {
            const text = await this.bibleService.getVerseText(verseId, version);
            this.verses.update((current) =>
              current.map((item) =>
                item.id === verseId
                  ? { ...item, text: text || item.text, likeCount: likeCounts.get(verseId) || item.likeCount }
                  : item
              )
            );
          } catch {
            // ignore per-reference errors
          }
        })
      );
    }

    this.isLoading.set(false);
  }

  removeVerse(verseId: string) {
    const col = this.collection();
    if (!col) return;
    this.collectionService.removeVerse(col.id, verseId);
    this.verses.update(v => v.filter(verse => verse.id !== verseId));
  }

  // --- VERSE PICKER ---

  openVersePicker() {
    this.showVersePicker.set(true);
    this.updateMaxVersesForChapter();
  }

  onPickerBookChange(bookId: string) {
    this.pickerBook.set(bookId);
    this.pickerChapter.set(1);
    this.updateMaxVersesForChapter();
  }

  onPickerChapterChange(chapter: number) {
    this.pickerChapter.set(chapter);
    this.updateMaxVersesForChapter();
  }

  async addVerseFromPicker() {
    const col = this.collection();
    if (!col) return;

    const book = this.pickerBook();
    const chapter = this.pickerChapter();
    const start = this.pickerStartVerse();
    const end = this.pickerEndVerse();

    // Ensure start <= end
    const actualStart = Math.min(start, end);
    const actualEnd = Math.max(start, end);

    const verseRef = actualStart === actualEnd
      ? `${book}-${chapter}-${actualStart}`
      : `${book}-${chapter}-${actualStart}-${actualEnd}`;

    this.collectionService.addVerse(col.id, verseRef);

    this.showVersePicker.set(false);
    await this.loadVerses(); // Reload to ensure correct sorting
  }

  getVerseComment(verseId: string): string {
    const col = this.collection();
    if (!col) return '';
    return this.collectionService.getVerseComment(col.id, verseId);
  }

  setVerseComment(verseId: string, value: string) {
    const col = this.collection();
    if (!col) return;
    this.collectionService.setVerseComment(col.id, verseId, value);

    const updated = this.collectionService.getCollection(col.id);
    if (updated) {
      this.collection.set(updated);
    }
  }

  navigateToVerse(book: string, chapter: string, verseId: string) {
    const parsed = this.bibleService.parseVerseRef(verseId);
    const targetVerse = parsed?.verseStart;

    this.persistScrollPosition();

    if (targetVerse) {
      this.router.navigate(['/bible', book, chapter], { queryParams: { verse: targetVerse } });
    } else {
      this.router.navigate(['/bible', book, chapter]);
    }
  }

  toggleVerseExpanded(verseId: string, event?: Event) {
    event?.stopPropagation();
    this.expandedVerseIds.update((current) => {
      const next = new Set(current);
      if (next.has(verseId)) {
        next.delete(verseId);
      } else {
        next.add(verseId);
      }
      return next;
    });
  }

  isVerseExpanded(verseId: string): boolean {
    return this.expandedVerseIds().has(verseId);
  }

  private getScrollKey(): string {
    return `collection_scroll_${this.currentCollectionId}`;
  }

  private persistScrollPosition() {
    if (typeof window === 'undefined' || !this.currentCollectionId) return;
    sessionStorage.setItem(this.getScrollKey(), String(window.scrollY || 0));
  }

  private restoreScrollPosition() {
    if (typeof window === 'undefined' || !this.currentCollectionId) return;
    const raw = sessionStorage.getItem(this.getScrollKey());
    if (!raw) return;
    const y = Number(raw);
    if (!Number.isFinite(y)) return;
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
  }

  deleteCollection() {
    const col = this.collection();
    if (!col) return;

    if (confirm(`Biztosan törölni szeretnéd a(z) "${col.name}" gyűjteményt?`)) {
      this.collectionService.deleteCollection(col.id);
      this.router.navigate(['/']);
    }
  }

  formatVerseRef(book: string, chapter: string, verse: string): string {
    return `${book.toUpperCase()} ${chapter}:${verse}`;
  }

  // --- VERSE LIKES ---

  toggleVerseLike(verseId: string, event: Event) {
    event.stopPropagation();
    const col = this.collection();
    if (!col) return;

    this.collectionService.toggleVerseLike(col.id, verseId);

    // Refresh collection reference to get updated liked_verses
    const updatedCol = this.collectionService.getCollection(col.id);
    if (updatedCol) {
      this.collection.set(updatedCol);
    }

    // Update UI optimistically
    const isLiked = this.isVerseLiked(verseId);
    const likeCount = this.verseLikeCounts().get(verseId) || 0;

    if (col.is_public) {
      // For public collections, update like count
      const newCount = isLiked ? likeCount - 1 : likeCount + 1;
      this.verseLikeCounts.update(counts => {
        const updated = new Map(counts);
        updated.set(verseId, Math.max(0, newCount));
        return updated;
      });
    }

    // Reload verses to update sorting
    this.loadVerses();
  }

  isVerseLiked(verseId: string): boolean {
    const col = this.collection();
    if (!col) return false;
    return this.collectionService.isVerseLiked(col.id, verseId);
  }

  getVerseLikeCount(verseId: string): number {
    return this.verseLikeCounts().get(verseId) || 0;
  }
}
