import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
} from '@angular/animations';
import { ApiService, Company } from '../core/api.service';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { forkJoin } from 'rxjs';

interface WatchlistRow {
  symbol: string;
  name: string;
  sector_id: string | null;
  score: number | null;
  rating: string | null;
  removing: boolean;
}

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [ScoreBadgeComponent],
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
        ], { optional: true, limit: 50 }),
      ]),
    ]),
  ],
  template: `
    <div class="watchlist-container" @fadeIn>
      <header class="wl-page-header">
        <h1 class="wl-page-title">WATCHLIST</h1>
        <span class="wl-count">{{ rows().length }} stocks</span>
      </header>

      @if (loading()) {
        <div class="loading-state">Loading...</div>
      } @else if (rows().length === 0) {
        <div class="empty-state">
          Your watchlist is empty. Search for tickers and add them from the detail page.
        </div>
      } @else {
        <div class="wl-table-wrap" @rowStagger>
          <table>
            <thead>
              <tr>
                <th class="col-symbol">Symbol</th>
                <th class="col-name">Company</th>
                <th class="col-sector">Sector</th>
                <th class="col-score">Score</th>
                <th class="col-action"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.symbol) {
                <tr class="wl-row" (click)="goToTicker(row.symbol)">
                  <td class="cell-symbol">{{ row.symbol }}</td>
                  <td class="cell-name">{{ row.name }}</td>
                  <td class="cell-sector">{{ row.sector_id ?? '—' }}</td>
                  <td class="cell-score">
                    @if (row.score !== null && row.rating !== null) {
                      <app-score-badge [score]="row.score" [rating]="row.rating" />
                    } @else {
                      <span class="no-score">&mdash;</span>
                    }
                  </td>
                  <td class="cell-action">
                    <button
                      class="remove-btn"
                      [class.removing]="row.removing"
                      (click)="removeFromWatchlist($event, row.symbol)"
                      title="Remove from watchlist"
                    >
                      @if (row.removing) {
                        ...
                      } @else {
                        &times;
                      }
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .watchlist-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #0f0f1a;
    }

    .wl-page-header {
      padding: 1rem 1.5rem 0.75rem;
      border-bottom: 1px solid #252540;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .wl-page-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: #555570;
      margin: 0;
      text-transform: uppercase;
    }

    .wl-count {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #555570;
    }

    .wl-table-wrap {
      flex: 1;
      overflow: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      position: sticky;
      top: 0;
      background: #0f0f1a;
      z-index: 10;
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #555570;
      border-bottom: 1px solid #252540;
      white-space: nowrap;
    }

    tbody tr {
      cursor: pointer;
      transition: background 100ms ease;
    }

    tbody tr:hover td {
      background: #1a1a2e;
    }

    td {
      padding: 0.5rem 0.75rem;
      font-size: 0.8125rem;
      color: #e8e8ed;
      border-bottom: 1px solid #1a1a2e;
      white-space: nowrap;
    }

    .cell-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      color: #e8e8ed;
      letter-spacing: 0.02em;
    }

    .cell-name {
      color: #8888a0;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-sector {
      color: #555570;
      font-size: 0.75rem;
    }

    .cell-score {
      white-space: nowrap;
    }

    .cell-action {
      text-align: center;
      width: 48px;
    }

    .no-score {
      font-family: 'JetBrains Mono', monospace;
      color: #555570;
    }

    .remove-btn {
      background: none;
      border: 1px solid transparent;
      color: #555570;
      font-size: 1.125rem;
      line-height: 1;
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
    }

    .remove-btn:hover {
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.3);
      background: rgba(239, 68, 68, 0.08);
    }

    .remove-btn.removing {
      color: #555570;
      cursor: default;
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: #555570;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: #555570;
      font-size: 0.875rem;
      padding: 3rem 1rem;
    }
  `],
})
export class WatchlistComponent implements OnInit {
  private router = inject(Router);
  private api = inject(ApiService);

  rows = signal<WatchlistRow[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    this.loadWatchlist();
  }

  goToTicker(symbol: string): void {
    this.router.navigate(['/ticker', symbol]);
  }

  removeFromWatchlist(event: Event, symbol: string): void {
    event.stopPropagation();

    // Mark row as removing
    this.rows.update(rows =>
      rows.map(r => r.symbol === symbol ? { ...r, removing: true } : r)
    );

    this.api.removeFromWatchlist(symbol).subscribe({
      next: () => {
        this.rows.update(rows => rows.filter(r => r.symbol !== symbol));
      },
      error: () => {
        // Revert removing state
        this.rows.update(rows =>
          rows.map(r => r.symbol === symbol ? { ...r, removing: false } : r)
        );
      },
    });
  }

  private loadWatchlist(): void {
    this.loading.set(true);
    this.api.getWatchlist().subscribe({
      next: (companies) => {
        if (companies.length === 0) {
          this.rows.set([]);
          this.loading.set(false);
          return;
        }

        // Fetch scores for each company
        const detailRequests = companies.map(c => this.api.getTickerDetail(c.symbol));
        forkJoin(detailRequests).subscribe({
          next: (details) => {
            const rows: WatchlistRow[] = companies.map((c, i) => ({
              symbol: c.symbol,
              name: c.name,
              sector_id: c.sector_id,
              score: details[i]?.score?.composite_score ?? null,
              rating: details[i]?.score?.rating ?? null,
              removing: false,
            }));
            this.rows.set(rows);
            this.loading.set(false);
          },
          error: () => {
            this.rows.set(companies.map(c => ({
              symbol: c.symbol,
              name: c.name,
              sector_id: c.sector_id,
              score: null,
              rating: null,
              removing: false,
            })));
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.rows.set([]);
        this.loading.set(false);
      },
    });
  }
}
