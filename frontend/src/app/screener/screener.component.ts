import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, ScreenerItem, Sector, Quote, Definition } from '../core/api.service';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { RatioBarComponent } from '../shared/components/ratio-bar.component';
import { InfoTooltipComponent } from '../shared/components/info-tooltip.component';
import { TickerSearchComponent } from '../shared/components/ticker-search.component';

type SortKey = 'score' | 'symbol' | 'price' | 'mcap' | 'sector';

@Component({
  selector: 'app-screener',
  standalone: true,
  imports: [FormsModule, RouterLink, ScoreBadgeComponent, RatioBarComponent, InfoTooltipComponent, TickerSearchComponent],
  template: `
    <div class="screener-container">
      <!-- Toolbar -->
      <header class="toolbar">
        <div class="toolbar-row">
          <div class="page-title-wrap">
            <h1 class="page-title">Screener</h1>
            <span class="page-count">{{ filteredItems().length }} of {{ items().length }}</span>
          </div>

          <div class="search-slot">
            <app-ticker-search />
          </div>
        </div>

        <div class="toolbar-row filters-row">
          <div class="filter-group">
            <label class="filter-label" for="sector-filter">Sector</label>
            <select
              id="sector-filter"
              class="filter-select"
              [ngModel]="selectedSector()"
              (ngModelChange)="onSectorChange($event)"
            >
              <option value="">All sectors</option>
              @for (sector of sectors(); track sector.key) {
                <option [value]="sector.key">{{ sector.display_name }}</option>
              }
            </select>
          </div>

          <div class="filter-group">
            <label class="filter-label" for="min-score">Min score</label>
            <input
              id="min-score"
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

          <span class="sort-hint">Click a column header to sort</span>
        </div>
      </header>

      <!-- Table -->
      @if (loading()) {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="col-symbol">Symbol</th>
                <th>Company</th>
                <th>Price</th>
                <th>Mkt cap</th>
                <th>Sector</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              @for (i of skeletonRows; track i) {
                <tr class="sk-row">
                  <td><span class="sk" style="width: 52px"></span></td>
                  <td><span class="sk" style="width: 140px"></span></td>
                  <td><span class="sk" style="width: 72px"></span></td>
                  <td><span class="sk" style="width: 48px"></span></td>
                  <td><span class="sk" style="width: 90px"></span></td>
                  <td><span class="sk" style="width: 96px"></span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="col-symbol sortable" (click)="setSort('symbol')">
                  Symbol <span class="sort-arrow">{{ arrowFor('symbol') }}</span>
                </th>
                <th class="col-name">Company</th>
                <th class="sortable" (click)="setSort('price')">
                  Price <span class="sort-arrow">{{ arrowFor('price') }}</span>
                </th>
                <th class="sortable" (click)="setSort('mcap')">
                  Mkt cap
                  @if (definitions()['market_cap']; as def) {
                    <app-info-tooltip [description]="def.description" />
                  }
                  <span class="sort-arrow">{{ arrowFor('mcap') }}</span>
                </th>
                <th class="sortable" (click)="setSort('sector')">
                  Sector <span class="sort-arrow">{{ arrowFor('sector') }}</span>
                </th>
                <th class="sortable" (click)="setSort('score')">
                  Score
                  @if (definitions()['composite_score']; as def) {
                    <app-info-tooltip [description]="def.description" />
                  }
                  <span class="sort-arrow">{{ arrowFor('score') }}</span>
                </th>
                @for (col of ratioHeadersWithDesc(); track col.key) {
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
                  <td class="cell-symbol">
                    <a class="symbol-link" [routerLink]="['/ticker', item.symbol]" (click)="$event.stopPropagation()">{{ item.symbol }}</a>
                  </td>
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
                  @for (col of ratioHeadersWithDesc(); track col.key) {
                    <td class="cell-ratio">
                      @if (ratioFor(item, col.key); as ratio) {
                        <div class="ratio-cell">
                          <span class="ratio-value">{{ formatRatio(ratio.value) }}</span>
                          <app-ratio-bar [value]="ratio.value" [rangeBucket]="ratio.range_bucket" />
                        </div>
                      } @else {
                        <span class="ratio-empty">&ndash;</span>
                      }
                    </td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="6 + maxRatioCols()" class="empty-state">
                    @if (selectedSector()) {
                      No scored stocks in this sector match the filters.
                    } @else {
                      No stocks match the filters. Try lowering the minimum score.
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
            <span class="page-range">{{ pageRangeLabel() }}</span>
            <div class="page-controls">
              <button class="page-btn" [disabled]="currentPage() === 1" (click)="prevPage()">&larr; Prev</button>
              <span class="page-info">{{ currentPage() }} / {{ totalPages() }}</span>
              <button class="page-btn" [disabled]="currentPage() === totalPages()" (click)="nextPage()">Next &rarr;</button>
            </div>
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

    // ── Toolbar ──
    .toolbar {
      flex-shrink: 0;
      border-bottom: 1px solid var(--border);
      padding: 1rem 1.5rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .toolbar-row {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .page-title-wrap {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-shrink: 0;
    }

    .page-title {
      font-family: 'Archivo', sans-serif;
      font-stretch: 104%;
      font-weight: 720;
      font-size: 1.25rem;
      letter-spacing: -0.015em;
      color: var(--text-primary);
      margin: 0;
    }

    .page-count {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    .search-slot {
      flex: 1;
      max-width: 420px;
      margin-left: auto;
    }

    .filters-row {
      gap: 1rem;
      flex-wrap: wrap;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .filter-label {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.07em;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .filter-select,
    .filter-input {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 0.82rem;
      padding: 0.4rem 0.6rem;
      outline: none;
      min-width: 150px;
      transition: border-color 160ms ease;
      cursor: pointer;
    }

    .filter-input {
      min-width: 70px;
      max-width: 84px;
      font-family: 'JetBrains Mono', monospace;
      cursor: text;
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

    .sort-hint {
      margin-left: auto;
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    // ── Table ──
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
      padding: 0.55rem 0.75rem;
      text-align: left;
      font-size: 0.67rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-strong);
      white-space: nowrap;
      user-select: none;
    }

    th.sortable {
      cursor: pointer;
      transition: color 120ms ease;
    }

    th.sortable:hover {
      color: var(--text-primary);
    }

    .sort-arrow {
      display: inline-block;
      width: 0.8em;
      color: var(--accent);
      font-size: 0.8rem;
    }

    tbody tr.table-row {
      cursor: pointer;
      transition: background 100ms ease;
    }

    tbody tr.table-row:hover td {
      background: var(--bg-surface);
    }

    tbody tr.table-row:hover .cell-symbol {
      color: var(--accent);
    }

    td {
      padding: 0.44rem 0.75rem;
      font-size: 0.8125rem;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }

    th.col-symbol {
      left: 0;
      z-index: 12;
      border-right: 1px solid var(--border);
    }

    .cell-symbol {
      position: sticky;
      left: 0;
      z-index: 5;
      background: var(--bg-base);
      border-right: 1px solid var(--border);
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: 0.02em;
      transition: color 100ms ease;
    }

    tbody tr.table-row:hover .cell-symbol {
      background: var(--bg-surface);
    }

    .symbol-link {
      color: inherit;
      text-decoration: none;
    }

    .symbol-link:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: 3px;
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
      padding: 0.44rem 0.5rem;
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

    .ratio-empty {
      color: var(--text-muted);
      opacity: 0.5;
    }

    .empty-state {
      text-align: center;
      color: var(--text-muted);
      padding: 3rem 1rem !important;
      font-size: 0.875rem;
    }

    // ── Skeleton ──
    .sk-row td {
      padding-top: 0.62rem;
      padding-bottom: 0.62rem;
    }

    .sk {
      display: inline-block;
      height: 11px;
      border-radius: 4px;
      background: linear-gradient(100deg, var(--bg-surface) 40%, var(--border) 50%, var(--bg-surface) 60%);
      background-size: 200% 100%;
      animation: skShimmer 1.4s ease infinite;
    }

    @keyframes skShimmer {
      from { background-position: 120% 0; }
      to { background-position: -80% 0; }
    }

    // ── Pagination ──
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.65rem 1.5rem;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }

    .page-range {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    .page-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .page-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 0.78rem;
      font-weight: 500;
      padding: 0.4rem 0.85rem;
      cursor: pointer;
      transition: border-color 150ms, background 150ms;
    }

    .page-btn:hover:not(:disabled) {
      border-color: var(--accent);
    }

    .page-btn:disabled {
      opacity: 0.35;
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

    .price-change.positive { color: var(--up); }
    .price-change.negative { color: var(--down); }

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

    // ── Mobile ──
    @media (max-width: 768px) {
      .toolbar {
        padding: 0.75rem 0.85rem 0.65rem;
        gap: 0.65rem;
      }

      .toolbar-row {
        flex-wrap: wrap;
        gap: 0.65rem;
      }

      .search-slot {
        flex-basis: 100%;
        max-width: none;
        margin-left: 0;
        order: 2;
      }

      .filter-group {
        flex: 1;
      }

      .filter-select {
        min-width: 0;
        flex: 1;
      }

      .sort-hint {
        display: none;
      }

      td, th {
        padding: 0.42rem 0.5rem;
        font-size: 0.75rem;
      }

      .cell-name {
        max-width: 110px;
      }

      .pagination {
        padding: 0.65rem 0.85rem;
        padding-bottom: calc(0.65rem + env(safe-area-inset-bottom, 0px));
      }

      .page-btn {
        padding: 0.55rem 1rem;
        min-height: 42px;
      }

      .page-range {
        display: none;
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
  quotesLoading = signal(false);

  selectedSector = signal('');
  minScore = signal(0);
  sortBy = signal<SortKey>('score');
  sortDir = signal<'asc' | 'desc'>('desc');
  currentPage = signal(1);
  readonly pageSize = 50;
  readonly skeletonRows = Array.from({ length: 14 }, (_, i) => i);

  filteredItems = computed(() => {
    let list = [...this.items()];

    const min = this.minScore();
    if (min > 0) {
      list = list.filter(item => item.composite_score >= min);
    }

    const sort = this.sortBy();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const q = this.quotes();
    if (sort === 'symbol') {
      list.sort((a, b) => dir * a.symbol.localeCompare(b.symbol));
    } else if (sort === 'price') {
      list.sort((a, b) => dir * ((q[a.symbol]?.price ?? 0) - (q[b.symbol]?.price ?? 0)));
    } else if (sort === 'mcap') {
      list.sort((a, b) => dir * ((q[a.symbol]?.market_cap ?? 0) - (q[b.symbol]?.market_cap ?? 0)));
    } else if (sort === 'sector') {
      list.sort((a, b) => dir * a.sector_name.localeCompare(b.sector_name));
    } else {
      list.sort((a, b) => dir * (a.composite_score - b.composite_score));
    }

    return list;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize)));

  pagedItems = computed(() => {
    const page = this.currentPage();
    const start = (page - 1) * this.pageSize;
    return this.filteredItems().slice(start, start + this.pageSize);
  });

  pageRangeLabel = computed(() => {
    const total = this.filteredItems().length;
    if (!total) return '';
    const start = (this.currentPage() - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage() * this.pageSize, total);
    return `${start}-${end} of ${total}`;
  });

  maxRatioCols = computed(() => {
    let max = 0;
    for (const item of this.items()) {
      const len = item.breakdown?.ratios?.length ?? 0;
      if (len > max) max = len;
    }
    return max || 1;
  });

  // Headers come from the first row that has ratios; each row's cells are
  // then matched by ratio key so partial-data companies stay column-aligned
  ratioHeadersWithDesc = computed(() => {
    const items = this.filteredItems();
    const first = items.find(i => i.breakdown?.ratios?.length);
    if (!first) return [];
    return first.breakdown.ratios.map(r => ({
      key: r.key,
      name: r.name,
      description: r.description || '',
    }));
  });

  ratioFor(item: ScreenerItem, key: string) {
    return item.breakdown?.ratios?.find(r => r.key === key) ?? null;
  }

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

  setSort(key: SortKey): void {
    if (this.sortBy() === key) {
      this.sortDir.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortBy.set(key);
      // Text columns read better ascending by default, numbers descending
      this.sortDir.set(key === 'symbol' || key === 'sector' ? 'asc' : 'desc');
    }
    this.currentPage.set(1);
    this.loadQuotesForPage();
  }

  arrowFor(key: SortKey): string {
    if (this.sortBy() !== key) return '';
    return this.sortDir() === 'asc' ? '↑' : '↓';
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
