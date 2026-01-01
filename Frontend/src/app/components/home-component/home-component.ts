import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BibleDataService } from '../../services/data-service/data-service';
import { StateService } from '../../services/state-service/state-service';
import { map } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-component.html',
})
export class HomeComponent {
  private bibleData = inject(BibleDataService);
  public state = inject(StateService); // A nyelvváltás (hu/en) miatt kell publikusnak lennie

  // Observable: Automatikusan feliratkozik a HTML-ben az | async pipe segítségével
  topics$ = this.bibleData.getTopics();

  // Ikon segédfüggvény: A JSON-ben lévő stringet (pl. "heart") SVG útvonallá alakítja
  // Később ezt kiszervezhetjük egy IconRegistry-be, ha nő a projekt
  getIconPath(iconName: string): string {
    const icons: { [key: string]: string } = {
      leaf: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8', // Levél/Nyíl
      anchor: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', // Pajzs/Horgony
      heart:
        'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    };
    // Fallback: Ha nincs ikon, egy kört rajzolunk
    return (
      icons[iconName] || 'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z'
    );
  }
}
