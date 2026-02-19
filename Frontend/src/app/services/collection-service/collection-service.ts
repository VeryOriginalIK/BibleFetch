import { Injectable, inject, signal, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { UserCollection } from '../../models/user-collection-model';
import { SupabaseSyncService } from '../supabase-sync/supabase-sync.service';
import { AuthService } from '../auth-service/auth.service';

const STORAGE_KEY = 'bible_collections';

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private platformId = inject(PLATFORM_ID);
  private auth = inject(AuthService);

  /** All collections */
  readonly collections = signal<UserCollection[]>([]);

  /** Transient UI state: which verse just got a toast */
  readonly lastAddedVerse = signal<string | null>(null);

  private supabase = inject(SupabaseSyncService);
  private hasAutoSynced = false;

  constructor() {
    this.load();

    // Auto-sync when user logs in
    effect(() => {
      const user = this.auth.user();
      if (user && !this.hasAutoSynced) {
        this.hasAutoSynced = true;
        this.autoSyncOnLogin();
      } else if (!user) {
        this.hasAutoSynced = false;
      }
    });

    // Merge any duplicate-named collections on startup
    this.mergeDuplicateNames();
  }

  private async autoSyncOnLogin() {
    console.log('[CollectionService] Auto-syncing on login...');
    try {
      // First load from Supabase and merge
      const result = await this.loadFromSupabase();
      if (result.ok) {
        console.log('[CollectionService] Auto-sync completed:', result.merged ? 'merged' : 'no remote data');
      }
    } catch (err) {
      console.error('[CollectionService] Auto-sync failed:', err);
    }
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

  // --- PUBLIC COLLECTIONS ---

  /** Make a collection public so others can see and copy it */
  async makeCollectionPublic(collectionId: string) {
    const collection = this.getCollection(collectionId);
    if (!collection) return { ok: false, error: 'Collection not found' };

    try {
      await this.supabase.shareCollection(collection);
      // Update local flag
      this.collections.update((list) =>
        list.map((c) => (c.id === collectionId ? { ...c, is_public: true } : c))
      );
      this.save();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  /** Make a collection private (remove from public sharing) */
  async makeCollectionPrivate(collectionId: string) {
    try {
      await this.supabase.unshareCollection(collectionId);
      // Update local flag
      this.collections.update((list) =>
        list.map((c) => (c.id === collectionId ? { ...c, is_public: false } : c))
      );
      this.save();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  /** Browse public collections from all users */
  async browsePublicCollections(limit = 50, offset = 0) {
    try {
      const collections = await this.supabase.browsePublicCollections(limit, offset);
      return { ok: true, collections };
    } catch (err) {
      return { ok: false, error: err, collections: [] };
    }
  }

  /** Search public collections by name */
  async searchPublicCollections(query: string) {
    try {
      const collections = await this.supabase.searchPublicCollections(query);
      return { ok: true, collections };
    } catch (err) {
      return { ok: false, error: err, collections: [] };
    }
  }

  /** Add a public collection from another user to your library */
  async addPublicCollectionToLibrary(publicCollection: UserCollection) {
    // Create a copy with a new ID but keep reference to original
    const newCollection: UserCollection = {
      ...publicCollection,
      id: crypto.randomUUID?.() ?? Date.now().toString(36),
      last_modified: Date.now(),
      is_public: false, // Not public by default when copied
      owner_id: publicCollection.owner_id, // Keep original owner for reference
      owner_email: publicCollection.owner_email,
    };

    this.collections.update((list) => [...list, newCollection]);
    this.save();
    return { ok: true, collection: newCollection };
  }

  /** Check if a collection is currently public */
  async isCollectionPublic(collectionId: string) {
    try {
      const isPublic = await this.supabase.isCollectionPublic(collectionId);
      return { ok: true, isPublic };
    } catch (err) {
      return { ok: false, error: err, isPublic: false };
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
    // Check if a collection with this name already exists
    const existingByName = this.collections().find(
      c => c.name.toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (existingByName) {
      // Return existing collection instead of creating a duplicate
      return existingByName;
    }

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
    // Check if another collection already has this name
    const existingByName = this.collections().find(
      c => c.id !== id && c.name.toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (existingByName) {
      // Merge the verses from the collection being renamed into the existing one
      const collectionBeingRenamed = this.getCollection(id);
      if (collectionBeingRenamed) {
        const mergedVerses = Array.from(new Set([
          ...existingByName.verse_ids,
          ...collectionBeingRenamed.verse_ids
        ]));

        // Update the existing collection with merged verses
        this.collections.update((list) =>
          list.filter(c => c.id !== id).map((c) =>
            c.id === existingByName.id
              ? { ...c, verse_ids: mergedVerses, last_modified: Date.now() }
              : c
          )
        );
      }
    } else {
      // No conflict, just rename
      this.collections.update((list) =>
        list.map((c) => (c.id === id ? { ...c, name, last_modified: Date.now() } : c))
      );
    }
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

  // --- VERSE LIKES ---

  /** Toggle like status for a verse in a collection */
  toggleVerseLike(collectionId: string, verseId: string) {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const likedVerses = collection.liked_verses || [];
    const isLiked = likedVerses.includes(verseId);

    this.collections.update((list) =>
      list.map((c) => {
        if (c.id !== collectionId) return c;
        const newLikedVerses = isLiked
          ? likedVerses.filter((v) => v !== verseId)
          : [...likedVerses, verseId];
        return {
          ...c,
          liked_verses: newLikedVerses,
          last_modified: Date.now()
        };
      })
    );
    this.save();

    // Sync to Supabase for public collections
    if (collection.is_public && this.auth.user()) {
      if (isLiked) {
        this.supabase.unlikeVerse(collectionId, verseId).catch(console.error);
      } else {
        this.supabase.likeVerse(collectionId, verseId).catch(console.error);
      }
    }
  }

  /** Check if a verse is liked in a collection */
  isVerseLiked(collectionId: string, verseId: string): boolean {
    const collection = this.getCollection(collectionId);
    return collection?.liked_verses?.includes(verseId) ?? false;
  }

  /** Get verse IDs sorted by like status (liked first) and then by like count (for public collections) */
  async getSortedVerseIds(collectionId: string): Promise<string[]> {
    const collection = this.getCollection(collectionId);
    if (!collection) return [];

    const likedVerses = new Set(collection.liked_verses || []);
    const verseIds = [...collection.verse_ids];

    // For public collections, get like counts from Supabase
    if (collection.is_public) {
      try {
        const likeCounts = await this.supabase.getVerseLikeCounts(collectionId);

        // Sort: user's liked verses first, then by total like count, then original order
        return verseIds.sort((a, b) => {
          const aLiked = likedVerses.has(a);
          const bLiked = likedVerses.has(b);

          // User's liked verses always come first
          if (aLiked && !bLiked) return -1;
          if (!aLiked && bLiked) return 1;

          // If both liked or both not liked, sort by total like count
          const aCount = likeCounts.get(a) || 0;
          const bCount = likeCounts.get(b) || 0;
          if (aCount !== bCount) return bCount - aCount;

          // Keep original order
          return 0;
        });
      } catch (err) {
        console.error('[CollectionService] Failed to get like counts', err);
      }
    }

    // For private collections, just put liked verses first
    return verseIds.sort((a, b) => {
      const aLiked = likedVerses.has(a);
      const bLiked = likedVerses.has(b);
      if (aLiked && !bLiked) return -1;
      if (!aLiked && bLiked) return 1;
      return 0;
    });
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

    // Merge strategy:
    // 1. If same ID: Keep newer by last_modified
    // 2. If same name (case-insensitive): Merge verses and keep newest metadata
    const existing = new Map(this.collections().map((c) => [c.id, c]));
    const nameMap = new Map<string, UserCollection>();

    // Build name map of existing collections
    for (const col of this.collections()) {
      nameMap.set(col.name.toLowerCase().trim(), col);
    }

    for (const col of parsed) {
      const curById = existing.get(col.id);
      const curByName = nameMap.get(col.name.toLowerCase().trim());

      if (curById) {
        // Same ID: keep newer by last_modified
        if ((col.last_modified ?? 0) > (curById.last_modified ?? 0)) {
          existing.set(col.id, col);
        }
      } else if (curByName && curByName.id !== col.id) {
        // Different IDs but same name: merge verses
        const mergedVerses = Array.from(new Set([...curByName.verse_ids, ...col.verse_ids]));
        const newerCol = (col.last_modified ?? 0) > (curByName.last_modified ?? 0) ? col : curByName;
        const merged: UserCollection = {
          ...newerCol,
          verse_ids: mergedVerses,
          last_modified: Date.now(),
        };
        existing.set(curByName.id, merged);
        nameMap.set(col.name.toLowerCase().trim(), merged);
      } else {
        // New collection
        existing.set(col.id, col);
        nameMap.set(col.name.toLowerCase().trim(), col);
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

  /** Merge collections with duplicate names (case-insensitive) */
  private mergeDuplicateNames() {
    if (!isPlatformBrowser(this.platformId)) return;

    const nameMap = new Map<string, UserCollection>();
    const merged: UserCollection[] = [];

    for (const col of this.collections()) {
      const normalizedName = col.name.toLowerCase().trim();
      const existing = nameMap.get(normalizedName);

      if (existing) {
        // Merge verses into existing collection
        const mergedVerses = Array.from(new Set([...existing.verse_ids, ...col.verse_ids]));
        const newerCol = (col.last_modified ?? 0) > (existing.last_modified ?? 0) ? col : existing;
        const mergedCollection: UserCollection = {
          ...newerCol,
          verse_ids: mergedVerses,
          last_modified: Date.now(),
        };
        nameMap.set(normalizedName, mergedCollection);
      } else {
        nameMap.set(normalizedName, col);
      }
    }

    // Build final list preserving original order where possible
    const finalCollections = Array.from(nameMap.values());

    // Only update if duplicates were actually merged
    if (finalCollections.length !== this.collections().length) {
      console.log(`[CollectionService] Merged ${this.collections().length - finalCollections.length} duplicate collections`);
      this.collections.set(finalCollections);
      this.save();
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
