import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.stored());

  toggle(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    localStorage.setItem('theme', next);
    this.apply(next);
  }

  init(): void {
    this.apply(this.theme());
  }

  private stored(): Theme {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  }

  private apply(t: Theme): void {
    document.documentElement.setAttribute('data-theme', t);
  }
}
