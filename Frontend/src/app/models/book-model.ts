export interface Book {
  id: string;
  name: { [lang: string]: string };
  short: { [lang: string]: string };
  color: string;
  chapterCount?: number;
}
