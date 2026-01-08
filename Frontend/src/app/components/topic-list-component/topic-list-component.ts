import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TopicService} from '../../services/topic-service/topic-service';
import { TopicIndexItem } from '../../models/topic-index-item-model';

@Component({
  selector: 'app-topics-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="topics-page">
      <header class="page-header">
        <h1>Témák</h1>
        <p>Fedezd fel a Bibliát témakörök szerint</p>
      </header>

      <div class="grid-container">
        <a
          *ngFor="let topic of topics$ | async"
          [routerLink]="['/topics', topic.id]"
          class="topic-card"
          [style.border-top-color]="topic.theme_color"
        >
          <div class="card-icon" [style.color]="topic.theme_color">
            <span class="material-icons">{{ getIcon(topic.icon) }}</span>
          </div>

          <div class="card-content">
            <h3>{{ topic.titles.hu }}</h3>
            <p class="description">{{ topic.description.hu }}</p>
            <span class="badge">{{ topic.verseCount }} vers</span>
          </div>
        </a>
      </div>
    </div>
  `,
  styles: [
    `
      .topics-page {
        max-width: 1000px;
        margin: 0 auto;
        padding: 20px;
        font-family: 'Segoe UI', sans-serif;
      }
      .page-header {
        text-align: center;
        margin-bottom: 40px;
      }
      .page-header h1 {
        font-size: 2.5rem;
        margin-bottom: 10px;
        color: #2c3e50;
      }
      .page-header p {
        color: #7f8c8d;
      }

      .grid-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
      }

      .topic-card {
        display: flex;
        flex-direction: column;
        background: white;
        border-radius: 12px;
        padding: 20px;
        text-decoration: none;
        color: inherit;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        transition: transform 0.2s, box-shadow 0.2s;
        border-top: 5px solid #ddd; /* Alapértelmezett szín, de felülírjuk */
        height: 100%;
      }

      .topic-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
      }

      .card-icon {
        font-size: 2rem;
        margin-bottom: 15px;
      }

      h3 {
        margin: 0 0 10px 0;
        font-size: 1.25rem;
        color: #34495e;
      }

      .description {
        font-size: 0.9rem;
        color: #7f8c8d;
        margin-bottom: 20px;
        line-height: 1.5;
        flex-grow: 1; /* Hogy a badge mindig alulra kerüljön */
      }

      .badge {
        align-self: flex-start;
        background: #f1f2f6;
        color: #57606f;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 600;
      }
    `,
  ],
})
export class TopicListComponent {
  private service = inject(TopicService);
  topics$ = this.service.getTopicsIndex();

  // Segédfüggvény az ikonokhoz (ha nincs ikonkönyvtárad, használhatsz emojikat is)
  getIcon(iconName: string): string {
    const icons: { [key: string]: string } = {
      leaf: '🌿', // Emoji fallback
      heart: '❤️',
      fire: '🔥',
      star: '⭐',
    };
    return icons[iconName] || '📖';
  }
}
