import { Component, inject, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { BibleDataService } from '../../services/data-service/data-service';
import { Book } from '../../models/book-model';
import { StateService } from '../../services/state-service/state-service';
import { TextParserPipe } from '../../pipes/text-parser-pipe/text-parser-pipe';

@Component({
  selector: 'app-bible-reader',
  standalone: true,
  imports: [CommonModule, TextParserPipe, RouterModule],
  template: `
    <div
      class="min-h-screen pb-32 animate-fade-in bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-300"
    >
      <div
        class="sticky top-16 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex justify-between items-center shadow-sm transition-colors duration-300"
      >
        <h1 class="text-xl font-serif font-bold capitalize truncate max-w-[60%]">
          {{ bookName() }} <span class="text-blue-600">{{ chapter() }}.</span>
        </h1>

        <div class="flex gap-2">
          <button
            (click)="nav(-1)"
            [disabled]="isFirst()"
            class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Előző fejezet"
          >
            ⬅️
          </button>
          <button
            (click)="nav(1)"
            [disabled]="isLast()"
            class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Következő fejezet"
          >
            ➡️
          </button>
        </div>
      </div>

      <div class="max-w-screen-md mx-auto px-5 py-8 space-y-6">
        @if (isLoading()) {
        <div class="flex justify-center items-center py-20 space-x-2 animate-pulse">
          <div class="w-3 h-3 bg-blue-600 rounded-full"></div>
          <div class="w-3 h-3 bg-blue-600 rounded-full delay-75"></div>
          <div class="w-3 h-3 bg-blue-600 rounded-full delay-150"></div>
        </div>
        } @if (!isLoading()) { @for (verse of verses(); track verse.id) {
        <div class="relative group pl-2 md:pl-0">
          <span
            class="absolute -left-2 md:-left-6 top-1 text-xs text-gray-400 font-bold select-none opacity-60 group-hover:opacity-100 group-hover:text-blue-500 transition-all"
          >
            {{ getVerseNum(verse.id) }}
          </span>

          <p
            class="text-lg leading-relaxed text-gray-800 dark:text-gray-200 font-serif"
            [innerHTML]="verse.text | textParser"
            (click)="handleWordClick($event)"
          ></p>
        </div>
        } @empty {
        <div class="text-center py-10 text-gray-400 italic">
          Nincs megjeleníthető szöveg ehhez a fejezethez.
        </div>
        } }
      </div>

      @if (!isLoading() && verses().length > 0) {
      <div class="flex justify-center mt-12 gap-4">
        @if (!isFirst()) {
        <button
          (click)="nav(-1)"
          class="px-6 py-2 rounded-full border border-gray-300 dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Előző
        </button>
        } @if (!isLast()) {
        <button
          (click)="nav(1)"
          class="px-6 py-2 rounded-full bg-blue-600 text-white text-sm hover:bg-blue-700 shadow-md transition-colors"
        >
          Következő fejezet
        </button>
        }
      </div>
      }
    </div>
  `,
})
export class BibleReaderComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private data = inject(BibleDataService);
  public state = inject(StateService);

  // === SIGNALS ===
  bookId = signal<string>('');
  chapter = signal<number>(1);
  bookName = signal<string>('Betöltés...');
  verses = signal<{ id: string; text: string }[]>([]);
  isLoading = signal<boolean>(false);

  // Navigációs állapot
  maxChapters = signal<number>(0);
  isFirst = signal<boolean>(true);
  isLast = signal<boolean>(true);

  private routeSub: Subscription;

  constructor() {
    // 1. URL paraméterek figyelése
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const b = params.get('book');
      const c = parseInt(params.get('chapter') || '1', 10);

      if (b && (b !== this.bookId() || c !== this.chapter())) {
        this.bookId.set(b);
        this.chapter.set(c);
        this.loadContent();
      }
    });

    // 2. Ha megváltozik a nyelv vagy a verzió (StateService), töltsük újra
    effect(() => {
      // Figyeljük a signálokat
      this.state.currentLang();
      this.state.currentBibleVersion();

      // Ha már van aktív könyvünk, töltsük újra a tartalmát
      if (this.bookId()) {
        this.loadContent();
      }
    });
  }

  ngOnDestroy() {
    if (this.routeSub) this.routeSub.unsubscribe();
  }

  async loadContent() {
    this.isLoading.set(true);
    const currentVer = this.state.currentBibleVersion();
    const currentLang = this.state.currentLang();
    const bId = this.bookId();
    const chap = this.chapter();

    try {
      // 1. Könyv adatainak lekérése (verziófüggő fejezetszámmal!)
      const books: Book[] = await this.data.getBooks(currentVer);
      const currentBook = books.find((b) => b.id === bId);

      if (currentBook) {
        // Név beállítása
        this.bookName.set(currentBook.name[currentLang] || currentBook.name['hu']);

        // Fejezetszám validálás
        // (A Service-ből jövő chapterCount már a struktúra alapján van)
        const max = currentBook.chapterCount || 1; // Fallback: legalább 1 fejezet
        this.maxChapters.set(max);

        // UI gombok állapota
        this.isFirst.set(chap <= 1);
        this.isLast.set(chap >= max);
      } else {
        this.bookName.set('Ismeretlen könyv');
      }

      // 2. Konkrét versek betöltése
      const content = await this.data.getChapterContent(bId, chap.toString(), currentVer);
      this.verses.set(content);
    } catch (error) {
      console.error('Hiba az olvasó betöltésekor:', error);
      this.verses.set([]); // Üres lista hiba esetén
    } finally {
      this.isLoading.set(false);
      // Opcionális: Görgetés a tetejére lapozáskor
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  // Lapozás (Gombok kezelése)
  nav(direction: number) {
    const nextChap = this.chapter() + direction;

    // Csak akkor navigálunk, ha érvényes a fejezet
    // (A gomb disabled állapota is védi, de ez a biztonsági háló)
    if (nextChap >= 1 && nextChap <= this.maxChapters()) {
      this.router.navigate(['/read', this.bookId(), nextChap]);
    }
    // TODO: Itt lehetne implementálni a könyvek közötti átugrást is
    // (Pl. ha nextChap > maxChapters, akkor következő könyv 1. fejezet)
  }

  // Segédfüggvény: "gen-1-15" -> "15"
  getVerseNum(id: string): string {
    const parts = id.split('-');
    return parts.length >= 3 ? parts[2] : '';
  }

  // Kattintás kezelése (Event Delegation)
  handleWordClick(event: MouseEvent) {
    const target = (event.target as HTMLElement).closest('.interactive-word');
    if (target) {
      event.preventDefault(); // Ne kövesse a linket, ha lenne
      event.stopPropagation();
      const id = target.getAttribute('data-strong');
      if (id) this.state.openDefinition(id);
    }
  }
}
