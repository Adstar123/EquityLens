import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp, lucideChevronDown, lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { ApiService, ScreenerItem, Sector, Quote, Definition } from '../core/api.service';
import { formatChangePct, formatMarketCap, formatPrice, formatRatio } from '../core/bands';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { BandMeterComponent } from '../shared/components/band-meter.component';
import { InfoTooltipComponent } from '../shared/components/info-tooltip.component';
import { TickerSearchComponent } from '../shared/components/ticker-search.component';

type SortKey = 'score' | 'symbol' | 'price' | 'change' | 'mcap' | 'sector';

const SORT_LABELS: Record<SortKey, [string, string]> = {
  score: ['Score, low to high', 'Score, high to low'],
  symbol: ['Symbol, A to Z', 'Symbol, Z to A'],
  price: ['Price, low to high', 'Price, high to low'],
  change: ['Day change, worst first', 'Day change, best first'],
  mcap: ['Market cap, smallest first', 'Market cap, largest first'],
  sector: ['Sector, A to Z', 'Sector, Z to A'],
};

@Component({
  selector: 'app-screener',
  standalone: true,
  imports: [RouterLink, NgIcon, ScoreBadgeComponent, BandMeterComponent, InfoTooltipComponent, TickerSearchComponent],
  template: `
    <div class="page">
      <header class="toolbar">
        <div class="toolbar-row">
          <div class="title-wrap">
            <h1 class="page-heading">Screener</h1>
            <span class="count">
              @if (loading()) {
                Loading
              } @else if (filteredItems().length === items().length) {
                {{ items().length }} companies
              } @else {
                {{ filteredItems().length }} of {{ items().length }} companies
              }
            </span>
          </div>
          <div class="search-slot">
            <app-ticker-search />
          </div>
        </div>

        <div class="toolbar-row filters">
          <label class="select-wrap">
            <span class="sr-only">Sector</span>
            <select
              class="select"
              [value]="selectedSector()"
              (change)="onSectorChange($any($event.target).value)"
            >
              <option value="">All sectors</option>
              @for (sector of sectors(); track sector.key) {
                <option [value]="sector.key" [selected]="sector.key === selectedSector()">{{ sector.display_name }}</option>
              }
            </select>
            <ng-icon [svg]="icons.chevronDown" size="16" strokeWidth="1.5" class="select-chevron" />
          </label>

          <div class="segmented" role="group" aria-label="Minimum score">
            <span class="seg-label">Min score</span>
            @for (opt of scoreOptions; track opt) {
              <button
                class="seg"
                [class.active]="minScore() === opt"
                [attr.aria-pressed]="minScore() === opt"
                (click)="onMinScoreChange(opt)"
              >{{ opt === 0 ? 'Any' : opt + '+' }}</button>
            }
          </div>

          <span class="sort-note">Sorted by {{ sortLabel() }}</span>
        </div>
      </header>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="col-symbol">
                <button class="th-btn" (click)="setSort('symbol')" [class.is-sorted]="sortBy() === 'symbol'">
                  Symbol @if (arrowFor('symbol'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                </button>
              </th>
              <th class="col-name">Company</th>
              <th class="col-score">
                <button class="th-btn" (click)="setSort('score')" [class.is-sorted]="sortBy() === 'score'">
                  Score @if (arrowFor('score'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                </button>
                @if (definitions()['composite_score']; as def) {
                  <app-info-tooltip [description]="def.description" />
                }
              </th>
              <th class="col-sector">
                <button class="th-btn" (click)="setSort('sector')" [class.is-sorted]="sortBy() === 'sector'">
                  Sector @if (arrowFor('sector'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                </button>
              </th>
              <th class="num">
                <button class="th-btn" (click)="setSort('price')" [class.is-sorted]="sortBy() === 'price'">
                  Price @if (arrowFor('price'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                </button>
              </th>
              <th class="num">
                <button class="th-btn" (click)="setSort('change')" [class.is-sorted]="sortBy() === 'change'">
                  Day @if (arrowFor('change'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                </button>
              </th>
              <th class="num">
                <button class="th-btn" (click)="setSort('mcap')" [class.is-sorted]="sortBy() === 'mcap'">
                  Market cap @if (arrowFor('mcap'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                </button>
                @if (definitions()['market_cap']; as def) {
                  <app-info-tooltip [description]="def.description" />
                }
              </th>
              @for (col of ratioHeaders(); track col.key) {
                <th class="col-ratio">
                  <span class="th-text">{{ col.name }}</span>
                  @if (col.description) {
                    <app-info-tooltip [description]="col.description" />
                  }
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              @for (i of skeletonRows; track i) {
                <tr class="sk-row">
                  <td class="col-symbol"><span class="sk" style="width: 48px"></span></td>
                  <td><span class="sk" style="width: 160px"></span></td>
                  <td><span class="sk" style="width: 120px"></span></td>
                  <td><span class="sk" style="width: 96px"></span></td>
                  <td class="num"><span class="sk" style="width: 56px"></span></td>
                  <td class="num"><span class="sk" style="width: 48px"></span></td>
                  <td class="num"><span class="sk" style="width: 48px"></span></td>
                </tr>
              }
            } @else {
              @for (item of pagedItems(); track item.symbol) {
                <tr class="row" (click)="goToTicker(item.symbol)">
                  <td class="col-symbol">
                    <a class="symbol-link" [routerLink]="['/ticker', item.symbol]" (click)="$event.stopPropagation()">{{ item.symbol }}</a>
                  </td>
                  <td class="cell-name">{{ item.company_name }}</td>
                  <td>
                    <app-score-badge [score]="item.composite_score" [rating]="item.rating" [showLabel]="true" />
                  </td>
                  <td class="cell-sector">{{ item.sector_name }}</td>
                  @if (quotes()[item.symbol]; as q) {
                    <td class="num mono">{{ fmtPrice(q.price) }}</td>
                    <td class="num mono" [class.up]="q.change_pct > 0" [class.down]="q.change_pct < 0">{{ fmtChange(q.change_pct) }}</td>
                    <td class="num mono is-muted">{{ fmtCap(q.market_cap) }}</td>
                  } @else {
                    <td class="num is-empty">&ndash;</td>
                    <td class="num is-empty">&ndash;</td>
                    <td class="num is-empty">&ndash;</td>
                  }
                  @for (col of ratioHeaders(); track col.key) {
                    <td class="col-ratio">
                      @if (ratioFor(item, col.key); as ratio) {
                        <span class="ratio">
                          <span class="ratio-value">{{ fmtRatio(ratio.value) }}</span>
                          <app-band-meter [band]="ratio.range_bucket" />
                        </span>
                      } @else {
                        <span class="is-empty">&ndash;</span>
                      }
                    </td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="7 + ratioHeaders().length" class="empty">
                    <span class="empty-title">No companies match</span>
                    <span class="empty-sub">
                      @if (minScore() > 0) {
                        Try a lower minimum score
                      } @else {
                        Try another sector
                      }
                    </span>
                    @if (minScore() > 0 || selectedSector()) {
                      <button class="ui-btn" (click)="clearFilters()">Clear filters</button>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      @if (!loading() && totalPages() > 1) {
        <footer class="pagination">
          <span class="page-range">{{ pageRangeLabel() }}</span>
          <div class="page-controls">
            <button class="ui-btn" [disabled]="currentPage() === 1" (click)="goToPage(currentPage() - 1)">
              <ng-icon [svg]="icons.chevronLeft" size="16" strokeWidth="1.5" />
              Previous
            </button>
            <span class="page-info">{{ currentPage() }} of {{ totalPages() }}</span>
            <button class="ui-btn" [disabled]="currentPage() === totalPages()" (click)="goToPage(currentPage() + 1)">
              Next
              <ng-icon [svg]="icons.chevronRight" size="16" strokeWidth="1.5" />
            </button>
          </div>
        </footer>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .page {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }

    // ── Toolbar ──
    .toolbar {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 24px 32px 20px;
      border-bottom: 1px solid var(--border);
    }

    .toolbar-row {
      display: flex;
      align-items: center;
      gap: 16px;
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
      flex: 1;
      max-width: 360px;
      margin-left: auto;
    }

    .select-wrap {
      position: relative;
      display: inline-flex;
    }

    .select {
      appearance: none;
      height: 36px;
      min-width: 200px;
      padding: 0 36px 0 12px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      background: var(--bg-surface);
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
      transition: border-color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease);
    }

    .select:hover {
      background: var(--bg-hover);
    }

    .select option {
      background: var(--bg-elevated);
      color: var(--text-primary);
    }

    .select-chevron {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      color: var(--text-muted);
      pointer-events: none;
    }

    .segmented {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      height: 36px;
      padding: 0 3px 0 12px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      background: var(--bg-surface);
      box-sizing: border-box;
    }

    .seg-label {
      margin-right: 8px;
      font-size: 13px;
      color: var(--text-muted);
    }

    .seg {
      height: 28px;
      padding: 0 10px;
      border: none;
      border-radius: 6px;
      background: none;
      color: var(--text-secondary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
    }

    .seg:first-of-type {
      font-family: inherit;
      font-size: 13px;
    }

    .seg:hover {
      color: var(--text-primary);
    }

    .seg.active {
      background: var(--bg-hover);
      color: var(--text-primary);
      box-shadow: inset 0 0 0 1px var(--border-strong);
    }

    .sort-note {
      margin-left: auto;
      font-size: 13px;
      color: var(--text-muted);
    }

    // ── Table ──
    .table-wrap {
      flex: 1;
      overflow: auto;
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 10;
      height: 40px;
      padding: 0 16px;
      background: var(--bg-base);
      border-bottom: 1px solid var(--border-strong);
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      white-space: nowrap;
    }

    th.num {
      text-align: right;
    }

    .th-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 28px;
      margin: 0 -6px;
      padding: 0 6px;
      border: none;
      border-radius: 6px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      transition: color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease);
    }

    .th-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }

    .th-btn.is-sorted {
      color: var(--text-primary);
    }

    .th-arrow {
      display: flex;
      width: 12px;
      color: var(--accent);
    }

    .th-text {
      vertical-align: middle;
    }

    td {
      height: 44px;
      padding: 0 16px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      color: var(--text-primary);
      white-space: nowrap;
      background: var(--bg-base);
      transition: background-color var(--dur-fast) var(--ease);
    }

    td.num {
      text-align: right;
    }

    .mono {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    }

    .up { color: var(--up); }
    .down { color: var(--down); }

    .is-muted {
      color: var(--text-secondary);
    }

    .is-empty {
      color: var(--text-muted);
    }

    tr.row {
      cursor: pointer;
    }

    tr.row:hover td {
      background: var(--bg-hover);
    }

    .col-symbol {
      position: sticky;
      left: 0;
      z-index: 5;
      padding-left: 32px;
      box-shadow: inset -1px 0 0 var(--border);
    }

    th.col-symbol {
      z-index: 12;
    }

    .symbol-link {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      text-decoration: none;
      border-radius: 4px;
      transition: color var(--dur-fast) var(--ease);
    }

    tr.row:hover .symbol-link {
      color: var(--accent-ink);
    }

    .cell-name {
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-secondary);
    }

    .cell-sector {
      color: var(--text-secondary);
    }

    .col-ratio {
      padding: 0 12px;
    }

    .ratio {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .ratio-value {
      min-width: 52px;
      text-align: right;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .empty {
      height: auto;
      padding: 64px 16px;
      text-align: center;
      white-space: normal;
    }

    .empty-title,
    .empty-sub {
      display: block;
    }

    .empty-title {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .empty-sub {
      margin: 4px 0 16px;
      font-size: 13px;
      color: var(--text-muted);
    }

    // ── Skeleton ──
    .sk {
      display: inline-block;
      height: 8px;
      border-radius: 4px;
      background: var(--band-off);
    }

    // ── Pagination ──
    .pagination {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 32px;
      border-top: 1px solid var(--border);
    }

    .page-range,
    .page-info {
      font-size: 13px;
      color: var(--text-muted);
    }

    .page-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .page-controls .ui-btn {
      padding: 0 12px;
    }

    @media (max-width: 1280px) {
      .sort-note {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .toolbar {
        padding: 16px;
        gap: 12px;
      }

      .toolbar-row {
        flex-wrap: wrap;
        gap: 12px;
      }

      .search-slot {
        flex-basis: 100%;
        max-width: none;
        margin-left: 0;
      }

      .select-wrap,
      .select {
        flex: 1;
        min-width: 0;
        width: 100%;
      }

      .segmented {
        width: 100%;
        justify-content: space-between;
      }

      th, td {
        padding: 0 12px;
      }

      .col-symbol {
        padding-left: 16px;
      }

      .cell-name {
        max-width: 140px;
      }

      .pagination {
        padding: 12px 16px;
        padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      }

      .page-range {
        display: none;
      }

      .page-controls {
        width: 100%;
        justify-content: space-between;
      }
    }
  `],
})
export class ScreenerComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly icons = {
    chevronDown: lucideChevronDown,
    chevronLeft: lucideChevronLeft,
    chevronRight: lucideChevronRight,
  };
  readonly scoreOptions = [0, 50, 60, 70, 80];
  readonly pageSize = 50;
  readonly skeletonRows = Array.from({ length: 14 }, (_, i) => i);

  sectors = signal<Sector[]>([]);
  items = signal<ScreenerItem[]>([]);
  loading = signal(true);
  quotes = signal<Record<string, Quote>>({});
  definitions = signal<Record<string, Definition>>({});

  selectedSector = signal('');
  minScore = signal(0);
  sortBy = signal<SortKey>('score');
  sortDir = signal<'asc' | 'desc'>('desc');
  currentPage = signal(1);

  fmtRatio = formatRatio;
  fmtPrice = formatPrice;
  fmtCap = formatMarketCap;
  fmtChange = formatChangePct;

  sortLabel = computed(() => {
    const label = SORT_LABELS[this.sortBy()][this.sortDir() === 'asc' ? 0 : 1];
    return label.charAt(0).toLowerCase() + label.slice(1);
  });

  filteredItems = computed(() => {
    let list = [...this.items()];

    const min = this.minScore();
    if (min > 0) list = list.filter(item => item.composite_score >= min);

    const sort = this.sortBy();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const q = this.quotes();
    const num = (v: number | undefined) => v ?? -Infinity;
    if (sort === 'symbol') {
      list.sort((a, b) => dir * a.symbol.localeCompare(b.symbol));
    } else if (sort === 'price') {
      list.sort((a, b) => dir * (num(q[a.symbol]?.price) - num(q[b.symbol]?.price)));
    } else if (sort === 'change') {
      list.sort((a, b) => dir * (num(q[a.symbol]?.change_pct) - num(q[b.symbol]?.change_pct)));
    } else if (sort === 'mcap') {
      list.sort((a, b) => dir * (num(q[a.symbol]?.market_cap) - num(q[b.symbol]?.market_cap)));
    } else if (sort === 'sector') {
      list.sort((a, b) => dir * a.sector_name.localeCompare(b.sector_name) || b.composite_score - a.composite_score);
    } else {
      list.sort((a, b) => dir * (a.composite_score - b.composite_score));
    }
    return list;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize)));

  pagedItems = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredItems().slice(start, start + this.pageSize);
  });

  pageRangeLabel = computed(() => {
    const total = this.filteredItems().length;
    if (!total) return '';
    const start = (this.currentPage() - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage() * this.pageSize, total);
    return `Showing ${start} to ${end} of ${total}`;
  });

  // Headers are the union of ratios across all rows (ordered by first
  // appearance) so a ratio the top-ranked company happens to be missing,
  // like interest coverage, still gets its column. Cells are matched by key.
  ratioHeaders = computed(() => {
    const seen = new Map<string, { key: string; name: string; description: string }>();
    for (const item of this.filteredItems()) {
      for (const r of item.breakdown?.ratios ?? []) {
        if (!seen.has(r.key)) {
          seen.set(r.key, { key: r.key, name: r.name, description: r.description || '' });
        }
      }
    }
    return [...seen.values()];
  });

  ratioFor(item: ScreenerItem, key: string) {
    return item.breakdown?.ratios?.find(r => r.key === key) ?? null;
  }

  ngOnInit(): void {
    // Filters live in the URL so Back from a ticker restores the same view
    const qp = this.route.snapshot.queryParamMap;
    const sort = qp.get('sort') as SortKey | null;
    if (sort && sort in SORT_LABELS) this.sortBy.set(sort);
    if (qp.get('dir') === 'asc' || qp.get('dir') === 'desc') this.sortDir.set(qp.get('dir') as 'asc' | 'desc');
    const min = Number(qp.get('min'));
    if (this.scoreOptions.includes(min)) this.minScore.set(min);
    this.selectedSector.set(qp.get('sector') ?? '');
    const page = Number(qp.get('page'));
    if (page > 1) this.currentPage.set(page);

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

    this.loadData(false);
  }

  arrowFor(key: SortKey): string {
    if (this.sortBy() !== key) return '';
    return this.sortDir() === 'asc' ? lucideArrowUp : lucideArrowDown;
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
    // Price based sorts need every quote, not just this page's
    if (key === 'price' || key === 'change' || key === 'mcap') this.loadAllQuotes();
    else this.loadQuotesForPage();
    this.syncUrl();
  }

  onSectorChange(sector: string): void {
    this.selectedSector.set(sector);
    this.currentPage.set(1);
    this.loadData(true);
  }

  onMinScoreChange(val: number): void {
    this.minScore.set(val);
    this.currentPage.set(1);
    this.loadQuotesForPage();
    this.syncUrl();
  }

  clearFilters(): void {
    this.minScore.set(0);
    if (this.selectedSector()) {
      this.onSectorChange('');
    } else {
      this.currentPage.set(1);
      this.syncUrl();
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadQuotesForPage();
    this.syncUrl();
    document.querySelector('.table-wrap')?.scrollTo({ top: 0 });
  }

  goToTicker(symbol: string): void {
    this.router.navigate(['/ticker', symbol]);
  }

  private syncUrl(): void {
    const params: Record<string, string | number | null> = {
      sector: this.selectedSector() || null,
      min: this.minScore() || null,
      sort: this.sortBy() === 'score' ? null : this.sortBy(),
      dir: this.sortDir() === 'desc' ? null : this.sortDir(),
      page: this.currentPage() > 1 ? this.currentPage() : null,
    };
    this.router.navigate([], { relativeTo: this.route, queryParams: params, replaceUrl: true });
  }

  private loadData(sync: boolean): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    const sector = this.selectedSector();
    if (sector) params['sector'] = sector;

    this.api.screener(params).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
        if (this.currentPage() > this.totalPages()) this.currentPage.set(1);
        const sort = this.sortBy();
        if (sort === 'price' || sort === 'change' || sort === 'mcap') this.loadAllQuotes();
        else this.loadQuotesForPage();
        if (sync) this.syncUrl();
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  private loadQuotesForPage(): void {
    const symbols = this.pagedItems().map(i => i.symbol).filter(s => !this.quotes()[s]);
    this.fetchQuotes(symbols);
  }

  private loadAllQuotes(): void {
    const symbols = this.items().map(i => i.symbol).filter(s => !this.quotes()[s]);
    for (let i = 0; i < symbols.length; i += 60) this.fetchQuotes(symbols.slice(i, i + 60));
  }

  private fetchQuotes(symbols: string[]): void {
    if (!symbols.length) return;
    this.api.getQuotes(symbols).subscribe({
      next: (q) => this.quotes.update(prev => ({ ...prev, ...q })),
      error: () => {},
    });
  }
}
