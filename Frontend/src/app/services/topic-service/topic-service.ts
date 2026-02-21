import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, combineLatest, defer, from, map, of, shareReplay, switchMap, catchError } from 'rxjs';
import { TopicSummary } from '../../models/topic-summary-model';
import { TopicDetail } from '../../models/topic-detail-model';
import { SupabaseSyncService } from '../supabase-sync/supabase-sync.service';

@Injectable({
  providedIn: 'root',
})
export class TopicService {
  private http = inject(HttpClient);
  private supabaseSync = inject(SupabaseSyncService);

  // Asset fallback index (kept for local/offline operation)
  private assetIndex$ = this.http.get<TopicSummary[]>('/assets/topics/index.json').pipe(shareReplay(1));

  // DB-first index: Supabase -> fallback assets
  private index$ = defer(() =>
    from(this.supabaseSync.loadDefaultTopicsIndex()).pipe(
      map((rows) =>
        (rows || []).map((row: any) => ({
          id: row.topic_id,
          titles: row.titles,
          description: row.description,
          icon: row.icon,
          category: row.category,
          theme_color: row.theme_color,
          verseCount: row.verse_count,
        })) as TopicSummary[]
      ),
      switchMap((dbList) => (dbList.length > 0 ? of(dbList) : this.assetIndex$)),
      catchError(() => this.assetIndex$),
      shareReplay(1)
    )
  );

  getTopicsIndex(): Observable<TopicSummary[]> {
    return this.index$;
  }

  getTopicDetail(id: string): Observable<TopicDetail> {
    const dbDetail$ = defer(() => from(this.supabaseSync.loadDefaultTopicDetail(id))).pipe(
      map((row) => {
        if (!row) return null;
        return {
          id: row.topic_id,
          titles: row.titles,
          description: row.description,
          icon: row.icon,
          category: row.category,
          theme_color: row.theme_color,
          verseCount: row.verse_count,
          verses: row.verse_ids || [],
        } as TopicDetail;
      }),
      catchError(() => of(null))
    );

    // 1. Metaadatok (Cím, leírás, szín) az indexből (fallback path)
    const summary$ = this.index$.pipe(map((list) => list.find((item) => item.id === id)));

    // 2. Részletek a JSON fájlból
    // Figyelem: A JSON-ban "verse_ids" van, de nekünk egy köztes típus kell itt a beolvasáshoz
    const details$ = this.http.get<{ verse_ids: string[]; theme_color?: string }>(
      `/assets/topics/${id}.json`
    );

    // 3. Prefer DB detail, otherwise fallback to assets
    return dbDetail$.pipe(
      switchMap((dbDetail) => {
        if (dbDetail) return of(dbDetail);

        return combineLatest([summary$, details$]).pipe(
          map(([summary, detail]) => {
            if (!summary) throw new Error('Téma nem található az indexben');

            return {
              ...summary,
              theme_color: detail.theme_color || summary.theme_color,
              verses: detail.verse_ids,
            } as TopicDetail;
          })
        );
      })
    );
  }
}
