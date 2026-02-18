import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { TopicService } from '../../services/topic-service/topic-service';
import { BibleDataService } from '../../services/data-service/data-service';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';
import { TopicDetail } from '../../models/topic-detail-model';

interface RenderedVerse {
  label: string;
  text: string;
}

@Component({
  selector: 'app-topic-viewer',
  standalone: true,
  imports: [CommonModule, RouterModule, VerseRendererComponent],
  templateUrl: './topic-viewer-component.html',
  styleUrl: './topic-viewer-component.css',
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
              //           "exo-3-14-15" -> book: exo, chap: 3, verse: 14-15 (range)
              const ref = this.bibleService.parseVerseRef(idString);

              if (!ref) {
                return of({ label: idString, text: 'Hibás hivatkozás formátum.' });
              }

              const { bookId, chapter, verseStart, verseEnd } = ref;
              const isRange = verseStart !== verseEnd;

              // Adatok lekérése a BibleService-től
              return this.bibleService.getChapter('kjv_strongs', bookId, chapter).pipe(
                map((chapterVerses) => {
                  if (isRange) {
                    const found = chapterVerses
                      .filter((v: any) => v.v >= verseStart && v.v <= verseEnd)
                      .sort((a: any, b: any) => a.v - b.v);
                    return {
                      label: `${bookId.toUpperCase()} ${chapter}:${verseStart}-${verseEnd}`,
                      text: found.length > 0
                        ? found.map((v: any) => v.text).join(' ')
                        : 'A versek nem találhatók.',
                    };
                  } else {
                    const found = chapterVerses.find((v: any) => v.v === verseStart);
                    return {
                      label: `${bookId.toUpperCase()} ${chapter}:${verseStart}`,
                      text: found ? found.text : 'A vers nem található.',
                    };
                  }
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
