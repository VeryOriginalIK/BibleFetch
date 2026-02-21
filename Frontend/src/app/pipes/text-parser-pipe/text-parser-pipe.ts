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

    const spanClass =
      'interactive-word cursor-pointer text-blue-600 hover:underline hover:text-blue-800 transition-colors';

    // Detect which format the text uses
    const hasCurlyStrongs = /\{[HG]\d+\}/.test(rawText);
    const hasAngleStrongs = /<[HG]\d+>/.test(rawText);

    let parsedText = rawText;

    if (hasCurlyStrongs) {
      // === Curly-brace format (e.g. KJV Strong's) ===
      // Example: "In the beginning{H7225} God{H430} created{H1254}{(H8804)}{H853}"

      // 1. Strip morphological / grammar tags like {(H8804)}
      parsedText = parsedText.replace(/\{\([^)]*\)\}/g, '');

      // 2. Match word + one or more Strong's codes: word{H1234}{H5678}
      parsedText = parsedText.replace(
        /([^{}\s]+)((?:\{[HG]\d+\})+)/g,
        (_match, word: string, codesBlock: string) => {
          const codes: string[] = [];
          const codeRx = /\{([HG]\d+)\}/g;
          let m;
          while ((m = codeRx.exec(codesBlock)) !== null) {
            codes.push(m[1]);
          }
          return `<span class="${spanClass}" data-strong="${codes.join(',')}">${word}</span>`;
        }
      );

      // 3. Remove any remaining standalone Strong's codes (no preceding word)
      parsedText = parsedText.replace(/\{[HG]\d+\}/g, '');
    } else if (hasAngleStrongs) {
      // === Angle-bracket format ===
      // Example: "Kezdetben<H7225> teremté<H1254>"
      parsedText = rawText.replace(
        /([^<]+)<([HG])(\d+)>/g,
        (_match, word: string, type: string, number: string) => {
          return `<span class="${spanClass}" data-strong="${type}${number}">${word}</span>`;
        }
      );
    }
    // Plain text without Strong's codes passes through unchanged

    return this.sanitizer.sanitize(SecurityContext.HTML, parsedText) || '';
  }
}
