import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { UserCollection } from '../../models/user-collection-model';
import { SupabaseSyncService } from '../supabase-sync/supabase-sync.service';

const STORAGE_KEY = 'bible_collections';

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private platformId = inject(PLATFORM_ID);

  /** All collections */
  readonly collections = signal<UserCollection[]>([]);

  /** Transient UI state: which verse just got a toast */
  readonly lastAddedVerse = signal<string | null>(null);

  private supabase = inject(SupabaseSyncService);

  constructor() {
    this.load();
  }

  // --- REMOTE SYNC (Supabase) ---
  /** Upload local collections to Supabase (user must be signed in via AuthService). */
  async syncToSupabase() {
    try {
      await this.supabase.saveCollections(this.collections());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  /** Download remote collections and merge into local (newest last_modified wins). */
  async loadFromSupabase() {
    try {
      const remote = await this.supabase.loadCollections();
      if (!remote) return { ok: true, merged: false };
      await this.importCollections(JSON.stringify(remote));
      return { ok: true, merged: true };
    } catch (err) {
      return { ok: false, error: err };
    }
  }


  // --- QUERIES ---

  getCollection(id: string): UserCollection | undefined {
    return this.collections().find((c) => c.id === id);
  }

  isVerseInCollection(collectionId: string, verseId: string): boolean {
    const col = this.getCollection(collectionId);
    return col ? col.verse_ids.includes(verseId) : false;
  }

  isVerseInAnyCollection(verseId: string): boolean {
    return this.collections().some((c) => c.verse_ids.includes(verseId));
  }

  // --- MUTATIONS ---

  createCollection(name: string): UserCollection {
    const col: UserCollection = {
      id: crypto.randomUUID?.() ?? Date.now().toString(36),
      name,
      verse_ids: [],
      last_modified: Date.now(),
    };
    this.collections.update((list) => [...list, col]);
    this.save();
    return col;
  }

  /** Create or update a topic-based collection (syncs topic verses into a collection) */
  syncTopicCollection(topicId: string, topicName: string, verseIds: string[], themeColor?: string) {
    const existing = this.collections().find((c) => c.topicId === topicId);

    if (existing) {
      // Update existing topic collection (preserve user-added verses, merge with topic verses)
      const mergedVerses = Array.from(new Set([...verseIds, ...existing.verse_ids]));
      this.collections.update((list) =>
        list.map((c) =>
          c.id === existing.id
            ? { ...c, verse_ids: mergedVerses, last_modified: Date.now(), themeColor }
            : c
        )
      );
    } else {
      // Create new topic collection
      const col: UserCollection = {
        id: crypto.randomUUID?.() ?? Date.now().toString(36),
        name: topicName,
        verse_ids: verseIds,
        last_modified: Date.now(),
        topicId,
        themeColor,
      };
      this.collections.update((list) => [...list, col]);
    }
    this.save();
  }

  renameCollection(id: string, name: string) {
    this.collections.update((list) =>
      list.map((c) => (c.id === id ? { ...c, name, last_modified: Date.now() } : c))
    );
    this.save();
  }

  deleteCollection(id: string) {
    this.collections.update((list) => list.filter((c) => c.id !== id));
    this.save();
  }

  addVerse(collectionId: string, verseId: string) {
    this.collections.update((list) =>
      list.map((c) => {
        if (c.id !== collectionId) return c;
        if (c.verse_ids.includes(verseId)) return c;
        return { ...c, verse_ids: [...c.verse_ids, verseId], last_modified: Date.now() };
      })
    );
    this.save();
    this.flashToast(verseId);
  }

  removeVerse(collectionId: string, verseId: string) {
    this.collections.update((list) =>
      list.map((c) => {
        if (c.id !== collectionId) return c;
        return { ...c, verse_ids: c.verse_ids.filter((v) => v !== verseId), last_modified: Date.now() };
      })
    );
    this.save();
  }

  toggleVerse(collectionId: string, verseId: string) {
    if (this.isVerseInCollection(collectionId, verseId)) {
      this.removeVerse(collectionId, verseId);
    } else {
      this.addVerse(collectionId, verseId);
    }
  }

  // --- PERSISTENCE ---

  private save() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.collections()));
    }
  }

  // --- EXPORT / IMPORT (client-only) ---

  /** Download collections as a JSON file (export) */
  exportCollections(filename = 'bible-collections.json') {
    if (!isPlatformBrowser(this.platformId)) return;
    const blob = new Blob([JSON.stringify(this.collections(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Import collections JSON (merge by id, keep newest by last_modified) */
  async importCollections(fileOrJson: File | string) {
    if (!isPlatformBrowser(this.platformId)) return;

    let parsed: UserCollection[] | null = null;
    try {
      if (typeof fileOrJson === 'string') {
        parsed = JSON.parse(fileOrJson) as UserCollection[];
      } else {
        const text = await fileOrJson.text();
        parsed = JSON.parse(text) as UserCollection[];
      }
    } catch (e) {
      console.error('Failed to parse collections JSON', e);
      return;
    }

    if (!Array.isArray(parsed)) return;

    // Merge: prefer collection with newer last_modified
    const existing = new Map(this.collections().map((c) => [c.id, c]));
    for (const col of parsed) {
      const cur = existing.get(col.id);
      if (!cur || (col.last_modified ?? 0) > (cur.last_modified ?? 0)) {
        existing.set(col.id, col);
      }
    }

    this.collections.set(Array.from(existing.values()));
    this.save();
  }

  private load() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this.collections.set(JSON.parse(raw));
        }
      } catch {
        this.collections.set([]);
      }

      // Ensure at least one default collection exists
      if (this.collections().length === 0) {
        this.createCollection('⭐ Kedvencek');
      }
    }
  }

  // --- UI HELPERS ---

  private flashToast(verseId: string) {
    this.lastAddedVerse.set(verseId);
    setTimeout(() => {
      if (this.lastAddedVerse() === verseId) {
        this.lastAddedVerse.set(null);
      }
    }, 2000);
  }
}
