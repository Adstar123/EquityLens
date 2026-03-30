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
import { ApiService, ScreenerItem, Sector, Quote, Company, Definition } from '../core/api.service';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { RatioBarComponent } from '../shared/components/ratio-bar.component';
import { InfoTooltipComponent } from '../shared/components/info-tooltip.component';

@Component({
  selector: 'app-screener',
  standalone: true,
  imports: [FormsModule, ScoreBadgeComponent, RatioBarComponent, InfoTooltipComponent],
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
      <!-- Search -->
      <div class="search-bar">
        <div class="search-wrap">
          <input
            type="text"
            class="search-input"
            placeholder="Search ticker or company..."
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearch($event)"
            (keydown.enter)="goToFirstResult()"
            (blur)="clearSearchDelayed()"
          />
          @if (searchResults().length > 0) {
            <div class="search-dropdown">
              @for (result of searchResults(); track result.symbol) {
                <div class="search-result" (mousedown)="goToTicker(result.symbol)">
                  <span class="sr-symbol">{{ result.symbol }}</span>
                  <span class="sr-name">{{ result.name }}</span>
                </div>
              }
            </div>
          }
        </div>
      </div>

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
              (ngModelChange)="onSortChange($event)"
            >
              <option value="score">Score</option>
              <option value="symbol">Symbol</option>
              <option value="price">Price</option>
              <option value="mcap">Market Cap</option>
              <option value="sector">Sector</option>
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
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="col-symbol">Symbol</th>
                <th class="col-name">Company</th>
                <th class="col-price">Price</th>
                <th class="col-mcap">
                  Mkt Cap
                  @if (definitions()['market_cap']; as def) {
                    <app-info-tooltip [description]="def.description" />
                  }
                </th>
                <th class="col-sector">Sector</th>
                <th class="col-score">
                  Score
                  @if (definitions()['composite_score']; as def) {
                    <app-info-tooltip [description]="def.description" />
                  }
                </th>
                @for (col of ratioHeadersWithDesc(); track col.name) {
                  <th class="col-ratio">
                    {{ col.name }}
                    @if (col.description) {
                      <app-info-tooltip [description]="col.description" />
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of pagedItems(); track item.symbol) {
                <tr class="table-row" (click)="goToTicker(item.symbol)">
                  <td class="cell-symbol">{{ item.symbol }}</td>
                  <td class="cell-name">{{ item.company_name }}</td>
                  <td class="cell-price">
                    @if (quotes()[item.symbol]; as q) {
                      <span class="price-value">{{ formatPrice(q.price) }}</span>
                      <span class="price-change" [class.positive]="q.change >= 0" [class.negative]="q.change < 0">
                        {{ q.change >= 0 ? '+' : '' }}{{ q.change_pct.toFixed(2) }}%
                      </span>
                    } @else {
                      <span class="price-placeholder">--</span>
                    }
                  </td>
                  <td class="cell-mcap">
                    @if (quotes()[item.symbol]; as q) {
                      {{ formatMarketCap(q.market_cap) }}
                    } @else {
                      <span class="price-placeholder">--</span>
                    }
                  </td>
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
                  <td [attr.colspan]="7 + maxRatioCols()" class="empty-state">
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

        <!-- Pagination -->
        @if (totalPages() > 1) {
          <div class="pagination">
            <button class="page-btn" [disabled]="currentPage() === 1" (click)="prevPage()">← Prev</button>
            <span class="page-info">Page {{ currentPage() }} of {{ totalPages() }}</span>
            <button class="page-btn" [disabled]="currentPage() === totalPages()" (click)="nextPage()">Next →</button>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .screener-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--bg-base);
    }

    .screener-header {
      padding: 1rem 1.5rem 0.75rem;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .screener-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--text-muted);
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
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .filter-select,
    .filter-input {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      padding: 0.375rem 0.5rem;
      outline: none;
      min-width: 140px;
    }

    .filter-input {
      min-width: 80px;
      max-width: 100px;
      -moz-appearance: textfield;
    }

    .filter-input::-webkit-outer-spin-button,
    .filter-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .filter-select:focus,
    .filter-input:focus {
      border-color: var(--accent);
    }

    .result-count {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-muted);
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
      background: var(--bg-base);
      z-index: 10;
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }

    tbody tr {
      cursor: pointer;
      transition: background 100ms ease;
    }

    tbody tr:hover td {
      background: var(--bg-surface);
    }

    td {
      padding: 0.4rem 0.75rem;
      font-size: 0.8125rem;
      color: var(--text-primary);
      border-bottom: 1px solid var(--bg-surface);
      white-space: nowrap;
    }

    .cell-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: 0.02em;
    }

    .cell-name {
      color: var(--text-secondary);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-sector {
      color: var(--text-muted);
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
      color: var(--text-secondary);
    }

    .empty-state {
      text-align: center;
      color: var(--text-muted);
      padding: 3rem 1rem !important;
      font-size: 0.875rem;
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 0.75rem 1.5rem;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }

    .page-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      padding: 0.375rem 0.75rem;
      cursor: pointer;
      transition: border-color 150ms, background 150ms;
    }

    .page-btn:hover:not(:disabled) {
      border-color: var(--accent);
    }

    .page-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .page-info {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .cell-price {
      white-space: nowrap;
    }

    .price-value {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 0.8125rem;
      margin-right: 0.375rem;
    }

    .price-change {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.6875rem;
      font-weight: 600;
    }

    .price-change.positive { color: #22c55e; }
    .price-change.negative { color: #ef4444; }

    .price-placeholder {
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    .cell-mcap {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .search-bar {
      padding: 1rem 1.5rem 0;
      flex-shrink: 0;
    }

    .search-wrap {
      position: relative;
    }

    .search-input {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      padding: 0.625rem 0.75rem;
      outline: none;
      transition: border-color 200ms ease;
      box-sizing: border-box;
    }

    .search-input::placeholder {
      color: var(--text-muted);
    }

    .search-input:focus {
      border-color: var(--accent);
    }

    .search-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-top: none;
      z-index: 20;
      max-height: 280px;
      overflow-y: auto;
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      transition: background 100ms ease;
    }

    .search-result:hover {
      background: var(--border);
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

    @media (max-width: 768px) {
      .screener-header {
        padding: 0.75rem 0.75rem 0.5rem;
      }

      .filter-bar {
        gap: 0.5rem;
      }

      .filter-group {
        flex: 1 1 calc(50% - 0.5rem);
        min-width: 0;
      }

      .filter-select,
      .filter-input {
        min-width: 0;
        width: 100%;
        font-size: 0.75rem;
        padding: 0.5rem;
      }

      .result-count {
        width: 100%;
        text-align: right;
      }

      td, th {
        padding: 0.4rem 0.5rem;
        font-size: 0.75rem;
      }

      .cell-name {
        max-width: 120px;
      }

      .pagination {
        padding: 0.75rem 1rem;
        padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
        gap: 0.75rem;
      }

      .page-btn {
        padding: 0.625rem 1.25rem;
        font-size: 0.8125rem;
        min-height: 44px;
      }

      .page-info {
        font-size: 0.8125rem;
      }
    }
  `],
})
export class ScreenerComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  sectors = signal<Sector[]>([]);
  items = signal<ScreenerItem[]>([]);
  loading = signal(false);
  quotes = signal<Record<string, Quote>>({});
  definitions = signal<Record<string, Definition>>({});
  searchQuery = signal('');
  searchResults = signal<Company[]>([]);
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  quotesLoading = signal(false);

  selectedSector = signal('');
  minScore = signal(0);
  sortBy = signal<'score' | 'symbol' | 'price' | 'mcap' | 'sector'>('score');
  currentPage = signal(1);
  readonly pageSize = 50;

  filteredItems = computed(() => {
    let list = [...this.items()];

    const min = this.minScore();
    if (min > 0) {
      list = list.filter(item => item.composite_score >= min);
    }

    const sort = this.sortBy();
    const q = this.quotes();
    if (sort === 'symbol') {
      list.sort((a, b) => a.symbol.localeCompare(b.symbol));
    } else if (sort === 'price') {
      list.sort((a, b) => (q[b.symbol]?.price ?? 0) - (q[a.symbol]?.price ?? 0));
    } else if (sort === 'mcap') {
      list.sort((a, b) => (q[b.symbol]?.market_cap ?? 0) - (q[a.symbol]?.market_cap ?? 0));
    } else if (sort === 'sector') {
      list.sort((a, b) => a.sector_name.localeCompare(b.sector_name));
    } else {
      list.sort((a, b) => b.composite_score - a.composite_score);
    }

    return list;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize)));

  pagedItems = computed(() => {
    const page = this.currentPage();
    const start = (page - 1) * this.pageSize;
    return this.filteredItems().slice(start, start + this.pageSize);
  });

  maxRatioCols = computed(() => {
    let max = 0;
    for (const item of this.items()) {
      const len = item.breakdown?.ratios?.length ?? 0;
      if (len > max) max = len;
    }
    return max || 1;
  });

  ratioHeaders = computed(() => {
    for (const item of this.items()) {
      if (item.breakdown?.ratios?.length) {
        return item.breakdown.ratios.map(r => r.name);
      }
    }
    return [];
  });

  ratioHeadersWithDesc = computed(() => {
    const items = this.filteredItems();
    if (!items.length || !items[0].breakdown?.ratios?.length) return [];
    return items[0].breakdown.ratios.map(r => ({
      name: r.name,
      description: r.description || '',
    }));
  });

  ngOnInit(): void {
    this.api.listSectors().subscribe({
      next: (sectors) => this.sectors.set(sectors),
      error: () => this.sectors.set([]),
    });

    this.api.getDefinitions().subscribe({
      next: (defs) => {
        const map: Record<string, Definition> = {};
        for (const d of defs) map[d.key] = d;
        this.definitions.set(map);
      },
    });

    this.loadData();
  }

  onSectorChange(sector: string): void {
    this.selectedSector.set(sector);
    this.currentPage.set(1);
    this.loadData();
  }

  onMinScoreChange(val: number): void {
    this.minScore.set(val ?? 0);
    this.currentPage.set(1);
  }

  onSortChange(sort: string): void {
    this.sortBy.set(sort as any);
    this.currentPage.set(1);
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
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

  goToFirstResult(): void {
    const results = this.searchResults();
    if (results.length > 0) {
      this.goToTicker(results[0].symbol);
    } else {
      const q = this.searchQuery().trim().toUpperCase();
      if (q) this.goToTicker(q);
    }
  }

  clearSearchDelayed(): void {
    setTimeout(() => {
      this.searchQuery.set('');
      this.searchResults.set([]);
    }, 200);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      this.loadQuotesForPage();
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
      this.loadQuotesForPage();
    }
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
        this.loadQuotesForPage();
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  formatPrice(price: number): string {
    return '$' + price.toFixed(2);
  }

  formatMarketCap(cap: number): string {
    if (cap >= 1_000_000_000) return '$' + (cap / 1_000_000_000).toFixed(1) + 'B';
    if (cap >= 1_000_000) return '$' + (cap / 1_000_000).toFixed(0) + 'M';
    return '$' + cap.toLocaleString();
  }

  private loadQuotesForPage(): void {
    const symbols = this.pagedItems().map(i => i.symbol);
    if (!symbols.length) return;
    this.quotesLoading.set(true);
    this.api.getQuotes(symbols).subscribe({
      next: (q) => {
        this.quotes.update(prev => ({ ...prev, ...q }));
        this.quotesLoading.set(false);
      },
      error: () => this.quotesLoading.set(false),
    });
  }
}
