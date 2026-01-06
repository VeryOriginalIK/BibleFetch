import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

// IMPORTOK
import { BibleDataService } from '../../services/data-service/data-service';
import { StateService } from '../../services/state-service/state-service';
import { VerseCardComponent } from '../verse-card-component/verse-card-component';
// FONTOS: A részletes modellt importáljuk!
import { TopicDetail } from '../../models/topic-detail-model';

@Component({
  selector: 'app-topic-viewer',
  standalone: true,
  imports: [CommonModule, VerseCardComponent],
  templateUrl: './topic-viewer-component.html',
})
export class TopicViewerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private bibleData = inject(BibleDataService);
  public state = inject(StateService);

  // 1. VÁLTOZÁS: A típus TopicDetail, mert ebben van a 'verses' tömb
  currentTopic = signal<TopicDetail | null>(null);

  // Opcionális: Betöltés állapot jelzése
  isLoading = signal<boolean>(true);

  ngOnInit() {
    const topicId = this.route.snapshot.paramMap.get('id');

    if (topicId) {
      this.loadTopic(topicId);
    }
  }

  goBack() {
    this.location.back();
  }

  // 2. VÁLTOZÁS: Az új service függvényt használjuk
  async loadTopic(id: string) {
    this.isLoading.set(true);

    // Ez letölti a topics/ID.json fájlt + összefésüli a címmel
    const topic = await this.bibleData.getTopicDetail(id);

    if (topic) {
      this.currentTopic.set(topic);
    } else {
      console.error('Nem sikerült betölteni a témát:', id);
    }

    this.isLoading.set(false);
  }
}
