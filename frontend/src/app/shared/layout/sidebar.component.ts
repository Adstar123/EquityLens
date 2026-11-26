import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import {
  lucideChartColumn,
  lucideLayoutDashboard,
  lucideStar,
  lucideSettings,
  lucideSun,
  lucideMoon,
  lucideLogOut,
  lucideLogIn,
  lucideMenu,
  lucideX,
} from '@ng-icons/lucide';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { ApiService, Sector } from '../../core/api.service';
import { LogoMarkComponent } from '../components/logo-mark.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIcon, NgTemplateOutlet, LogoMarkComponent],
  template: `
    <ng-template #navBody>
      <div class="group">
        <a routerLink="/screener" routerLinkActive="active" class="nav-item">
          <ng-icon [svg]="icons.chart" size="18" strokeWidth="1.5" class="nav-icon" />
          <span>Screener</span>
        </a>
        @if (auth.isLoggedIn()) {
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
            <ng-icon [svg]="icons.dashboard" size="18" strokeWidth="1.5" class="nav-icon" />
            <span>Dashboard</span>
          </a>
          <a routerLink="/watchlist" routerLinkActive="active" class="nav-item">
            <ng-icon [svg]="icons.star" size="18" strokeWidth="1.5" class="nav-icon" />
            <span>Watchlist</span>
          </a>
        }
        @if (auth.isLoggedIn() && auth.isSuperAdmin()) {
          <a routerLink="/admin" routerLinkActive="active" class="nav-item">
            <ng-icon [svg]="icons.settings" size="18" strokeWidth="1.5" class="nav-icon" />
            <span>Scoring models</span>
          </a>
        }
      </div>

      <div class="group">
        <span class="group-label">Sectors</span>
        @for (sector of sectors(); track sector.key) {
          <a [routerLink]="['/sector', sector.key]" routerLinkActive="active" class="nav-item is-sub">
            <span class="sub-dot"></span>
            <span class="nav-text">{{ sector.display_name }}</span>
          </a>
        } @empty {
          @for (i of [0, 1, 2, 3, 4, 5]; track i) {
            <span class="nav-item is-sub is-loading"><span class="sk"></span></span>
          }
        }
      </div>
    </ng-template>

    <ng-template #footBody>
      <button class="nav-item" (click)="theme.toggle()">
        <ng-icon [svg]="theme.theme() === 'dark' ? icons.sun : icons.moon" size="18" strokeWidth="1.5" class="nav-icon" />
        <span>{{ theme.theme() === 'dark' ? 'Light theme' : 'Dark theme' }}</span>
      </button>
      @if (auth.isLoggedIn()) {
        <div class="user">
          <span class="avatar">{{ userInitial() }}</span>
          <span class="user-info">
            <span class="user-name">{{ auth.user()?.name || 'Signed in' }}</span>
            <span class="user-email">{{ auth.user()?.email }}</span>
          </span>
          <button class="icon-btn" (click)="logout()" aria-label="Sign out" title="Sign out">
            <ng-icon [svg]="icons.logOut" size="16" strokeWidth="1.5" />
          </button>
        </div>
      } @else {
        <a routerLink="/" fragment="signin" class="nav-item">
          <ng-icon [svg]="icons.logIn" size="18" strokeWidth="1.5" class="nav-icon" />
          <span>Sign in</span>
        </a>
      }
    </ng-template>

    <!-- Desktop sidebar -->
    <nav class="sidebar" aria-label="Main">
      <a routerLink="/" class="brand" aria-label="EquityLens home">
        <app-logo-mark [size]="22" />
        <span class="wordmark">EQUITY<em>LENS</em></span>
      </a>
      <div class="scroll">
        <ng-container [ngTemplateOutlet]="navBody" />
      </div>
      <div class="foot">
        <ng-container [ngTemplateOutlet]="footBody" />
      </div>
    </nav>

    <!-- Mobile top bar -->
    <header class="mobile-bar">
      <button class="icon-btn" (click)="drawerOpen.set(true)" aria-label="Open menu">
        <ng-icon [svg]="icons.menu" size="20" strokeWidth="1.5" />
      </button>
      <a routerLink="/" class="brand is-bar" aria-label="EquityLens home">
        <app-logo-mark [size]="22" />
        <span class="wordmark">EQUITY<em>LENS</em></span>
      </a>
      <button class="icon-btn" (click)="theme.toggle()" aria-label="Toggle theme">
        <ng-icon [svg]="theme.theme() === 'dark' ? icons.sun : icons.moon" size="18" strokeWidth="1.5" />
      </button>
    </header>

    <!-- Mobile drawer -->
    @if (drawerOpen()) {
      <div class="backdrop" (click)="drawerOpen.set(false)"></div>
      <nav class="drawer" aria-label="Main">
        <div class="drawer-head">
          <a routerLink="/" class="brand is-bar" aria-label="EquityLens home">
            <app-logo-mark [size]="22" />
            <span class="wordmark">EQUITY<em>LENS</em></span>
          </a>
          <button class="icon-btn" (click)="drawerOpen.set(false)" aria-label="Close menu">
            <ng-icon [svg]="icons.x" size="20" strokeWidth="1.5" />
          </button>
        </div>
        <div class="scroll">
          <ng-container [ngTemplateOutlet]="navBody" />
        </div>
        <div class="foot">
          <ng-container [ngTemplateOutlet]="footBody" />
        </div>
      </nav>
    }
  `,
  styles: [`
    :host {
      display: contents;
    }

    .wordmark {
      font-family: 'Archivo', sans-serif;
      font-stretch: 115%;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.03em;
      color: var(--text-primary);
      white-space: nowrap;

      em {
        font-style: normal;
        color: var(--accent);
      }
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 64px;
      padding: 0 20px;
      flex-shrink: 0;
      text-decoration: none;
    }

    .brand.is-bar {
      height: auto;
      padding: 0;
    }

    // ── Desktop ──
    .sidebar {
      width: 240px;
      flex-shrink: 0;
      height: 100vh;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--bg-deep);
      border-right: 1px solid var(--border);
    }

    .scroll {
      flex: 1;
      overflow-y: auto;
      padding: 4px 12px 16px;
    }

    .group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .group + .group {
      margin-top: 24px;
    }

    .group-label {
      padding: 0 12px 8px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 36px;
      padding: 0 12px;
      border: none;
      border-radius: var(--radius);
      background: none;
      color: var(--text-secondary);
      font-size: 14px;
      text-decoration: none;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
      transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
    }

    .nav-item:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }

    .nav-item.active {
      color: var(--text-primary);
      background: var(--bg-hover);
      box-shadow: inset 0 0 0 1px var(--border);
    }

    .nav-icon {
      flex-shrink: 0;
      display: flex;
      width: 18px;
      color: var(--text-muted);
      transition: color var(--dur-fast) var(--ease);
    }

    .nav-item:hover .nav-icon {
      color: var(--text-secondary);
    }

    .nav-item.active .nav-icon {
      color: var(--accent);
    }

    .nav-item.is-sub {
      height: 32px;
      font-size: 13px;
    }

    .nav-text {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sub-dot {
      flex-shrink: 0;
      width: 18px;
      display: flex;
      justify-content: center;
    }

    .sub-dot::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--text-muted);
      opacity: 0.6;
      transition: background-color var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease);
    }

    .nav-item.active .sub-dot::before {
      background: var(--accent);
      opacity: 1;
    }

    .is-loading .sk {
      display: block;
      width: 112px;
      height: 8px;
      margin-left: 28px;
      border-radius: 4px;
      background: var(--band-off);
    }

    .foot {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px;
      border-top: 1px solid var(--border);
    }

    .user {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      padding: 0 4px 0 12px;
    }

    .avatar {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: -3px;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent-ink);
      font-size: 11px;
      font-weight: 600;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
      line-height: 1.3;
    }

    .user-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-email {
      font-size: 12px;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .icon-btn {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: var(--radius);
      background: none;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
    }

    .icon-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }

    // ── Mobile ──
    .mobile-bar {
      display: none;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(4, 6, 9, 0.6);
      animation: fadeIn var(--dur) var(--ease);
    }

    .drawer {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 201;
      width: min(296px, 86vw);
      display: flex;
      flex-direction: column;
      background: var(--bg-deep);
      border-right: 1px solid var(--border);
      animation: slideIn var(--dur) var(--ease);
    }

    .drawer .foot {
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    }

    .drawer-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
      padding: 0 8px 0 20px;
      flex-shrink: 0;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
    }

    @keyframes slideIn {
      from { transform: translateX(-100%); }
    }

    @media (max-width: 1023px) {
      .sidebar {
        display: none;
      }

      .mobile-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        gap: 8px;
        height: 56px;
        padding: 0 8px;
        background: var(--bg-deep);
        border-bottom: 1px solid var(--border);
      }

      .mobile-bar .brand {
        margin-right: auto;
      }
    }

    @media (min-width: 1024px) {
      .drawer,
      .backdrop {
        display: none;
      }
    }
  `],
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private api = inject(ApiService);
  private router = inject(Router);

  drawerOpen = signal(false);
  sectors = signal<Sector[]>([]);

  userInitial = () => {
    const name = this.auth.user()?.name;
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  icons = {
    chart: lucideChartColumn,
    dashboard: lucideLayoutDashboard,
    star: lucideStar,
    settings: lucideSettings,
    sun: lucideSun,
    moon: lucideMoon,
    logOut: lucideLogOut,
    logIn: lucideLogIn,
    menu: lucideMenu,
    x: lucideX,
  };

  constructor() {
    this.api.listSectors().subscribe({
      next: (sectors) => this.sectors.set(sectors),
      error: () => this.sectors.set([]),
    });
    // Any navigation closes the drawer
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.drawerOpen.set(false));
  }

  @HostListener('document:keydown.escape')
  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
