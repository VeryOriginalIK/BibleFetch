import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth-service/auth.service';
import { UserCollection } from '../../models/user-collection-model';

const TABLE = 'user_collections';
const PUBLIC_TABLE = 'public_collections';

/**
 * Supabase sync helper — delegates credential/client management to AuthService.
 * Requires the user to be signed in: collections are stored per authenticated user_id.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseSyncService {
  private auth = inject(AuthService);

  private get supabase() {
    return this.auth.client;
  }

  private get currentUserId() {
    return this.auth.user()?.id;
  }

  private get currentUserEmail() {
    return this.auth.user()?.email;
  }

  async saveCollections(collections: UserCollection[]) {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: userId, data: collections }, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async loadCollections(): Promise<UserCollection[] | null> {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from(TABLE)
      .select('data')
      .eq('user_id', userId)
      .single();

    if (error) {
      const code = (error as any).code ?? (error as any).status;
      if (code === 'PGRST116' || code === 404) return null;
      throw error;
    }
    return (data?.data as UserCollection[]) ?? null;
  }

  // --- PUBLIC COLLECTIONS ---

  /** Share a collection publicly */
  async shareCollection(collection: UserCollection) {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');
    const userId = this.currentUserId;
    const userEmail = this.currentUserEmail;
    if (!userId) throw new Error('Not authenticated');

    const publicCollection = {
      collection_id: collection.id,
      owner_id: userId,
      owner_email: userEmail,
      name: collection.name,
      verse_ids: collection.verse_ids,
      theme_color: collection.themeColor,
      last_modified: collection.last_modified,
    };

    const { error } = await supabase
      .from(PUBLIC_TABLE)
      .upsert(publicCollection, { onConflict: 'collection_id' });

    if (error) throw error;
  }

  /** Remove a collection from public sharing */
  async unshareCollection(collectionId: string) {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');
    const userId = this.currentUserId;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await supabase
      .from(PUBLIC_TABLE)
      .delete()
      .eq('collection_id', collectionId)
      .eq('owner_id', userId);

    if (error) throw error;
  }

  /** Browse all public collections */
  async browsePublicCollections(limit = 50, offset = 0): Promise<UserCollection[]> {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from(PUBLIC_TABLE)
      .select('*')
      .order('last_modified', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Transform to UserCollection format
    return (data || []).map((row: any) => ({
      id: row.collection_id,
      name: row.name,
      verse_ids: row.verse_ids,
      last_modified: row.last_modified,
      themeColor: row.theme_color,
      is_public: true,
      owner_id: row.owner_id,
      owner_email: row.owner_email,
    }));
  }

  /** Search public collections by name */
  async searchPublicCollections(query: string): Promise<UserCollection[]> {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from(PUBLIC_TABLE)
      .select('*')
      .ilike('name', `%${query}%`)
      .order('last_modified', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.collection_id,
      name: row.name,
      verse_ids: row.verse_ids,
      last_modified: row.last_modified,
      themeColor: row.theme_color,
      is_public: true,
      owner_id: row.owner_id,
      owner_email: row.owner_email,
    }));
  }

  /** Check if a collection is shared publicly */
  async isCollectionPublic(collectionId: string): Promise<boolean> {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from(PUBLIC_TABLE)
      .select('collection_id')
      .eq('collection_id', collectionId)
      .single();

    if (error) {
      const code = (error as any).code ?? (error as any).status;
      if (code === 'PGRST116' || code === 404) return false;
      throw error;
    }

    return !!data;
  }

  // --- VERSE LIKES ---

  /** Like a verse in a collection */
  async likeVerse(collectionId: string, verseId: string) {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');
    const userId = this.currentUserId;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('collection_verse_likes')
      .insert({
        collection_id: collectionId,
        verse_id: verseId,
        user_id: userId,
      });

    // Ignore duplicate key errors (already liked)
    if (error && error.code !== '23505') throw error;
  }

  /** Unlike a verse in a collection */
  async unlikeVerse(collectionId: string, verseId: string) {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');
    const userId = this.currentUserId;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('collection_verse_likes')
      .delete()
      .eq('collection_id', collectionId)
      .eq('verse_id', verseId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /** Get like counts for all verses in a collection */
  async getVerseLikeCounts(collectionId: string): Promise<Map<string, number>> {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from('collection_verse_likes')
      .select('verse_id')
      .eq('collection_id', collectionId);

    if (error) throw error;

    const counts = new Map<string, number>();
    for (const row of data || []) {
      const verseId = row.verse_id;
      counts.set(verseId, (counts.get(verseId) || 0) + 1);
    }

    return counts;
  }

  /** Load user's liked verses for a collection */
  async loadUserLikes(collectionId: string): Promise<string[]> {
    const supabase = this.supabase;
    if (!supabase) throw new Error('Supabase not configured');
    const userId = this.currentUserId;
    if (!userId) return [];

    const { data, error } = await supabase
      .from('collection_verse_likes')
      .select('verse_id')
      .eq('collection_id', collectionId)
      .eq('user_id', userId);

    if (error) throw error;

    return (data || []).map((row: any) => row.verse_id);
  }
}
