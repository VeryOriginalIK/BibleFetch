import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CollectionService } from '../../services/collection-service/collection-service';
import { BibleDataService } from '../../services/data-service/data-service';
import { StateService } from '../../services/state-service/state-service';
import { UserCollection } from '../../models/user-collection-model';
import { AuthService } from '../../services/auth-service/auth.service';

@Component({
  standalone: true,
  selector: 'app-collection-viewer',
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './collection-viewer-component.html',
})
export class CollectionViewerComponent implements OnInit {
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
  newVerseInput = signal('');
  errorMessage = signal<string | null>(null);
  verseLikeCounts = signal<Map<string, number>>(new Map());

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

    const col = this.collectionService.getCollection(id);
    if (!col) {
      this.router.navigate(['/']);
      return;
    }

    this.collection.set(col);
    await this.loadVerses();
    await this.loadBookList();
  }

  async loadBookList() {
    try {
      const books = await this.bibleService.getBooks('hu');
      this.allBooks.set(books.map(b => ({
        id: b.id,
        name: b.name['hu'] || b.name['en'] || b.id,
        chapterCount: b.chapterCount || 1
      })));
    } catch (err) {
      console.error('Failed to load books', err);
    }
  }

  async updateMaxVersesForChapter() {
    try {
      this.bibleService.getChapter('kjv_strongs', this.pickerBook(), this.pickerChapter()).subscribe({
        next: (verses) => {
          this.maxVerseInChapter.set(verses.length || 31);
          // Reset verse selections if they exceed the max
          if (this.pickerStartVerse() > verses.length) this.pickerStartVerse.set(1);
          if (this.pickerEndVerse() > verses.length) this.pickerEndVerse.set(1);
        },
        error: () => {
          this.maxVerseInChapter.set(31);
        }
      });
    } catch (err) {
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
        likeCounts = await this.collectionService['supabase'].getVerseLikeCounts(col.id);
        this.verseLikeCounts.set(likeCounts);
      } catch (err) {
        console.error('Failed to load like counts', err);
      }
    }

    // Initialize UI immediately with placeholders so available texts can populate gradually
    const initial = sortedVerseIds.map((vid) => {
      const parts = vid.split('-');
      const book = parts[0] || '';
      const chapter = parts[1] || '';
      const verse = parts[2] || '';
      return { id: `${book}-${chapter}-${verse}`, text: '', book, chapter, verse, likeCount: likeCounts.get(`${book}-${chapter}-${verse}`) || 0 };
    });

    this.verses.set(initial);

    // Group by chapter to load chunk files efficiently and update UI as each chunk arrives
    const chapters = new Set<string>(); // Set of "book-chapter" keys to load
    for (const id of sortedVerseIds) {
      const parts = id.split('-');
      if (parts.length >= 3) {
        chapters.add(`${parts[0]}-${parts[1]}`);
      }
    }

    // For each chapter group, fetch chapter content (uses cached chunk if available)
    const chapterPromises: Promise<void>[] = [];
    for (const chapterKey of chapters) {
      const [bookId, chapterNum] = chapterKey.split('-');
      const p = this.bibleService.getChapterContent(bookId, chapterNum, version).then((items) => {
        if (!items || items.length === 0) return;
        // Map texts by id for quick lookup
        const map = new Map(items.map(i => [i.id, i.text]));
        // Update verses signal incrementally (only mutate changed items)
        this.verses.update((current) => {
          return current.map(v =>
            map.has(v.id)
              ? { ...v, text: map.get(v.id)!, likeCount: likeCounts.get(v.id) || v.likeCount }
              : v  // Keep existing object reference if no change
          );
        });
      }).catch((err) => {
        console.debug('Chapter load failed for', chapterKey, err);
      });
      chapterPromises.push(p);
    }

    // After attempting to load all chapters, turn off main loading indicator
    await Promise.allSettled(chapterPromises);
    this.isLoading.set(false);

    // For any still-empty texts, fetch individually (deferred with requestIdleCallback)
    const remaining = this.verses().filter(v => !v.text).map(v => v.id);
    if (remaining.length > 0) {
      // Limit concurrency to avoid hammering network; simple batch of 10
      const batchSize = 10;
      for (let i = 0; i < remaining.length; i += batchSize) {
        const batch = remaining.slice(i, i + batchSize);
        await Promise.all(batch.map(async (vid) => {
          try {
            const text = await this.bibleService.getVerseText(vid, version);
            if (text) {
              this.verses.update(curr => curr.map(v =>
                v.id === vid
                  ? { ...v, text, likeCount: likeCounts.get(vid) || v.likeCount }
                  : v  // Keep existing reference
              ));
            }
          } catch (err) {
            // ignore per-verse errors
          }
        }));
      }
    }
  }

  removeVerse(verseId: string) {
    const col = this.collection();
    if (!col) return;
    this.collectionService.removeVerse(col.id, verseId);
    this.verses.update(v => v.filter(verse => verse.id !== verseId));
  }

  async addVerse() {
    const input = this.newVerseInput().trim();
    const col = this.collection();
    if (!input || !col) return;

    // Parse input like "gen 1:1" or "Genesis 1:1"
    const match = input.match(/^([a-z0-9]+)\s+(\d+):(\d+)$/i);
    if (!match) {
      this.errorMessage.set('Helytelen formátum. Példa: gen 1:1');
      setTimeout(() => this.errorMessage.set(null), 3000);
      return;
    }

    const [, book, chapter, verse] = match;
    const verseId = `${book.toLowerCase()}-${chapter}-${verse}`;

    // Check if verse exists
    const version = this.state.currentBibleVersion();
    const vid = `${book.toLowerCase()}-${chapter}-${verse}`;
    const text = await this.bibleService.getVerseText(vid, version);

    if (!text) {
      this.errorMessage.set('Vers nem található');
      setTimeout(() => this.errorMessage.set(null), 3000);
      return;
    }

    // Add to collection
    this.collectionService.addVerse(col.id, verseId);
    this.verses.update(v => [...v, { id: verseId, text, book, chapter, verse }]);
    this.newVerseInput.set('');
    this.showAddVerseModal.set(false);
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

    const version = this.state.currentBibleVersion();

    // Add each verse in the range
    for (let v = actualStart; v <= actualEnd; v++) {
      const verseId = `${book}-${chapter}-${v}`;
      const text = await this.bibleService.getVerseText(verseId, version);
      if (text) {
        this.collectionService.addVerse(col.id, verseId);
        this.verses.update(vList => [...vList, { id: verseId, text, book, chapter: String(chapter), verse: String(v) }]);
      }
    }

    this.showVersePicker.set(false);
    await this.loadVerses(); // Reload to ensure correct sorting
  }

  navigateToVerse(book: string, chapter: string) {
    this.router.navigate(['/bible', book, chapter]);
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
