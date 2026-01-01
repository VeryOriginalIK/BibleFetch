import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BibleDataService } from '../../services/data-service/data-service';
import { StateService } from '../../services/state-service/state-service';
import { Topic } from '../../models/topic-model';
import { VerseCardComponent } from '../verse-card-component/verse-card-component';

@Component({
  selector: 'app-topic-viewer',
  standalone: true,
  imports: [CommonModule, VerseCardComponent],
  templateUrl: './topic-viewer-component.html',
})
export class TopicViewerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private location = inject(Location); // A "Vissza" gombhoz
  private bibleData = inject(BibleDataService);
  public state = inject(StateService);

  currentTopic = signal<Topic | null>(null);

  ngOnInit() {
    // URL paraméter leolvasása (pl. 'hope')
    const topicId = this.route.snapshot.paramMap.get('id');

    if (topicId) {
      this.loadTopic(topicId);
    }
  }

  goBack() {
    this.location.back();
  }

  loadTopic(id: string) {
    // Mivel a topics.json már cache-elve van a Home-ról, ez azonnal visszatér
    this.bibleData.getTopics().subscribe((topics) => {
      const found = topics.find((t) => t.id === id);
      if (found) {
        this.currentTopic.set(found);
      }
    });
  }
}
