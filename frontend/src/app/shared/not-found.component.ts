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
      <h1 class="nf-title">Nothing listed at this address.</h1>
      <p class="nf-sub">
        The page you're after doesn't exist, or the ticker was mistyped.
        Try a search, or head back to the screener.
      </p>
      <div class="nf-search">
        <app-ticker-search placeholder="Search any ASX ticker or company" />
      </div>
      <div class="nf-links">
        <a routerLink="/screener" class="nf-btn">Open the screener</a>
        <a routerLink="/" class="nf-link">Back to home</a>
      </div>
    </div>
  `,
  styles: [`
    .nf-page {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 4rem 1.5rem;
      max-width: 460px;
      margin: 0 auto;
    }

    .nf-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.18em;
      color: var(--accent);
      margin: 1.25rem 0 0.4rem;
    }

    .nf-title {
      font-family: 'Archivo', sans-serif;
      font-stretch: 104%;
      font-weight: 720;
      font-size: 1.6rem;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin: 0 0 0.6rem;
    }

    .nf-sub {
      font-size: 0.9rem;
      line-height: 1.65;
      color: var(--text-secondary);
      margin: 0 0 1.75rem;
    }

    .nf-search {
      width: 100%;
      margin-bottom: 1.5rem;
    }

    .nf-links {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .nf-btn {
      display: inline-flex;
      align-items: center;
      padding: 9px 18px;
      background: var(--accent);
      color: #14100a;
      font-size: 0.84rem;
      font-weight: 600;
      border-radius: var(--radius);
      text-decoration: none;
      transition: background 0.18s ease, transform 0.18s ease;
    }

    .nf-btn:hover {
      background: var(--accent-light);
      transform: translateY(-1px);
    }

    .nf-link {
      font-size: 0.84rem;
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.15s ease;
    }

    .nf-link:hover {
      color: var(--text-primary);
    }
  `],
})
export class NotFoundComponent {}
