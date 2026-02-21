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
  public collectionService = inject(CollectionService);
  private router = inject(Router);

  topics$: Observable<TopicSummary[]> = this.topicsService.getTopicsIndex();

  getLocaleText(obj: LocalizedString | undefined): string {
    if (!obj) return '';
    return obj[this.state.lang()] || obj['en'] || '';
  }

  getIconPath(icon: string): string {
    const paths: Record<string, string> = {
      star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
      heart: 'M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z',
      book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
      fire: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z',
    };
    return paths[icon] || paths['star'];
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
    return this.collectionService.collections().filter(c => !c.topicId);
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
