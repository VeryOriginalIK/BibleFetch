import { UserCollection } from "./user-collection-model";

export interface UserProfile{
  uid: string;
  email?: string;
  preferences: {
    primary_lang: 'hu' | 'en';
    theme: 'light' | 'dark' | 'auto';
    font_size: number;
  };
  collections?: { [id: string]: UserCollection }; // Csak referencia
}
