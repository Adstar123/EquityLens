import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
} from '@angular/animations';
import { NgxEchartsDirective } from 'ngx-echarts';
import { EChartsCoreOption } from 'echarts/core';
import { forkJoin } from 'rxjs';
import { ApiService, Sector, ScreenerItem } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { RatioBarComponent } from '../shared/components/ratio-bar.component';

type SortColumn = 'rank' | 'symbol' | 'company' | 'score' | 'rating' | string;
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-sector',
  standalone: true,
  imports: [ScoreBadgeComponent, RatioBarComponent, NgxEchartsDirective],
  animations: [
    trigger('tableStagger', [
      transition(':enter', [
        query('.table-row', [
          style({ opacity: 0, transform: 'translateY(8px)' }),
          stagger('50ms', [
            animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
          ]),
        ], { optional: true, limit: 30 }),
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('400ms 200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
  template: `
    @if (loading()) {
      <div class="loading-state">Loading...</div>
    } @else if (sector()) {
      <div class="sector-page">
        <!-- Header -->
        <header class="sector-header">
          <h1 class="sector-name">{{ sector()!.display_name }}</h1>
          <p class="sector-desc">{{ sector()!.description }}</p>
          <div class="sector-stats">
            {{ items().length }} companies | Avg score: {{ avgScore() }}
          </div>
        </header>

        <!-- Rankings Table -->
        @if (sortedItems().length) {
          <section class="table-section" @tableStagger>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th class="col-rank sortable" (click)="toggleSort('rank')"
                        [class.active-sort]="sortColumn() === 'rank'">
                      # <span class="sort-arrow">{{ sortArrow('rank') }}</span>
                    </th>
                    <th class="col-symbol sortable" (click)="toggleSort('symbol')"
                        [class.active-sort]="sortColumn() === 'symbol'">
                      Symbol <span class="sort-arrow">{{ sortArrow('symbol') }}</span>
                    </th>
                    <th class="col-name sortable" (click)="toggleSort('company')"
                        [class.active-sort]="sortColumn() === 'company'">
                      Company <span class="sort-arrow">{{ sortArrow('company') }}</span>
                    </th>
                    <th class="col-score sortable" (click)="toggleSort('score')"
                        [class.active-sort]="sortColumn() === 'score'">
                      Score <span class="sort-arrow">{{ sortArrow('score') }}</span>
                    </th>
                    <th class="col-rating sortable" (click)="toggleSort('rating')"
                        [class.active-sort]="sortColumn() === 'rating'">
                      Rating <span class="sort-arrow">{{ sortArrow('rating') }}</span>
                    </th>
                    @for (name of ratioNames(); track name) {
                      <th class="col-ratio sortable" (click)="toggleSort('ratio:' + name)"
                          [class.active-sort]="sortColumn() === 'ratio:' + name">
                        {{ name }} <span class="sort-arrow">{{ sortArrow('ratio:' + name) }}</span>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (item of sortedItems(); track item.symbol; let i = $index) {
                    <tr class="table-row" (click)="goToTicker(item.symbol)">
                      <td class="cell-rank">{{ i + 1 }}</td>
                      <td class="cell-symbol">{{ item.symbol }}</td>
                      <td class="cell-name">{{ item.company_name }}</td>
                      <td class="cell-score">
                        <app-score-badge [score]="item.composite_score" [rating]="item.rating" />
                      </td>
                      <td class="cell-rating">
                        <span class="rating-pill"
                              [style.background]="ratingBg(item.rating)"
                              [style.color]="ratingColor(item.rating)">
                          {{ item.rating.replace('_', ' ') }}
                        </span>
                      </td>
                      @if (item.breakdown && item.breakdown.ratios) {
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
                  }
                </tbody>
              </table>
            </div>
          </section>

          <!-- Heatmap -->
          @if (heatmapOptions()) {
            <section class="heatmap-section" @fadeIn>
              <h2 class="section-title">RATIO HEATMAP</h2>
              <div
                echarts
                [options]="heatmapOptions()!"
                class="heatmap-chart"
              ></div>
            </section>
          }
        } @else {
          <div class="empty-state">No scored companies found in this sector.</div>
        }
      </div>
    } @else {
      <div class="error-state">Sector not found.</div>
    }
  `,
  styles: [`
    .loading-state,
    .error-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
    }

    .sector-page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    /* Header */
    .sector-header {
      margin-bottom: 2rem;
    }

    .sector-name {
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 700;
      font-size: 1.75rem;
      color: var(--text-primary);
      margin: 0 0 0.375rem;
      line-height: 1.2;
    }

    .sector-desc {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin: 0 0 0.75rem;
      line-height: 1.5;
    }

    .sector-stats {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: var(--text-muted);
    }

    /* Table */
    .table-section {
      margin-bottom: 2.5rem;
    }

    .table-wrap {
      overflow-x: auto;
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
      user-select: none;
    }

    th.sortable {
      cursor: pointer;
      transition: color 150ms ease;
    }

    th.sortable:hover {
      color: var(--text-secondary);
    }

    th.active-sort {
      color: var(--accent);
    }

    .sort-arrow {
      font-size: 0.625rem;
      margin-left: 2px;
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

    .cell-rank {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-muted);
      font-size: 0.75rem;
      width: 40px;
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

    .cell-score {
      white-space: nowrap;
    }

    .cell-rating {
      white-space: nowrap;
    }

    .rating-pill {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 6px;
      line-height: 1.2;
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
      padding: 3rem 1rem;
      font-size: 0.875rem;
    }

    /* Heatmap */
    .heatmap-section {
      margin-top: 1rem;
    }

    .section-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--text-muted);
      text-transform: uppercase;
      margin: 0 0 0.75rem;
    }

    .heatmap-chart {
      width: 100%;
      height: 500px;
      min-height: 300px;
    }
  `],
})
export class SectorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private theme = inject(ThemeService);

  loading = signal(true);
  sector = signal<Sector | null>(null);
  items = signal<ScreenerItem[]>([]);

  sortColumn = signal<SortColumn>('score');
  sortDir = signal<SortDir>('desc');

  /** All unique ratio names derived from data */
  ratioNames = computed(() => {
    const list = this.items();
    if (!list.length) return [];
    const first = list.find(i => i.breakdown?.ratios?.length);
    return first?.breakdown.ratios.map(r => r.name) ?? [];
  });

  /** Average composite score */
  avgScore = computed(() => {
    const list = this.items();
    if (!list.length) return '0.0';
    const sum = list.reduce((acc, i) => acc + i.composite_score, 0);
    return (sum / list.length).toFixed(1);
  });

  /** Sorted items */
  sortedItems = computed(() => {
    const list = [...this.items()];
    const col = this.sortColumn();
    const dir = this.sortDir();
    const mul = dir === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      let cmp = 0;
      if (col === 'rank' || col === 'score') {
        cmp = a.composite_score - b.composite_score;
      } else if (col === 'symbol') {
        cmp = a.symbol.localeCompare(b.symbol);
      } else if (col === 'company') {
        cmp = a.company_name.localeCompare(b.company_name);
      } else if (col === 'rating') {
        cmp = this.ratingOrder(a.rating) - this.ratingOrder(b.rating);
      } else if (col.startsWith('ratio:')) {
        const name = col.slice(6);
        const aVal = a.breakdown?.ratios?.find(r => r.name === name)?.points ?? 0;
        const bVal = b.breakdown?.ratios?.find(r => r.name === name)?.points ?? 0;
        cmp = aVal - bVal;
      }
      return cmp * mul;
    });

    return list;
  });

  /** ECharts heatmap options */
  heatmapOptions = computed<EChartsCoreOption | null>(() => {
    const list = this.items();
    const names = this.ratioNames();
    if (!list.length || !names.length) return null;

    // Sort by score descending for the heatmap
    const sorted = [...list].sort((a, b) => a.composite_score - b.composite_score);
    const symbols = sorted.map(i => i.symbol);

    const data: number[][] = [];
    for (let yi = 0; yi < sorted.length; yi++) {
      const item = sorted[yi];
      const ratios = item.breakdown?.ratios ?? [];
      for (let xi = 0; xi < names.length; xi++) {
        const ratio = ratios.find(r => r.name === names[xi]);
        data.push([xi, yi, ratio?.points ?? 0]);
      }
    }

    const dynamicHeight = Math.max(300, sorted.length * 24 + 120);
    const isDark = this.theme.theme() === 'dark';
    const labelColor = isDark ? '#8888a0' : '#4a4a65';
    const borderCol = isDark ? '#0f0f1a' : '#f5f5f9';
    const heatColors = isDark
      ? ['#1e1e35', '#2e2e50', '#6b5b1e', '#b8860b', '#d4930d']
      : ['#e0e0ec', '#c8c8d8', '#c9a84c', '#b8960b', '#d4930d'];

    return {
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const d = params.data;
          return `<b>${symbols[d[1]]}</b><br/>${names[d[0]]}: ${d[2]}/5`;
        },
      },
      grid: { top: 40, bottom: 100, left: 100, right: 20 },
      xAxis: {
        type: 'category',
        data: names,
        position: 'top',
        axisLabel: { color: labelColor, rotate: 0, fontSize: 11, fontFamily: 'Inter' },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: symbols,
        axisLabel: { color: labelColor, fontFamily: 'JetBrains Mono', fontSize: 11 },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      visualMap: {
        min: 1,
        max: 5,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 15,
        itemWidth: 16,
        itemHeight: 140,
        text: ['Strong', 'Weak'],
        inRange: { color: heatColors },
        textStyle: { color: labelColor, fontSize: 11 },
      },
      series: [{
        type: 'heatmap',
        data,
        itemStyle: {
          borderColor: borderCol,
          borderWidth: 2,
          borderRadius: 3,
        },
        emphasis: {
          itemStyle: {
            borderColor: '#d4930d',
            borderWidth: 2,
          },
        },
      }],
      _height: dynamicHeight,
    };
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const key = params.get('key');
      if (key) {
        this.loadSector(key);
      }
    });
  }

  toggleSort(col: SortColumn): void {
    if (this.sortColumn() === col) {
      this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    } else {
      this.sortColumn.set(col);
      // Default to descending for numeric columns, ascending for text
      this.sortDir.set(col === 'symbol' || col === 'company' ? 'asc' : 'desc');
    }
  }

  sortArrow(col: SortColumn): string {
    if (this.sortColumn() !== col) return '';
    return this.sortDir() === 'desc' ? '\u2193' : '\u2191';
  }

  goToTicker(symbol: string): void {
    this.router.navigate(['/ticker', symbol]);
  }

  formatRatio(value: number): string {
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    return value.toFixed(2);
  }

  ratingColor(rating: string): string {
    const map: Record<string, string> = {
      strong_buy: '#22c55e',
      buy: '#84cc16',
      hold: '#d4930d',
      sell: '#ef4444',
      strong_sell: '#dc2626',
    };
    return map[rating] ?? '#8888a0';
  }

  ratingBg(rating: string): string {
    const map: Record<string, string> = {
      strong_buy: 'rgba(34, 197, 94, 0.12)',
      buy: 'rgba(132, 204, 22, 0.12)',
      hold: 'rgba(212, 147, 13, 0.12)',
      sell: 'rgba(239, 68, 68, 0.12)',
      strong_sell: 'rgba(220, 38, 38, 0.12)',
    };
    return map[rating] ?? 'rgba(136, 136, 160, 0.12)';
  }

  private ratingOrder(rating: string): number {
    const order: Record<string, number> = {
      strong_buy: 5,
      buy: 4,
      hold: 3,
      sell: 2,
      strong_sell: 1,
    };
    return order[rating] ?? 0;
  }

  private loadSector(key: string): void {
    this.loading.set(true);

    // Load sector info and rankings in parallel
    forkJoin({
      sectors: this.api.listSectors(),
      items: this.api.screener({ sector: key }),
    }).subscribe({
      next: ({ sectors, items }) => {
        const found = sectors.find(s => s.key === key);
        this.sector.set(found ?? null);
        this.items.set(found ? items : []);
        this.loading.set(false);
      },
      error: () => {
        this.sector.set(null);
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }
}
