import { RenderMode, ServerRoute } from '@angular/ssr';
import * as topicsJson from '../assets/topics/index.json';
import * as booksJson from '../assets/translation_structures/books.json'
import { TopicSummary } from './models/topic-summary-model';

const topics: TopicSummary[] = (topicsJson as any).default;

export const serverRoutes: ServerRoute[] = [
  {
    path: 'topic/:id',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => {
      return topics.map((topic) => ({ id: topic.id }));
    }
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
