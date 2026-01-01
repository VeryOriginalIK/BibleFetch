export interface UserCollection{
  id: string;
  name: string;
  verse_ids: string[];
  last_modified: number; // Timestamp a szinkronizációhoz (Conflict Resolution)
}
