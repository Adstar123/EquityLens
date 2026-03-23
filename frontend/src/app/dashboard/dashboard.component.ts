import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
} from '@angular/animations';
import { AuthService } from '../core/auth.service';
import { ApiService, Company, TickerDetail } from '../core/api.service';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { forkJoin } from 'rxjs';

interface WatchlistRow {
  symbol: string;
  name: string;
  score: number | null;
  rating: string | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, ScoreBadgeComponent],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('rowStagger', [
      transition(':enter', [
        query('.wl-row', [
          style({ opacity: 0, transform: 'translateY(6px)' }),
          stagger('40ms', [
            animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
          ]),
        ], { optional: true, limit: 20 }),
      ]),
    ]),
  ],
  template: `
    <div class="dashboard-container" @fadeIn>
      <!-- Greeting -->
      <header class="dash-header">
        <h1 class="greeting">Welcome back, {{ userName() }}</h1>
        <p class="greeting-sub">Your equity analysis dashboard</p>
      </header>

      <!-- Search -->
      <section class="search-section">
        <div class="search-wrap">
          <input
            type="text"
            class="search-input"
            placeholder="Search ticker or company..."
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearch($event)"
            (keydown.enter)="goToFirstResult()"
          />
          @if (searchResults().length > 0) {
            <div class="search-dropdown">
              @for (result of searchResults(); track result.symbol) {
                <div class="search-result" (click)="goToTicker(result.symbol)">
                  <span class="sr-symbol">{{ result.symbol }}</span>
                  <span class="sr-name">{{ result.name }}</span>
                </div>
              }
            </div>
          }
        </div>
      </section>

      <!-- Watchlist summary -->
      <section class="watchlist-section">
        <div class="section-header">
          <h2 class="section-title">WATCHLIST</h2>
          <a routerLink="/watchlist" class="view-all">View all &rarr;</a>
        </div>

        @if (watchlistLoading()) {
          <div class="loading-state">Loading watchlist...</div>
        } @else if (watchlistRows().length === 0) {
          <div class="empty-state">
            No tickers in your watchlist yet. Use the search bar above to find stocks.
          </div>
        } @else {
          <div class="wl-table" @rowStagger>
            <div class="wl-header">
              <span class="wh-symbol">Symbol</span>
              <span class="wh-name">Company</span>
              <span class="wh-score">Score</span>
            </div>
            @for (row of watchlistRows(); track row.symbol) {
              <div class="wl-row" (click)="goToTicker(row.symbol)">
                <span class="wc-symbol">{{ row.symbol }}</span>
                <span class="wc-name">{{ row.name }}</span>
                <span class="wc-score">
                  @if (row.score !== null && row.rating !== null) {
                    <app-score-badge [score]="row.score" [rating]="row.rating" />
                  } @else {
                    <span class="no-score">&mdash;</span>
                  }
                </span>
              </div>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .dashboard-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    .dash-header {
      margin-bottom: 2rem;
    }

    .greeting {
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 700;
      font-size: 1.5rem;
      color: #e8e8ed;
      margin: 0 0 0.25rem;
      line-height: 1.3;
    }

    .greeting-sub {
      font-size: 0.8125rem;
      color: #555570;
      margin: 0;
    }

    /* Search */
    .search-section {
      margin-bottom: 2.5rem;
    }

    .search-wrap {
      position: relative;
    }

    .search-input {
      width: 100%;
      background: #1a1a2e;
      border: 2px solid #252540;
      color: #e8e8ed;
      font-family: 'JetBrains Mono', monospace;
      font-size: 1rem;
      padding: 0.75rem 1rem;
      outline: none;
      transition: border-color 200ms ease;
      box-sizing: border-box;
    }

    .search-input::placeholder {
      color: #555570;
    }

    .search-input:focus {
      border-color: #d4930d;
    }

    .search-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #1a1a2e;
      border: 1px solid #252540;
      border-top: none;
      z-index: 20;
      max-height: 280px;
      overflow-y: auto;
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 1rem;
      cursor: pointer;
      transition: background 100ms ease;
    }

    .search-result:hover {
      background: #252540;
    }

    .sr-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.8125rem;
      color: #e8e8ed;
      min-width: 60px;
    }

    .sr-name {
      font-size: 0.8125rem;
      color: #8888a0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Watchlist */
    .watchlist-section {
      margin-bottom: 2rem;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    .section-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: #555570;
      margin: 0;
      text-transform: uppercase;
    }

    .view-all {
      font-size: 0.75rem;
      color: #d4930d;
      text-decoration: none;
      transition: color 150ms ease;
    }

    .view-all:hover {
      color: #e8a820;
    }

    .wl-table {
      border: 1px solid #252540;
      overflow: hidden;
    }

    .wl-header {
      display: grid;
      grid-template-columns: 100px 1fr 140px;
      gap: 0;
      padding: 0.5rem 0.75rem;
      background: #1a1a2e;
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #555570;
      border-bottom: 1px solid #252540;
    }

    .wl-row {
      display: grid;
      grid-template-columns: 100px 1fr 140px;
      gap: 0;
      padding: 0.5rem 0.75rem;
      align-items: center;
      cursor: pointer;
      transition: background 100ms ease;
      border-bottom: 1px solid #1a1a2e;
    }

    .wl-row:last-child {
      border-bottom: none;
    }

    .wl-row:hover {
      background: #1a1a2e;
    }

    .wc-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.8125rem;
      color: #e8e8ed;
      letter-spacing: 0.02em;
    }

    .wc-name {
      font-size: 0.8125rem;
      color: #8888a0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wc-score {
      white-space: nowrap;
    }

    .no-score {
      font-family: 'JetBrains Mono', monospace;
      color: #555570;
    }

    .loading-state,
    .empty-state {
      text-align: center;
      color: #555570;
      padding: 2rem 1rem;
      font-size: 0.8125rem;
      border: 1px solid #252540;
    }
  `],
})
export class DashboardComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);
  private api = inject(ApiService);

  searchQuery = signal('');
  searchResults = signal<Company[]>([]);
  watchlistRows = signal<WatchlistRow[]>([]);
  watchlistLoading = signal(true);

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  userName = () => this.auth.user()?.name ?? 'User';

  ngOnInit(): void {
    this.loadWatchlist();
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (!query || query.length < 1) {
      this.searchResults.set([]);
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.api.searchTickers(query).subscribe({
        next: (results) => this.searchResults.set(results.slice(0, 8)),
        error: () => this.searchResults.set([]),
      });
    }, 250);
  }

  goToTicker(symbol: string): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.router.navigate(['/ticker', symbol]);
  }

  goToFirstResult(): void {
    const results = this.searchResults();
    if (results.length > 0) {
      this.goToTicker(results[0].symbol);
    } else {
      // Try navigating directly to the typed symbol
      const q = this.searchQuery().trim().toUpperCase();
      if (q) {
        this.goToTicker(q);
      }
    }
  }

  private loadWatchlist(): void {
    this.watchlistLoading.set(true);
    this.api.getWatchlist().subscribe({
      next: (companies) => {
        if (companies.length === 0) {
          this.watchlistRows.set([]);
          this.watchlistLoading.set(false);
          return;
        }

        // Fetch scores for each company
        const detailRequests = companies.map(c => this.api.getTickerDetail(c.symbol));
        forkJoin(detailRequests).subscribe({
          next: (details) => {
            const rows: WatchlistRow[] = companies.map((c, i) => ({
              symbol: c.symbol,
              name: c.name,
              score: details[i]?.score?.composite_score ?? null,
              rating: details[i]?.score?.rating ?? null,
            }));
            this.watchlistRows.set(rows);
            this.watchlistLoading.set(false);
          },
          error: () => {
            // Fallback: show companies without scores
            this.watchlistRows.set(companies.map(c => ({
              symbol: c.symbol,
              name: c.name,
              score: null,
              rating: null,
            })));
            this.watchlistLoading.set(false);
          },
        });
      },
      error: () => {
        this.watchlistRows.set([]);
        this.watchlistLoading.set(false);
      },
    });
  }
}
