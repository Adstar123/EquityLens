import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../core/api.service';
import { ratingBand } from '../core/bands';
import { loadMoverRows, computeDivergence, MoverRow } from '../core/movers';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { BandMeterComponent } from '../shared/components/band-meter.component';
import { TickerSearchComponent } from '../shared/components/ticker-search.component';

interface WatchlistRow {
  symbol: string;
  name: string;
  score: number | null;
  rating: string | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, ScoreBadgeComponent, BandMeterComponent, TickerSearchComponent],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1 class="page-heading">Dashboard</h1>
          <p class="date">{{ today }}</p>
        </div>
        <div class="search-slot">
          <app-ticker-search placeholder="Search any ASX ticker or company" />
        </div>
      </header>

      <div class="grid">
        <section class="card span-7">
          <div class="card-head">
            <h2 class="card-title">Watchlist</h2>
            <a routerLink="/watchlist" class="ui-link">Manage</a>
          </div>

          @if (watchlistLoading()) {
            @for (i of [0, 1, 2, 3]; track i) {
              <div class="row is-skeleton"><span class="sk"></span></div>
            }
          } @else if (watchlistRows().length === 0) {
            <div class="empty">
              Nothing here yet. Open a company and press Watch to keep it on this page.
            </div>
          } @else {
            @for (row of watchlistRows(); track row.symbol) {
              <a class="row" [routerLink]="['/ticker', row.symbol]">
                <span class="sym">{{ row.symbol }}</span>
                <span class="name">{{ row.name }}</span>
                <span class="end">
                  @if (row.score !== null && row.rating !== null) {
                    <app-score-badge [score]="row.score" [rating]="row.rating" [showLabel]="true" />
                  } @else {
                    <span class="muted">Not scored</span>
                  }
                </span>
              </a>
            }
          }
        </section>

        <section class="card span-5">
          <div class="card-head">
            <h2 class="card-title">Price vs the books</h2>
            <a routerLink="/screener" class="ui-link">Screener</a>
          </div>

          @if (moversLoading()) {
            @for (i of [0, 1, 2, 3, 4, 5]; track i) {
              <div class="row is-skeleton"><span class="sk"></span></div>
            }
          } @else if (strongFallers().length === 0 && weakRallies().length === 0) {
            <div class="empty">Price and the model agree today. Nothing worth flagging.</div>
          } @else {
            @if (strongFallers().length) {
              <div class="group-label">Strong books, falling price</div>
              @for (row of strongFallers(); track row.symbol) {
                <a class="row is-mover" [routerLink]="['/ticker', row.symbol]">
                  <span class="sym">{{ row.symbol }}</span>
                  <span class="score"><i>{{ row.score }}</i><app-band-meter [band]="band(row.rating)" /></span>
                  <span class="chg down">{{ row.change }}</span>
                </a>
              }
            }
            @if (weakRallies().length) {
              <div class="group-label">Weak books, rising price</div>
              @for (row of weakRallies(); track row.symbol) {
                <a class="row is-mover" [routerLink]="['/ticker', row.symbol]">
                  <span class="sym">{{ row.symbol }}</span>
                  <span class="score"><i>{{ row.score }}</i><app-band-meter [band]="band(row.rating)" /></span>
                  <span class="chg up">{{ row.change }}</span>
                </a>
              }
            }
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 32px 64px;
    }

    .head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 32px;
    }

    .date {
      margin: 8px 0 0;
      font-size: 14px;
      color: var(--text-muted);
    }

    .search-slot {
      width: 360px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }

    .span-7 { grid-column: span 7; }
    .span-5 { grid-column: span 5; }

    .card {
      padding: 20px 12px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      min-width: 0;
    }

    .card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 0 12px;
      margin-bottom: 12px;
    }

    .card-title {
      margin: 0;
      font-size: 15px;
      font-weight: 500;
    }

    .group-label {
      padding: 16px 12px 8px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .row {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      height: 44px;
      padding: 0 12px;
      border-radius: var(--radius);
      text-decoration: none;
      color: inherit;
      transition: background-color var(--dur-fast) var(--ease);
    }

    .row:not(.is-skeleton):hover {
      background: var(--bg-hover);
    }

    .row.is-mover {
      grid-template-columns: 72px minmax(0, 1fr) 64px;
    }

    .row.is-skeleton {
      display: flex;
    }

    .sym {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .row:hover .sym {
      color: var(--accent-ink);
    }

    .name {
      font-size: 13px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .score {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .score i {
      font-style: normal;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      min-width: 2ch;
      text-align: right;
    }

    .chg {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      text-align: right;
    }

    .up { color: var(--up); }
    .down { color: var(--down); }

    .muted {
      font-size: 13px;
      color: var(--text-muted);
    }

    .sk {
      display: block;
      width: 60%;
      height: 8px;
      border-radius: 4px;
      background: var(--band-off);
    }

    .empty {
      padding: 24px 12px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-muted);
    }

    @media (max-width: 1024px) {
      .span-7,
      .span-5 {
        grid-column: span 12;
      }
    }

    @media (max-width: 768px) {
      .page {
        padding: 24px 16px 48px;
      }

      .head {
        flex-direction: column;
        align-items: stretch;
      }

      .search-slot {
        width: 100%;
      }
    }
  `],
})
export class DashboardComponent implements OnInit {
  private router = inject(Router);
  private api = inject(ApiService);

  watchlistRows = signal<WatchlistRow[]>([]);
  watchlistLoading = signal(true);
  strongFallers = signal<MoverRow[]>([]);
  weakRallies = signal<MoverRow[]>([]);
  moversLoading = signal(true);

  readonly today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  band(rating: string) {
    return ratingBand(rating);
  }

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
        const details = companies.map(c => this.api.getTickerDetail(c.symbol).pipe(catchError(() => of(null))));
        forkJoin(details).subscribe(results => {
          this.watchlistRows.set(companies.map((c, i) => ({
            symbol: c.symbol,
            name: c.name,
            score: results[i]?.score?.composite_score ?? null,
            rating: results[i]?.score?.rating ?? null,
          })));
          this.watchlistLoading.set(false);
        });
      },
      error: () => {
        this.watchlistRows.set([]);
        this.watchlistLoading.set(false);
      },
    });
  }
}
