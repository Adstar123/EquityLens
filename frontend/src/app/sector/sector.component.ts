import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp } from '@ng-icons/lucide';
import { forkJoin } from 'rxjs';
import { ApiService, Sector, ScreenerItem, Definition } from '../core/api.service';
import { BANDS, Band, bandVar, formatRatio, ratingBand, ratingLabel, ratingLevel, shortName, shortSymbol } from '../core/bands';
import { ScoreBadgeComponent } from '../shared/components/score-badge.component';
import { BandMeterComponent } from '../shared/components/band-meter.component';
import { InfoTooltipComponent } from '../shared/components/info-tooltip.component';

type SortColumn = 'rank' | 'symbol' | 'company' | 'score' | 'rating' | string;
type SortDir = 'asc' | 'desc';

const MIX_LABELS: Record<Band, string> = {
  strong: 'Very strong',
  good: 'Strong',
  neutral: 'Neutral',
  weak: 'Weak',
  poor: 'Very weak',
};

@Component({
  selector: 'app-sector',
  standalone: true,
  imports: [RouterLink, NgIcon, ScoreBadgeComponent, BandMeterComponent, InfoTooltipComponent],
  template: `
    @if (loading()) {
      <div class="page" aria-busy="true">
        <div class="sk sk-title"></div>
        <div class="sk sk-line"></div>
        <div class="sk sk-panel"></div>
      </div>
    } @else if (sector(); as s) {
      <div class="page">
        <header class="head">
          <div class="head-copy">
            <a class="crumb" routerLink="/screener" [queryParams]="{ sector: s.key }">Sector</a>
            <h1 class="page-heading">{{ s.display_name }}</h1>
            @if (s.description) {
              <p class="desc">{{ s.description }}</p>
            }
          </div>
          <dl class="figures">
            <div class="figure">
              <dt>Companies</dt>
              <dd>{{ scored().length }}</dd>
            </div>
            <div class="figure">
              <dt>Average score</dt>
              <dd>{{ avgScore() }}</dd>
            </div>
            @if (leader(); as l) {
              <div class="figure">
                <dt>Strongest</dt>
                <dd><a [routerLink]="['/ticker', l.symbol]">{{ l.symbol }}</a> <span>{{ l.score }}</span></dd>
              </div>
            }
          </dl>
        </header>

        @if (sortedItems().length) {
          <section class="card field-card">
            <div class="card-head">
              <h2 class="card-title">The sector under the lens</h2>
              <span class="card-note">Strongest first, coloured by band</span>
            </div>
            <div class="tiles">
              @for (t of tiles(); track t.symbol; let i = $index) {
                <a
                  class="tile"
                  [routerLink]="['/ticker', t.symbol]"
                  [style.--c]="t.colour"
                  [style.--d]="(i * 12) + 'ms'"
                  [title]="t.name + ', ' + t.label"
                >
                  <b>{{ t.short }}</b>
                  <i>{{ t.score }}</i>
                </a>
              }
            </div>
          </section>

          <section class="table-section">
            <div class="table-head">
              <h2 class="card-title">Rankings</h2>
              <span class="card-note">Ratio columns sort by band</span>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th class="col-rank">
                      <button class="th-btn" (click)="toggleSort('rank')" [class.is-sorted]="sortColumn() === 'rank'">
                        # @if (sortArrow('rank'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                      </button>
                    </th>
                    <th class="col-symbol">
                      <button class="th-btn" (click)="toggleSort('symbol')" [class.is-sorted]="sortColumn() === 'symbol'">
                        Symbol @if (sortArrow('symbol'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                      </button>
                    </th>
                    <th>
                      <button class="th-btn" (click)="toggleSort('company')" [class.is-sorted]="sortColumn() === 'company'">
                        Company @if (sortArrow('company'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                      </button>
                    </th>
                    <th>
                      <button class="th-btn" (click)="toggleSort('score')" [class.is-sorted]="sortColumn() === 'score'">
                        Score @if (sortArrow('score'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                      </button>
                      @if (definitions()['composite_score']; as def) {
                        <app-info-tooltip [description]="def.description" />
                      }
                    </th>
                    <th>
                      <button class="th-btn" (click)="toggleSort('rating')" [class.is-sorted]="sortColumn() === 'rating'">
                        Rating @if (sortArrow('rating'); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                      </button>
                    </th>
                    @for (col of ratioHeaders(); track col.name) {
                      <th class="col-ratio">
                        <button class="th-btn" (click)="toggleSort('ratio:' + col.name)" [class.is-sorted]="sortColumn() === 'ratio:' + col.name">
                          {{ col.name }} @if (sortArrow('ratio:' + col.name); as a) { <ng-icon [svg]="a" size="12" strokeWidth="2" class="th-arrow" /> }
                        </button>
                        @if (col.description) {
                          <app-info-tooltip [description]="col.description" />
                        }
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (item of sortedItems(); track item.symbol) {
                    <tr class="row" (click)="goToTicker(item.symbol)">
                      <td class="col-rank">{{ rankOf(item.symbol) }}</td>
                      <td class="col-symbol">
                        <a class="symbol-link" [routerLink]="['/ticker', item.symbol]" (click)="$event.stopPropagation()">{{ item.symbol }}</a>
                      </td>
                      <td class="cell-name">{{ item.company_name }}</td>
                      <td><app-score-badge [score]="item.composite_score" [rating]="item.rating" /></td>
                      <td class="cell-rating" [class.is-strong]="isStrong(item.rating)">{{ labelOf(item.rating) }}</td>
                      @for (col of ratioHeaders(); track col.name) {
                        <td class="col-ratio">
                          @if (ratioByName(item, col.name); as ratio) {
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
                  }
                </tbody>
              </table>
            </div>
          </section>

          <div class="grid">
            <section class="card">
              <div class="card-head">
                <h2 class="card-title">Band mix</h2>
                <span class="card-note">{{ scored().length }} companies</span>
              </div>
              <div class="mix" role="img" [attr.aria-label]="mixAria()">
                @for (m of mix(); track m.band) {
                  @if (m.count) {
                    <i [style.flex-grow]="m.count" [style.background]="m.colour"></i>
                  }
                }
              </div>
              <div class="mix-legend">
                @for (m of mix(); track m.band) {
                  <div class="mix-row" [class.is-zero]="!m.count">
                    <span class="swatch" [style.background]="m.colour"></span>
                    <span class="mix-label">{{ m.label }}</span>
                    <span class="mix-count">{{ m.count }}</span>
                    <span class="mix-share">{{ m.share }}%</span>
                  </div>
                }
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <h2 class="card-title">Ratio profile</h2>
                <span class="card-note">Average band across the sector</span>
              </div>
              <div class="profile">
                @for (p of profile(); track p.name) {
                  <div class="profile-row">
                    <span class="profile-name">{{ p.name }}</span>
                    <span class="profile-track"><b [style.width.%]="p.pct"></b></span>
                    <span class="profile-val">{{ p.avg }}<span> / 5</span></span>
                  </div>
                }
              </div>
            </section>
          </div>
        } @else {
          <div class="card empty">
            <span class="empty-title">No scored companies yet</span>
            <span class="empty-sub">Nothing in this sector has enough reported figures to score.</span>
          </div>
        }
      </div>
    } @else {
      <div class="page nf">
        <h1 class="page-heading">Sector not found</h1>
        <a class="ui-link" routerLink="/screener">Open the screener</a>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .page {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 32px 64px;
    }

    // ── Header ──
    .head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 48px;
      margin-bottom: 32px;
    }

    .crumb {
      display: inline-block;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--accent-ink);
      text-decoration: none;
    }

    .crumb:hover {
      color: var(--text-primary);
    }

    .desc {
      margin: 12px 0 0;
      max-width: 600px;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .figures {
      display: flex;
      gap: 40px;
      margin: 0;
    }

    .figure dt {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .figure dd {
      margin: 4px 0 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
    }

    .figure dd a {
      color: var(--accent-ink);
      text-decoration: none;
    }

    .figure dd span {
      margin-left: 6px;
      font-size: 14px;
      color: var(--text-muted);
    }

    // ── Cards ──
    .card {
      padding: 24px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      min-width: 0;
    }

    .card-head,
    .table-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }

    .card-title {
      margin: 0;
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .card-note {
      font-size: 12px;
      color: var(--text-muted);
    }

    .field-card {
      margin-bottom: 40px;
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
      gap: 4px;
    }

    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      height: 48px;
      border-radius: 6px;
      background: var(--c);
      color: var(--on-accent);
      text-decoration: none;
      line-height: 1;
      animation: tileIn 420ms var(--ease) both;
      animation-delay: var(--d);
      transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
    }

    .tile:hover {
      box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--text-primary);
    }

    .tile:active {
      transform: scale(0.96);
    }

    .tile b {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 500;
    }

    .tile i {
      font-family: 'JetBrains Mono', monospace;
      font-style: normal;
      font-size: 11px;
      opacity: 0.72;
    }

    @keyframes tileIn {
      from { opacity: 0; transform: scale(0.85); }
    }

    // ── Table ──
    .table-section {
      margin-bottom: 40px;
    }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }

    th {
      height: 40px;
      padding: 0 16px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-strong);
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      white-space: nowrap;
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
      color: var(--accent);
    }

    td {
      height: 44px;
      padding: 0 16px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-base);
      font-size: 13px;
      color: var(--text-primary);
      white-space: nowrap;
      transition: background-color var(--dur-fast) var(--ease);
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    tr.row {
      cursor: pointer;
    }

    tr.row:hover td {
      background: var(--bg-hover);
    }

    .col-rank {
      position: sticky;
      left: 0;
      z-index: 2;
      width: 24px;
      padding-right: 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      text-align: right;
    }

    th.col-rank {
      z-index: 3;
    }

    .col-symbol {
      position: sticky;
      left: 40px;
      z-index: 2;
      box-shadow: inset -1px 0 0 var(--border);
    }

    th.col-symbol {
      z-index: 3;
    }

    .symbol-link {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      color: var(--text-primary);
      text-decoration: none;
      border-radius: 4px;
    }

    tr.row:hover .symbol-link {
      color: var(--accent-ink);
    }

    .cell-name {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-secondary);
    }

    .cell-rating {
      font-size: 13px;
      color: var(--text-muted);
    }

    .cell-rating.is-strong {
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
      min-width: 48px;
      text-align: right;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .is-empty {
      color: var(--text-muted);
    }

    // ── Analytics ──
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .mix {
      display: flex;
      gap: 2px;
      height: 12px;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 20px;
    }

    .mix i {
      display: block;
      flex-basis: 0;
    }

    .mix-legend {
      display: flex;
      flex-direction: column;
    }

    .mix-row {
      display: grid;
      grid-template-columns: 12px minmax(0, 1fr) 40px 48px;
      align-items: center;
      gap: 12px;
      height: 36px;
      border-top: 1px solid var(--border);
      font-size: 13px;
    }

    .mix-row.is-zero {
      opacity: 0.45;
    }

    .swatch {
      width: 12px;
      height: 6px;
      border-radius: 2px;
    }

    .mix-label {
      color: var(--text-secondary);
    }

    .mix-count,
    .mix-share {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      text-align: right;
    }

    .mix-count {
      color: var(--text-primary);
    }

    .mix-share {
      color: var(--text-muted);
    }

    .profile {
      display: flex;
      flex-direction: column;
    }

    .profile-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 56px;
      align-items: center;
      gap: 16px;
      height: 36px;
      border-top: 1px solid var(--border);
      font-size: 13px;
    }

    .profile-name {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .profile-track {
      height: 6px;
      border-radius: 3px;
      background: var(--band-off);
      overflow: hidden;
    }

    .profile-track b {
      display: block;
      height: 100%;
      background: var(--text-muted);
    }

    .profile-row:first-child .profile-track b {
      background: var(--accent);
    }

    .profile-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-primary);
      text-align: right;
    }

    .profile-val span {
      color: var(--text-muted);
    }

    // ── States ──
    .sk {
      border-radius: var(--radius);
      background: var(--band-off);
    }

    .sk-title { width: 280px; height: 32px; margin: 32px 0 12px; }
    .sk-line { width: 420px; max-width: 90%; height: 14px; margin-bottom: 32px; }
    .sk-panel { height: 240px; opacity: 0.6; border-radius: var(--radius-lg); }

    .empty {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 48px 24px;
      text-align: center;
    }

    .empty-title {
      font-size: 15px;
      font-weight: 500;
    }

    .empty-sub {
      font-size: 13px;
      color: var(--text-muted);
    }

    .nf {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding-top: 120px;
    }

    @media (max-width: 1024px) {
      .head {
        flex-direction: column;
        align-items: flex-start;
        gap: 24px;
      }

      .grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .page {
        padding: 24px 16px 48px;
      }

      .figures {
        gap: 24px;
      }

      .figure dd {
        font-size: 20px;
      }

      .card {
        padding: 20px 16px;
      }

      th, td {
        padding: 0 12px;
      }

      .col-symbol {
        left: 36px;
      }

      .cell-name {
        max-width: 140px;
      }
    }
  `],
})
export class SectorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private titleService = inject(Title);
  private api = inject(ApiService);

  loading = signal(true);
  sector = signal<Sector | null>(null);
  items = signal<ScreenerItem[]>([]);
  definitions = signal<Record<string, Definition>>({});

  sortColumn = signal<SortColumn>('score');
  sortDir = signal<SortDir>('desc');

  fmtRatio = formatRatio;

  scored = computed(() => this.items().filter(i => i.rating !== 'insufficient_data'));

  /** Unique ratio names across companies, ordered by first appearance, so a
   * ratio the top company lacks (e.g. interest coverage) still shows */
  ratioHeaders = computed(() => {
    const seen = new Map<string, { name: string; description: string }>();
    for (const item of this.items()) {
      for (const r of item.breakdown?.ratios ?? []) {
        if (!seen.has(r.name)) seen.set(r.name, { name: r.name, description: r.description || '' });
      }
    }
    return [...seen.values()];
  });

  avgScore = computed(() => {
    const list = this.scored();
    if (!list.length) return '0';
    return Math.round(list.reduce((acc, i) => acc + i.composite_score, 0) / list.length).toString();
  });

  private byScore = computed(() => [...this.items()].sort((a, b) => b.composite_score - a.composite_score));

  leader = computed(() => {
    const top = this.byScore()[0];
    return top ? { symbol: top.symbol, score: Math.round(top.composite_score) } : null;
  });

  tiles = computed(() =>
    this.byScore()
      .filter(i => i.rating !== 'insufficient_data')
      .map(i => ({
        symbol: i.symbol,
        short: shortSymbol(i.symbol),
        name: shortName(i.company_name),
        score: Math.round(i.composite_score),
        label: ratingLabel(i.rating),
        colour: bandVar(ratingBand(i.rating)),
      })));

  private ranks = computed(() => new Map(this.byScore().map((i, idx) => [i.symbol, idx + 1])));

  sortedItems = computed(() => {
    const list = [...this.items()];
    const col = this.sortColumn();
    const mul = this.sortDir() === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      let cmp = 0;
      if (col === 'rank' || col === 'score') {
        cmp = a.composite_score - b.composite_score;
      } else if (col === 'symbol') {
        cmp = a.symbol.localeCompare(b.symbol);
      } else if (col === 'company') {
        cmp = a.company_name.localeCompare(b.company_name);
      } else if (col === 'rating') {
        cmp = ratingLevel(a.rating) - ratingLevel(b.rating);
      } else if (col.startsWith('ratio:')) {
        const name = col.slice(6);
        const aVal = a.breakdown?.ratios?.find(r => r.name === name)?.points ?? -1;
        const bVal = b.breakdown?.ratios?.find(r => r.name === name)?.points ?? -1;
        cmp = aVal - bVal;
      }
      return cmp * mul;
    });
    return list;
  });

  mix = computed(() => {
    const list = this.scored();
    const counts = new Map<Band, number>();
    for (const i of list) {
      const b = ratingBand(i.rating);
      if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return [...BANDS].reverse().map(band => {
      const count = counts.get(band) ?? 0;
      return {
        band,
        label: MIX_LABELS[band],
        count,
        share: list.length ? Math.round((count / list.length) * 100) : 0,
        colour: bandVar(band),
      };
    });
  });

  mixAria = computed(() =>
    this.mix().filter(m => m.count).map(m => `${m.count} ${m.label.toLowerCase()}`).join(', '));

  /** Average points (out of 5) per ratio, strongest first */
  profile = computed(() => {
    const names = this.ratioHeaders().map(h => h.name);
    const rows = names.map(name => {
      let sum = 0;
      let n = 0;
      for (const item of this.items()) {
        const r = item.breakdown?.ratios?.find(x => x.name === name);
        if (r) {
          sum += r.points;
          n++;
        }
      }
      const avg = n ? sum / n : 0;
      return { name, avg: avg.toFixed(1), pct: (avg / 5) * 100, raw: avg };
    });
    return rows.sort((a, b) => b.raw - a.raw);
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const key = params.get('key');
      if (key) this.loadSector(key);
    });
    this.api.getDefinitions().subscribe({
      next: (defs) => {
        const map: Record<string, Definition> = {};
        for (const d of defs) map[d.key] = d;
        this.definitions.set(map);
      },
    });
  }

  rankOf(symbol: string): number {
    return this.ranks().get(symbol) ?? 0;
  }

  labelOf(rating: string): string {
    return ratingLabel(rating);
  }

  isStrong(rating: string): boolean {
    return ratingLevel(rating) >= 4;
  }

  toggleSort(col: SortColumn): void {
    if (this.sortColumn() === col) {
      this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    } else {
      this.sortColumn.set(col);
      this.sortDir.set(col === 'symbol' || col === 'company' ? 'asc' : 'desc');
    }
  }

  sortArrow(col: SortColumn): string {
    if (this.sortColumn() !== col) return '';
    // Rank 1 is the highest score, so rank ascending reads as score descending
    const dir = col === 'rank' ? (this.sortDir() === 'desc' ? 'asc' : 'desc') : this.sortDir();
    return dir === 'desc' ? lucideArrowDown : lucideArrowUp;
  }

  goToTicker(symbol: string): void {
    this.router.navigate(['/ticker', symbol]);
  }

  ratioByName(item: ScreenerItem, name: string) {
    return item.breakdown?.ratios?.find(r => r.name === name) ?? null;
  }

  private loadSector(key: string): void {
    this.loading.set(true);
    forkJoin({
      sectors: this.api.listSectors(),
      items: this.api.screener({ sector: key }),
    }).subscribe({
      next: ({ sectors, items }) => {
        const found = sectors.find(s => s.key === key);
        this.sector.set(found ?? null);
        this.items.set(found ? items : []);
        this.loading.set(false);
        this.titleService.setTitle(
          found ? `${found.display_name} · EquityLens` : 'Sector not found · EquityLens',
        );
      },
      error: () => {
        this.sector.set(null);
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }
}
