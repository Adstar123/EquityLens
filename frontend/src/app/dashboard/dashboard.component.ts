import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { loadMoverRows, computeDivergence, MoverRow } from '../core/movers';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { TickerSearchComponent } from '../shared/components/ticker-search.component';
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
  imports: [RouterLink, ScoreBadgeComponent, TickerSearchComponent],
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
        <app-ticker-search placeholder="Search any ASX ticker or company" />
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

        <!-- Price vs the books -->
        <section class="dash-card">
          <div class="card-head">
            <h2 class="card-title">Price vs the books</h2>
            <a routerLink="/screener" class="card-link">Open screener</a>
          </div>

          @if (moversLoading()) {
            <div class="row-list">
              @for (i of [0, 1, 2, 3, 4, 5]; track i) {
                <div class="sk-line"></div>
              }
            </div>
          } @else if (strongFallers().length === 0 && weakRallies().length === 0) {
            <div class="empty-state">
              Price and the model agree today. Nothing worth flagging.
            </div>
          } @else {
            <div class="row-list">
              @if (strongFallers().length) {
                <div class="group-label label-strong">Strong books, falling price</div>
                @for (row of strongFallers(); track row.symbol) {
                  <div class="data-row" (click)="goToTicker(row.symbol)">
                    <span class="dr-symbol">{{ row.symbol }}</span>
                    <span class="dr-name">{{ row.name }}</span>
                    <span class="dr-chg down">{{ row.change }}</span>
                    <span class="dr-num num-strong">{{ row.score }}</span>
                  </div>
                }
              }
              @if (weakRallies().length) {
                <div class="group-label label-weak">Weak books, rising price</div>
                @for (row of weakRallies(); track row.symbol) {
                  <div class="data-row" (click)="goToTicker(row.symbol)">
                    <span class="dr-symbol">{{ row.symbol }}</span>
                    <span class="dr-name">{{ row.name }}</span>
                    <span class="dr-chg up">{{ row.change }}</span>
                    <span class="dr-num num-weak">{{ row.score }}</span>
                  </div>
                }
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

    .dr-num.num-strong { color: var(--up); }
    .dr-num.num-weak { color: var(--down); }

    .group-label {
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 0.7rem 0.25rem 0.3rem;
    }

    .group-label.label-strong { color: var(--up); }
    .group-label.label-weak { color: var(--down); }

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

  watchlistRows = signal<WatchlistRow[]>([]);
  watchlistLoading = signal(true);
  strongFallers = signal<MoverRow[]>([]);
  weakRallies = signal<MoverRow[]>([]);
  moversLoading = signal(true);

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

  goToTicker(symbol: string): void {
    this.router.navigate(['/ticker', symbol]);
  }

  private loadMoversPanel(): void {
    this.api.screener({}).subscribe({
      next: (items) => {
        loadMoverRows(this.api, items).subscribe({
          next: (rows) => {
            const board = computeDivergence(rows, 4);
            this.strongFallers.set(board.strongFallers);
            this.weakRallies.set(board.weakRallies);
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
