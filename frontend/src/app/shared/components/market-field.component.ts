import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ScreenerItem } from '../../core/api.service';
import { bandVar, ratingBand, ratingLabel, shortName } from '../../core/bands';
import { BandMeterComponent } from './band-meter.component';

interface FieldCell {
  symbol: string;
  name: string;
  sector: string;
  score: number;
  rating: string;
  colour: string;
  index: number;
  row: number;
  rank: number;
  of: number;
}

interface FieldRow {
  key: string;
  name: string;
  avg: number;
  cells: FieldCell[];
}

const SKELETON_COUNTS = [66, 61, 30, 27, 24, 22, 19, 17, 14, 10, 7];
const CARD_WIDTH = 232;

// The whole market at a glance. Every company is a tile in its sector's row,
// coloured by band and sorted strongest first. Pointing at a tile brings its
// sector into focus (the rest of the field dims) and opens a small card
// above the tile; the readout underneath keeps the last company you looked at.
//
// Card placement is written straight to the DOM outside Angular so moving
// across tiles never re-renders the field.
@Component({
  selector: 'app-market-field',
  standalone: true,
  imports: [RouterLink, BandMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field" [class.is-ready]="ready()">
      <div
        class="stage"
        #stage
        [class.has-active]="active() !== null"
        [attr.tabindex]="ready() ? 0 : -1"
        role="application"
        [attr.aria-label]="ariaLabel()"
        (keydown)="onKey($event)"
        (blur)="clearActive()"
      >
        @for (row of displayRows(); track row.key; let r = $index) {
          <div class="row" [class.is-active-row]="active()?.row === r">
            @if (row.key && !row.key.startsWith('sk')) {
              <a class="row-label" [routerLink]="['/sector', row.key]">
                <span class="row-name">{{ row.name }}</span>
                <span class="row-count">{{ row.cells.length }}</span>
              </a>
            } @else {
              <span class="row-label"><span class="sk-bar"></span></span>
            }
            <div class="cells">
              @for (cell of row.cells; track cell.symbol; let c = $index) {
                <span
                  class="cell"
                  [attr.data-i]="cell.index"
                  [class.is-hot]="cell.index === active()?.index"
                  [style.--c]="cell.colour"
                  [style.--d]="(r * 50 + c * 6) + 'ms'"
                ></span>
              }
            </div>
            <span class="row-avg">{{ row.cells.length && ready() ? row.avg : '' }}</span>
          </div>
        }

        <div class="card" #card [class.is-on]="active() !== null" aria-hidden="true">
          @if (active() ?? focused(); as a) {
            <div class="card-top">
              <span class="card-sym">{{ a.symbol }}</span>
              <span class="card-rank">Rank {{ a.rank }} of {{ a.of }}</span>
            </div>
            <div class="card-name">{{ a.name }}</div>
            <div class="card-score">
              <span class="card-num">{{ a.score }}</span>
              <app-band-meter [band]="bandOf(a)" size="md" />
              <span class="card-label">{{ labelOf(a) }}</span>
            </div>
          }
        </div>
      </div>

      <div class="readout" aria-live="polite">
        @if (focused(); as f) {
          <div class="ro-main">
            <span class="ro-sym">{{ f.symbol }}</span>
            <span class="ro-name">{{ f.name }}</span>
            <span class="ro-sector">{{ f.sector }}</span>
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
      grid-template-columns: 156px minmax(0, 1fr) 36px;
      column-gap: 16px;
      align-items: center;
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
      transition: color var(--dur-fast) var(--ease), opacity var(--dur) var(--ease);
    }

    a.row-label:hover {
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
      transition: color var(--dur-fast) var(--ease), opacity var(--dur) var(--ease);
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

    .cell {
      position: relative;
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: var(--band-off);
      transition: opacity var(--dur) var(--ease), transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
    }

    .is-ready .cell {
      background: var(--c);
      cursor: pointer;
      animation: cellIn 420ms var(--ease) both;
      animation-delay: var(--d);
    }

    @keyframes cellIn {
      from { opacity: 0; transform: scale(0.4); }
    }

    // Focus: the active sector stays lit, everything else steps back
    .has-active .row:not(.is-active-row) .cell {
      opacity: 0.28;
    }

    .has-active .row:not(.is-active-row) .row-label,
    .has-active .row:not(.is-active-row) .row-avg {
      opacity: 0.45;
    }

    .is-active-row .row-label,
    .is-active-row .row-avg {
      color: var(--text-primary);
    }

    .cell.is-hot {
      z-index: 2;
      transform: scale(1.5);
      box-shadow: 0 0 0 1px var(--bg-surface), 0 0 0 2px var(--text-primary);
    }

    // ── Hover card ──
    .card {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 5;
      width: ${CARD_WIDTH}px;
      box-sizing: border-box;
      padding: 12px 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      box-shadow: var(--shadow-pop);
      pointer-events: none;
      opacity: 0;
      will-change: transform;
      transition: opacity var(--dur-fast) var(--ease);
    }

    .card.is-on {
      opacity: 1;
    }

    // Pointer down to the tile, following it when the card is clamped
    .card::after {
      content: '';
      position: absolute;
      left: var(--ax, 50%);
      bottom: -6px;
      width: 10px;
      height: 10px;
      margin-left: -5px;
      background: var(--bg-elevated);
      border-right: 1px solid var(--border-strong);
      border-bottom: 1px solid var(--border-strong);
      transform: rotate(45deg);
    }

    .card.is-moving {
      transition: opacity var(--dur-fast) var(--ease), transform 120ms var(--ease);
    }

    .card-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }

    .card-sym {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 500;
      color: var(--accent-ink);
    }

    .card-rank {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-muted);
    }

    .card-name {
      margin: 4px 0 10px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-score {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .card-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 500;
      line-height: 1;
      color: var(--text-primary);
    }

    .card-label {
      font-size: 12px;
      color: var(--text-secondary);
    }

    // ── Readout ──
    .readout {
      display: flex;
      align-items: center;
      gap: 24px;
      min-height: 56px;
      margin-top: 24px;
      padding: 0 12px 0 20px;
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
      height: 36px;
      padding: 0 14px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      color: var(--on-accent);
      text-decoration: none;
      background: var(--accent);
      white-space: nowrap;
      transition: background-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
    }

    .ro-link:hover {
      background: var(--accent-light);
    }

    .ro-link:active {
      transform: scale(0.98);
    }

    .ro-wait {
      font-size: 13px;
      color: var(--text-muted);
    }

    @media (max-width: 1100px) {
      .row {
        grid-template-columns: 140px minmax(0, 1fr) 32px;
        column-gap: 12px;
      }
    }

    @media (max-width: 720px) {
      .stage {
        row-gap: 12px;
      }

      .row {
        grid-template-columns: minmax(0, 1fr) auto;
        row-gap: 6px;
      }

      .cells {
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

      .readout {
        flex-wrap: wrap;
        gap: 8px 16px;
        padding: 12px 12px 12px 16px;
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
  featured = input<string | null>(null);

  @ViewChild('stage') stageRef!: ElementRef<HTMLElement>;
  @ViewChild('card') cardRef!: ElementRef<HTMLElement>;

  /** Tile under the pointer or keyboard focus; drives the card and dimming */
  activeIndex = signal(-1);
  /** Last company looked at; drives the readout */
  private lastIndex = signal(-1);

  ready = computed(() => (this.items()?.length ?? 0) > 0);

  rows = computed<FieldRow[]>(() => {
    const items = (this.items() ?? []).filter(i => i.rating !== 'insufficient_data');
    if (!items.length) return [];

    const groups = new Map<string, { name: string; list: ScreenerItem[] }>();
    for (const item of items) {
      if (!groups.has(item.sector_key)) groups.set(item.sector_key, { name: item.sector_name, list: [] });
      groups.get(item.sector_key)!.list.push(item);
    }

    const rows: FieldRow[] = [...groups.entries()].map(([key, g]) => {
      const sorted = [...g.list].sort((a, b) => b.composite_score - a.composite_score);
      const avg = Math.round(sorted.reduce((s, i) => s + i.composite_score, 0) / sorted.length);
      return {
        key,
        name: g.name,
        avg,
        cells: sorted.map((i, c) => ({
          symbol: i.symbol,
          name: shortName(i.company_name),
          sector: i.sector_name,
          score: Math.round(i.composite_score),
          rating: i.rating,
          colour: bandVar(ratingBand(i.rating)),
          index: 0,
          row: 0,
          rank: c + 1,
          of: sorted.length,
        })),
      };
    });

    rows.sort((a, b) => b.avg - a.avg);
    let index = 0;
    rows.forEach((row, r) => row.cells.forEach(cell => {
      cell.index = index++;
      cell.row = r;
    }));
    return rows;
  });

  // Placeholder rows hold the layout while scores load
  displayRows = computed<FieldRow[]>(() => {
    const rows = this.rows();
    if (rows.length) return rows;
    return SKELETON_COUNTS.map((n, r) => ({
      key: 'sk' + r,
      name: '',
      avg: 0,
      cells: Array.from({ length: n }, (_, c) => ({
        symbol: `sk-${r}-${c}`, name: '', sector: '', score: 0, rating: '',
        colour: '', index: -1, row: r, rank: 0, of: 0,
      })),
    }));
  });

  cells = computed(() => this.rows().flatMap(r => r.cells));

  active = computed(() => {
    const i = this.activeIndex();
    return i >= 0 ? this.cells()[i] ?? null : null;
  });

  focused = computed(() => {
    const cells = this.cells();
    if (!cells.length) return null;
    const last = this.lastIndex();
    if (last >= 0 && cells[last]) return cells[last];
    const featured = this.featured();
    return cells.find(c => c.symbol === featured) ?? cells[0];
  });

  ariaLabel = computed(() =>
    `${this.cells().length} companies, one tile each, coloured by score band. ` +
    'Use the arrow keys to move between companies and Enter to open one.',
  );

  private cleanup: (() => void)[] = [];
  private pointerType = 'mouse';
  // Taps don't always report a touch pointer before the click, so also ask
  // whether this device can hover at all
  private noHover = window.matchMedia('(hover: none)').matches;
  private shown = false;

  bandOf(cell: FieldCell) {
    return ratingBand(cell.rating);
  }

  labelOf(cell: FieldCell) {
    return ratingLabel(cell.rating);
  }

  ngAfterViewInit(): void {
    const stage = this.stageRef.nativeElement;
    this.zone.runOutsideAngular(() => {
      const indexOf = (target: EventTarget | null) => {
        const el = (target as HTMLElement | null)?.closest<HTMLElement>('.cell[data-i]');
        return el ? Number(el.dataset['i']) : -1;
      };

      const onMove = (e: PointerEvent) => {
        this.pointerType = e.pointerType;
        if (e.pointerType !== 'mouse' || !this.ready()) return;
        const i = indexOf(e.target);
        if (i >= 0) {
          this.activate(i);
          return;
        }
        // Not on a tile. Crossing the 2px gap beside the current tile keeps
        // it, so the card doesn't flicker; anywhere else (labels, averages,
        // the empty end of a short row) means nothing is pointed at.
        const hot = this.activeIndex() >= 0
          ? stage.querySelector<HTMLElement>(`.cell[data-i="${this.activeIndex()}"]`)
          : null;
        if (hot) {
          const r = hot.getBoundingClientRect();
          const pad = 3;
          if (e.clientX >= r.left - pad && e.clientX <= r.right + pad &&
              e.clientY >= r.top - pad && e.clientY <= r.bottom + pad) return;
        }
        this.clearActive();
      };
      const onLeave = () => this.clearActive();
      const onDown = (e: PointerEvent) => {
        this.pointerType = e.pointerType;
      };
      const onClick = (e: MouseEvent) => {
        const i = indexOf(e.target);
        if (i < 0) return;
        const cell = this.cells()[i];
        if (!cell) return;
        if (this.pointerType === 'mouse' && !this.noHover) {
          this.zone.run(() => this.router.navigate(['/ticker', cell.symbol]));
        } else {
          // Touch: a tap shows the card; the readout button opens it
          this.activate(i);
        }
      };

      stage.addEventListener('pointermove', onMove, { passive: true });
      stage.addEventListener('pointerleave', onLeave);
      stage.addEventListener('pointerdown', onDown, { passive: true });
      stage.addEventListener('click', onClick);
      // A tap anywhere else dismisses the card on touch screens
      const onDocDown = (e: PointerEvent) => {
        if (!stage.contains(e.target as Node)) this.clearActive();
      };
      document.addEventListener('pointerdown', onDocDown, { passive: true });
      this.cleanup.push(() => document.removeEventListener('pointerdown', onDocDown));
      this.cleanup.push(() => {
        stage.removeEventListener('pointermove', onMove);
        stage.removeEventListener('pointerleave', onLeave);
        stage.removeEventListener('pointerdown', onDown);
        stage.removeEventListener('click', onClick);
      });
    });
  }

  ngOnDestroy(): void {
    this.cleanup.forEach(fn => fn());
  }

  onKey(event: KeyboardEvent): void {
    const rows = this.rows();
    if (!rows.length) return;
    const current = this.active() ?? this.focused();
    if (!current) return;

    if (event.key === 'Enter') {
      this.router.navigate(['/ticker', current.symbol]);
      return;
    }
    if (event.key === 'Escape') {
      this.clearActive();
      return;
    }

    let r = current.row;
    let c = current.rank - 1;
    // The first arrow press just shows the current company
    if (this.activeIndex() < 0 && event.key.startsWith('Arrow')) {
      event.preventDefault();
      this.activate(current.index);
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
    this.activate(rows[r].cells[c].index);
  }

  clearActive(): void {
    if (this.activeIndex() < 0) return;
    this.shown = false;
    this.zone.run(() => this.activeIndex.set(-1));
  }

  private activate(index: number): void {
    if (index === this.activeIndex()) return;
    this.zone.run(() => {
      this.activeIndex.set(index);
      this.lastIndex.set(index);
    });
    this.placeCard(index);
  }

  // Centre the card above the tile, kept inside the field. It glides between
  // tiles once visible, but appears in place the first time.
  private placeCard(index: number): void {
    const stage = this.stageRef.nativeElement;
    const card = this.cardRef.nativeElement;
    const tile = stage.querySelector<HTMLElement>(`.cell[data-i="${index}"]`);
    if (!tile) return;

    const s = stage.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    const cardHeight = card.offsetHeight || 88;
    const x = Math.max(0, Math.min(s.width - CARD_WIDTH, t.left - s.left + t.width / 2 - CARD_WIDTH / 2));
    const y = t.top - s.top - cardHeight - 12;

    const tileCentre = t.left - s.left + t.width / 2;
    card.style.setProperty('--ax', `${Math.round(Math.max(16, Math.min(CARD_WIDTH - 16, tileCentre - x)))}px`);
    card.classList.toggle('is-moving', this.shown);
    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.shown = true;
  }
}
