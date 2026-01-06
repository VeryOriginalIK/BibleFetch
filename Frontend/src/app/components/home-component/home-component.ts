import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BibleDataService } from '../../services/data-service/data-service';
import { StateService } from '../../services/state-service/state-service';
import { LocalizedString } from '../../models/localized-string-model';

// A 'map' import törölhető, ha nem transzformálod az adatot
// import { map } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-component.html',
})
export class HomeComponent {
  private bibleData = inject(BibleDataService);
  public state = inject(StateService);

  // Ez tökéletes, a HTML-ben az | async kezeli
  topics$ = this.bibleData.getTopicList();

  getLocaleText(content: LocalizedString | undefined): string {
    if (!content) return '';
    const lang = this.state.lang();
    return content[lang] || content['hu'];
  }

  getIconPath(iconName: string): string {
    const icons: { [key: string]: string } = {
      leaf: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
      anchor: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
      heart:
        'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
      // Ide adhatsz még többet: book, sun, star, etc.
    };

    // Alapértelmezett ikon (kör)
    const defaultIcon = 'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z';

    return icons[iconName] || defaultIcon;
  }
}
