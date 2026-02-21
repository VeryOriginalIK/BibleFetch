import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { StateService } from './services/state-service/state-service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home-component/home-component').then(m => m.HomeComponent),
    title: 'Biblia - Kezdőlap',
  },
  {
    path: 'topics/:id',
    loadComponent: () =>
      import('./components/topic-redirect-component/topic-redirect-component').then(m => m.TopicRedirectComponent),
    title: 'Téma olvasása',
  },
  {
    path: 'bible/:book/:chapter',
    loadComponent: () =>
      import('./components/bible-reader-component/bible-reader-component').then(m => m.BibleReaderComponent),
    title: 'Bibliaolvasó',
  },
  {
    path: 'bible',
    pathMatch: 'full',
    canActivate: [() => {
      const state = inject(StateService);
      const router = inject(Router);
      // Redirect to last reading position or default gen/1
      return router.createUrlTree(['/bible', state.lastBook(), state.lastChapter()]);
    }],
    loadComponent: () =>
      import('./components/bible-reader-component/bible-reader-component').then(m => m.BibleReaderComponent),
  },
  {
    path: 'search',
    loadComponent: () =>
      import('./components/search-bar-component/search-bar-component').then(m => m.SearchBarComponent),
    title: 'Keresés',
  },
  {
    path: 'profile',
    loadComponent: () => import('./components/profile-component/profile-component').then(m => m.ProfileComponent),
    title: 'Profil',
  },
  {
    path: 'auth',
    loadComponent: () => import('./components/auth-component/auth-component').then(m => m.AuthComponent),
    title: 'Bejelentkezés',
  },
  {
    path: 'public-collections',
    loadComponent: () => import('./components/public-collections-component/public-collections-component').then(m => m.PublicCollectionsComponent),
    title: 'Nyilvános Gyűjtemények',
  },
  {
    path: 'collection/:id',
    loadComponent: () => import('./components/collection-viewer-component/collection-viewer-component').then(m => m.CollectionViewerComponent),
    title: 'Gyűjtemény',
  },
  {
    path: 'read/:trans/:book/:chapter',
    loadComponent: () =>
      import('./components/reader-component/reader-component').then(m => m.ReaderComponent),
    title: 'Bibliaolvasó',
  },
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full',
  },
];
