import {
  Component,
  OnInit,
  inject,
  PLATFORM_ID,
  ChangeDetectorRef,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule, ViewportScroller, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

// === IMPORTOK (Ellenőrizd az útvonalakat!) ===
import { BibleDataService } from '../../services/data-service/data-service';
import { VerseManagerService } from '../../services/verse-manager-service/verse-manager-service';
import { BibleVerse } from '../../models/bible-verse-model';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';

@Component({
  selector: 'app-reader',
  standalone: true,
  imports: [CommonModule, RouterModule, VerseRendererComponent],
  // Encapsulation: None, hogy a globális fontokat könnyebben elérjük,
  // de itt most scoped stílusokat használunk, ami biztonságosabb.
  encapsulation: ViewEncapsulation.Emulated,
  template: `
    <div class="reader-layout">
      <article class="paper-card">
        <header class="chapter-header">
          <div class="version-tag">{{ currentTrans | uppercase }}</div>
          <h1 class="book-title">
            <span class="book-name">{{ currentBook | titlecase }}</span>
            <span class="chapter-num">{{ currentChapter }}</span>
          </h1>
        </header>

        <div *ngIf="isLoading" class="status-container">
          <div class="spinner"></div>
          <p>Szöveg betöltése...</p>
        </div>

        <div *ngIf="errorMessage" class="status-container error-state">
          <div class="error-icon">⚠️</div>
          <p>{{ errorMessage }}</p>
          <button (click)="loadChapter()" class="btn-retry">Újrapróbálás</button>
        </div>

        <div
          *ngIf="!isLoading && !errorMessage && verses.length === 0"
          class="status-container empty-state"
        >
          <p>Ez a fejezet még nem elérhető.</p>
        </div>

        <section *ngIf="!isLoading && verses.length > 0" class="scripture-body">
          <div
            *ngFor="let verse of verses"
            [id]="'v-' + verse.v"
            class="verse-wrapper"
            [class.focused-verse]="focusVerse === verse.v"
            [class.hidden-verse]="isHidden(verse.v)"
            (click)="onVerseClick(verse)"
          >
            <span class="v-num">{{ verse.v }}</span>

            <div class="v-text">
              <app-verse-renderer [rawText]="verse.text"></app-verse-renderer>
            </div>

            <button
              *ngIf="isHidden(verse.v)"
              class="btn-reveal"
              (click)="toggleHide(verse.v, $event)"
            >
              👁️ Megjelenítés
            </button>
          </div>
        </section>

        <footer class="chapter-footer">
          <button
            (click)="navChapter(-1)"
            [disabled]="currentChapter === '1' && currentBook === 'gen'"
            class="nav-btn prev"
          >
            <span>← Előző</span>
          </button>

          <button (click)="navChapter(1)" class="nav-btn next">
            <span>Következő →</span>
          </button>
        </footer>
      </article>
    </div>
  `,
  styles: [
    `
      /* === 1. ALAP ELRENDEZÉS === */
      :host {
        display: block;
        min-height: 100vh;
        background-color: #f4f4f4; /* Halványszürke háttér az oldalnak */
        padding: 20px 10px;
        font-family: 'Merriweather', 'Georgia', serif; /* Prémium betűtípus */
      }

      .reader-layout {
        display: flex;
        justify-content: center;
      }

      .paper-card {
        background-color: #ffffff;
        width: 100%;
        max-width: 850px; /* Olvasható sorszélesség */
        padding: 40px 50px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08); /* Elegáns árnyék */
        min-height: 80vh;
        position: relative;
      }

      /* Mobilon kisebb padding */
      @media (max-width: 600px) {
        .paper-card {
          padding: 20px;
        }
        :host {
          padding: 10px 5px;
        }
      }

      /* === 2. FEJLÉC === */
      .chapter-header {
        text-align: center;
        margin-bottom: 40px;
        border-bottom: 2px solid #f0f0f0;
        padding-bottom: 20px;
      }

      .version-tag {
        font-family: 'Helvetica Neue', sans-serif;
        font-size: 0.75rem;
        letter-spacing: 1px;
        color: #888;
        background: #f9f9f9;
        display: inline-block;
        padding: 4px 10px;
        border-radius: 20px;
        margin-bottom: 10px;
      }

      .book-title {
        margin: 0;
        color: #333;
        font-weight: 700;
        font-size: 2.2rem;
      }

      .book-name {
        margin-right: 10px;
      }
      .chapter-num {
        color: #d35400; /* Kiemelő szín (pl. terrakotta) */
      }

      /* === 3. SZÖVEG STÍLUSOK === */
      .scripture-body {
        font-size: 1.15rem; /* Nagyobb betűméret */
        line-height: 1.8; /* Szellős sorköz */
        color: #2c3e50; /* Sötétkék-szürke (jobb mint a fekete) */
      }

      .verse-wrapper {
        position: relative;
        padding: 6px 8px 6px 40px; /* Hely a versszámnak */
        margin-bottom: 4px;
        border-radius: 6px;
        transition: background-color 0.2s ease;
        cursor: pointer;
      }

      .verse-wrapper:hover {
        background-color: #f8f9fa;
      }

      /* Kiemelt vers (URL-ből vagy kattintásra) */
      .verse-wrapper.focused-verse {
        background-color: #fff8e1; /* Halvány sárga */
        box-shadow: inset 3px 0 0 #ffc107; /* Bal oldali csík */
      }

      .v-num {
        position: absolute;
        left: 5px;
        top: 8px;
        font-family: 'Helvetica Neue', sans-serif;
        font-size: 0.75rem;
        font-weight: bold;
        color: #b0bec5; /* Halvány szürke szám */
        user-select: none;
      }

      .v-text {
        display: inline;
      }

      /* Rejtett vers stílus */
      .hidden-verse .v-text {
        filter: blur(5px);
        opacity: 0.2;
        pointer-events: none;
      }

      .btn-reveal {
        display: block;
        margin: 10px auto;
        padding: 6px 12px;
        background: #eee;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
      }

      /* === 4. NAVIGÁCIÓ (LÁBLÉC) === */
      .chapter-footer {
        margin-top: 60px;
        padding-top: 30px;
        border-top: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .nav-btn {
        background-color: white;
        border: 1px solid #ddd;
        color: #555;
        padding: 12px 24px;
        font-size: 1rem;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: sans-serif;
        font-weight: 500;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
      }

      .nav-btn:hover:not(:disabled) {
        background-color: #333;
        color: white;
        border-color: #333;
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
      }

      .nav-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        box-shadow: none;
      }

      /* === 5. LOADING & ERROR === */
      .status-container {
        text-align: center;
        padding: 60px 0;
        color: #777;
      }

      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #d35400;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 15px;
      }

      .error-state {
        color: #c0392b;
        background: #fdedec;
        border-radius: 8px;
        padding: 20px;
      }
      .btn-retry {
        margin-top: 10px;
        padding: 8px 16px;
        background: #c0392b;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class ReaderComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dataService = inject(BibleDataService);
  private verseManager = inject(VerseManagerService);
  private scroller = inject(ViewportScroller);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef); // A "Change Detection" javítás

  verses: BibleVerse[] = [];
  currentTrans = 'kjv_strongs';
  currentBook = 'gen';
  currentChapter = '1';
  focusVerse: number | null = null;
  isLoading = true;
  errorMessage = '';

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      this.currentTrans = params.get('trans') || 'kjv_strongs';
      this.currentBook = params.get('book') || 'gen';
      this.currentChapter = params.get('chapter') || '1';
      this.errorMessage = '';

      // Javítás: Aszinkron késleltetés az Angular ciklushoz
      setTimeout(() => {
        this.loadChapter();
      }, 0);
    });

    this.route.queryParamMap.subscribe((q) => {
      const v = q.get('v');
      this.focusVerse = v ? parseInt(v, 10) : null;
      if (this.verses.length > 0) this.tryScroll();
    });
  }

  loadChapter() {
    if (!isPlatformBrowser(this.platformId)) return;

    this.isLoading = true;
    this.verses = [];
    this.errorMessage = '';
    this.cdr.detectChanges(); // UI frissítés: Töltés indul

    this.dataService
      .getChapter(this.currentTrans, this.currentBook, this.currentChapter)
      .pipe(
        catchError((err) => {
          console.error('[Reader] Hiba:', err);
          this.errorMessage = 'Nem sikerült betölteni a fejezetet. Ellenőrizd a kapcsolatot.';
          this.isLoading = false;
          this.cdr.detectChanges();
          return of([]);
        })
      )
      .subscribe((data) => {
        this.verses = data || [];
        this.isLoading = false;

        if (this.verses.length === 0 && !this.errorMessage) {
          this.errorMessage = 'A fejezet üres vagy nem található.';
        }

        this.cdr.detectChanges(); // UI frissítés: Adat megjött
        this.tryScroll();
      });
  }

  tryScroll() {
    if (this.focusVerse && isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        try {
          this.scroller.scrollToAnchor(`v-${this.focusVerse}`);
        } catch (e) {}
      }, 150);
    }
  }

  onVerseClick(verse: BibleVerse) {
    // Itt hívható meg a Context Menu logika
    console.log('Clicked:', verse);
  }

  toggleHide(v: number, event: Event) {
    event.stopPropagation();
    this.verseManager.toggleVerseVisibility(this.currentBook, this.currentChapter, v);
  }

  isHidden(v: number): boolean {
    return this.verseManager.isVerseHidden(this.currentBook, this.currentChapter, v);
  }

  navChapter(delta: number) {
    const currentChapNum = parseInt(this.currentChapter, 10);
    if (isNaN(currentChapNum)) return;

    const nextChap = currentChapNum + delta;
    if (nextChap > 0) {
      this.router.navigate(['/read', this.currentTrans, this.currentBook, nextChap]);
    }
  }
}
