import { Component, Input, inject, signal, OnChanges, SimpleChanges, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BibleDataService } from '../../services/data-service/data-service';
import { StateService } from '../../services/state-service/state-service';
import { TextParserPipe } from '../../pipes/text-parser-pipe/text-parser-pipe';

@Component({
  selector: 'app-verse-card',
  standalone: true,
  imports: [CommonModule, TextParserPipe],
  templateUrl: './verse-card-component.html',
})
export class VerseCardComponent implements OnChanges {
  // Ez jön kívülről a TopicViewer-től (pl. "gen-1-1")
  @Input({ required: true }) verseId!: string;

  private bibleData = inject(BibleDataService);
  public state = inject(StateService);

  // Állapotjelzők
  verseText = signal<string>('');
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);

  // Helyi verzió felülbírálás (opcionális, ha a user kártyánként váltana fordítást)
  localVersion = signal<string | null>(null);

  constructor() {
    // Ha megváltozik a globális nyelv/verzió, töltsük újra a verset!
    effect(() => {
      // Figyeljük a state változását
      const currentVer = this.state.currentBibleVersion();
      // Csak akkor töltünk újra, ha már van ID-nk
      if (this.verseId) {
        this.loadVerse();
      }
    });
  }

  // Ha a szülő komponens megváltoztatja az ID-t (pl. virtuális görgetésnél)
  async ngOnChanges(changes: SimpleChanges) {
    if (changes['verseId'] && this.verseId) {
      await this.loadVerse();
    }
  }

  async loadVerse() {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    // Prioritás: Helyi verzió > Globális beállítás
    const versionToLoad = this.localVersion() || this.state.currentBibleVersion();

    try {
      // Itt hívjuk meg az új dinamikus DataService-t
      const text = await this.bibleData.getVerseText(this.verseId, versionToLoad);
      this.verseText.set(text);

      if (text.startsWith('[')) {
        // Ha a service hibaüzenetet küldött vissza stringként (pl. "[Vers nem található]")
        // Ezt kezelhetjük hibaállapotként is, ha szigorúbbak akarunk lenni.
      }
    } catch (e) {
      console.error('Hiba a kártya betöltésekor', e);
      this.errorMessage.set('Nem sikerült betölteni az igeverset.');
      this.verseText.set('');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Ez hívódik meg, ha a user rákattint egy kék szóra (Strong szám)
  handleWordClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // A .closest() megkeresi a legközelebbi szülő elemet (vagy önmagát),
    // ami rendelkezik az adott osztállyal. Ez sokkal biztosabb.
    const clickedWord = target.closest('.interactive-word');

    if (clickedWord) {
      const strongId = clickedWord.getAttribute('data-strong');
      console.log('Kattintás érzékelve:', strongId); // Debugoláshoz

      if (strongId) {
        // Megakadályozzuk, hogy a kártya esetleges egyéb kattintás eseményei lefussonak
        event.stopPropagation();

        // Szólunk a StateService-nek
        this.state.openDefinition(strongId);
      }
    }
  }

  // Kontextus (egész fejezet) megnyitása - egyelőre placeholder
  openContext() {
    console.log('Open context for:', this.verseId);
  }
}
