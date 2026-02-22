import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { StrongsDataService } from '../../services/strongs-data-service/strongs-data-service';
import { StateService } from '../../services/state-service/state-service';
import { StrongDefinition } from '../../models/strong-definition-model';

@Component({
  selector: 'app-strongs-word-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './strongs-word-viewer-component.html',
})
export class StrongsWordViewerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  public router = inject(Router);
  private strongsData = inject(StrongsDataService);
  public state = inject(StateService);

  currentId = signal<string>('H1');
  definition = signal<StrongDefinition | null>(null);
  isLoading = signal(false);
  notFound = signal(false);
  searchInput = signal('');

  isHebrew = computed(() => this.currentId().startsWith('H') || this.currentId().startsWith('A'));

  // Adjacent entry IDs
  prevId = computed(() => {
    const id = this.currentId();
    const prefix = id.charAt(0).toUpperCase();
    const num = parseInt(id.substring(1), 10);
    return num > 1 ? `${prefix}${num - 1}` : null;
  });

  nextId = computed(() => {
    const id = this.currentId();
    const prefix = id.charAt(0).toUpperCase();
    const num = parseInt(id.substring(1), 10);
    const max = prefix === 'H' || prefix === 'A' ? 8674 : 5624;
    return num < max ? `${prefix}${num + 1}` : null;
  });

  async ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      const id = (params.get('id') || 'H1').toUpperCase();
      this.currentId.set(id);
      this.searchInput.set(id);
      await this.loadDefinition(id);
    });
  }

  async loadDefinition(id: string) {
    this.isLoading.set(true);
    this.notFound.set(false);
    this.definition.set(null);
    try {
      const def = await this.strongsData.getDefinition(id);
      this.definition.set(def);
      this.notFound.set(!def);
    } catch {
      this.notFound.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  navigateTo(id: string | null) {
    if (!id) return;
    this.router.navigate(['/strongs', id]);
  }

  onSearchSubmit() {
    const raw = this.searchInput().trim().toUpperCase();
    if (!raw) return;
    // Normalize: "H1", "H 1", "1" (default H), "G1" etc.
    const match = raw.match(/^([HGA]?)(\d+)$/);
    if (match) {
      const prefix = match[1] || 'H';
      const num = match[2];
      this.router.navigate(['/strongs', `${prefix}${num}`]);
    }
  }

  get langLabel(): string {
    return this.isHebrew() ? 'Héber' : 'Görög';
  }

  get langLabelEn(): string {
    return this.isHebrew() ? 'Hebrew' : 'Greek';
  }
}
