import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CollectionService } from '../../services/collection-service/collection-service';
import { UserCollection } from '../../models/user-collection-model';

@Component({
  standalone: true,
  selector: 'app-collections',
  imports: [CommonModule, RouterModule],
  templateUrl: './collections-component.html',
  styleUrl: './collections-component.css',
})
export class CollectionsComponent {
  public collectionService = inject(CollectionService);
  private router = inject(Router);

  expandedCollectionId = signal<string | null>(null);

  get hasTopicCollections(): boolean {
    return this.collectionService.collections().some(c => c.topicId);
  }

  toggleCollection(id: string) {
    this.expandedCollectionId.set(this.expandedCollectionId() === id ? null : id);
  }

  navigateToVerse(verseId: string) {
    // Parse verseId like "joh-3-16" → /bible/joh/3
    const parts = verseId.split('-');
    if (parts.length >= 2) {
      const bookId = parts[0];
      const chapter = parts[1];
      this.router.navigate(['/bible', bookId, chapter]);
    }
  }

  deleteCollection(id: string, event: Event) {
    event.stopPropagation();
    const collection = this.collectionService.getCollection(id);

    if (collection?.topicId) {
      alert('A téma-gyűjteményeket nem lehet törölni. Csak verseket távolíthatsz el belőlük.');
      return;
    }

    if (confirm('Biztosan törlöd ezt a gyűjteményt?')) {
      this.collectionService.deleteCollection(id);
    }
  }

  navigateToTopic(topicId: string, event: Event) {
    event.stopPropagation();
    this.router.navigate(['/topics', topicId]);
  }

  formatVerseId(verseId: string): string {
    // Convert "joh-3-16" → "JOH 3:16"
    const parts = verseId.split('-');
    if (parts.length === 3) {
      return `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}`;
    } else if (parts.length === 4) {
      // Range: "joh-3-16-17" → "JOH 3:16-17"
      return `${parts[0].toUpperCase()} ${parts[1]}:${parts[2]}-${parts[3]}`;
    }
    return verseId;
  }
}
