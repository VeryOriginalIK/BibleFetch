import { Component, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth-service/auth.service';
import { CollectionService } from '../../services/collection-service/collection-service';

type AuthMode = 'login' | 'register';

@Component({
  standalone: true,
  selector: 'app-auth',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './auth-component.html',
})
export class AuthComponent {
  private auth = inject(AuthService);
  private collections = inject(CollectionService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  mode = signal<AuthMode>('login');
  email = signal('');
  password = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

  constructor() {
    // Supabase config now comes exclusively from environment variables
    // No manual configuration needed
    if (isPlatformBrowser(this.platformId) && !this.auth.isConfigured) {
      this.error.set('Supabase környezeti változók hiányoznak. Ellenőrizd a SUPABASE_URL és SUPABASE_ANON_KEY beállításokat.');
    }
  }

  async submit() {
    const email = this.email().trim();
    const password = this.password();
    if (!email || !password) {
      this.error.set('Töltsd ki az összes mezőt!');
      return;
    }
    this.isLoading.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'register') {
        await this.auth.signUp(email, password);
        this.success.set('Sikeres regisztráció! Ellenőrizd az e-mail fiókod.');
      } else {
        await this.auth.signIn(email, password);
        // After login, pull remote collections
        const result = await this.collections.loadFromSupabase();
        if (result.ok && result.merged) {
          this.success.set('Bejelentkezve, gyűjtemények szinkronizálva!');
        }
        setTimeout(() => this.router.navigate(['/']), 1200);
      }
    } catch (err: any) {
      this.error.set(err?.message ?? 'Hiba történt.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
