import { TextParserPipe } from './text-parser-pipe';
import { DomSanitizer } from '@angular/platform-browser';
import { SecurityContext } from '@angular/core';

describe('TextParserPipe', () => {
  let pipe: TextParserPipe;

  // Létrehozunk egy "Fake" Sanitizert.
  // Ez csak annyit csinál, hogy visszaadja a bemenetet, mintha biztonságos lenne.
  // Így nem kell bonyolult Angular modulokat importálni a teszthez.
  const mockSanitizer = {
    sanitize: (context: SecurityContext, value: string) => value,
  } as DomSanitizer;

  beforeEach(() => {
    // Itt adjuk át a mockSanitizert a konstruktornak
    pipe = new TextParserPipe(mockSanitizer);
  });

  it('create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return empty string for null or undefined', () => {
    expect(pipe.transform('null')).toBe('');
    expect(pipe.transform('undefined')).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  it('should transform Format B tags into HTML spans', () => {
    const input = 'Kezdetben<H7225> teremté<H1254>';
    // A Pipe kimenete SafeHtml, ezért stringgé kell alakítani az összehasonlításhoz,
    // de a mock objektumunk miatt ez amúgy is string marad.
    const result = pipe.transform(input) as string;

    // Ellenőrizzük, hogy a tagek átalakultak-e HTML-lé
    expect(result).toContain('data-strong="H7225"');
    expect(result).toContain('data-strong="H1254"');
    expect(result).toContain('>Kezdetben</span>');
    expect(result).toContain('>teremté</span>');
  });

  it('should leave text without tags unchanged', () => {
    const input = 'Ez egy sima szöveg.';
    const result = pipe.transform(input) as string;
    expect(result).toBe('Ez egy sima szöveg.');
  });
});
