import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TopicService } from '../../services/topic-service/topic-service';
import { CollectionService } from '../../services/collection-service/collection-service';
import { take } from 'rxjs';

/**
 * This component loads a topic and syncs it as a collection, then redirects to the collection viewer.
 * This unifies topics and collections - topics are just pregenerated collections.
 */
@Component({
  standalone: true,
  selector: 'app-topic-redirect',
  template: `<div class="flex items-center justify-center min-h-screen">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Loading topic...</p>
    </div>
  </div>`,
})
export class TopicRedirectComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private topicsService = inject(TopicService);
  private collectionService = inject(CollectionService);

  ngOnInit() {
    const topicId = this.route.snapshot.paramMap.get('id');
    if (!topicId) {
      this.router.navigate(['/']);
      return;
    }

    // Load topic and sync as collection
    this.topicsService.getTopicDetail(topicId).pipe(take(1)).subscribe({
      next: (topic) => {
        // Sync topic as a collection
        this.collectionService.syncTopicCollection(
          topic.id,
          topic.titles.hu, // Use Hungarian title as default
          topic.verses,
          topic.theme_color
        );

        // Find the synced collection
        const collection = this.collectionService.collections().find(c => c.topicId === topicId);
        if (collection) {
          // Redirect to collection viewer
          this.router.navigate(['/collection', collection.id]);
        } else {
          this.router.navigate(['/']);
        }
      },
      error: () => {
        this.router.navigate(['/']);
      }
    });
  }
}
