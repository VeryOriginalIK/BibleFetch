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
  template: `
    <span class="verse-content">
      <ng-container *ngFor="let item of parsedWords">
        <span
          *ngIf="item.strongCodes.length > 0; else simpleWord"
          class="word-with-strong"
          (mouseenter)="onHover(item.strongCodes)"
        >
          {{ item.word }}

          <span class="tooltip-bubble">
            <div *ngFor="let code of item.strongCodes" class="strong-entry">
              <span class="strong-header">
                {{ code }}
                <span *ngIf="getDef(code)?.lemma" class="lemma-text">
                  - {{ getDef(code)?.lemma }}
                </span>
              </span>

              <div *ngIf="isLoading(code)" class="loading-text">Betöltés...</div>

              <div *ngIf="getDef(code) as def" class="def-content">
                <div *ngIf="def.translit" class="pronunciation">/{{ def.translit }}/</div>
                <div class="definition-text">
                  {{ def.defs.hu || def.defs.en }}
                </div>
              </div>

              <div *ngIf="!isLoading(code) && !getDef(code)" class="error-text">Nincs adat.</div>
            </div>
          </span>
        </span>

        <ng-template #simpleWord>
          <span class="simple-word">{{ item.word }}</span>
        </ng-template>

        <span *ngIf="item.punctuation" class="punctuation">{{ item.punctuation }}</span>
        <span class="space">&nbsp;</span>
      </ng-container>
    </span>
  `,
  styles: [
    `
      /* ... A stílusok változatlanok maradnak ... */
      .verse-content {
        line-height: 1.8;
        color: #2c3e50;
      }
      .punctuation {
        margin-right: 0;
      }
      .word-with-strong {
        position: relative;
        cursor: help;
        border-bottom: 1px dotted #bbb;
        transition: all 0.2s ease;
      }
      .word-with-strong:hover {
        color: #d35400;
        border-bottom-color: #d35400;
        background-color: rgba(211, 84, 0, 0.08);
      }
      .tooltip-bubble {
        visibility: hidden;
        opacity: 0;
        position: absolute;
        bottom: 140%;
        left: 50%;
        transform: translateX(-50%) translateY(10px);
        background-color: #34495e;
        color: #fff;
        min-width: 200px;
        max-width: 300px;
        padding: 12px;
        border-radius: 8px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
        z-index: 100;
        text-align: left;
        font-family: 'Segoe UI', sans-serif;
        font-size: 0.85rem;
        pointer-events: none;
        transition: all 0.2s;
      }
      .tooltip-bubble::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        margin-left: -6px;
        border-width: 6px;
        border-style: solid;
        border-color: #34495e transparent transparent transparent;
      }
      .word-with-strong:hover .tooltip-bubble {
        visibility: visible;
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      .strong-entry {
        border-bottom: 1px solid #4e6072;
        padding-bottom: 8px;
        margin-bottom: 8px;
      }
      .strong-entry:last-child {
        border-bottom: none;
        margin-bottom: 0;
      }
      .strong-header {
        font-weight: bold;
        color: #f1c40f;
        display: block;
        font-size: 0.95rem;
        margin-bottom: 2px;
      }
      .lemma-text {
        color: #ecf0f1;
        font-weight: normal;
        font-style: italic;
      }
      .pronunciation {
        color: #bdc3c7;
        font-size: 0.8rem;
        margin-bottom: 4px;
      }
      .definition-text {
        line-height: 1.3;
      }
      .loading-text {
        color: #95a5a6;
        font-style: italic;
      }
    `,
  ],
})
export class VerseRendererComponent implements OnChanges {
  @Input() rawText: string = '';
  parsedWords: ParsedWord[] = [];
  definitionsCache = new Map<string, LoadedDefinition>();

  private strongsService = inject(StrongsDataService);

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
