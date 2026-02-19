import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StateService } from '../../services/state-service/state-service';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './bottom-nav-component.html',
  // Nincs styleUrls vagy styles, mert a stílusokat közvetlenül a HTML-ben oldottuk meg Tailwinddel
})
export class BottomNavComponent {
  public state = inject(StateService);
}
