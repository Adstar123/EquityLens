import { Routes } from '@angular/router';
import { authGuard, superAdminGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./landing/landing.component').then(m => m.LandingComponent) },
  { path: 'screener', loadComponent: () => import('./screener/screener.component').then(m => m.ScreenerComponent) },
  { path: 'ticker/:symbol', loadComponent: () => import('./ticker/ticker.component').then(m => m.TickerComponent) },
  { path: 'sector/:key', loadComponent: () => import('./sector/sector.component').then(m => m.SectorComponent) },
  { path: 'watchlist', loadComponent: () => import('./watchlist/watchlist.component').then(m => m.WatchlistComponent), canActivate: [authGuard] },
  { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [authGuard] },
  { path: 'admin', loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent), canActivate: [superAdminGuard] },
  { path: 'auth/callback', loadComponent: () => import('./core/auth-callback.component').then(m => m.AuthCallbackComponent) },
  { path: 'privacy', loadComponent: () => import('./legal/privacy.component').then(m => m.PrivacyComponent) },
  { path: 'terms', loadComponent: () => import('./legal/terms.component').then(m => m.TermsComponent) },
  { path: '**', redirectTo: '' },
];
