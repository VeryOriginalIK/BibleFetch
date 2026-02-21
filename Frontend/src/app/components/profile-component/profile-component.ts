import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CollectionService } from '../../services/collection-service/collection-service';
import { AuthService } from '../../services/auth-service/auth.service';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [CommonModule, RouterModule],
  templateUrl: './profile-component.html',
})
export class ProfileComponent {
  private collectionService = inject(CollectionService);
  public auth = inject(AuthService);
  status = signal<string | null>(null);

  get collections() {
    return this.collectionService.collections;
  }

  exportCollections() {
    this.collectionService.exportCollections();
    this.status.set('Gyűjtemények exportálva JSON-ba');
    setTimeout(() => this.status.set(null), 2000);
  }

  async importFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    await this.collectionService.importCollections(f);
    input.value = '';
    this.status.set('Gyűjtemények importálva');
    setTimeout(() => this.status.set(null), 2000);
  }

  async syncToSupabase() {
    if (!this.auth.isLoggedIn()) {
      this.status.set('Jelentkezz be a szinkronizáláshoz!');
      setTimeout(() => this.status.set(null), 3000);
      return;
    }
    this.status.set('Szinkronizálás Supabase-be...');
    const res = await this.collectionService.syncToSupabase();
    if (res.ok) this.status.set('Szinkronizálva Supabase-be');
    else this.status.set('Hiba: ' + String((res.error as any)?.message || res.error));
    setTimeout(() => this.status.set(null), 3000);
  }

  async loadFromSupabase() {
    if (!this.auth.isLoggedIn()) {
      this.status.set('Jelentkezz be a letöltéshez!');
      setTimeout(() => this.status.set(null), 3000);
      return;
    }
    this.status.set('Letöltés Supabase-ből...');
    const res = await this.collectionService.loadFromSupabase();
    if (res.ok && res.merged) this.status.set('Gyűjtemények letöltve és összefűzve');
    else if (res.ok) this.status.set('Nincs távoli gyűjtemény');
    else this.status.set('Hiba: ' + String((res.error as any)?.message || res.error));
    setTimeout(() => this.status.set(null), 3000);
  }

  async togglePublicStatus(collectionId: string, currentStatus: boolean) {
    if (!this.auth.isLoggedIn()) {
      this.status.set('Jelentkezz be a megosztáshoz!');
      setTimeout(() => this.status.set(null), 3000);
      return;
    }

    this.status.set(currentStatus ? 'Privát állapotba állítás...' : 'Nyilvánossá tétel...');

    try {
      const res = currentStatus
        ? await this.collectionService.makeCollectionPrivate(collectionId)
        : await this.collectionService.makeCollectionPublic(collectionId);

      if (res.ok) {
        this.status.set(currentStatus ? 'Gyűjtemény privát' : 'Gyűjtemény nyilvános!');
      } else {
        this.status.set('Hiba: ' + String((res.error as any)?.message || res.error));
      }
    } catch (err) {
      this.status.set('Hiba történt: ' + String(err));
    }

    setTimeout(() => this.status.set(null), 3000);
  }
}

