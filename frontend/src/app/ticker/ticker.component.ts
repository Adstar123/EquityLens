import { Component, inject, signal, computed, OnInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { ApiService, TickerDetail, Company } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { RatioBarComponent } from '../shared/components/ratio-bar.component';

@Component({
  selector: 'app-ticker',
  standalone: true,
  imports: [RouterLink, RatioBarComponent, NgxEchartsDirective],
  animations: [
    trigger('rowStagger', [
      transition(':enter', [
        query('.ratio-row', [
          style({ opacity: 0, transform: 'translateY(8px)' }),
          stagger('60ms', [
            animate('250ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
          ]),
        ], { optional: true, limit: 20 }),
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
  template: `
    @if (loading()) {
      <div class="loading-state">Loading...</div>
    } @else if (detail()) {
      <div class="ticker-page" @fadeIn>
        <!-- Back link -->
        <a routerLink="/screener" class="back-link">&larr; Screener</a>

        <!-- Top section: company info -->
        <header class="company-header">
          <div class="company-identity">
            <h1 class="company-name">{{ detail()!.company.name }}</h1>
            <span class="company-symbol">{{ detail()!.company.symbol }}</span>
            @if (detail()!.company.sector_id) {
              <span class="sector-pill">{{ detail()!.company.sector_id }}</span>
            }
            @if (auth.isLoggedIn()) {
              <button
                class="watchlist-btn"
                [class.active]="inWatchlist()"
                (click)="toggleWatchlist()"
                [title]="inWatchlist() ? 'Remove from watchlist' : 'Add to watchlist'"
              >
                @if (inWatchlist()) {
                  &#9733;
                } @else {
                  &#9734;
                }
              </button>
            }
          </div>
        </header>

        @if (detail()!.score) {
          <!-- Score area -->
          <section class="score-section">
            <div class="score-hero">
              <div class="score-number-area">
                <span class="score-big">{{ displayScore() }}</span>
                <span
                  class="rating-pill-large"
                  [style.background]="ratingBg()"
                  [style.color]="ratingColor()"
                >{{ ratingLabel() }}</span>
              </div>
              <div class="score-sub">COMPOSITE SCORE</div>
            </div>
            <div class="radar-chart-container">
              <div
                echarts
                [options]="radarOptions()"
                class="radar-chart"
              ></div>
            </div>
          </section>

          <!-- Breakdown table -->
          <section class="breakdown-section" @rowStagger>
            <h2 class="breakdown-title">SCORE BREAKDOWN</h2>
            <div class="breakdown-table">
              <div class="breakdown-header">
                <span class="bh-name">Ratio</span>
                <span class="bh-value">Value</span>
                <span class="bh-bucket">Range</span>
                <span class="bh-bar">Bar</span>
                <span class="bh-weight">Weight</span>
                <span class="bh-contrib">Contribution</span>
              </div>
              @for (ratio of ratios(); track ratio.key) {
                <div
                  class="ratio-row"
                  [class.expanded]="expandedRatio() === ratio.key"
                  (mouseenter)="expandedRatio.set(ratio.key)"
                  (mouseleave)="expandedRatio.set(null)"
                >
                  <div class="ratio-main">
                    <span class="r-name">{{ ratio.name }}</span>
                    <span class="r-value">{{ formatRatio(ratio.value) }}</span>
                    <span
                      class="r-bucket"
                      [style.color]="bucketColor(ratio.range_bucket)"
                    >{{ ratio.range_bucket }}</span>
                    <span class="r-bar">
                      <app-ratio-bar [value]="ratio.value" [rangeBucket]="ratio.range_bucket" />
                    </span>
                    <span class="r-weight">{{ (ratio.weight * 100).toFixed(0) }}%</span>
                    <span class="r-contrib">{{ ratio.weighted_score.toFixed(2) }}</span>
                  </div>
                  @if (expandedRatio() === ratio.key) {
                    <div class="ratio-detail" @fadeIn>
                      <div class="threshold-bar">
                        <div class="threshold-segment poor">Poor</div>
                        <div class="threshold-segment weak">Weak</div>
                        <div class="threshold-segment neutral">Neutral</div>
                        <div class="threshold-segment good">Good</div>
                        <div class="threshold-segment strong">Strong</div>
                      </div>
                      <div class="current-marker">
                        <span class="marker-label">Current: {{ ratio.range_bucket }}</span>
                        <span class="marker-points">{{ ratio.points }}/5 pts</span>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </section>
        } @else {
          <div class="no-score-state">
            No score data available for this ticker yet.
          </div>
        }
      </div>
    } @else {
      <div class="error-state">Ticker not found.</div>
    }
  `,
  styles: [`
    .loading-state,
    .error-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #555570;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
    }

    .ticker-page {
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    .back-link {
      display: inline-block;
      font-size: 0.75rem;
      color: #555570;
      text-decoration: none;
      margin-bottom: 1.5rem;
      transition: color 150ms ease;
    }

    .back-link:hover {
      color: #d4930d;
    }

    /* Company header */
    .company-header {
      margin-bottom: 2rem;
    }

    .company-identity {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .company-name {
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 700;
      font-size: 1.75rem;
      color: #e8e8ed;
      margin: 0;
      line-height: 1.2;
    }

    .company-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1rem;
      color: #8888a0;
      font-weight: 500;
    }

    .sector-pill {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      background: rgba(136, 136, 160, 0.12);
      color: #8888a0;
      white-space: nowrap;
    }

    .watchlist-btn {
      background: none;
      border: 1px solid transparent;
      color: #555570;
      font-size: 1.25rem;
      line-height: 1;
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: color 200ms ease, border-color 200ms ease, transform 150ms ease;
      margin-left: 0.25rem;
    }

    .watchlist-btn:hover {
      color: #d4930d;
      border-color: rgba(212, 147, 13, 0.3);
      transform: scale(1.15);
    }

    .watchlist-btn.active {
      color: #d4930d;
    }

    /* Score section */
    .score-section {
      display: flex;
      align-items: flex-start;
      gap: 2rem;
      margin-bottom: 2.5rem;
      flex-wrap: wrap;
    }

    .score-hero {
      flex-shrink: 0;
    }

    .score-number-area {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .score-big {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 900;
      font-size: 4rem;
      color: #d4930d;
      letter-spacing: -0.03em;
      line-height: 1;
    }

    .rating-pill-large {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 4px 12px;
      white-space: nowrap;
      align-self: center;
    }

    .score-sub {
      font-size: 0.625rem;
      font-weight: 500;
      letter-spacing: 0.12em;
      color: #555570;
      text-transform: uppercase;
      margin-top: 0.5rem;
    }

    .radar-chart-container {
      flex-shrink: 0;
    }

    .radar-chart {
      width: 200px;
      height: 200px;
    }

    /* Breakdown section */
    .breakdown-section {
      margin-top: 1rem;
    }

    .breakdown-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: #555570;
      text-transform: uppercase;
      margin: 0 0 0.75rem;
    }

    .breakdown-table {
      border: 1px solid #252540;
      overflow: hidden;
    }

    .breakdown-header {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 80px 0.75fr 1fr;
      gap: 0;
      padding: 0.5rem 0.75rem;
      background: #1a1a2e;
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #555570;
      border-bottom: 1px solid #252540;
    }

    .ratio-row {
      border-bottom: 1px solid #1a1a2e;
      transition: background 100ms ease;
    }

    .ratio-row:last-child {
      border-bottom: none;
    }

    .ratio-row:hover {
      background: #1a1a2e;
    }

    .ratio-main {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 80px 0.75fr 1fr;
      gap: 0;
      padding: 0.5rem 0.75rem;
      align-items: center;
      font-size: 0.8125rem;
    }

    .r-name {
      color: #e8e8ed;
      font-weight: 500;
    }

    .r-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: #8888a0;
    }

    .r-bucket {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }

    .r-bar {
      display: flex;
      align-items: center;
    }

    .r-weight {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #555570;
    }

    .r-contrib {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: #d4930d;
      font-weight: 600;
    }

    /* Expanded ratio detail */
    .ratio-detail {
      padding: 0.5rem 0.75rem 0.75rem;
      background: rgba(26, 26, 46, 0.5);
    }

    .threshold-bar {
      display: flex;
      gap: 2px;
      margin-bottom: 0.375rem;
    }

    .threshold-segment {
      flex: 1;
      height: 6px;
      font-size: 0;
      line-height: 0;
    }

    .threshold-segment.poor { background: #ef4444; }
    .threshold-segment.weak { background: #f97316; }
    .threshold-segment.neutral { background: #d4930d; }
    .threshold-segment.good { background: #84cc16; }
    .threshold-segment.strong { background: #22c55e; }

    .current-marker {
      display: flex;
      justify-content: space-between;
      font-size: 0.6875rem;
      color: #8888a0;
    }

    .marker-label {
      text-transform: capitalize;
    }

    .marker-points {
      font-family: 'JetBrains Mono', monospace;
      color: #d4930d;
    }

    .no-score-state {
      text-align: center;
      color: #555570;
      padding: 3rem 1rem;
      font-size: 0.875rem;
    }
  `],
})
export class TickerComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  detail = signal<TickerDetail | null>(null);
  loading = signal(true);
  displayScore = signal(0);
  expandedRatio = signal<string | null>(null);
  inWatchlist = signal(false);
  private watchlistSymbols = signal<Set<string>>(new Set());

  ratios = computed(() => {
    const d = this.detail();
    if (!d?.score?.breakdown?.ratios) return [];
    return d.score.breakdown.ratios;
  });

  ratingLabel = computed(() => {
    const d = this.detail();
    return d?.score?.rating?.replace(/_/g, ' ') ?? '';
  });

  ratingColor = computed(() => {
    const map: Record<string, string> = {
      strong_buy: '#22c55e',
      buy: '#84cc16',
      hold: '#d4930d',
      sell: '#ef4444',
      strong_sell: '#dc2626',
    };
    return map[this.detail()?.score?.rating ?? ''] ?? '#8888a0';
  });

  ratingBg = computed(() => {
    const map: Record<string, string> = {
      strong_buy: 'rgba(34, 197, 94, 0.12)',
      buy: 'rgba(132, 204, 22, 0.12)',
      hold: 'rgba(212, 147, 13, 0.12)',
      sell: 'rgba(239, 68, 68, 0.12)',
      strong_sell: 'rgba(220, 38, 38, 0.12)',
    };
    return map[this.detail()?.score?.rating ?? ''] ?? 'rgba(136, 136, 160, 0.12)';
  });

  radarOptions = computed<EChartsCoreOption>(() => {
    const r = this.ratios();
    if (!r.length) return {};
    return {
      radar: {
        indicator: r.map(ratio => ({
          name: ratio.name,
          max: 5,
        })),
        shape: 'polygon' as const,
        axisName: {
          color: '#8888a0',
          fontSize: 10,
        },
        splitArea: {
          areaStyle: {
            color: ['transparent', 'rgba(37, 37, 64, 0.3)'],
          },
        },
        splitLine: {
          lineStyle: {
            color: '#252540',
          },
        },
        axisLine: {
          lineStyle: {
            color: '#252540',
          },
        },
      },
      series: [{
        type: 'radar',
        data: [{
          value: r.map(ratio => ratio.points),
          areaStyle: {
            color: 'rgba(212, 147, 13, 0.2)',
          },
          lineStyle: {
            color: '#d4930d',
            width: 2,
          },
          itemStyle: {
            color: '#d4930d',
          },
        }],
      }],
    };
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const symbol = params.get('symbol');
      if (symbol) {
        this.loadTicker(symbol);
        this.checkWatchlistStatus(symbol);
      }
    });
  }

  ngAfterViewInit(): void {
    // Score animation is triggered after data loads
  }

  bucketColor(bucket: string): string {
    const map: Record<string, string> = {
      strong: '#22c55e',
      good: '#84cc16',
      neutral: '#d4930d',
      weak: '#f97316',
      poor: '#ef4444',
    };
    return map[bucket] ?? '#8888a0';
  }

  formatRatio(value: number): string {
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    return value.toFixed(2);
  }

  toggleWatchlist(): void {
    const symbol = this.detail()?.company.symbol;
    if (!symbol) return;

    if (this.inWatchlist()) {
      this.api.removeFromWatchlist(symbol).subscribe({
        next: () => this.inWatchlist.set(false),
        error: () => {},
      });
    } else {
      this.api.addToWatchlist(symbol).subscribe({
        next: () => this.inWatchlist.set(true),
        error: () => {},
      });
    }
  }

  private checkWatchlistStatus(symbol: string): void {
    if (!this.auth.isLoggedIn()) return;
    this.api.getWatchlist().subscribe({
      next: (companies: Company[]) => {
        const symbols = new Set(companies.map(c => c.symbol));
        this.watchlistSymbols.set(symbols);
        this.inWatchlist.set(symbols.has(symbol.toUpperCase()));
      },
      error: () => {},
    });
  }

  private loadTicker(symbol: string): void {
    this.loading.set(true);
    this.api.getTickerDetail(symbol).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.loading.set(false);
        if (data.score) {
          this.animateScore(data.score.composite_score);
        }
      },
      error: () => {
        this.detail.set(null);
        this.loading.set(false);
      },
    });
  }

  private animateScore(target: number): void {
    const duration = 800;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      this.displayScore.set(Math.round(target * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }
}
