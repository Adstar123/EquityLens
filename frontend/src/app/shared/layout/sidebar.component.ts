import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideBarChart3,
  lucideLayers,
  lucideStar,
  lucideSettings,
  lucideSun,
  lucideMoon,
  lucideLogOut,
  lucideLogIn,
  lucideMenu,
  lucideX,
} from '@ng-icons/lucide';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { ApiService, Sector } from '../../core/api.service';
import { LogoMarkComponent } from '../components/logo-mark.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIcon, LogoMarkComponent],
  template: `
    <!-- ── Desktop rail ── -->
    <nav
      class="sidebar"
      (mouseenter)="expanded.set(true)"
      (mouseleave)="expanded.set(false); sectorsOpen.set(false)"
    >
      <div class="logo-area">
        <a routerLink="/" class="logo-link">
          <app-logo-mark [size]="24" />
          @if (expanded()) {
            <span class="logo-word">EQUITY<em>LENS</em></span>
          }
        </a>
      </div>

      <div class="nav-items">
        <a routerLink="/screener" routerLinkActive="active" class="nav-item">
          <ng-icon [svg]="icons.barChart3" class="nav-icon" size="19" />
          @if (expanded()) {
            <span class="nav-label">Screener</span>
          }
        </a>

        <button class="nav-item" (click)="sectorsOpen.set(!sectorsOpen())">
          <ng-icon [svg]="icons.layers" class="nav-icon" size="19" />
          @if (expanded()) {
            <span class="nav-label">Sectors</span>
            <span class="nav-caret" [class.open]="sectorsOpen()">&rsaquo;</span>
          }
        </button>
        @if (expanded() && sectorsOpen()) {
          <div class="sector-sub">
            @for (sector of sectors(); track sector.key) {
              <a [routerLink]="['/sector', sector.key]" routerLinkActive="active" class="nav-sub-item">
                {{ sector.display_name }}
              </a>
            }
            @if (sectors().length === 0) {
              <span class="nav-sub-item is-muted">Loading&hellip;</span>
            }
          </div>
        }

        @if (auth.isLoggedIn()) {
          <a routerLink="/watchlist" routerLinkActive="active" class="nav-item">
            <ng-icon [svg]="icons.star" class="nav-icon" size="19" />
            @if (expanded()) {
              <span class="nav-label">Watchlist</span>
            }
          </a>
        }

        @if (auth.isLoggedIn() && auth.isSuperAdmin()) {
          <a routerLink="/admin" routerLinkActive="active" class="nav-item">
            <ng-icon [svg]="icons.settings" class="nav-icon" size="19" />
            @if (expanded()) {
              <span class="nav-label">Admin</span>
            }
          </a>
        }
      </div>

      <div class="sidebar-bottom">
        <button class="nav-item" (click)="theme.toggle()">
          <ng-icon [svg]="theme.theme() === 'dark' ? icons.sun : icons.moon" class="nav-icon" size="19" />
          @if (expanded()) {
            <span class="nav-label">{{ theme.theme() === 'dark' ? 'Light mode' : 'Dark mode' }}</span>
          }
        </button>
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
          <button class="nav-item" (click)="logout()">
            <ng-icon [svg]="icons.logOut" class="nav-icon" size="19" />
            @if (expanded()) {
              <span class="nav-label">Sign out</span>
            }
          </button>
        } @else {
          <a routerLink="/" class="nav-item">
            <ng-icon [svg]="icons.logIn" class="nav-icon" size="19" />
            @if (expanded()) {
              <span class="nav-label">Sign in</span>
            }
          </a>
        }
      </div>
    </nav>

    <!-- ── Mobile top bar ── -->
    <header class="mobile-bar">
      <button class="mb-menu" (click)="drawerOpen.set(true)" aria-label="Open menu">
        <ng-icon [svg]="icons.menu" size="22" />
      </button>
      <a routerLink="/" class="mb-brand">
        <app-logo-mark [size]="24" />
        <span class="logo-word">EQUITY<em>LENS</em></span>
      </a>
      <button class="mb-theme" (click)="theme.toggle()" aria-label="Toggle theme">
        <ng-icon [svg]="theme.theme() === 'dark' ? icons.sun : icons.moon" size="20" />
      </button>
    </header>

    <!-- ── Mobile drawer ── -->
    @if (drawerOpen()) {
      <div class="drawer-backdrop" (click)="drawerOpen.set(false)"></div>
      <nav class="drawer">
        <div class="drawer-head">
          <span class="logo-word">EQUITY<em>LENS</em></span>
          <button class="mb-menu" (click)="drawerOpen.set(false)" aria-label="Close menu">
            <ng-icon [svg]="icons.x" size="22" />
          </button>
        </div>

        <div class="drawer-items">
          <a routerLink="/screener" routerLinkActive="active" class="nav-item" (click)="drawerOpen.set(false)">
            <ng-icon [svg]="icons.barChart3" class="nav-icon" size="19" />
            <span class="nav-label">Screener</span>
          </a>

          @if (auth.isLoggedIn()) {
            <a routerLink="/watchlist" routerLinkActive="active" class="nav-item" (click)="drawerOpen.set(false)">
              <ng-icon [svg]="icons.star" class="nav-icon" size="19" />
              <span class="nav-label">Watchlist</span>
            </a>
          }

          @if (auth.isLoggedIn() && auth.isSuperAdmin()) {
            <a routerLink="/admin" routerLinkActive="active" class="nav-item" (click)="drawerOpen.set(false)">
              <ng-icon [svg]="icons.settings" class="nav-icon" size="19" />
              <span class="nav-label">Admin</span>
            </a>
          }

          <div class="drawer-section">Sectors</div>
          @for (sector of sectors(); track sector.key) {
            <a [routerLink]="['/sector', sector.key]" routerLinkActive="active" class="nav-sub-item" (click)="drawerOpen.set(false)">
              {{ sector.display_name }}
            </a>
          }
        </div>

        <div class="drawer-bottom">
          <div class="user-area">
            <div class="user-avatar">{{ userInitial() }}</div>
            <div class="user-info">
              <span class="user-name">{{ auth.isLoggedIn() ? (auth.user()?.name || 'User') : 'Guest' }}</span>
              <span class="user-email">{{ auth.isLoggedIn() ? auth.user()?.email : 'Not signed in' }}</span>
            </div>
          </div>
          @if (auth.isLoggedIn()) {
            <button class="nav-item" (click)="logout(); drawerOpen.set(false)">
              <ng-icon [svg]="icons.logOut" class="nav-icon" size="19" />
              <span class="nav-label">Sign out</span>
            </button>
          } @else {
            <a routerLink="/" class="nav-item" (click)="drawerOpen.set(false)">
              <ng-icon [svg]="icons.logIn" class="nav-icon" size="19" />
              <span class="nav-label">Sign in</span>
            </a>
          }
        </div>
      </nav>
    }
  `,
  styles: [`
    // ── Shared brand ──
    .logo-word {
      font-family: 'Archivo', sans-serif;
      font-stretch: 115%;
      font-weight: 800;
      font-size: 0.92rem;
      letter-spacing: 0.03em;
      color: var(--text-primary);
      white-space: nowrap;

      em {
        font-style: normal;
        color: var(--accent);
      }
    }

    // ── Desktop rail ──
    .sidebar {
      width: 60px;
      min-width: 60px;
      height: 100vh;
      height: 100dvh;
      background: var(--bg-deep);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: width 200ms ease, min-width 200ms ease;
      overflow: hidden;
      position: relative;
      z-index: 50;
    }

    .sidebar:hover {
      width: 236px;
      min-width: 236px;
    }

    .logo-area {
      padding: 0 1.05rem;
      border-bottom: 1px solid var(--border);
      height: 56px;
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    .logo-link {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      white-space: nowrap;
    }

    .nav-items {
      padding: 0.5rem 0;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .nav-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1.05rem;
      color: var(--text-secondary);
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
      transition: color 150ms ease, background 150ms ease;
      font-size: 0.865rem;
      font-weight: 500;
      background: none;
      border: none;
      width: 100%;
      text-align: left;
      font-family: inherit;
    }

    .nav-item:hover {
      color: var(--text-primary);
      background: var(--bg-surface);
    }

    .nav-item.active {
      color: var(--accent);
      background: var(--accent-soft);
    }

    .nav-item.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 2px;
      border-radius: 0 2px 2px 0;
      background: var(--accent);
    }

    .nav-icon {
      flex-shrink: 0;
      width: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 2px;
    }

    .nav-caret {
      margin-left: auto;
      font-size: 1rem;
      color: var(--text-muted);
      transition: transform 150ms ease;
    }

    .nav-caret.open {
      transform: rotate(90deg);
    }

    .sector-sub {
      display: flex;
      flex-direction: column;
      padding: 2px 0 6px 2.45rem;
    }

    .nav-sub-item {
      display: block;
      padding: 0.34rem 1rem 0.34rem 0.6rem;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.8rem;
      white-space: nowrap;
      border-left: 1px solid var(--border);
      transition: color 150ms ease, border-color 150ms ease;
    }

    .nav-sub-item:hover {
      color: var(--text-primary);
    }

    .nav-sub-item.active {
      color: var(--accent);
      border-left-color: var(--accent);
    }

    .nav-sub-item.is-muted {
      color: var(--text-muted);
      font-size: 0.75rem;
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
      padding: 0.6rem 1.05rem;
      white-space: nowrap;
      overflow: hidden;
    }

    .user-avatar {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--accent);
      color: #14100a;
      font-weight: 700;
      font-size: 0.62rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: 1px;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .user-name {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-email {
      font-size: 0.68rem;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    // ── Mobile bar ──
    .mobile-bar {
      display: none;
    }

    .mb-menu,
    .mb-theme {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      transition: color 150ms ease, background 150ms ease;
    }

    .mb-menu:hover,
    .mb-theme:hover {
      color: var(--text-primary);
      background: var(--bg-surface);
    }

    .mb-brand {
      display: flex;
      align-items: center;
      gap: 9px;
      text-decoration: none;
      margin-right: auto;
    }

    // ── Drawer ──
    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(4, 6, 9, 0.6);
      backdrop-filter: blur(2px);
      z-index: 200;
      animation: fadeIn 180ms ease;
    }

    .drawer {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: min(300px, 84vw);
      background: var(--bg-deep);
      border-right: 1px solid var(--border);
      z-index: 201;
      display: flex;
      flex-direction: column;
      animation: slideIn 220ms cubic-bezier(0.32, 0.72, 0.28, 1);
      overflow-y: auto;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
    }

    @keyframes slideIn {
      from { transform: translateX(-100%); }
    }

    .drawer-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6rem 0.75rem 0.6rem 1.05rem;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .drawer-items {
      padding: 0.5rem 0;
      flex: 1;
    }

    .drawer-section {
      font-size: 0.66rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text-muted);
      padding: 1.1rem 1.05rem 0.4rem;
    }

    .drawer .nav-sub-item {
      border-left: none;
      padding: 0.5rem 1.05rem;
      font-size: 0.85rem;
    }

    .drawer-bottom {
      border-top: 1px solid var(--border);
      padding: 0.5rem 0;
      padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
      flex-shrink: 0;
    }

    @media (min-width: 769px) {
      .drawer,
      .drawer-backdrop {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .sidebar {
        display: none;
      }

      .mobile-bar {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 56px;
        padding: 0 0.6rem;
        background: var(--bg-deep);
        border-bottom: 1px solid var(--border);
        z-index: 100;
      }
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
  drawerOpen = signal(false);
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
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
