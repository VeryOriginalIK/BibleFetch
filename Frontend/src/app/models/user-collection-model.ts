export interface UserCollection{
  id: string;
  name: string;
  verse_ids: string[];
  last_modified: number; // Timestamp a szinkronizációhoz (Conflict Resolution)
  topicId?: string; // Ha van, akkor ez egy téma-gyűjtemény
  themeColor?: string; // Téma színe (ha téma-gyűjtemény)
}
