import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { TopicService } from '../../services/topic-service/topic-service';
import { TopicSummary } from '../../models/topic-summary-model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="home-container">
      <header class="hero-section">
        <div class="hero-content">
          <h1>Bibliai Témák</h1>
          <p>Fedezd fel Isten igéjét tematikus gyűjteményeinken keresztül.</p>
        </div>
      </header>

      <main class="topics-grid" *ngIf="topics$ | async as topics; else loading">
        <a
          *ngFor="let topic of topics"
          [routerLink]="['/topics', topic.id]"
          class="topic-card"
          [style.--hover-color]="topic.theme_color || '#3b82f6'"
        >
          <div class="card-header">
            <div class="icon-circle" [style.background-color]="topic.theme_color || '#ccc'">
              <span class="material-icon">{{ topic.icon || 'star' }}</span>
            </div>
            <span class="verse-count" *ngIf="topic.verseCount"> {{ topic.verseCount }} vers </span>
          </div>

          <h2 class="topic-title">{{ topic.titles.hu }}</h2>
          <p class="topic-desc" *ngIf="topic.description">
            {{ topic.description.hu }}
          </p>

          <div class="card-footer">
            <span class="read-more" [style.color]="topic.theme_color">Megnyitás →</span>
          </div>
        </a>
      </main>

      <ng-template #loading>
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Témák betöltése...</p>
        </div>
      </ng-template>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background-color: #f8fafc;
        font-family: 'Segoe UI', sans-serif;
      }

      /* Hero Szekció */
      .hero-section {
        background: white;
        padding: 60px 20px;
        text-align: center;
        border-bottom: 1px solid #e2e8f0;
        margin-bottom: 40px;
      }
      .hero-content h1 {
        font-size: 2.5rem;
        color: #1e293b;
        margin: 0 0 10px;
      }
      .hero-content p {
        color: #64748b;
        font-size: 1.1rem;
      }

      /* Grid Elrendezés */
      .topics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 24px;
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 20px 60px;
      }

      /* Kártya Stílus */
      .topic-card {
        background: white;
        border-radius: 12px;
        padding: 24px;
        text-decoration: none;
        color: inherit;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        transition: all 0.3s ease;
        border: 1px solid transparent;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
      }

      /* Hover effektek */
      .topic-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        border-color: var(--hover-color);
      }

      /* Kártya Belső Elemek */
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .icon-circle {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 1.2rem;
      }

      .verse-count {
        font-size: 0.8rem;
        background: #f1f5f9;
        color: #64748b;
        padding: 4px 10px;
        border-radius: 20px;
        font-weight: 600;
      }

      .topic-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 8px;
      }

      .topic-desc {
        color: #64748b;
        font-size: 0.95rem;
        line-height: 1.5;
        margin: 0 0 20px;
        flex-grow: 1; /* Hogy a footer mindig alul legyen */
      }

      .card-footer {
        margin-top: auto;
      }

      .read-more {
        font-weight: 600;
        font-size: 0.9rem;
      }

      /* Loading */
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
export class HomeComponent {
  private topicsService = inject(TopicService);

  // Lekérjük az indexet, ami TopicSummary[] típusú
  topics$: Observable<TopicSummary[]> = this.topicsService.getTopicsIndex();
}
