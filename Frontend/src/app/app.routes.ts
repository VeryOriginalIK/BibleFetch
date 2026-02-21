import { Routes } from '@angular/router';

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
    redirectTo: 'bible/gen/1',
    pathMatch: 'full',
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
