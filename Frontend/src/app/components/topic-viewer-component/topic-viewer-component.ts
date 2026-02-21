import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { TopicService } from '../../services/topic-service/topic-service';
import { BibleDataService } from '../../services/data-service/data-service';
import { VerseRendererComponent } from '../verse-renderer-component/verse-renderer-component';
import { CollectionService } from '../../services/collection-service/collection-service';
import { TopicDetail } from '../../models/topic-detail-model';

interface RenderedVerse {
  label: string;
  text: string;
  verseId: string;   // e.g. "joh-3-16"
  bookId: string;    // e.g. "joh"
  chapter: number;   // e.g. 3
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
  private router = inject(Router);
  private topicsService = inject(TopicService);
  private bibleService = inject(BibleDataService);
  public collectionService = inject(CollectionService);

  vm$!: Observable<{ topic: TopicDetail; verses: RenderedVerse[] }>;

  // Collection picker state
  collectionPickerVerseId = signal<string | null>(null);
  newCollectionName = signal<string>('');

  navigateToVerse(bookId: string, chapter: number) {
    this.router.navigate(['/bible', bookId, chapter]);
  }

  openCollectionPicker(verseId: string, event: Event) {
    event.stopPropagation();
    this.collectionPickerVerseId.set(
      this.collectionPickerVerseId() === verseId ? null : verseId
    );
    this.newCollectionName.set('');
  }

  closeCollectionPicker(event?: Event) {
    event?.stopPropagation();
    this.collectionPickerVerseId.set(null);
  }

  toggleVerseInCollection(collectionId: string, verseId: string, event: Event) {
    event.stopPropagation();
    this.collectionService.toggleVerse(collectionId, verseId);
  }

  createAndAddToCollection(verseId: string) {
    const name = this.newCollectionName().trim();
    if (!name) return;
    const col = this.collectionService.createCollection(name);
    this.collectionService.addVerse(col.id, verseId);
    this.newCollectionName.set('');
  }

  ngOnInit() {
    this.vm$ = this.route.paramMap.pipe(
      switchMap((params) => {
        const id = params.get('id')!;

        return this.topicsService.getTopicDetail(id).pipe(
          switchMap((topic) => {
            // Sync topic as a collection
            this.collectionService.syncTopicCollection(
              topic.id,
              topic.titles.hu,
              topic.verses,
              topic.theme_color
            );

            const requests = topic.verses.map((idString) => {
              const ref = this.bibleService.parseVerseRef(idString);

              if (!ref) {
                return of<RenderedVerse>({ label: idString, text: 'Hibás hivatkozás formátum.', verseId: idString, bookId: '', chapter: 0 });
              }

              const { bookId, chapter, verseStart, verseEnd } = ref;
              const isRange = verseStart !== verseEnd;
              const chapterNum = typeof chapter === 'number' ? chapter : parseInt(String(chapter), 10);

              return this.bibleService.getChapter('kjv_strongs', bookId, chapterNum).pipe(
                map((chapterVerses) => {
                  if (isRange) {
                    const found = chapterVerses
                      .filter((v: any) => v.v >= verseStart && v.v <= verseEnd)
                      .sort((a: any, b: any) => a.v - b.v);
                    return <RenderedVerse>{
                      label: `${bookId.toUpperCase()} ${chapterNum}:${verseStart}-${verseEnd}`,
                      text: found.length > 0 ? found.map((v: any) => v.text).join(' ') : 'A versek nem találhatók.',
                      verseId: idString,
                      bookId,
                      chapter: chapterNum,
                    };
                  } else {
                    const found = chapterVerses.find((v: any) => v.v === verseStart);
                    return <RenderedVerse>{
                      label: `${bookId.toUpperCase()} ${chapterNum}:${verseStart}`,
                      text: found ? found.text : 'A vers nem található.',
                      verseId: idString,
                      bookId,
                      chapter: chapterNum,
                    };
                  }
                }),
                catchError(() => of<RenderedVerse>({ label: idString, text: 'Hiba a betöltésnél.', verseId: idString, bookId: '', chapter: 0 }))
              );
            });

            if (requests.length === 0) {
              return of({ topic, verses: [] as RenderedVerse[] });
            }

            return forkJoin(requests).pipe(map((verses) => ({ topic, verses })));
          })
        );
      })
    );
  }
}

