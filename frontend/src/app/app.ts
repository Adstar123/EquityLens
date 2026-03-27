import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { SidebarComponent } from './shared/layout/sidebar.component';
import { ThemeService } from './core/theme.service';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private router = inject(Router);
  private themeService = inject(ThemeService);
  isLandingPage = signal(true);

  constructor() {
    this.themeService.init();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.isLandingPage.set(e.urlAfterRedirects === '/');
      });
  }
}
