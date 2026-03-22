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
import { ApiService, Sector } from '../../core/api.service';
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
    </nav>
  `,
  styles: [`
    .sidebar {
      width: 60px;
      min-width: 60px;
      height: 100vh;
      background: #0a0a15;
      border-right: 1px solid #1a1a2e;
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
      border-bottom: 1px solid #1a1a2e;
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
      color: #8888a0;
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
      transition: color 150ms ease, background 150ms ease;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .nav-item:hover {
      color: #e8e8ed;
      background: #1a1a2e;
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
      color: #8888a0;
      text-decoration: none;
      font-size: 0.8125rem;
      white-space: nowrap;
      transition: color 150ms ease;
    }

    .nav-sub-item:hover {
      color: #e8e8ed;
    }

    .nav-sub-item.active {
      color: #d4930d;
    }
  `],
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);

  expanded = signal(false);
  sectorsOpen = signal(false);
  sectors = signal<Sector[]>([]);

  icons = {
    barChart3: lucideBarChart3,
    layers: lucideLayers,
    star: lucideStar,
    settings: lucideSettings,
    search: lucideSearch,
    home: lucideHome,
  };

  constructor() {
    this.api.listSectors().subscribe({
      next: (sectors) => this.sectors.set(sectors),
      error: () => this.sectors.set([]),
    });
  }
}
