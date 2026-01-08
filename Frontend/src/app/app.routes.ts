<<<<<<< HEAD
import { Routes } from '@angular/router';
import { ReaderComponent } from './components/reader-component/reader-component';
import { HomeComponent } from './components/home-component/home-component';
import { TopicViewerComponent } from './components/topic-viewer-component/topic-viewer-component';

export const routes: Routes = [
  // 1. Főoldal (Home) - Itt listázzuk a témákat
  {
    path: '',
    component: HomeComponent,
    title: 'Biblia - Kezdőlap',
  },

  // 2. Konkrét téma megtekintése (pl. /topics/creation)
  {
    path: 'topics/:id',
    component: TopicViewerComponent,
    title: 'Téma olvasása',
  },

  // 3. A Reader útvonala: /read/fordítás/könyv/fejezet
  {
    path: 'read/:trans/:book/:chapter',
    component: ReaderComponent,
    title: 'Bibliaolvasó',
  },

  // 404 Fallback: Bármi más esetén irányítson vissza a főoldalra
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full',
  },
];
=======
import { Routes } from '@angular/router';
import { ReaderComponent } from './components/reader-component/reader-component';
import { HomeComponent } from './components/home-component/home-component';
import { TopicViewerComponent } from './components/topic-viewer-component/topic-viewer-component';

export const routes: Routes = [
  // 1. Főoldal (Home) - Itt listázzuk a témákat
  {
    path: '',
    component: HomeComponent,
    title: 'Biblia - Kezdőlap',
  },

  // 2. Konkrét téma megtekintése (pl. /topics/creation)
  {
    path: 'topics/:id',
    component: TopicViewerComponent,
    title: 'Téma olvasása',
  },

  // 3. A Reader útvonala: /read/fordítás/könyv/fejezet
  {
    path: 'read/:trans/:book/:chapter',
    component: ReaderComponent,
    title: 'Bibliaolvasó',
  },

  // 404 Fallback: Bármi más esetén irányítson vissza a főoldalra
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full',
  },
];
>>>>>>> 722a3c8 (add topic-viewer)
