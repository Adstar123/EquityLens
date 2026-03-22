import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSignal = signal<string | null>(localStorage.getItem('token'));

  readonly isLoggedIn = computed(() => !!this.tokenSignal());
  readonly token = computed(() => this.tokenSignal());

  readonly user = computed(() => {
    const token = this.tokenSignal();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return { id: payload.user_id, email: payload.email, name: payload.name };
    } catch {
      return null;
    }
  });

  readonly isSuperAdmin = computed(() => {
    // This is checked server-side; client just uses it for UI visibility
    const email = this.user()?.email;
    return !!email; // All logged-in users see admin UI; server enforces access
  });

  login(token: string): void {
    localStorage.setItem('token', token);
    this.tokenSignal.set(token);
  }

  logout(): void {
    localStorage.removeItem('token');
    this.tokenSignal.set(null);
  }

  getAuthHeader(): string | null {
    const token = this.tokenSignal();
    return token ? `Bearer ${token}` : null;
  }
}
