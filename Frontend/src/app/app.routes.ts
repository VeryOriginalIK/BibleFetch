import { Routes } from '@angular/router';
import { HomeComponent } from './components/home-component/home-component';
import { TopicViewerComponent } from './components/topic-viewer-component/topic-viewer-component';

export const routes: Routes = [
  // Főoldal
  { path: '', component: HomeComponent },

  // A hiányzó láncszem: Dinamikus útvonal paraméterrel (:id)
  // Ez kezeli a /topic/creation, /topic/hope stb. linkeket
  { path: 'topic/:id', component: TopicViewerComponent },

  // Opcionális: Ismeretlen URL esetén visszavisz a főoldalra
  { path: '**', redirectTo: '' },
];
