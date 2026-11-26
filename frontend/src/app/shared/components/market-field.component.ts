import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ScreenerItem } from '../../core/api.service';
import {
  bandVar,
  ratingBand,
  ratingLabel,
  ratingLevel,
  shortName,
  shortSymbol,
} from '../../core/bands';
import { BandMeterComponent } from './band-meter.component';

interface FieldCell {
  symbol: string;
  short: string;
  name: string;
  sector: string;
  score: number;
  rating: string;
  colour: string;
  level: number;
  index: number;
}

interface FieldRow {
  key: string;
  name: string;
  avg: number;
  cells: FieldCell[];
}

interface CellBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SKELETON_COUNTS = [66, 61, 30, 27, 24, 22, 19, 17, 14, 10, 7];

// The whole market under one lens. Every company is a tile in its sector's
// row, coloured by band and sorted strongest first. A loupe follows the
// pointer (or arrow keys) and magnifies the tiles into readable tickers.
//
// The lens moves with direct transforms outside Angular so tracking the
// pointer never runs change detection; only the focused company does.
@Component({
  selector: 'app-market-field',
  standalone: true,
  imports: [RouterLink, BandMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field" [class.is-grouped]="grouped()" [class.is-ready]="ready()">
      <div
        class="stage"
        #stage
        [attr.tabindex]="ready() ? 0 : -1"
        role="application"
        [attr.aria-label]="ariaLabel()"
        (keydown)="onKey($event)"
      >
        @for (row of displayRows(); track row.key; let r = $index) {
          <div class="row" [style.--r]="r">
            @if (grouped()) {
              @if (row.key && !row.key.startsWith('sk')) {
                <a class="row-label" [routerLink]="['/sector', row.key]">
                  <span class="row-name">{{ row.name }}</span>
                  <span class="row-count">{{ row.cells.length }}</span>
                </a>
              } @else {
                <span class="row-label is-skeleton"><span class="sk-bar"></span></span>
              }
            }
            <div class="cells">
              @for (cell of row.cells; track cell.symbol; let c = $index) {
                <span
                  class="cell"
                  [class.is-focus]="cell.index === focusIndex()"
                  [style.--c]="cell.colour"
                  [style.--d]="(r * 50 + c * 6) + 'ms'"
                ></span>
              }
            </div>
            @if (grouped()) {
              <span class="row-avg">{{ row.cells.length && ready() ? row.avg : '' }}</span>
            }
          </div>
        }

        <div class="lens" #lens [class.is-hidden]="!ready() || (touch && !touched())" aria-hidden="true">
          <div class="lens-clip">
          <div class="lens-view" #lensView>
            @for (cell of cells(); track cell.symbol) {
              @if (boxes()[cell.index]; as b) {
                <span
                  class="lcell"
                  [class.is-focus]="cell.index === focusIndex()"
                  [style.left.px]="b.x * zoom"
                  [style.top.px]="b.y * zoom"
                  [style.width.px]="b.w * zoom"
                  [style.height.px]="b.h * zoom"
                  [style.--c]="cell.colour"
                >
                  <b>{{ cell.short }}</b>
                  <i>{{ cell.score }}</i>
                </span>
              }
            }
          </div>
          </div>
          <svg class="reticle" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="99" />
            @for (t of ticks; track t) {
              <line x1="100" y1="1" x2="100" [attr.y2]="t % 90 === 0 ? 11 : 6" [attr.transform]="'rotate(' + t + ' 100 100)'" />
            }
          </svg>
        </div>
      </div>

      <div class="readout" aria-live="polite">
        @if (focused(); as f) {
          <div class="ro-main">
            <span class="ro-sym">{{ f.symbol }}</span>
            <span class="ro-name">{{ f.name }}</span>
            @if (grouped()) {
              <span class="ro-sector">{{ f.sector }}</span>
            }
          </div>
          <div class="ro-score">
            <span class="ro-num">{{ f.score }}</span>
            <app-band-meter [band]="bandOf(f)" size="md" />
            <span class="ro-label">{{ labelOf(f) }}</span>
          </div>
          <a class="ro-link" [routerLink]="['/ticker', f.symbol]">
            Open breakdown
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
        } @else {
          <span class="ro-wait">Loading the latest scores</span>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .stage {
      position: relative;
      display: grid;
      row-gap: 8px;
      outline: none;
      border-radius: 8px;
    }

    .stage:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 8px;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr;
      align-items: center;
    }

    .is-grouped .row {
      grid-template-columns: 156px minmax(0, 1fr) 36px;
      column-gap: 16px;
    }

    .row-label {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      font-size: 13px;
      color: var(--text-secondary);
      text-decoration: none;
      transition: color var(--dur-fast) var(--ease);
    }

    .row-label:hover {
      color: var(--text-primary);
    }

    .row-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row-count {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-muted);
    }

    .row-avg {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
      text-align: right;
    }

    .sk-bar {
      display: block;
      width: 120px;
      height: 8px;
      border-radius: 4px;
      background: var(--band-off);
    }

    .cells {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }

    .is-ready .cells {
      cursor: none;
    }

    .cell {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: var(--band-off);
    }

    .is-ready .cell {
      background: var(--c);
      animation: cellIn 420ms var(--ease) both;
      animation-delay: var(--d);
    }

    .is-ready .cell.is-focus {
      box-shadow: 0 0 0 1.5px var(--bg-surface), 0 0 0 3px var(--text-primary);
    }

    @keyframes cellIn {
      from { opacity: 0; transform: scale(0.4); }
    }

    // ── Lens ──
    .lens {
      position: absolute;
      left: 0;
      top: 0;
      width: 168px;
      height: 168px;
      margin: -84px 0 0 -84px;
      border-radius: 50%;
      pointer-events: none;
      z-index: 5;
      will-change: transform;
      transition: opacity var(--dur) var(--ease);
    }

    .lens.is-hidden {
      opacity: 0;
    }

    .lens.glide,
    .lens.glide .lens-view {
      transition: transform 420ms var(--ease), opacity var(--dur) var(--ease);
    }

    .lens::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: var(--bg-deep);
      box-shadow: var(--shadow-pop);
    }

    .lens-clip {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      overflow: hidden;
      clip-path: circle(50%);
    }

    .lens-view {
      position: absolute;
      left: 0;
      top: 0;
      will-change: transform;
    }

    .lcell {
      position: absolute;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      border-radius: 6px;
      background: var(--c);
      color: var(--on-accent);
      line-height: 1;
    }

    .lcell b {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      font-size: 10px;
      letter-spacing: 0;
    }

    .lcell i {
      font-family: 'JetBrains Mono', monospace;
      font-style: normal;
      font-size: 9px;
      opacity: 0.72;
    }

    .lcell.is-focus {
      outline: 2px solid var(--text-primary);
      outline-offset: 2px;
    }

    .reticle {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .reticle circle {
      fill: none;
      stroke: var(--accent);
      stroke-width: 1.5;
    }

    .reticle line {
      stroke: var(--accent);
      stroke-width: 1.5;
      stroke-linecap: round;
    }

    // ── Readout ──
    .readout {
      display: flex;
      align-items: center;
      gap: 24px;
      min-height: 56px;
      margin-top: 24px;
      padding: 0 16px 0 20px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--bg-base);
    }

    .ro-main {
      display: flex;
      align-items: baseline;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }

    .ro-sym {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      font-size: 13px;
      color: var(--accent-ink);
    }

    .ro-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ro-sector {
      font-size: 13px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .ro-score {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .ro-num {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      font-size: 20px;
      color: var(--text-primary);
      min-width: 3ch;
      text-align: right;
    }

    .ro-label {
      font-size: 13px;
      color: var(--text-secondary);
      min-width: 76px;
    }

    .ro-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      text-decoration: none;
      background: var(--bg-hover);
      white-space: nowrap;
      transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
    }

    .ro-link:hover {
      background: var(--accent);
      color: var(--on-accent);
    }

    .ro-wait {
      font-size: 13px;
      color: var(--text-muted);
    }

    @media (max-width: 1100px) {
      .is-grouped .row {
        grid-template-columns: 148px minmax(0, 1fr) 32px;
        column-gap: 12px;
      }
    }

    @media (max-width: 720px) {
      .stage {
        row-gap: 12px;
      }

      .is-grouped .row {
        grid-template-columns: minmax(0, 1fr) auto;
        row-gap: 6px;
      }

      .is-grouped .cells {
        grid-column: 1 / -1;
        grid-row: 2;
      }

      .row-label {
        justify-content: flex-start;
      }

      .cell {
        width: 10px;
        height: 10px;
      }

      .lens {
        width: 128px;
        height: 128px;
        margin: -64px 0 0 -64px;
      }

      .readout {
        flex-wrap: wrap;
        gap: 8px 16px;
        padding: 12px 16px;
      }

      .ro-main {
        flex-basis: 100%;
      }

      .ro-sector {
        display: none;
      }

      .ro-link {
        margin-left: auto;
      }
    }
  `],
})
export class MarketFieldComponent implements AfterViewInit, OnDestroy {
  private zone = inject(NgZone);
  private router = inject(Router);

  items = input<ScreenerItem[] | null>(null);
  grouped = input(true);
  featured = input<string | null>(null);

  @ViewChild('stage') stageRef!: ElementRef<HTMLElement>;
  @ViewChild('lens') lensRef!: ElementRef<HTMLElement>;
  @ViewChild('lensView') lensViewRef!: ElementRef<HTMLElement>;

  readonly zoom = 2.75;
  readonly ticks = Array.from({ length: 24 }, (_, i) => i * 15);

  boxes = signal<CellBox[]>([]);
  focusIndex = signal(-1);
  // On touch screens the lens waits for a first tap instead of covering
  // the field before anyone has touched it
  touched = signal(false);
  readonly touch = window.matchMedia('(pointer: coarse)').matches;

  ready = computed(() => (this.items()?.length ?? 0) > 0);

  rows = computed<FieldRow[]>(() => {
    const items = (this.items() ?? []).filter(i => i.rating !== 'insufficient_data');
    if (!items.length) return [];

    const groups = new Map<string, { name: string; list: ScreenerItem[] }>();
    for (const item of items) {
      const key = this.grouped() ? item.sector_key : 'all';
      if (!groups.has(key)) groups.set(key, { name: item.sector_name, list: [] });
      groups.get(key)!.list.push(item);
    }

    const rows: FieldRow[] = [...groups.entries()].map(([key, g]) => {
      const sorted = [...g.list].sort((a, b) => b.composite_score - a.composite_score);
      const avg = Math.round(sorted.reduce((s, i) => s + i.composite_score, 0) / sorted.length);
      return {
        key,
        name: g.name,
        avg,
        cells: sorted.map(i => ({
          symbol: i.symbol,
          short: shortSymbol(i.symbol),
          name: shortName(i.company_name),
          sector: i.sector_name,
          score: Math.round(i.composite_score),
          rating: i.rating,
          colour: bandVar(ratingBand(i.rating)),
          level: ratingLevel(i.rating),
          index: 0,
        })),
      };
    });

    rows.sort((a, b) => b.avg - a.avg);
    let index = 0;
    for (const row of rows) for (const cell of row.cells) cell.index = index++;
    return rows;
  });

  // Placeholder rows hold the layout while scores load
  displayRows = computed<FieldRow[]>(() => {
    const rows = this.rows();
    if (rows.length) return rows;
    const counts = this.grouped() ? SKELETON_COUNTS : [48];
    return counts.map((n, r) => ({
      key: 'sk' + r,
      name: '',
      avg: 0,
      cells: Array.from({ length: n }, (_, c) => ({
        symbol: `sk-${r}-${c}`, short: '', name: '', sector: '', score: 0,
        rating: '', colour: '', level: 0, index: -1,
      })),
    }));
  });

  cells = computed(() => this.rows().flatMap(r => r.cells));

  focused = computed(() => {
    const i = this.focusIndex();
    return i >= 0 ? this.cells()[i] ?? null : null;
  });

  ariaLabel = computed(() =>
    `${this.cells().length} companies, one tile each, coloured by score band. ` +
    'Use the arrow keys to move the lens and Enter to open a company.',
  );

  private resizeObserver: ResizeObserver | null = null;
  private cleanup: (() => void)[] = [];
  private frame = 0;
  private pointerType = 'mouse';
  private focusedSymbol: string | null = null;
  private bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  constructor() {
    // Re-measure once the real tiles have rendered
    effect(() => {
      this.rows();
      queueMicrotask(() => requestAnimationFrame(() => this.measure(true)));
    });
  }

  bandOf(cell: FieldCell) {
    return ratingBand(cell.rating);
  }

  labelOf(cell: FieldCell) {
    return ratingLabel(cell.rating);
  }

  ngAfterViewInit(): void {
    const stage = this.stageRef.nativeElement;
    this.zone.runOutsideAngular(() => {
      const onMove = (e: PointerEvent) => {
        this.pointerType = e.pointerType;
        if (e.pointerType !== 'mouse' || !this.ready()) return;
        const rect = stage.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.moveLens(x, y));
      };
      const onDown = (e: PointerEvent) => {
        this.pointerType = e.pointerType;
      };
      const onClick = (e: MouseEvent) => {
        if (!this.ready()) return;
        if ((e.target as HTMLElement).closest('a')) return;
        if (this.pointerType === 'mouse') {
          const f = this.focused();
          if (f) this.zone.run(() => this.router.navigate(['/ticker', f.symbol]));
          return;
        }
        // Touch and pen: a tap moves the lens; the readout link opens it
        if (!this.touched()) this.zone.run(() => this.touched.set(true));
        const rect = stage.getBoundingClientRect();
        this.glideTo(e.clientX - rect.left, e.clientY - rect.top);
      };
      stage.addEventListener('pointermove', onMove, { passive: true });
      stage.addEventListener('pointerdown', onDown, { passive: true });
      stage.addEventListener('click', onClick);
      this.cleanup.push(() => {
        stage.removeEventListener('pointermove', onMove);
        stage.removeEventListener('pointerdown', onDown);
        stage.removeEventListener('click', onClick);
      });

      this.resizeObserver = new ResizeObserver(() => this.measure(false));
      this.resizeObserver.observe(stage);
    });
  }

  ngOnDestroy(): void {
    this.cleanup.forEach(fn => fn());
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  onKey(event: KeyboardEvent): void {
    const rows = this.rows();
    if (!rows.length) return;
    const current = this.focused();
    let r = 0;
    let c = 0;
    if (current) {
      r = rows.findIndex(row => row.cells.some(cell => cell.index === current.index));
      c = rows[r].cells.findIndex(cell => cell.index === current.index);
    }

    if (event.key === 'Enter' && current) {
      this.router.navigate(['/ticker', current.symbol]);
      return;
    }
    if (event.key === 'ArrowRight') c++;
    else if (event.key === 'ArrowLeft') c--;
    else if (event.key === 'ArrowDown') r++;
    else if (event.key === 'ArrowUp') r--;
    else return;

    event.preventDefault();
    r = Math.max(0, Math.min(rows.length - 1, r));
    c = Math.max(0, Math.min(rows[r].cells.length - 1, c));
    this.glideToCell(rows[r].cells[c].index);
  }

  // ── Geometry ──

  private measure(park: boolean): void {
    if (!this.stageRef || !this.ready()) return;
    const stage = this.stageRef.nativeElement;
    const origin = stage.getBoundingClientRect();
    const els = stage.querySelectorAll<HTMLElement>('.cells .cell');
    const boxes: CellBox[] = [];
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      boxes.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    });
    // Tiles animate in from a smaller scale; measure their resting size
    const size = parseFloat(getComputedStyle(els[0] ?? stage).width) || 12;
    for (const b of boxes) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      b.x = cx - size / 2;
      b.y = cy - size / 2;
      b.w = size;
      b.h = size;
    }
    this.bounds = {
      minX: Math.min(...boxes.map(b => b.x)),
      maxX: Math.max(...boxes.map(b => b.x + b.w)),
      minY: Math.min(...boxes.map(b => b.y)),
      maxY: Math.max(...boxes.map(b => b.y + b.h)),
    };
    this.zone.run(() => this.boxes.set(boxes));

    // Stay on the company already in focus (live data can replace the
    // snapshot underneath the lens); otherwise park on the featured one
    const cells = this.cells();
    let idx = this.focusedSymbol ? cells.findIndex(c => c.symbol === this.focusedSymbol) : -1;
    if (idx < 0 && park) {
      const featured = this.featured();
      idx = featured ? cells.findIndex(c => c.symbol === featured) : -1;
      if (idx < 0) idx = Math.min(3, cells.length - 1);
    }
    if (idx >= 0) {
      const target = idx;
      requestAnimationFrame(() => this.glideToCell(target, false));
    }
  }

  private moveLens(x: number, y: number): void {
    const boxes = this.boxes();
    if (!boxes.length) return;
    const { minX, maxX, minY, maxY } = this.bounds;
    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));
    this.place(x, y);

    // Nearest tile becomes the focus
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const dx = b.x + b.w / 2 - x;
      const dy = b.y + b.h / 2 - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best !== this.focusIndex()) this.setFocus(best);
  }

  private glideTo(x: number, y: number): void {
    const lens = this.lensRef.nativeElement;
    lens.classList.add('glide');
    this.moveLens(x, y);
    setTimeout(() => lens.classList.remove('glide'), 440);
  }

  private glideToCell(index: number, animate = true): void {
    const b = this.boxes()[index];
    if (!b) return;
    const lens = this.lensRef.nativeElement;
    if (animate) lens.classList.add('glide');
    this.place(b.x + b.w / 2, b.y + b.h / 2);
    this.setFocus(index);
    if (animate) setTimeout(() => lens.classList.remove('glide'), 440);
  }

  private setFocus(index: number): void {
    this.focusedSymbol = this.cells()[index]?.symbol ?? null;
    this.zone.run(() => this.focusIndex.set(index));
  }

  private place(x: number, y: number): void {
    const lens = this.lensRef.nativeElement;
    const view = this.lensViewRef.nativeElement;
    const radius = lens.offsetWidth / 2;
    lens.style.transform = `translate(${x}px, ${y}px)`;
    view.style.transform = `translate(${radius - x * this.zoom}px, ${radius - y * this.zoom}px)`;
  }
}
