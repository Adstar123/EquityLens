import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { inject as injectAnalytics } from '@vercel/analytics';
import { SidebarComponent } from './shared/layout/sidebar.component';
import { ThemeService } from './core/theme.service';
import { environment } from '../environments/environment';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private router = inject(Router);
  private http = inject(HttpClient);
  private themeService = inject(ThemeService);
  isLandingPage = signal(true);

  constructor() {
    this.themeService.init();
    if (environment.production) {
      injectAnalytics();
    }
    // Wake up backend on app load (handles Render cold starts)
    this.http.get(`${environment.apiUrl}/health`).subscribe({ error: () => {} });
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.isLandingPage.set(e.urlAfterRedirects === '/');
      });

    // "/" focuses the nearest ticker search box, terminal style
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )) return;
      const search = document.querySelector<HTMLInputElement>('[data-ticker-search]');
      if (search) {
        event.preventDefault();
        search.focus();
      }
    });
  }
}
