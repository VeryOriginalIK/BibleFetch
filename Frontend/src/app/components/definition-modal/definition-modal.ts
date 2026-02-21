import { Component, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from '../../services/state-service/state-service';
import { StrongsDataService } from '../../services/strongs-data-service/strongs-data-service';
import { StrongDefinition } from '../../models/strong-definition-model';

@Component({
  selector: 'app-definition-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './definition-modal.html',
  styleUrl: './definition-modal.css',
})
export class DefinitionModal {
  state = inject(StateService);
  private strongsData = inject(StrongsDataService);

  definition = signal<StrongDefinition | null>(null);
  isLoading = signal(false);

  constructor() {
    effect(() => {
      const id = this.state.selectedStrongId();
      if (id) {
        this.loadDefinition(id);
      } else {
        this.definition.set(null);
      }
    });
  }

  async loadDefinition(id: string) {
    this.isLoading.set(true);
    try {
      const def = await this.strongsData.getDefinition(id);
      this.definition.set(def);
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  close() {
    this.state.closeDefinition();
  }
}
