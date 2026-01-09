import { Component, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header-component.html',
  styles: [`
    /* Animációk definíciója (Tailwind mellett ezek kellenek custom keyframe-ként) */
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
  // Signal az állapotkezeléshez
  isSearchActive = signal(false);

  @ViewChild('searchInput') searchInput!: ElementRef;

  toggleSearch(state: boolean) {
    this.isSearchActive.set(state);
    if (state) {
      // Pici késleltetés, hogy az elem renderelődjön a DOM-ba a fókusz előtt
      setTimeout(() => this.searchInput?.nativeElement.focus(), 50);
    }
  }

  onBlur(value: string) {
    // Ha üres a mező és kikattint, zárjuk be
    if (!value.trim()) this.toggleSearch(false);
  }

  onSearch(value: string) {
    console.log('Keresés indítása:', value);
    // TODO: Itt implementáljuk majd a navigációt:
    // this.router.navigate(['/search'], { queryParams: { q: value } });
  }
}
