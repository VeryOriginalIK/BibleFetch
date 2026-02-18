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
    path: 'read/:trans/:book/:chapter',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
