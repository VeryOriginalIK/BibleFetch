import { Component, inject, signal, effect, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BibleDataService } from '../../services/data-service/data-service';
import { Book } from '../../models/book-model';
import { StateService } from '../../services/state-service/state-service';
import { CollectionService } from '../../services/collection-service/collection-service';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';

@Component({
  selector: 'app-bible-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, VerseRendererComponent, RouterModule],
  templateUrl: './bible-reader-component.html',
  styleUrl: './bible-reader-component.css',
})
export class BibleReaderComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private data = inject(BibleDataService);
  public state = inject(StateService);
  public collectionService = inject(CollectionService);

  // === SIGNALS ===
  bookId = signal<string>('');
  chapter = signal<number>(1);
  bookName = signal<string>('Betöltés...');
  verses = signal<{ id: string; text: string }[]>([]);
  isLoading = signal<boolean>(false);

  // Navigation state
  maxChapters = signal<number>(0);
  isFirst = signal<boolean>(true);
  isLast = signal<boolean>(true);

  // Verse selection state
  selectedVerseIds = signal<string[]>([]);
  rangeAnchorVerseId = signal<string | null>(null);

  // Collection picker state
  collectionPickerOpen = signal<boolean>(false);
  newCollectionName = signal<string>('');

  // Book/Chapter selector state
  selectorOpen = signal<boolean>(false);
  selectorMode = signal<'book' | 'chapter'>('book');
  allBooks = signal<Book[]>([]);
  selectedBookForPicker = signal<Book | null>(null);



  // Computed: chapter numbers for selected book in picker
  chapterNumbers = computed(() => {
    const book = this.selectedBookForPicker();
    if (!book || !book.chapterCount) return [];
    return Array.from({ length: book.chapterCount }, (_, i) => i + 1);
  });

  // Computed: selected book name for picker header
  selectedBookName = computed(() => {
    const book = this.selectedBookForPicker();
    if (!book) return '';
    return book.name[this.state.lang()] || book.name['hu'] || book.id;
  });

  selectedVerseCount = computed(() => this.selectedVerseIds().length);

  private routeSub: Subscription;
  private querySub: Subscription;
  private previousLang: string = '';
  private previousVersion: string = '';
  private targetVerseNumber: number | null = null;

  constructor() {
    // Initialize previous values to prevent duplicate initial load
    this.previousLang = this.state.lang();
    this.previousVersion = this.state.currentBibleVersion();

    // 1. Listen to URL params
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const b = params.get('book');
      const c = parseInt(params.get('chapter') || '1', 10);

      if (b && (b !== this.bookId() || c !== this.chapter())) {
        this.bookId.set(b);
        this.chapter.set(c);
        this.state.setReadingPosition(b, c);
        this.loadContent();
        // Prefetch adjacent chapters for faster navigation
        this.prefetchAdjacentChapters(b, c);
      }
    });

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const raw = params.get('verse');
      if (!raw) {
        this.targetVerseNumber = null;
        return;
      }

      const parsed = parseInt(raw, 10);
      this.targetVerseNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    });

    // 2. Reload when language or version changes (skip if unchanged)
    effect(() => {
      const currentLang = this.state.lang();
      const currentVersion = this.state.currentBibleVersion();

      if (this.bookId() && (currentLang !== this.previousLang || currentVersion !== this.previousVersion)) {
        this.previousLang = currentLang;
        this.previousVersion = currentVersion;
        this.loadContent();
      }
    });

  }

  ngOnDestroy() {
    if (this.routeSub) this.routeSub.unsubscribe();
    if (this.querySub) this.querySub.unsubscribe();
  }

  async loadContent() {
    this.isLoading.set(true);
    this.selectedVerseIds.set([]);
    this.rangeAnchorVerseId.set(null);
    this.collectionPickerOpen.set(false);
    const currentVer = this.state.currentBibleVersion();
    const currentLang = this.state.lang();
    const bId = this.bookId();
    const chap = this.chapter();

    try {
      const books: Book[] = await this.data.getBooks(currentVer);
      this.allBooks.set(books);

      const currentBook = books.find((b) => b.id === bId);

      if (currentBook) {
        this.bookName.set(currentBook.name[currentLang] || currentBook.name['hu']);
        const max = currentBook.chapterCount || 1;
        this.maxChapters.set(max);
        this.isFirst.set(chap <= 1);
        this.isLast.set(chap >= max);
      } else {
        this.bookName.set(bId);
      }

      const content = await this.data.getChapterContent(bId, chap.toString(), currentVer);
      this.verses.set(content);

      if (typeof window !== 'undefined') {
        if (this.targetVerseNumber) {
          const targetId = `${bId}-${chap}-${this.targetVerseNumber}`;
          requestAnimationFrame(() => {
            const el = document.getElementById(`verse-${targetId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } catch (error) {
      console.error('Hiba az olvasó betöltésekor:', error);
      this.verses.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Open the book/chapter selector
  openSelector() {
    this.selectorMode.set('book');
    this.selectorOpen.set(true);
  }

  // Get book name in current language
  getBookName(book: Book): string {
    return book.name[this.state.lang()] || book.name['hu'] || book.id;
  }

  // User picks a book → show chapter grid
  selectBook(book: Book) {
    this.selectedBookForPicker.set(book);
    this.selectorMode.set('chapter');
  }

  // User picks a chapter → navigate and close
  selectChapter(ch: number) {
    const book = this.selectedBookForPicker();
    if (!book) return;
    this.selectorOpen.set(false);
    this.router.navigate(['/bible', book.id, ch]);
  }

  // Chapter navigation (prev/next)
  nav(direction: number) {
    const nextChap = this.chapter() + direction;
    if (nextChap >= 1 && nextChap <= this.maxChapters()) {
      this.router.navigate(['/bible', this.bookId(), nextChap]);
    }
  }

  // Helper: "gen-1-15" -> "15"
  getVerseNum(id: string): string {
    const parts = id.split('-');
    return parts.length >= 3 ? parts[2] : '';
  }

  // Toggle verse selection highlight
  toggleVerseMenu(verseId: string, event: MouseEvent) {
    // Don't toggle if clicking on the bookmark button, Strong's word, or tooltip
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.word-with-strong') || target.closest('.collection-picker')) return;

    this.collectionPickerOpen.set(false);

    const ids = this.verses().map((v) => v.id);
    const anchor = this.rangeAnchorVerseId();

    if (!anchor) {
      this.rangeAnchorVerseId.set(verseId);
      this.selectedVerseIds.set([verseId]);
      return;
    }

    if (anchor === verseId) {
      this.rangeAnchorVerseId.set(null);
      this.selectedVerseIds.set([]);
      return;
    }

    const anchorIndex = ids.indexOf(anchor);
    const currentIndex = ids.indexOf(verseId);

    if (anchorIndex === -1 || currentIndex === -1) {
      this.rangeAnchorVerseId.set(verseId);
      this.selectedVerseIds.set([verseId]);
      return;
    }

    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);
    this.selectedVerseIds.set(ids.slice(start, end + 1));
  }

  // Open collection picker for selected verses
  openCollectionPicker(verseId: string, event: MouseEvent) {
    event.stopPropagation();

    if (!this.selectedVerseIds().includes(verseId)) {
      this.rangeAnchorVerseId.set(verseId);
      this.selectedVerseIds.set([verseId]);
    }

    this.collectionPickerOpen.update((open) => !open);
    this.newCollectionName.set('');
  }

  // Toggle selected verses in/out of a specific collection
  toggleVersesInCollection(collectionId: string, event: MouseEvent) {
    event.stopPropagation();
    const selected = this.selectedVerseIds();
    if (selected.length === 0) return;

    const spanRef = this.toSelectionReference(selected);
    if (!spanRef) return;

    const allSinglesInCollection = selected.every((verseId) =>
      this.collectionService.isVerseInCollection(collectionId, verseId)
    );

    if (this.collectionService.isVerseInCollection(collectionId, spanRef)) {
      this.collectionService.removeVerse(collectionId, spanRef);
      return;
    }

    if (allSinglesInCollection) {
      this.collectionService.removeVerses(collectionId, selected);
      return;
    }

    this.collectionService.addVerse(collectionId, spanRef);
  }

  areAllSelectedInCollection(collectionId: string): boolean {
    const selected = this.selectedVerseIds();
    if (selected.length === 0) return false;

    const spanRef = this.toSelectionReference(selected);
    if (spanRef && this.collectionService.isVerseInCollection(collectionId, spanRef)) {
      return true;
    }

    return selected.every((verseId) => this.collectionService.isVerseInCollection(collectionId, verseId));
  }

  // Create a new collection and add selected verses to it
  createAndAddToCollection() {
    const name = this.newCollectionName().trim();
    if (!name) return;
    const selected = this.selectedVerseIds();
    if (selected.length === 0) return;

    const spanRef = this.toSelectionReference(selected);
    if (!spanRef) return;

    const col = this.collectionService.createCollection(name);
    this.collectionService.addVerse(col.id, spanRef);
    this.newCollectionName.set('');
    this.collectionPickerOpen.set(false);
  }

  // Close collection picker
  closeCollectionPicker() {
    this.collectionPickerOpen.set(false);
  }

  clearSelectedVerses(event?: Event) {
    event?.stopPropagation();
    this.selectedVerseIds.set([]);
    this.rangeAnchorVerseId.set(null);
    this.collectionPickerOpen.set(false);
  }

  private toSelectionReference(selectedVerseIds: string[]): string | null {
    if (selectedVerseIds.length === 0) return null;
    if (selectedVerseIds.length === 1) return selectedVerseIds[0];

    const refs = selectedVerseIds
      .map((id) => this.data.parseVerseRef(id))
      .filter((ref): ref is { bookId: string; chapter: string; verseStart: number; verseEnd: number } => !!ref);

    if (refs.length !== selectedVerseIds.length) return null;

    const bookId = refs[0].bookId;
    const chapter = refs[0].chapter;
    if (refs.some((r) => r.bookId !== bookId || r.chapter !== chapter)) {
      return null;
    }

    const starts = refs.map((r) => r.verseStart);
    const start = Math.min(...starts);
    const end = Math.max(...starts);

    return `${bookId}-${chapter}-${start}-${end}`;
  }

  // Prefetch adjacent chapters for faster navigation
  private prefetchAdjacentChapters(bookId: string, currentChapter: number) {
    const version = this.state.currentBibleVersion();
    const maxChap = this.maxChapters();

    // Prefetch next chapter
    if (currentChapter < maxChap) {
      this.data.getChapterContent(bookId, String(currentChapter + 1), version).catch(() => {});
    }

    // Prefetch previous chapter
    if (currentChapter > 1) {
      this.data.getChapterContent(bookId, String(currentChapter - 1), version).catch(() => {});
    }
  }
}
