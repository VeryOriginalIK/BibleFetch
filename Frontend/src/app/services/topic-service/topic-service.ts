import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, combineLatest, map, shareReplay } from 'rxjs';
import { TopicSummary } from '../../models/topic-summary-model';
import { TopicDetail } from '../../models/topic-detail-model';

@Injectable({
  providedIn: 'root',
})
export class TopicService {
  private http = inject(HttpClient);

  // Cache az indexhez
  private index$ = this.http.get<TopicSummary[]>('/assets/topics/index.json').pipe(shareReplay(1));

  getTopicsIndex(): Observable<TopicSummary[]> {
    return this.index$;
  }

  getTopicDetail(id: string): Observable<TopicDetail> {
    // 1. Metaadatok (Cím, leírás, szín) az indexből
    const summary$ = this.index$.pipe(map((list) => list.find((item) => item.id === id)));

    // 2. Részletek a JSON fájlból
    // Figyelem: A JSON-ban "verse_ids" van, de nekünk egy köztes típus kell itt a beolvasáshoz
    const details$ = this.http.get<{ verse_ids: string[]; theme_color?: string }>(
      `/assets/topics/${id}.json`
    );

    // 3. Egyesítés
    return combineLatest([summary$, details$]).pipe(
      map(([summary, detail]) => {
        if (!summary) throw new Error('Téma nem található az indexben');

        // Itt hozzuk létre a végleges TopicDetail objektumot
        return {
          ...summary, // Örökli az id, titles, description, icon, stb. mezőket

          // Felülírjuk a színt, ha a részlet fájlban van egyedi
          theme_color: detail.theme_color || summary.theme_color,

          // FONTOS: Átnevezzük a mezőt! JSON: verse_ids -> Model: verses
          verses: detail.verse_ids,
        } as TopicDetail;
      })
    );
  }
}
