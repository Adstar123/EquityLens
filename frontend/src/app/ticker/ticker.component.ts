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
import { ApiService, TickerDetail, Company, Quote, Definition } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { RatioBarComponent } from '../shared/components/ratio-bar.component';
import { InfoTooltipComponent } from '../shared/components/info-tooltip.component';

@Component({
  selector: 'app-ticker',
  standalone: true,
  imports: [RouterLink, RatioBarComponent, NgxEchartsDirective, InfoTooltipComponent],
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
            @if (sectorName()) {
              <span class="sector-pill">{{ sectorName() }}</span>
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

        @if (quote()) {
          <div class="price-block" @fadeIn>
            <span class="price-big">{{ formatPrice(quote()!.price) }}</span>
            <span class="price-change-lg" [class.positive]="quote()!.change >= 0" [class.negative]="quote()!.change < 0">
              {{ quote()!.change >= 0 ? '+' : '' }}{{ formatPrice(quote()!.change) }}
              ({{ quote()!.change >= 0 ? '+' : '' }}{{ quote()!.change_pct.toFixed(2) }}%)
            </span>
            <div class="price-meta">
              <span>Vol: {{ formatVolume(quote()!.volume) }}</span>
              <span>
                Mkt Cap: {{ formatMarketCap(quote()!.market_cap) }}
                @if (definitions()['market_cap']; as def) {
                  <app-info-tooltip [description]="def.description" />
                }
              </span>
              <span class="price-delayed">Updated hourly</span>
            </div>
          </div>
        }

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
              <div class="score-sub">
                COMPOSITE SCORE
                @if (definitions()['composite_score']; as def) {
                  <app-info-tooltip [description]="def.description" />
                }
              </div>
            </div>
            <div class="radar-chart-container">
              <div
                echarts
                [options]="radarOptions()"
                class="radar-chart"
              ></div>
            </div>
          </section>

          <!-- Sector rank context -->
          @if (sectorRank() && sectorTotal()) {
            <div class="sector-rank-bar">
              <span class="rank-text">
                Ranked <strong>#{{ sectorRank() }}</strong> of {{ sectorTotal() }} in {{ sectorName() }}
              </span>
              <span class="rank-percentile">Top {{ sectorPercentile() }}%</span>
            </div>
          }

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
                    <span class="r-name">
                      {{ ratio.name }}
                      @if (ratio.description) {
                        <app-info-tooltip [description]="ratio.description" />
                      }
                    </span>
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

          <!-- Context ratios (display-only) -->
          @if (contextRatios().length > 0) {
            <section class="context-section">
              <h2 class="context-title">
                VALUATION CONTEXT
                @if (definitions()['valuation_context']; as def) {
                  <app-info-tooltip [description]="def.description" />
                }
              </h2>
              <div class="context-grid">
                @for (ctx of contextRatios(); track ctx.key) {
                  <div class="context-card">
                    <span class="ctx-label">{{ ctx.name }}</span>
                    <span class="ctx-value">{{ formatRatio(ctx.value) }}</span>
                  </div>
                }
              </div>
              <p class="context-note">These valuation metrics are shown for reference only and do not affect the composite score.</p>
            </section>
          }
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
      color: var(--text-muted);
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
      color: var(--text-muted);
      text-decoration: none;
      margin-bottom: 1.5rem;
      transition: color 150ms ease;
    }

    .back-link:hover {
      color: var(--accent);
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
      color: var(--text-primary);
      margin: 0;
      line-height: 1.2;
    }

    .company-symbol {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1rem;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .sector-pill {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      background: rgba(136, 136, 160, 0.12);
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .watchlist-btn {
      background: none;
      border: 1px solid transparent;
      color: var(--text-muted);
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
      color: var(--accent);
      border-color: rgba(212, 147, 13, 0.3);
      transform: scale(1.15);
    }

    .watchlist-btn.active {
      color: var(--accent);
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
      color: var(--accent);
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
      color: var(--text-muted);
      text-transform: uppercase;
      margin-top: 0.5rem;
    }

    .radar-chart-container {
      flex-shrink: 0;
    }

    .radar-chart {
      width: 360px;
      height: 360px;
    }

    .sector-rank-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      margin-bottom: 2rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }

    .rank-text strong {
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
    }

    .rank-percentile {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      color: var(--accent);
      font-size: 0.8125rem;
      white-space: nowrap;
    }

    /* Breakdown section */
    .breakdown-section {
      margin-top: 1rem;
    }

    .breakdown-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--text-muted);
      text-transform: uppercase;
      margin: 0 0 0.75rem;
    }

    .breakdown-table {
      border: 1px solid var(--border);
      overflow: hidden;
    }

    .breakdown-header {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 80px 0.75fr 1fr;
      gap: 0;
      padding: 0.5rem 0.75rem;
      background: var(--bg-surface);
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }

    .ratio-row {
      border-bottom: 1px solid var(--bg-surface);
      transition: background 100ms ease;
    }

    .ratio-row:last-child {
      border-bottom: none;
    }

    .ratio-row:hover {
      background: var(--bg-surface);
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
      color: var(--text-primary);
      font-weight: 500;
    }

    .r-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: var(--text-secondary);
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
      color: var(--text-muted);
    }

    .r-contrib {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: var(--accent);
      font-weight: 600;
    }

    /* Expanded ratio detail */
    .ratio-detail {
      padding: 0.5rem 0.75rem 0.75rem;
      background: var(--bg-surface);
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
    .threshold-segment.neutral { background: var(--accent); }
    .threshold-segment.good { background: #84cc16; }
    .threshold-segment.strong { background: #22c55e; }

    .current-marker {
      display: flex;
      justify-content: space-between;
      font-size: 0.6875rem;
      color: var(--text-secondary);
    }

    .marker-label {
      text-transform: capitalize;
    }

    .marker-points {
      font-family: 'JetBrains Mono', monospace;
      color: var(--accent);
    }

    .price-block {
      margin-bottom: 2rem;
      padding: 1rem 0;
      border-bottom: 1px solid var(--border);
    }

    .price-big {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 900;
      font-size: 2rem;
      color: var(--text-primary);
      letter-spacing: -0.02em;
      margin-right: 0.75rem;
    }

    .price-change-lg {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1rem;
      font-weight: 600;
    }

    .price-change-lg.positive { color: #22c55e; }
    .price-change-lg.negative { color: #ef4444; }

    .price-meta {
      display: flex;
      gap: 1.5rem;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }

    .price-delayed {
      font-style: italic;
      opacity: 0.7;
    }

    .context-section {
      margin-top: 2rem;
    }

    .context-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--text-muted);
      text-transform: uppercase;
      margin: 0 0 0.75rem;
    }

    .context-grid {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .context-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0.75rem 1rem;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      min-width: 120px;
    }

    .ctx-label {
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .ctx-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .context-note {
      font-size: 0.6875rem;
      color: var(--text-muted);
      font-style: italic;
      margin: 0.75rem 0 0;
    }

    .no-score-state {
      text-align: center;
      color: var(--text-muted);
      padding: 3rem 1rem;
      font-size: 0.875rem;
    }
  `],
})
export class TickerComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private theme = inject(ThemeService);

  definitions = signal<Record<string, Definition>>({});
  detail = signal<TickerDetail | null>(null);
  loading = signal(true);
  displayScore = signal(0);
  expandedRatio = signal<string | null>(null);
  inWatchlist = signal(false);
  quote = signal<Quote | null>(null);
  private watchlistSymbols = signal<Set<string>>(new Set());

  // Sector context
  sectorName = signal<string | null>(null);
  sectorRank = signal<number | null>(null);
  sectorTotal = signal<number | null>(null);
  sectorPercentile = computed(() => {
    const rank = this.sectorRank();
    const total = this.sectorTotal();
    if (!rank || !total) return 0;
    return Math.round(((total - rank + 1) / total) * 100);
  });

  ratios = computed(() => {
    const d = this.detail();
    if (!d?.score?.breakdown?.ratios) return [];
    return d.score.breakdown.ratios;
  });

  contextRatios = computed(() => {
    const d = this.detail();
    if (!d?.score?.breakdown?.context_ratios) return [];
    return d.score.breakdown.context_ratios;
  });

  ratingLabel = computed(() => {
    const r = this.detail()?.score?.rating ?? '';
    const labels: Record<string, string> = {
      strong_buy: 'Very Strong', buy: 'Strong', hold: 'Neutral',
      sell: 'Weak', strong_sell: 'Very Weak', insufficient_data: 'No Data',
    };
    return labels[r] ?? r.replace(/_/g, ' ');
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
        radius: '55%',
        shape: 'polygon' as const,
        axisName: {
          color: this.theme.theme() === 'dark' ? '#8888a0' : '#4a4a65',
          fontSize: 11,
        },
        splitArea: {
          areaStyle: {
            color: this.theme.theme() === 'dark'
              ? ['transparent', 'rgba(37, 37, 64, 0.3)']
              : ['transparent', 'rgba(200, 200, 220, 0.25)'],
          },
        },
        splitLine: {
          lineStyle: {
            color: this.theme.theme() === 'dark' ? '#252540' : '#d8d8e4',
          },
        },
        axisLine: {
          lineStyle: {
            color: this.theme.theme() === 'dark' ? '#252540' : '#d8d8e4',
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
    this.api.getDefinitions().subscribe({
      next: (defs) => {
        const map: Record<string, Definition> = {};
        for (const d of defs) map[d.key] = d;
        this.definitions.set(map);
      },
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

  formatPrice(price: number): string {
    return '$' + price.toFixed(2);
  }

  formatMarketCap(cap: number): string {
    if (cap >= 1_000_000_000) return '$' + (cap / 1_000_000_000).toFixed(1) + 'B';
    if (cap >= 1_000_000) return '$' + (cap / 1_000_000).toFixed(0) + 'M';
    return '$' + cap.toLocaleString();
  }

  formatVolume(vol: number): string {
    if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + 'M';
    if (vol >= 1_000) return (vol / 1_000).toFixed(0) + 'K';
    return vol.toLocaleString();
  }

  toggleWatchlist(): void {
    const symbol = this.detail()?.company.symbol;
    if (!symbol) return;

    const wasInWatchlist = this.inWatchlist();
    this.inWatchlist.set(!wasInWatchlist); // optimistic update

    if (wasInWatchlist) {
      this.api.removeFromWatchlist(symbol).subscribe({
        error: () => this.inWatchlist.set(true), // revert on failure
      });
    } else {
      this.api.addToWatchlist(symbol).subscribe({
        error: () => this.inWatchlist.set(false), // revert on failure
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
        this.api.getQuote(symbol).subscribe({
          next: (q) => this.quote.set(q),
          error: () => this.quote.set(null),
        });
        if (data.score) {
          this.animateScore(data.score.composite_score);
        }
        // Load sector context (name + rank)
        if (data.company.sector_id) {
          this.loadSectorContext(data.company.sector_id, symbol);
        }
      },
      error: () => {
        this.detail.set(null);
        this.loading.set(false);
      },
    });
  }

  private loadSectorContext(sectorId: string, symbol: string): void {
    this.api.listSectors().subscribe({
      next: (sectors) => {
        const sector = sectors.find(s => s.id === sectorId);
        if (!sector) return;
        this.sectorName.set(sector.display_name);

        // Load sector screener to find rank
        this.api.screener({ sector: sector.key }).subscribe({
          next: (items) => {
            const sorted = [...items].sort((a, b) => b.composite_score - a.composite_score);
            const rank = sorted.findIndex(i => i.symbol.toUpperCase() === symbol.toUpperCase()) + 1;
            this.sectorTotal.set(sorted.length);
            this.sectorRank.set(rank > 0 ? rank : null);
          },
        });
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
