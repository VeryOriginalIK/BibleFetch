export interface UserCollection{
  id: string;
  name: string;
  verse_ids: string[];
  last_modified: number; // Timestamp a szinkronizációhoz (Conflict Resolution)
  topicId?: string; // Ha van, akkor ez egy téma-gyűjtemény
  themeColor?: string; // Téma színe (ha téma-gyűjtemény)
  is_public?: boolean; // Ha true, mások is láthatják
  owner_id?: string; // Tulajdonos user_id (ha megosztott)
  owner_email?: string; // Tulajdonos email (megjelenítéshez)
  liked_verses?: string[]; // Versek, amiket a jelenlegi felhasználó kedvelt ebben a gyűjteményben
}
