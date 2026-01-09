import { Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'textParser',
  standalone: true,
})
export class TextParserPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(rawText: string): SafeHtml {
    if (!rawText) return '';

    // REGEX: Megkeresi a szó<TAG> mintákat.
    // Csoport 1: A szó (vagy szövegrész)
    // Csoport 2: H vagy G (Héber/Görög)
    // Csoport 3: A szám
    // A regex "global" flaggel fut, hogy minden találatot megtaláljon.

    // Példa input: "Kezdetben<H7225> teremté<H1254>"
    const parsedText = rawText.replace(/([^<]+)<([HG])(\d+)>/g, (match, word, type, number) => {
      const strongId = `${type}${number}`;
      // Interaktív span generálása
      // A click eventet nem itt kezeljük, hanem a szülő komponensben (Event Delegation)!
      return `<span class="interactive-word cursor-pointer text-blue-600 hover:underline hover:text-blue-800 transition-colors" data-strong="${strongId}">${word}</span>`;
    });

    // Biztonsági okokból ellenőrizzük, de engedélyezzük a HTML-t
    return this.sanitizer.sanitize(SecurityContext.HTML, parsedText) || '';
  }
}
