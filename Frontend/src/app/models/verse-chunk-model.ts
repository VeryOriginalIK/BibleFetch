export interface VerseChunk {
  version_meta: {
    name: string; // pl. "Károli Gáspár"
    lang: string; // "hu"
  };
  verses: {
    [id: string]: string; // "gen-1-1": "Kezdetben<H7225> teremté<H1254>..."
  };
}
