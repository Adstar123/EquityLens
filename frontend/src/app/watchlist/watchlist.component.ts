import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideStar, lucideX } from '@ng-icons/lucide';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService, Sector } from '../core/api.service';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { TickerSearchComponent } from '../shared/components/ticker-search.component';

interface WatchlistRow {
  symbol: string;
  name: string;
  sector: string | null;
  sectorKey: string | null;
  score: number | null;
  rating: string | null;
  removing: boolean;
}

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [RouterLink, NgIcon, ScoreBadgeComponent, TickerSearchComponent],
  template: `
    <div class="page">
      <header class="head">
        <div class="title-wrap">
          <h1 class="page-heading">Watchlist</h1>
          @if (!loading()) {
            <span class="count">{{ rows().length }} {{ rows().length === 1 ? 'company' : 'companies' }}</span>
          }
        </div>
        <div class="search-slot">
          <app-ticker-search placeholder="Find a company to add" />
        </div>
      </header>

      @if (loading()) {
        <div class="list">
          @for (i of [0, 1, 2, 3]; track i) {
            <div class="row is-skeleton"><span class="sk" style="width: 56px"></span><span class="sk" style="width: 180px"></span></div>
          }
        </div>
      } @else if (rows().length === 0) {
        <div class="empty">
          <span class="empty-icon"><ng-icon [svg]="icons.star" size="20" strokeWidth="1.5" /></span>
          <span class="empty-title">Nothing on your watchlist yet</span>
          <span class="empty-sub">Open any company and press Watch to keep it here.</span>
          <a routerLink="/screener" class="ui-btn is-primary">Browse the screener</a>
        </div>
      } @else {
        <div class="list" role="table" aria-label="Watchlist">
          <div class="row is-head" role="row">
            <span role="columnheader">Symbol</span>
            <span role="columnheader">Company</span>
            <span role="columnheader">Sector</span>
            <span role="columnheader">Score</span>
            <span role="columnheader"></span>
          </div>
          @for (row of rows(); track row.symbol) {
            <div class="row" role="row" [class.is-removing]="row.removing" (click)="goToTicker(row.symbol)">
              <span role="cell">
                <a class="symbol-link" [routerLink]="['/ticker', row.symbol]" (click)="$event.stopPropagation()">{{ row.symbol }}</a>
              </span>
              <span class="name" role="cell">{{ row.name }}</span>
              <span class="sector" role="cell">{{ row.sector ?? '' }}</span>
              <span role="cell">
                @if (row.score !== null && row.rating !== null) {
                  <app-score-badge [score]="row.score" [rating]="row.rating" [showLabel]="true" />
                } @else {
                  <span class="muted">Not scored</span>
                }
              </span>
              <span class="action" role="cell">
                <button
                  class="remove"
                  [disabled]="row.removing"
                  (click)="removeFromWatchlist($event, row.symbol)"
                  [attr.aria-label]="'Remove ' + row.symbol + ' from watchlist'"
                  title="Remove from watchlist"
                >
                  <ng-icon [svg]="icons.x" size="16" strokeWidth="1.5" />
                </button>
              </span>
            </div>
          }
        </div>
      }
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
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 24px;
    }

    .title-wrap {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    .count {
      font-size: 13px;
      color: var(--text-muted);
    }

    .search-slot {
      width: 320px;
    }

    .list {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      background: var(--bg-surface);
    }

    .row {
      display: grid;
      grid-template-columns: 96px minmax(0, 1.4fr) minmax(0, 1fr) 200px 44px;
      align-items: center;
      gap: 16px;
      height: 52px;
      padding: 0 12px 0 20px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease), opacity var(--dur) var(--ease);
    }

    .row:first-child {
      border-top: none;
    }

    .row:not(.is-head):not(.is-skeleton):hover {
      background: var(--bg-hover);
    }

    .row.is-head {
      height: 40px;
      font-size: 12px;
      color: var(--text-muted);
      cursor: default;
    }

    .row.is-skeleton {
      grid-template-columns: 96px 1fr;
      cursor: default;
    }

    .row.is-removing {
      opacity: 0.4;
    }

    .symbol-link {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      color: var(--text-primary);
      text-decoration: none;
      border-radius: 4px;
    }

    .row:hover .symbol-link {
      color: var(--accent-ink);
    }

    .name {
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sector,
    .muted {
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .action {
      display: flex;
      justify-content: flex-end;
    }

    .remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: var(--radius);
      background: none;
      color: var(--text-muted);
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
    }

    .remove:hover {
      color: var(--down);
      background: var(--down-soft);
    }

    .sk {
      display: block;
      height: 8px;
      border-radius: 4px;
      background: var(--band-off);
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 64px 24px;
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      text-align: center;
    }

    .empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      margin-bottom: 12px;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent-ink);
    }

    .empty-title {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .empty-sub {
      margin-bottom: 16px;
      font-size: 13px;
      color: var(--text-muted);
    }

    @media (max-width: 768px) {
      .page {
        padding: 24px 16px 48px;
      }

      .head {
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
      }

      .search-slot {
        width: 100%;
      }

      .row {
        grid-template-columns: 72px minmax(0, 1fr) auto 40px;
        padding: 0 8px 0 16px;
        gap: 12px;
      }

      .row > :nth-child(3) {
        display: none;
      }

      .row app-score-badge ::ng-deep .score-label {
        display: none;
      }
    }
  `],
})
export class WatchlistComponent implements OnInit {
  private router = inject(Router);
  private api = inject(ApiService);

  readonly icons = { star: lucideStar, x: lucideX };

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
    this.rows.update(rows => rows.map(r => r.symbol === symbol ? { ...r, removing: true } : r));

    this.api.removeFromWatchlist(symbol).subscribe({
      next: () => this.rows.update(rows => rows.filter(r => r.symbol !== symbol)),
      error: () => this.rows.update(rows => rows.map(r => r.symbol === symbol ? { ...r, removing: false } : r)),
    });
  }

  private loadWatchlist(): void {
    this.loading.set(true);
    forkJoin({
      companies: this.api.getWatchlist(),
      sectors: this.api.listSectors().pipe(catchError(() => of([] as Sector[]))),
    }).subscribe({
      next: ({ companies, sectors }) => {
        if (companies.length === 0) {
          this.rows.set([]);
          this.loading.set(false);
          return;
        }
        const sectorById = new Map(sectors.map(s => [s.id, s]));
        const details = companies.map(c => this.api.getTickerDetail(c.symbol).pipe(catchError(() => of(null))));
        forkJoin(details).subscribe(results => {
          this.rows.set(companies.map((c, i) => {
            const sector = c.sector_id ? sectorById.get(c.sector_id) : undefined;
            return {
              symbol: c.symbol,
              name: c.name,
              sector: sector?.display_name ?? null,
              sectorKey: sector?.key ?? null,
              score: results[i]?.score?.composite_score ?? null,
              rating: results[i]?.score?.rating ?? null,
              removing: false,
            };
          }));
          this.loading.set(false);
        });
      },
      error: () => {
        this.rows.set([]);
        this.loading.set(false);
      },
    });
  }
}
