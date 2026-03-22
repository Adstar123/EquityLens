import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
} from '@angular/animations';
import { ApiService, ScreenerItem, Sector } from '../core/api.service';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { RatioBarComponent } from '../shared/components/ratio-bar.component';

@Component({
  selector: 'app-screener',
  standalone: true,
  imports: [FormsModule, ScoreBadgeComponent, RatioBarComponent],
  animations: [
    trigger('tableStagger', [
      transition(':enter', [
        query('.table-row', [
          style({ opacity: 0, transform: 'translateY(8px)' }),
          stagger('50ms', [
            animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
          ]),
        ], { optional: true, limit: 20 }),
      ]),
    ]),
  ],
  template: `
    <div class="screener-container">
      <!-- Header -->
      <header class="screener-header">
        <h1 class="screener-title">SCREENER</h1>
        <div class="filter-bar">
          <div class="filter-group">
            <label class="filter-label">SECTOR</label>
            <select
              class="filter-select"
              [ngModel]="selectedSector()"
              (ngModelChange)="onSectorChange($event)"
            >
              <option value="">All Sectors</option>
              @for (sector of sectors(); track sector.key) {
                <option [value]="sector.key">{{ sector.display_name }}</option>
              }
            </select>
          </div>

          <div class="filter-group">
            <label class="filter-label">MIN SCORE</label>
            <input
              type="number"
              class="filter-input"
              [ngModel]="minScore()"
              (ngModelChange)="onMinScoreChange($event)"
              min="0"
              max="100"
              step="5"
              placeholder="0"
            />
          </div>

          <div class="filter-group">
            <label class="filter-label">SORT BY</label>
            <select
              class="filter-select"
              [ngModel]="sortBy()"
              (ngModelChange)="sortBy.set($event)"
            >
              <option value="score">Score</option>
              <option value="symbol">Symbol</option>
            </select>
          </div>

          <div class="result-count">
            {{ filteredItems().length }} results
          </div>
        </div>
      </header>

      <!-- Table -->
      @if (loading()) {
        <div class="loading-state">Loading...</div>
      } @else {
        <div class="table-wrap" @tableStagger>
          <table>
            <thead>
              <tr>
                <th class="col-symbol">Symbol</th>
                <th class="col-name">Company</th>
                <th class="col-sector">Sector</th>
                <th class="col-score">Score</th>
                <th class="col-ratios" [attr.colspan]="maxRatioCols()">Ratios</th>
              </tr>
            </thead>
            <tbody>
              @for (item of filteredItems(); track item.symbol) {
                <tr class="table-row" (click)="goToTicker(item.symbol)">
                  <td class="cell-symbol">{{ item.symbol }}</td>
                  <td class="cell-name">{{ item.company_name }}</td>
                  <td class="cell-sector">{{ item.sector_name }}</td>
                  <td class="cell-score">
                    <app-score-badge [score]="item.composite_score" [rating]="item.rating" />
                  </td>
                  @if (item.breakdown && item.breakdown.ratios && item.breakdown.ratios.length) {
                    @for (ratio of item.breakdown.ratios; track ratio.key) {
                      <td class="cell-ratio">
                        <div class="ratio-cell">
                          <span class="ratio-value">{{ formatRatio(ratio.value) }}</span>
                          <app-ratio-bar [value]="ratio.value" [rangeBucket]="ratio.range_bucket" />
                        </div>
                      </td>
                    }
                  }
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="5 + maxRatioCols()" class="empty-state">
                    @if (selectedSector()) {
                      No scored stocks found for this sector.
                    } @else {
                      Select a sector or adjust filters.
                    }
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
    .screener-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #0f0f1a;
    }

    .screener-header {
      padding: 1rem 1.5rem 0.75rem;
      border-bottom: 1px solid #252540;
      flex-shrink: 0;
    }

    .screener-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: #555570;
      margin: 0 0 0.75rem;
      text-transform: uppercase;
    }

    .filter-bar {
      display: flex;
      align-items: flex-end;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .filter-label {
      font-size: 0.625rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      color: #555570;
      text-transform: uppercase;
    }

    .filter-select,
    .filter-input {
      background: #1a1a2e;
      border: 1px solid #252540;
      color: #e8e8ed;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      padding: 0.375rem 0.5rem;
      outline: none;
      min-width: 140px;
    }

    .filter-input {
      min-width: 80px;
      max-width: 100px;
    }

    .filter-select:focus,
    .filter-input:focus {
      border-color: #d4930d;
    }

    .result-count {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #555570;
      padding-bottom: 0.375rem;
      margin-left: auto;
    }

    .table-wrap {
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
      padding: 0.4rem 0.75rem;
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
      max-width: 200px;
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

    .cell-ratio {
      padding: 0.4rem 0.5rem;
    }

    .ratio-cell {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .ratio-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #8888a0;
    }

    .empty-state {
      text-align: center;
      color: #555570;
      padding: 3rem 1rem !important;
      font-size: 0.875rem;
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
  `],
})
export class ScreenerComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  sectors = signal<Sector[]>([]);
  items = signal<ScreenerItem[]>([]);
  loading = signal(false);

  selectedSector = signal('');
  minScore = signal(0);
  sortBy = signal<'score' | 'symbol'>('score');

  filteredItems = computed(() => {
    let list = [...this.items()];

    const min = this.minScore();
    if (min > 0) {
      list = list.filter(item => item.composite_score >= min);
    }

    const sort = this.sortBy();
    if (sort === 'symbol') {
      list.sort((a, b) => a.symbol.localeCompare(b.symbol));
    } else {
      list.sort((a, b) => b.composite_score - a.composite_score);
    }

    return list;
  });

  maxRatioCols = computed(() => {
    let max = 0;
    for (const item of this.items()) {
      const len = item.breakdown?.ratios?.length ?? 0;
      if (len > max) max = len;
    }
    return max || 1;
  });

  ngOnInit(): void {
    this.api.listSectors().subscribe({
      next: (sectors) => this.sectors.set(sectors),
      error: () => this.sectors.set([]),
    });

    this.loadData();
  }

  onSectorChange(sector: string): void {
    this.selectedSector.set(sector);
    this.loadData();
  }

  onMinScoreChange(val: number): void {
    this.minScore.set(val ?? 0);
  }

  goToTicker(symbol: string): void {
    this.router.navigate(['/ticker', symbol]);
  }

  formatRatio(value: number): string {
    if (Math.abs(value) >= 1000) {
      return value.toFixed(0);
    }
    if (Math.abs(value) >= 100) {
      return value.toFixed(1);
    }
    return value.toFixed(2);
  }

  private loadData(): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    const sector = this.selectedSector();
    if (sector) {
      params['sector'] = sector;
    }

    this.api.screener(params).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }
}
