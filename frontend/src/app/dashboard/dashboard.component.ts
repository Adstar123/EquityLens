import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { NgIcon } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';
import { AuthService } from '../core/auth.service';
import { ApiService, Company } from '../core/api.service';
import { loadMovers, MoverRow } from '../core/movers';
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
  imports: [FormsModule, RouterLink, NgIcon, ScoreBadgeComponent],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
  template: `
    <div class="dashboard-container" @fadeIn>
      <header class="dash-header">
        <h1 class="greeting">{{ greetingLine() }}, {{ userName() }}</h1>
        <p class="greeting-sub">Here's where the market's fundamentals stand.</p>
      </header>

      <section class="search-section">
        <div class="search-wrap">
          <ng-icon [svg]="searchIcon" class="search-icon" size="16" />
          <input
            type="text"
            class="search-input"
            placeholder="Search any ASX ticker or company"
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

      <div class="dash-grid">
        <!-- Watchlist -->
        <section class="dash-card">
          <div class="card-head">
            <h2 class="card-title">Watchlist</h2>
            <a routerLink="/watchlist" class="card-link">View all</a>
          </div>

          @if (watchlistLoading()) {
            <div class="row-list">
              @for (i of [0, 1, 2, 3]; track i) {
                <div class="sk-line"></div>
              }
            </div>
          } @else if (watchlistRows().length === 0) {
            <div class="empty-state">
              Nothing here yet. Search a ticker above and star it to start a watchlist.
            </div>
          } @else {
            <div class="row-list">
              @for (row of watchlistRows(); track row.symbol) {
                <div class="data-row" (click)="goToTicker(row.symbol)">
                  <span class="dr-symbol">{{ row.symbol }}</span>
                  <span class="dr-name">{{ row.name }}</span>
                  <span class="dr-score">
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

        <!-- Today's movers -->
        <section class="dash-card">
          <div class="card-head">
            <h2 class="card-title">Today's movers</h2>
            <a routerLink="/screener" class="card-link">Open screener</a>
          </div>

          @if (moversLoading()) {
            <div class="row-list">
              @for (i of [0, 1, 2, 3, 4, 5]; track i) {
                <div class="sk-line"></div>
              }
            </div>
          } @else {
            <div class="row-list">
              @for (row of moverRows(); track row.symbol) {
                <div class="data-row" (click)="goToTicker(row.symbol)">
                  <span class="dr-symbol">{{ row.symbol }}</span>
                  <span class="dr-name">{{ row.name }}</span>
                  <span class="dr-chg" [class.up]="row.changePct >= 0" [class.down]="row.changePct < 0">{{ row.change }}</span>
                  <span class="dr-num">{{ row.score ?? '&ndash;' }}</span>
                </div>
              } @empty {
                <div class="empty-state">Quotes are taking a moment. Check the screener instead.</div>
              }
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      max-width: 1080px;
      margin: 0 auto;
      padding: 2.25rem 1.5rem 4rem;
    }

    .dash-header {
      margin-bottom: 1.75rem;
    }

    .greeting {
      font-family: 'Archivo', sans-serif;
      font-stretch: 104%;
      font-weight: 720;
      font-size: 1.6rem;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin: 0 0 0.3rem;
      line-height: 1.2;
    }

    .greeting-sub {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin: 0;
    }

    /* Search */
    .search-section {
      margin-bottom: 2rem;
    }

    .search-wrap {
      position: relative;
    }

    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
      display: flex;
    }

    .search-input {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      color: var(--text-primary);
      font-size: 0.95rem;
      padding: 0.8rem 1rem 0.8rem 2.5rem;
      outline: none;
      transition: border-color 180ms ease, box-shadow 180ms ease;
      box-sizing: border-box;
    }

    .search-input::placeholder {
      color: var(--text-muted);
    }

    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .search-dropdown {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      box-shadow: var(--shadow-card);
      z-index: 20;
      max-height: 300px;
      overflow-y: auto;
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      cursor: pointer;
      transition: background 100ms ease;
    }

    .search-result:hover {
      background: var(--bg-surface);
    }

    .sr-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.8125rem;
      color: var(--text-primary);
      min-width: 70px;
    }

    .sr-name {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Cards */
    .dash-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
      align-items: start;
    }

    .dash-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.1rem 1.25rem 0.6rem;
    }

    .card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 0.6rem;
    }

    .card-title {
      font-family: 'Archivo', sans-serif;
      font-weight: 680;
      font-size: 0.95rem;
      letter-spacing: -0.01em;
      color: var(--text-primary);
      margin: 0;
    }

    .card-link {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--accent);
      text-decoration: none;
      transition: color 150ms ease;
    }

    .card-link:hover {
      color: var(--accent-light);
    }

    .row-list {
      display: flex;
      flex-direction: column;
    }

    .data-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.55rem 0.25rem;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
      transition: background 100ms ease;
    }

    .data-row:last-child {
      border-bottom: none;
    }

    .data-row:hover {
      background: var(--bg-surface);
    }

    .data-row:hover .dr-symbol {
      color: var(--accent);
    }

    .dr-chg {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .dr-chg.up { color: var(--up); }
    .dr-chg.down { color: var(--down); }

    .dr-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.8125rem;
      color: var(--text-primary);
      min-width: 74px;
      flex-shrink: 0;
      transition: color 100ms ease;
    }

    .dr-name {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .dr-score {
      white-space: nowrap;
      flex-shrink: 0;
    }

    .dr-num {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.85rem;
      color: var(--accent);
      flex-shrink: 0;
    }

    .no-score {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-muted);
    }

    .empty-state {
      color: var(--text-muted);
      padding: 1.5rem 0.25rem 2rem;
      font-size: 0.8125rem;
      line-height: 1.6;
    }

    .sk-line {
      height: 13px;
      margin: 0.6rem 0.25rem;
      border-radius: 4px;
      background: linear-gradient(100deg, var(--bg-surface) 40%, var(--border) 50%, var(--bg-surface) 60%);
      background-size: 200% 100%;
      animation: skShimmer 1.4s ease infinite;
    }

    @keyframes skShimmer {
      from { background-position: 120% 0; }
      to { background-position: -80% 0; }
    }

    @media (max-width: 860px) {
      .dash-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class DashboardComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);
  private api = inject(ApiService);

  searchIcon = lucideSearch;

  searchQuery = signal('');
  searchResults = signal<Company[]>([]);
  watchlistRows = signal<WatchlistRow[]>([]);
  watchlistLoading = signal(true);
  gainers = signal<MoverRow[]>([]);
  fallers = signal<MoverRow[]>([]);
  moversLoading = signal(true);

  // Interleave so the panel reads gainers first, then fallers
  moverRows = (): MoverRow[] => [...this.gainers(), ...this.fallers()];

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  userName = () => {
    const name = this.auth.user()?.name ?? 'there';
    return name.split(' ')[0];
  };

  greetingLine = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  ngOnInit(): void {
    this.loadWatchlist();
    this.loadMoversPanel();
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
      const q = this.searchQuery().trim().toUpperCase();
      if (q) {
        this.goToTicker(q);
      }
    }
  }

  private loadMoversPanel(): void {
    this.api.screener({}).subscribe({
      next: (items) => {
        loadMovers(this.api, items, 4).subscribe({
          next: (movers) => {
            this.gainers.set(movers.gainers);
            this.fallers.set(movers.fallers);
            this.moversLoading.set(false);
          },
          error: () => this.moversLoading.set(false),
        });
      },
      error: () => this.moversLoading.set(false),
    });
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
