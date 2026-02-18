import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header-component/header-component';
import { BottomNavComponent } from '../bottom-nav-component/bottom-nav-component';
import { DefinitionModal } from '../definition-modal/definition-modal';

@Component({
  selector: 'app-main-layout-component',
  standalone: true,
  imports: [
    HeaderComponent,
    BottomNavComponent,
    RouterOutlet,
    DefinitionModal,
  ],
  templateUrl: './main-layout-component.html',
})
export class MainLayoutComponent {}
