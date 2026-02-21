import { Component, inject, signal, effect, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BibleDataService } from '../../services/data-service/data-service';
import { Book } from '../../models/book-model';
import { Version } from '../../models/version-model';
import { StateService } from '../../services/state-service/state-service';
import { CollectionService } from '../../services/collection-service/collection-service';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';

interface LanguageGroup {
  lang: string;
  versions: Version[];
}

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
  selectedVerseId = signal<string | null>(null);

  // Collection picker state
  collectionPickerVerseId = signal<string | null>(null);
  newCollectionName = signal<string>('');

  // Book/Chapter selector state
  selectorOpen = signal<boolean>(false);
  selectorMode = signal<'book' | 'chapter'>('book');
  allBooks = signal<Book[]>([]);
  selectedBookForPicker = signal<Book | null>(null);

  // Version picker state
  versionPickerOpen = signal<boolean>(false);
  groupedVersions = signal<LanguageGroup[]>([]);

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

  private routeSub: Subscription;

  constructor() {
    // 1. Listen to URL params
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const b = params.get('book');
      const c = parseInt(params.get('chapter') || '1', 10);

      if (b && (b !== this.bookId() || c !== this.chapter())) {
        this.bookId.set(b);
        this.chapter.set(c);
        this.loadContent();
        // Prefetch adjacent chapters for faster navigation
        this.prefetchAdjacentChapters(b, c);
      }
    });

    // 2. Reload when language or version changes
    effect(() => {
      this.state.lang();
      this.state.currentBibleVersion();

      if (this.bookId()) {
        this.loadContent();
      }
    });

    // 3. Load versions for the picker
    this.loadVersions();
  }

  ngOnDestroy() {
    if (this.routeSub) this.routeSub.unsubscribe();
  }

  async loadVersions() {
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

  async loadContent() {
    this.isLoading.set(true);
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
    } catch (error) {
      console.error('Hiba az olvasó betöltésekor:', error);
      this.verses.set([]);
    } finally {
      this.isLoading.set(false);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
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

    // Close collection picker if open on another verse
    this.collectionPickerVerseId.set(null);
    this.selectedVerseId.update((cur) => (cur === verseId ? null : verseId));
  }

  // Open collection picker for a verse
  openCollectionPicker(verseId: string, event: MouseEvent) {
    event.stopPropagation();
    this.collectionPickerVerseId.update((cur) => (cur === verseId ? null : verseId));
    this.newCollectionName.set('');
  }

  // Toggle verse in/out of a specific collection
  toggleVerseInCollection(collectionId: string, verseId: string, event: MouseEvent) {
    event.stopPropagation();
    this.collectionService.toggleVerse(collectionId, verseId);
  }

  // Create a new collection and add the verse to it
  createAndAddToCollection(verseId: string) {
    const name = this.newCollectionName().trim();
    if (!name) return;

    const col = this.collectionService.createCollection(name);
    this.collectionService.addVerse(col.id, verseId);
    this.newCollectionName.set('');
  }

  // Close collection picker
  closeCollectionPicker() {
    this.collectionPickerVerseId.set(null);
  }

  // Select a translation version
  selectVersion(versionId: string) {
    this.state.setVersion(versionId);
    this.versionPickerOpen.set(false);
    // Content reload will be triggered by the effect watching currentBibleVersion
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
