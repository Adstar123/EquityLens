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
import { ScreenerItem } from '../../../core/api.service';
import { bandVar, ratingBand, ratingLabel, shortName } from '../../../core/bands';
import { ThemeService } from '../../../core/theme.service';
import { BandMeterComponent } from '../band-meter.component';
import { MarketFieldComponent } from '../market-field.component';
import type { CityScene } from './city-scene';

interface Company {
  index: number;
  symbol: string;
  name: string;
  sector: string;
  score: number;
  rating: string;
  district: number;
  rank: number;
  of: number;
}

interface District {
  key: string;
  name: string;
  avg: number;
  companies: Company[];
}

const CARD_WIDTH = 232;

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// The hero centrepiece. three.js is imported on demand so it never weighs on
// first paint; if WebGL isn't available the flat tile field stands in.
@Component({
  selector: 'app-market-city',
  standalone: true,
  imports: [RouterLink, BandMeterComponent, MarketFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (webgl()) {
      <div
        class="stage"
        #stage
        [class.is-ready]="sceneReady()"
        tabindex="0"
        role="application"
        [attr.aria-label]="ariaLabel()"
        (keydown)="onKey($event)"
        (blur)="clearActive()"
      >
        <canvas #canvas aria-hidden="true"></canvas>

        <div class="labels" #labels>
          @for (d of districts(); track d.key; let i = $index) {
            <a
              class="d-label"
              [attr.data-d]="i"
              [class.is-active]="active()?.district === i"
              [class.is-dim]="active() !== null && active()?.district !== i"
              [routerLink]="['/sector', d.key]"
              tabindex="-1"
            >
              <span class="d-name">{{ d.name }}</span>
              <span class="d-avg">{{ d.avg }}</span>
            </a>
          }
        </div>

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

        @if (!sceneReady()) {
          <div class="loading">Building the market</div>
        }
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
    } @else {
      <app-market-field [items]="items()" [featured]="featured()" />
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .stage {
      position: relative;
      height: 440px;
      outline: none;
      border-radius: 12px;
      cursor: default;
    }

    .stage:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 4px;
    }

    .stage.is-pointing {
      cursor: pointer;
    }

    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      opacity: 0;
      transition: opacity 600ms var(--ease);
    }

    .is-ready canvas {
      opacity: 1;
    }

    .loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      color: var(--text-muted);
    }

    // ── District labels, pinned to the front edge of each block ──
    .labels {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      opacity: 0;
      transition: opacity 500ms var(--ease);
    }

    .is-settled .labels {
      opacity: 1;
    }

    // Hidden labels must not catch clicks, and on touch screens they sit
    // among the towers, so taps go to the city instead
    .stage:not(.is-settled) .labels .d-label {
      pointer-events: none;
    }

    @media (hover: none) {
      .labels .d-label {
        pointer-events: none;
      }
    }

    .d-label {
      position: absolute;
      left: 0;
      top: 0;
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--bg-surface);
      box-shadow: inset 0 0 0 1px var(--border);
      white-space: nowrap;
      font-size: 12px;
      color: var(--text-secondary);
      text-decoration: none;
      pointer-events: auto;
      will-change: transform;
      transition: color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease), opacity var(--dur) var(--ease);
    }

    .d-label:hover,
    .d-label.is-active {
      color: var(--text-primary);
      background: var(--bg-hover);
      box-shadow: inset 0 0 0 1px var(--border-strong);
    }

    .d-label.is-dim {
      opacity: 0.35;
    }

    .d-avg {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-muted);
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
      margin-top: 16px;
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

    @media (max-width: 720px) {
      .stage {
        height: 340px;
      }

      .d-label {
        font-size: 11px;
        padding: 1px 4px;
      }

      .d-avg {
        display: none;
      }

      // Small screens: only the district you're looking at is named
      .d-label:not(.is-active) {
        opacity: 0;
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
export class MarketCityComponent implements AfterViewInit, OnDestroy {
  private zone = inject(NgZone);
  private router = inject(Router);
  private theme = inject(ThemeService);

  items = input<ScreenerItem[] | null>(null);
  featured = input<string | null>(null);

  @ViewChild('stage') stageRef?: ElementRef<HTMLElement>;
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('labels') labelsRef?: ElementRef<HTMLElement>;
  @ViewChild('card') cardRef?: ElementRef<HTMLElement>;

  webgl = signal(supportsWebGL());
  sceneReady = signal(false);
  activeIndex = signal(-1);
  private lastIndex = signal(-1);

  districts = computed<District[]>(() => {
    const items = (this.items() ?? []).filter(i => i.rating !== 'insufficient_data');
    const groups = new Map<string, { name: string; list: ScreenerItem[] }>();
    for (const item of items) {
      if (!groups.has(item.sector_key)) groups.set(item.sector_key, { name: item.sector_name, list: [] });
      groups.get(item.sector_key)!.list.push(item);
    }
    const districts = [...groups.entries()].map(([key, g]) => {
      const sorted = [...g.list].sort((a, b) => b.composite_score - a.composite_score);
      return {
        key,
        name: g.name,
        avg: Math.round(sorted.reduce((s, i) => s + i.composite_score, 0) / sorted.length),
        list: sorted,
      };
    }).sort((a, b) => b.avg - a.avg);

    let index = 0;
    return districts.map((d, di) => ({
      key: d.key,
      name: d.name,
      avg: d.avg,
      companies: d.list.map((i, rank) => ({
        index: index++,
        symbol: i.symbol,
        name: shortName(i.company_name),
        sector: i.sector_name,
        score: Math.round(i.composite_score),
        rating: i.rating,
        district: di,
        rank: rank + 1,
        of: d.list.length,
      })),
    }));
  });

  companies = computed(() => this.districts().flatMap(d => d.companies));

  active = computed(() => {
    const i = this.activeIndex();
    return i >= 0 ? this.companies()[i] ?? null : null;
  });

  focused = computed(() => {
    const all = this.companies();
    if (!all.length) return null;
    const last = this.lastIndex();
    if (last >= 0 && all[last]) return all[last];
    return all.find(c => c.symbol === this.featured()) ?? all[0];
  });

  ariaLabel = computed(() =>
    `The ASX 300 as a city: ${this.companies().length} companies, one tower each, ` +
    'height is the score and colour is the band. Use the arrow keys to move between companies and Enter to open one.',
  );

  private scene: CityScene | null = null;
  private cleanup: (() => void)[] = [];
  private pointerType = 'mouse';
  // Taps don't always report a touch pointer before the click, so also ask
  // whether this device can hover at all
  private noHover = window.matchMedia('(hover: none)').matches;
  private shown = false;
  private rowWidth = 0;
  private builtSymbols = '';
  private destroyed = false;

  constructor() {
    // Rebuild the city when the data changes (snapshot, then live)
    effect(() => {
      const districts = this.districts();
      if (this.scene && districts.length) this.pushData();
    });
    // Repaint for the other theme
    effect(() => {
      this.theme.theme();
      if (this.scene) queueMicrotask(() => this.scene?.setPalette(this.palette()));
    });
  }

  bandOf(c: Company) {
    return ratingBand(c.rating);
  }

  labelOf(c: Company) {
    return ratingLabel(c.rating);
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.webgl() || !this.canvasRef || !this.stageRef) return;
    let mod: typeof import('./city-scene');
    try {
      mod = await import('./city-scene');
    } catch {
      this.webgl.set(false);
      return;
    }
    if (this.destroyed || !this.canvasRef) return;

    this.zone.runOutsideAngular(() => {
      try {
        this.scene = new mod.CityScene(this.canvasRef!.nativeElement, () => this.onFrame());
      } catch {
        this.zone.run(() => this.webgl.set(false));
        return;
      }
      this.scene.setPalette(this.palette());
      this.bindEvents();
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.stageRef!.nativeElement);
      this.cleanup.push(() => ro.disconnect());
      this.resize();
    });
    if (this.districts().length) this.pushData();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanup.forEach(fn => fn());
    this.scene?.dispose();
    this.scene = null;
  }

  // ── Scene plumbing ──

  private palette() {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    return {
      background: v('--bg-surface') || '#10151c',
      plinth: v('--bg-hover') || '#18202a',
      highlight: '#ffffff',
    };
  }

  private bandColours() {
    const css = getComputedStyle(document.documentElement);
    const map = new Map<string, string>();
    for (const b of ['poor', 'weak', 'neutral', 'good', 'strong']) {
      map.set(b, css.getPropertyValue(`--band-${b}`).trim());
    }
    return map;
  }

  private pushData(): void {
    if (!this.scene || !this.stageRef) return;
    const districts = this.districts();
    const symbols = districts.map(d => d.companies.map(c => c.symbol).join(',')).join('|');
    const colours = this.bandColours();
    const first = !this.builtSymbols;
    this.builtSymbols = symbols;
    const streets = this.streetsFor();
    this.rowWidth = streets;
    this.scene.setData(
      districts.map(d => ({
        towers: d.companies.map(c => ({
          index: c.index,
          score: c.score,
          colour: colours.get(ratingBand(c.rating) ?? 'neutral') || bandVar(ratingBand(c.rating)),
        })),
      })),
      streets,
      first,
    );
    this.zone.run(() => this.sceneReady.set(true));
  }

  // Wide stages get two long streets, narrow ones stack more
  private streetsFor(): number {
    const el = this.stageRef?.nativeElement;
    if (!el) return 2;
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    return aspect > 1.75 ? 2 : aspect > 1.3 ? 3 : 4;
  }

  private resize(): void {
    const el = this.stageRef?.nativeElement;
    if (!el || !this.scene) return;
    this.scene.resize(el.clientWidth, el.clientHeight);
    if (this.builtSymbols && this.streetsFor() !== this.rowWidth) this.pushData();
  }

  /** Runs after every rendered frame: keep labels and the card pinned */
  private onFrame(): void {
    const scene = this.scene;
    const labels = this.labelsRef?.nativeElement;
    if (!scene || !labels) return;
    this.stageRef?.nativeElement.classList.toggle('is-settled', !scene.introRunning);
    // Place every label, then nudge any that would overlap one already
    // placed: down for labels under the front street, up for the rest
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const items = [...labels.querySelectorAll<HTMLElement>('.d-label')]
      .map(el => ({ el, p: scene.projectDistrict(Number(el.dataset['d'])) }))
      .filter((it): it is { el: HTMLElement; p: { x: number; y: number; below: boolean } } => !!it.p)
      .sort((a, b) => a.p.x - b.p.x);
    for (const { el, p } of items) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const maxX = (this.stageRef?.nativeElement.clientWidth ?? 0) - w - 4;
      const x = Math.max(4, Math.min(maxX, p.x - w / 2));
      let y = p.below ? p.y + 4 : p.y - h;
      const step = (h + 4) * (p.below ? 1 : -1);
      for (let guard = 0; guard < 4; guard++) {
        const hit = placed.some(r => x < r.x + r.w + 4 && x + w + 4 > r.x && y < r.y + r.h && y + h > r.y);
        if (!hit) break;
        y += step;
      }
      placed.push({ x, y, w, h });
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    if (this.activeIndex() >= 0) this.placeCard(this.activeIndex(), false);
  }

  private bindEvents(): void {
    const stage = this.stageRef!.nativeElement;
    let raf = 0;
    const ndc = (e: PointerEvent | MouseEvent) => {
      const r = stage.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: -((e.clientY - r.top) / r.height) * 2 + 1,
      };
    };

    const onMove = (e: PointerEvent) => {
      this.pointerType = e.pointerType;
      if (e.pointerType !== 'mouse') return;
      const target = e.target as HTMLElement;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = ndc(e);
        this.scene?.lean(p.x, p.y);
        if (target.closest('.d-label')) {
          this.clearActive();
          return;
        }
        const i = this.scene?.pick(p.x, p.y) ?? -1;
        stage.classList.toggle('is-pointing', i >= 0);
        if (i >= 0) this.activate(i);
        else this.clearActive();
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      stage.classList.remove('is-pointing');
      this.scene?.settle();
      this.clearActive();
    };
    const onDown = (e: PointerEvent) => {
      this.pointerType = e.pointerType;
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a')) return;
      const p = ndc(e);
      const i = this.scene?.pick(p.x, p.y) ?? -1;
      if (i < 0) {
        this.clearActive();
        return;
      }
      if (this.pointerType === 'mouse' && !this.noHover) {
        const c = this.companies()[i];
        if (c) this.zone.run(() => this.router.navigate(['/ticker', c.symbol]));
      } else {
        this.activate(i);
      }
    };
    const onDocDown = (e: PointerEvent) => {
      if (!stage.contains(e.target as Node)) this.clearActive();
    };

    stage.addEventListener('pointermove', onMove, { passive: true });
    stage.addEventListener('pointerleave', onLeave);
    stage.addEventListener('pointerdown', onDown, { passive: true });
    stage.addEventListener('click', onClick);
    document.addEventListener('pointerdown', onDocDown, { passive: true });
    this.cleanup.push(() => {
      cancelAnimationFrame(raf);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('click', onClick);
      document.removeEventListener('pointerdown', onDocDown);
    });
  }

  // ── Focus ──

  onKey(event: KeyboardEvent): void {
    const districts = this.districts();
    if (!districts.length) return;
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
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    if (this.activeIndex() < 0) {
      this.activate(current.index);
      return;
    }

    let d = current.district;
    let r = current.rank - 1;
    if (event.key === 'ArrowRight') r++;
    else if (event.key === 'ArrowLeft') r--;
    else if (event.key === 'ArrowDown') { d++; r = 0; }
    else if (event.key === 'ArrowUp') { d--; r = 0; }
    d = Math.max(0, Math.min(districts.length - 1, d));
    r = Math.max(0, Math.min(districts[d].companies.length - 1, r));
    this.activate(districts[d].companies[r].index);
  }

  clearActive(): void {
    if (this.activeIndex() < 0) return;
    this.shown = false;
    this.scene?.setHot(-1);
    this.zone.run(() => this.activeIndex.set(-1));
  }

  private activate(index: number): void {
    if (index === this.activeIndex()) return;
    this.zone.run(() => {
      this.activeIndex.set(index);
      this.lastIndex.set(index);
    });
    this.scene?.setHot(index);
    this.placeCard(index, true);
  }

  // Centre the card above the tower, kept inside the stage
  private placeCard(index: number, jumpable: boolean): void {
    const card = this.cardRef?.nativeElement;
    const stage = this.stageRef?.nativeElement;
    const p = this.scene?.projectTower(index);
    if (!card || !stage || !p) return;
    const cardHeight = card.offsetHeight || 88;
    const x = Math.max(0, Math.min(stage.clientWidth - CARD_WIDTH, p.x - CARD_WIDTH / 2));
    const y = Math.max(-cardHeight / 2, p.y - cardHeight - 14);
    card.style.setProperty('--ax', `${Math.round(Math.max(16, Math.min(CARD_WIDTH - 16, p.x - x)))}px`);
    card.style.transition = jumpable && this.shown
      ? 'opacity var(--dur-fast) var(--ease), transform 140ms var(--ease)'
      : '';
    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.shown = true;
  }
}
