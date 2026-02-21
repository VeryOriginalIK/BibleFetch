import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CollectionService } from '../../services/collection-service/collection-service';
import { UserCollection } from '../../models/user-collection-model';

@Component({
  standalone: true,
  selector: 'app-public-collections',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './public-collections-component.html',
})
export class PublicCollectionsComponent implements OnInit {
  private collectionService = inject(CollectionService);

  publicCollections = signal<UserCollection[]>([]);
  isLoading = signal(false);
  status = signal<string | null>(null);
  searchQuery = signal('');

  ngOnInit(): void {
    this.loadPublicCollections();
  }

  async loadPublicCollections() {
    this.isLoading.set(true);
    this.status.set(null);

    try {
      const result = await this.collectionService.browsePublicCollections();
      if (result.ok) {
        this.publicCollections.set(result.collections);
        if (result.collections.length === 0) {
          this.status.set('Még nincsenek nyilvános gyűjtemények.');
        }
      } else {
        this.status.set('Hiba a betöltés során: ' + String((result.error as any)?.message || result.error));
      }
    } catch (err) {
      this.status.set('Hiba történt: ' + String(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async searchPublic() {
    const query = this.searchQuery().trim();
    if (!query) {
      await this.loadPublicCollections();
      return;
    }

    this.isLoading.set(true);
    this.status.set(null);

    try {
      const result = await this.collectionService.searchPublicCollections(query);
      if (result.ok) {
        this.publicCollections.set(result.collections);
        if (result.collections.length === 0) {
          this.status.set('Nincs találat erre a keresésre.');
        }
      } else {
        this.status.set('Hiba a keresés során: ' + String((result.error as any)?.message || result.error));
      }
    } catch (err) {
      this.status.set('Hiba történt: ' + String(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async addToLibrary(collection: UserCollection) {
    this.status.set('Hozzáadás...');

    try {
      const result = await this.collectionService.addPublicCollectionToLibrary(collection);
      if (result.ok) {
        this.status.set(`"${collection.name}" hozzáadva a gyűjteményeidhez!`);
        setTimeout(() => this.status.set(null), 3000);
      } else {
        this.status.set('Hiba: ' + String((result as any).error));
      }
    } catch (err) {
      this.status.set('Hiba történt: ' + String(err));
    }
  }
}
