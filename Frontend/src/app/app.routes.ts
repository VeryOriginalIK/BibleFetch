import { Routes } from '@angular/router';
import { ReaderComponent } from './components/reader-component/reader-component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'read/kjv_strongs/gen/1',
    pathMatch: 'full',
  },

  // A Reader útvonala: /read/fordítás/könyv/fejezet
  {
    path: 'read/:trans/:book/:chapter',
    component: ReaderComponent,
  },

  // (Később ide jön a Témakészítő és a Gyűjtemények útvonala)
  // { path: 'create-topic', component: TopicGeneratorComponent },

  // 404 Fallback: Bármi más esetén irányítson vissza az elejére
  {
    path: '**',
    redirectTo: 'read/kjv_strongs/gen/1',
  },
];
