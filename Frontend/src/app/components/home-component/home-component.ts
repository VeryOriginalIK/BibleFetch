import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { TopicService } from '../../services/topic-service/topic-service';
import { TopicSummary } from '../../models/topic-summary-model';
import { StateService } from '../../services/state-service/state-service';
import { LocalizedString } from '../../models/localized-string-model';
import { CollectionService } from '../../services/collection-service/collection-service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home-component.html',
  styleUrl: './home-component.css',
})
export class HomeComponent {
  state = inject(StateService);
  private topicsService = inject(TopicService);
  protected collectionService = inject(CollectionService);
  private router = inject(Router);

  topics$: Observable<TopicSummary[]> = this.topicsService.getTopicsIndex();

  getLocaleText(obj: LocalizedString | undefined): string {
    if (!obj) return '';
    return obj[this.state.lang()] || obj['en'] || '';
  }
  getIconEmoji(icon: string): string {
    const emojis: Record<string, string> = {
      star: '⭐',
      heart: '❤️',
      book: '📖',
      fire: '🔥',
      light: '💡',
      pray: '🙏',
      family: '👨‍👩‍👧‍👦',
      money: '💰',
      health: '⚕️',
      work: '💼',
    };
    return emojis[icon] || '⭐';
  }

  // Collection methods
  get userCollections() {
    return this.collectionService.collections();
  }

  navigateToCollection(collectionId: string) {
    this.router.navigate(['/collection', collectionId]);
  }

  formatVerseId(verseId: string): string {
    const parts = verseId.split('-');
    if (parts.length === 3) {
      return `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}`;
    } else if (parts.length === 4) {
      return `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}-${parts[3]}`;
    }
    return verseId;
  }
}
