import { Component, signal, ViewChild, ElementRef, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth-service/auth.service';
import { StateService } from '../../services/state-service/state-service';
import { VersionSelectorComponent } from '../version-selector/version-selector';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, VersionSelectorComponent],
  templateUrl: './header-component.html',
  styles: [`
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(10px) scale(0.98); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
    .animate-slide-in { animation: slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .animate-fade-in { animation: fadeIn 0.2s ease-out; }
  `]
})
export class HeaderComponent {
  isSearchActive = signal(false);
  public auth = inject(AuthService);
  public state = inject(StateService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  @ViewChild('searchInput') searchInput?: ElementRef;

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.isSearchActive.set(false);
      });
  }

  toggleSearch(state: boolean) {
    this.isSearchActive.set(state);
    if (state) {
      setTimeout(() => this.searchInput?.nativeElement.focus(), 50);
    }
  }

  onBlur(value: string) {
    if (!value.trim()) this.toggleSearch(false);
  }

  onSearch(value: string) {
    const query = value.trim();
    if (query) {
      this.isSearchActive.set(false);
      this.router.navigate(['/search'], { queryParams: { q: query } });
    }
  }

  async signOut() {
    await this.auth.signOut();
  }
}
