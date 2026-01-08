import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { TopicService } from '../../services/topic-service/topic-service';
import { BibleDataService } from '../../services/data-service/data-service'
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';
import { TopicDetail } from '../../models/topic-detail-model';

// Ez egy belső nézet-modell a komponensnek (nem kell külön fájlba)
interface RenderedVerse {
  label: string;
  text: string;
}

@Component({
  selector: 'app-topic-viewer',
  standalone: true,
  imports: [CommonModule, RouterModule, VerseRendererComponent],
  template: `
    <div class="topic-viewer" *ngIf="vm$ | async as vm; else loading">
      <header class="topic-hero" [style.background-color]="vm.topic.theme_color">
        <div class="hero-content">
          <a routerLink="/topics" class="back-btn">← Vissza</a>
          <h1>{{ vm.topic.titles.hu }}</h1>
          <p *ngIf="vm.topic.description">{{ vm.topic.description.hu }}</p>
        </div>
      </header>

      <div class="verses-container">
        <div *ngFor="let verse of vm.verses" class="verse-card">
          <div class="verse-ref" [style.color]="vm.topic.theme_color">
            {{ verse.label }}
          </div>

          <app-verse-renderer [rawText]="verse.text"></app-verse-renderer>
        </div>
      </div>
    </div>

    <ng-template #loading>
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Téma betöltése...</p>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .topic-viewer {
        min-height: 100vh;
        background: #f9f9f9;
        font-family: 'Segoe UI', sans-serif;
      }
      .topic-hero {
        color: white;
        padding: 60px 20px;
        text-align: center;
      }
      .hero-content {
        max-width: 800px;
        margin: 0 auto;
        position: relative;
      }
      .back-btn {
        position: absolute;
        left: 0;
        top: -40px;
        color: rgba(255, 255, 255, 0.8);
        text-decoration: none;
        font-weight: bold;
      }
      .back-btn:hover {
        text-decoration: underline;
      }

      .verses-container {
        max-width: 800px;
        margin: -30px auto 0;
        padding: 0 20px 40px;
      }

      .verse-card {
        background: white;
        padding: 25px;
        margin-bottom: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        transition: transform 0.2s;
      }

      .verse-ref {
        font-weight: 700;
        font-size: 0.9rem;
        margin-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .loading-state {
        text-align: center;
        padding: 50px;
        color: #777;
      }
      .spinner {
        margin: 0 auto 15px;
        border: 4px solid #eee;
        border-top: 4px solid #666;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
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
export class TopicViewerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private topicsService = inject(TopicService);
  private bibleService = inject(BibleDataService);

  vm$!: Observable<{ topic: TopicDetail; verses: RenderedVerse[] }>;

  ngOnInit() {
    this.vm$ = this.route.paramMap.pipe(
      switchMap((params) => {
        const id = params.get('id')!;

        return this.topicsService.getTopicDetail(id).pipe(
          switchMap((topic) => {
            // Itt használjuk a TopicDetail 'verses' mezőjét (ami string[])
            const requests = topic.verses.map((idString) => {
              // Kódolás: "jer-29-11" -> book: jer, chap: 29, verse: 11
              const parts = idString.split('-');

              if (parts.length !== 3) {
                return of({ label: idString, text: 'Hibás hivatkozás formátum.' });
              }

              const book = parts[0];
              const chapter = parts[1];
              const verseNum = parseInt(parts[2], 10);

              // Adatok lekérése a BibleService-től
              return this.bibleService.getChapter('kjv_strongs', book, chapter).pipe(
                map((chapterVerses) => {
                  const found = chapterVerses.find((v) => v.v === verseNum);
                  return {
                    // Csinosítjuk a címkét
                    label: `${book.toUpperCase()} ${chapter}:${verseNum}`,
                    text: found ? found.text : 'A vers nem található.',
                  };
                }),
                catchError(() => of({ label: idString, text: 'Hiba a betöltésnél.' }))
              );
            });

            // Ha nincs vers a listában, üres tömbbel térünk vissza azonnal
            if (requests.length === 0) {
              return of({ topic, verses: [] });
            }

            return forkJoin(requests).pipe(map((verses) => ({ topic, verses })));
          })
        );
      })
    );
  }
}
