import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DefinitionModal } from './components/definition-modal/definition-modal';
import { HeaderComponent } from './components/header-component/header-component';
import { BottomNavComponent } from './components/bottom-nav-component/bottom-nav-component';
import { AuthService } from './services/auth-service/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DefinitionModal, HeaderComponent, BottomNavComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private auth = inject(AuthService);

  constructor() {
    this.auth.init();
  }
}
