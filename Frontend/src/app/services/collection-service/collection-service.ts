import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { UserCollection } from '../../models/user-collection-model';

const STORAGE_KEY = 'bible_collections';

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private platformId = inject(PLATFORM_ID);

  /** All collections */
  readonly collections = signal<UserCollection[]>([]);

  /** Transient UI state: which verse just got a toast */
  readonly lastAddedVerse = signal<string | null>(null);

  constructor() {
    this.load();
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
