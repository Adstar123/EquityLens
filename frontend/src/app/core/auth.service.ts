import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../../environments/environment';

const MOCK_USERS: Record<string, { id: string; email: string; name: string; admin: boolean }> = {
  admin: { id: 'mock-admin', email: 'admin@equitylens.dev', name: 'Adam Jarick', admin: true },
  user: { id: 'mock-user', email: 'user@equitylens.dev', name: 'Test User', admin: false },
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSignal = signal<string | null>(localStorage.getItem('token'));
  private mockRole = environment.mockAuth as string;

  readonly isLoggedIn = computed(() => !!this.mockRole || !!this.tokenSignal());
  readonly token = computed(() => this.tokenSignal());

  readonly user = computed(() => {
    if (this.mockRole && MOCK_USERS[this.mockRole]) {
      const m = MOCK_USERS[this.mockRole];
      return { id: m.id, email: m.email, name: m.name };
    }
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
    if (this.mockRole) return MOCK_USERS[this.mockRole]?.admin ?? false;
    const token = this.tokenSignal();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.is_admin === true;
    } catch {
      return false;
    }
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
