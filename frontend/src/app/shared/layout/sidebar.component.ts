import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideBarChart3,
  lucideLayers,
  lucideStar,
  lucideSettings,
  lucideSearch,
  lucideHome,
} from '@ng-icons/lucide';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { ApiService, Sector } from '../../core/api.service';
import { lucideSun, lucideMoon, lucideLogOut } from '@ng-icons/lucide';
import { filter } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIcon],
  template: `
    <nav
      class="sidebar"
      (mouseenter)="expanded.set(true)"
      (mouseleave)="expanded.set(false); sectorsOpen.set(false)"
    >
      <!-- Logo -->
      <div class="logo-area">
        <a routerLink="/" class="logo-link">
          <span class="logo-icon font-display text-accent text-xl font-bold">EL</span>
          @if (expanded()) {
            <span class="logo-text font-display text-accent text-lg tracking-wide">EquityLens</span>
          }
        </a>
      </div>

      <!-- Nav items -->
      <div class="nav-items">
        <a routerLink="/screener" routerLinkActive="active" class="nav-item">
          <ng-icon [svg]="icons.barChart3" class="nav-icon" size="20" />
          @if (expanded()) {
            <span class="nav-label">Screener</span>
          }
        </a>

        <div class="nav-item" (click)="sectorsOpen.set(!sectorsOpen())">
          <ng-icon [svg]="icons.layers" class="nav-icon" size="20" />
          @if (expanded()) {
            <span class="nav-label">Sectors</span>
          }
        </div>
        @if (expanded() && sectorsOpen()) {
          <div class="sector-sub">
            @for (sector of sectors(); track sector.key) {
              <a [routerLink]="['/sector', sector.key]" routerLinkActive="active" class="nav-sub-item">
                {{ sector.display_name }}
              </a>
            }
            @if (sectors().length === 0) {
              <span class="nav-sub-item text-text-muted text-xs">Loading...</span>
            }
          </div>
        }

        @if (auth.isLoggedIn()) {
          <a routerLink="/watchlist" routerLinkActive="active" class="nav-item">
            <ng-icon [svg]="icons.star" class="nav-icon" size="20" />
            @if (expanded()) {
              <span class="nav-label">Watchlist</span>
            }
          </a>
        }

        @if (auth.isLoggedIn() && auth.isSuperAdmin()) {
          <a routerLink="/admin" routerLinkActive="active" class="nav-item">
            <ng-icon [svg]="icons.settings" class="nav-icon" size="20" />
            @if (expanded()) {
              <span class="nav-label">Admin</span>
            }
          </a>
        }
      </div>

      <!-- Bottom: theme toggle + user -->
      <div class="sidebar-bottom">
        <div class="nav-item" (click)="theme.toggle()">
          <ng-icon [svg]="theme.theme() === 'dark' ? icons.sun : icons.moon" class="nav-icon" size="20" />
          @if (expanded()) {
            <span class="nav-label">{{ theme.theme() === 'dark' ? 'Light mode' : 'Dark mode' }}</span>
          }
        </div>
        <div class="user-area">
          <div class="user-avatar">{{ userInitial() }}</div>
          @if (expanded()) {
            <div class="user-info">
              <span class="user-name">{{ auth.isLoggedIn() ? (auth.user()?.name || 'User') : 'Guest' }}</span>
              <span class="user-email">{{ auth.isLoggedIn() ? auth.user()?.email : 'Not signed in' }}</span>
            </div>
          }
        </div>
        @if (auth.isLoggedIn()) {
          <div class="nav-item" (click)="logout()">
            <ng-icon [svg]="icons.logOut" class="nav-icon" size="20" />
            @if (expanded()) {
              <span class="nav-label">Sign out</span>
            }
          </div>
        }
      </div>
    </nav>
  `,
  styles: [`
    .sidebar {
      width: 60px;
      min-width: 60px;
      height: 100vh;
      background: var(--bg-deep);
      border-right: 1px solid var(--bg-surface);
      display: flex;
      flex-direction: column;
      transition: width 200ms ease, min-width 200ms ease;
      overflow: hidden;
      position: relative;
      z-index: 50;
    }

    :host:hover .sidebar,
    .sidebar:hover {
      width: 240px;
      min-width: 240px;
    }

    .logo-area {
      padding: 1rem;
      border-bottom: 1px solid var(--border);
      height: 56px;
      display: flex;
      align-items: center;
    }

    .logo-link {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      white-space: nowrap;
    }

    .logo-icon {
      flex-shrink: 0;
      width: 28px;
      text-align: center;
    }

    .nav-items {
      padding: 0.5rem 0;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 1rem;
      color: var(--text-secondary);
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
      transition: color 150ms ease, background 150ms ease;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .nav-item:hover {
      color: var(--text-primary);
      background: var(--bg-surface);
    }

    .nav-item.active {
      color: #d4930d;
      background: rgba(212, 147, 13, 0.08);
      border-right: 2px solid #d4930d;
    }

    .nav-icon {
      flex-shrink: 0;
      width: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 2px;
    }

    .nav-label {
      opacity: 1;
      transition: opacity 150ms ease;
    }

    .sector-sub {
      display: flex;
      flex-direction: column;
      padding-left: 2.5rem;
    }

    .nav-sub-item {
      display: block;
      padding: 0.375rem 1rem;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.8125rem;
      white-space: nowrap;
      transition: color 150ms ease;
    }

    .nav-sub-item:hover {
      color: var(--text-primary);
    }

    .nav-sub-item.active {
      color: #d4930d;
    }

    .sidebar-bottom {
      margin-top: auto;
      border-top: 1px solid var(--border);
      padding: 0.5rem 0;
    }

    .user-area {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 1rem;
      white-space: nowrap;
      overflow: hidden;
    }

    .user-avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--accent);
      color: #0f0f1a;
      font-weight: 700;
      font-size: 0.6rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: 2px;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .user-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-email {
      font-size: 0.6875rem;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `],
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private api = inject(ApiService);
  private router = inject(Router);

  expanded = signal(false);
  sectorsOpen = signal(false);
  sectors = signal<Sector[]>([]);

  userInitial = () => {
    if (!this.auth.isLoggedIn()) return 'G';
    const name = this.auth.user()?.name;
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  icons = {
    barChart3: lucideBarChart3,
    layers: lucideLayers,
    star: lucideStar,
    settings: lucideSettings,
    search: lucideSearch,
    home: lucideHome,
    sun: lucideSun,
    moon: lucideMoon,
    logOut: lucideLogOut,
  };

  constructor() {
    this.api.listSectors().subscribe({
      next: (sectors) => this.sectors.set(sectors),
      error: () => this.sectors.set([]),
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
