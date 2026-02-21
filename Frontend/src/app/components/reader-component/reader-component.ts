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

import { BibleDataService } from '../../services/data-service/data-service';
import { VerseManagerService } from '../../services/verse-manager-service/verse-manager-service';
import { BibleVerse } from '../../models/bible-verse-model';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';

@Component({
  selector: 'app-reader',
  standalone: true,
  imports: [CommonModule, RouterModule, VerseRendererComponent],
  encapsulation: ViewEncapsulation.Emulated,
  templateUrl: './reader-component.html',
  styleUrl: './reader-component.css',
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
