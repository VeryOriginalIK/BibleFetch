export interface Topic {
  id: string;
  titles: { [lang: string]: string }; // pl. { hu: "Reménység", en: "Hope" }
  icon: string; // FontAwesome vagy SVG név
  verse_ids: string[]; // ["jer-29-11", "rom-8-28"]
  theme_color: string; // Hex kód
  last_updated?: string;
}
