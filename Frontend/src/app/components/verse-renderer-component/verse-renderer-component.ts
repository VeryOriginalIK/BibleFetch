import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewEncapsulation,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { StrongsDataService } from '../../services/strongs-data-service/strongs-data-service';
import { StateService } from '../../services/state-service/state-service';
import { StrongDefinition } from '../../models/strong-definition-model';

interface ParsedWord {
  word: string;
  strongCodes: string[];
  punctuation: string;
}

interface LoadedDefinition {
  code: string;
  data: StrongDefinition | null;
  loading: boolean;
}

@Component({
  selector: 'app-verse-renderer',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './verse-renderer-component.html',
  styleUrl: './verse-renderer-component.css',
})
export class VerseRendererComponent implements OnChanges {
  @Input() rawText: string = '';
  parsedWords: ParsedWord[] = [];
  definitionsCache = new Map<string, LoadedDefinition>();

  private strongsService = inject(StrongsDataService);
  protected state = inject(StateService);

  // 1. INJEKTÁLJUK A DETEKTORT
  private cdr = inject(ChangeDetectorRef);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rawText'] && this.rawText) {
      this.parseText(this.rawText);
    }
  }

  onHover(codes: string[]) {
    let needsUpdate = false;

    codes.forEach((code) => {
      if (!this.definitionsCache.has(code)) {
        needsUpdate = true; // Jelöljük, hogy változás indult

        // Loading állapot beállítása
        this.definitionsCache.set(code, { code, data: null, loading: true });

        // Lekérés indítása
        this.strongsService.getDefinition(code).then((def) => {
          // Adat megérkezett -> Cache frissítése
          this.definitionsCache.set(code, { code, data: def, loading: false });

          // 2. FONTOS: Szólunk az Angularnak, hogy kész vagyunk!
          // Ez frissíti a buborékot akkor is, ha az egér nem mozdul.
          this.cdr.detectChanges();
        });
      }
    });

    // Ha beállítottuk a loading állapotot, azonnal frissítünk, hogy megjelenjen a "Betöltés..."
    if (needsUpdate) {
      this.cdr.detectChanges();
    }
  }

  getDef(code: string): StrongDefinition | null {
    return this.definitionsCache.get(code)?.data || null;
  }

  isLoading(code: string): boolean {
    return this.definitionsCache.get(code)?.loading || false;
  }

  // Open the global definition modal when a word is clicked
  openDefinition(code: string, event: MouseEvent) {
    event.stopPropagation();
    this.state.openDefinition(code);
  }

  private parseText(text: string) {
    const mainRegex = /([^{}\s]+)((?:\{[^}]+\})*)([.,:;?!]?)/g;
    const matches = [...text.matchAll(mainRegex)];

    this.parsedWords = matches.map((match) => {
      const word = match[1];
      const tagsBlock = match[2];
      const punctuation = match[3];

      let codes: string[] = [];
      if (tagsBlock) {
        const tagRegex = /\{([^}]+)\}/g;
        const tagMatches = [...tagsBlock.matchAll(tagRegex)];
        codes = tagMatches.map((m) => m[1].replace(/[()]/g, ''));
      }

      return {
        word: word,
        strongCodes: codes,
        punctuation: punctuation || '',
      };
    });
  }
}
