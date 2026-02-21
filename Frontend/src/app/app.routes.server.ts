import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'topics/:id',
    renderMode: RenderMode.Client,
  },
  {
    path: 'bible/:book/:chapter',
    renderMode: RenderMode.Client,
  },
  {
    path: 'search',
    renderMode: RenderMode.Client,
  },
  {
    path: 'collection/:id',
    renderMode: RenderMode.Client,
  },
  {
    path: 'public-collections',
    renderMode: RenderMode.Prerender,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
