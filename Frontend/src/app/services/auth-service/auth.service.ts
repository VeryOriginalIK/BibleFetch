import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

const SB_URL_KEY = 'supabase_url';
const SB_KEY_KEY = 'supabase_anon_key';

function buildClient(): SupabaseClient | null {
  // 1. Vercel env vars (build-time injection via Angular env proxy)
  const envUrl = (window as any).__SB_URL__;
  const envKey = (window as any).__SB_KEY__;
  const url = envUrl || localStorage.getItem(SB_URL_KEY) || '';
  const key = envKey || localStorage.getItem(SB_KEY_KEY) || '';
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private platformId = inject(PLATFORM_ID);
  private _client: SupabaseClient | null = null;

  readonly user = signal<User | null>(null);
  readonly session = signal<Session | null>(null);
  readonly isLoading = signal(true);

  get client(): SupabaseClient | null {
    return this._client;
  }

  /** Call once from app init (AppComponent) */
  async init() {
    if (!isPlatformBrowser(this.platformId)) {
      this.isLoading.set(false);
      return;
    }

    this._client = buildClient();
    if (!this._client) {
      this.isLoading.set(false);
      return;
    }

    // Restore session
    const { data } = await this._client.auth.getSession();
    this.session.set(data.session);
    this.user.set(data.session?.user ?? null);

    // Subscribe to auth changes
    this._client.auth.onAuthStateChange((_ev, session) => {
      this.session.set(session);
      this.user.set(session?.user ?? null);
    });

    this.isLoading.set(false);
  }

  get isConfigured(): boolean {
    return this._client !== null;
  }

  get isLoggedIn(): boolean {
    return this.user() !== null;
  }

  async signUp(email: string, password: string) {
    if (!this._client) throw new Error('Supabase not configured');
    const { data, error } = await this._client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async signIn(email: string, password: string) {
    if (!this._client) throw new Error('Supabase not configured');
    const { data, error } = await this._client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signOut() {
    if (!this._client) return;
    await this._client.auth.signOut();
  }

  /**
   * Configure Supabase credentials at runtime (profile page demo)
   * and re-initialize the client.
   */
  configure(url: string, key: string) {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(SB_URL_KEY, url);
    localStorage.setItem(SB_KEY_KEY, key);
    this._client = buildClient();
  }
}
