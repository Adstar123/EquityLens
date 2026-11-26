import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoMarkComponent } from './components/logo-mark.component';
import { TickerSearchComponent } from './components/ticker-search.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, LogoMarkComponent, TickerSearchComponent],
  template: `
    <div class="nf-page">
      <app-logo-mark [size]="44" />
      <p class="nf-code">404</p>
      <h1 class="page-heading nf-title">Nothing listed at this address</h1>
      <p class="nf-sub">
        The page you're after doesn't exist, or the ticker was mistyped.
        Try a search, or head back to the screener.
      </p>
      <div class="nf-search">
        <app-ticker-search placeholder="Search any ASX ticker or company" />
      </div>
      <div class="nf-links">
        <a routerLink="/screener" class="ui-btn is-primary">Open the screener</a>
        <a routerLink="/" class="nf-link">Back to home</a>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .nf-page {
      min-height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 64px 24px;
      max-width: 440px;
      margin: 0 auto;
    }

    .nf-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--accent-ink);
      margin: 24px 0 8px;
    }

    .nf-title {
      margin-bottom: 12px;
    }

    .nf-sub {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-secondary);
      margin: 0 0 24px;
    }

    .nf-search {
      width: 100%;
      margin-bottom: 24px;
    }

    .nf-links {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .nf-link {
      font-size: 13px;
      color: var(--text-secondary);
      text-decoration: none;
      transition: color var(--dur-fast) var(--ease);
    }

    .nf-link:hover {
      color: var(--text-primary);
    }
  `],
})
export class NotFoundComponent {}
