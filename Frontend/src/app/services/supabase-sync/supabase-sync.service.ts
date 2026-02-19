import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth-service/auth.service';
import { UserCollection } from '../../models/user-collection-model';

const TABLE = 'user_collections';

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
}
