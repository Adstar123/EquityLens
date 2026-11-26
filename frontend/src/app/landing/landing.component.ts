import {
  Component,
  AfterViewInit,
  OnDestroy,
  OnInit,
  ViewChild,
  ElementRef,
  NgZone,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { ApiService, ScreenerItem } from '../core/api.service';
import { loadMoverRows, computeDivergence, DivergenceBoard } from '../core/movers';
import { BANDS, Band, ratingBand, shortName } from '../core/bands';
import { LogoMarkComponent } from '../shared/components/logo-mark.component';
import { MarketCityComponent } from '../shared/components/city/market-city.component';
import { BandMeterComponent } from '../shared/components/band-meter.component';

gsap.registerPlugin(ScrollTrigger);

interface TapeItem {
  symbol: string;
  price: string;
  change: string;
  up: boolean;
}

interface SectorChip {
  key: string;
  name: string;
}

interface SectorRow extends SectorChip {
  count: number;
  avg: number;
  mix: { band: Band; share: number }[];
}

// Shown if live quotes can't be loaded
const FALLBACK_BOARD: DivergenceBoard = {
  strongFallers: [
    { symbol: 'REA.AX', name: 'REA Group', price: '$160.71', change: '-2.68%', changePct: -2.68, score: 94, rating: 'strong_buy' },
    { symbol: 'HLI.AX', name: 'Helia Group', price: '$5.02', change: '-2.33%', changePct: -2.33, score: 98, rating: 'strong_buy' },
    { symbol: 'CYL.AX', name: 'Catalyst Metals', price: '$5.40', change: '-1.82%', changePct: -1.82, score: 92, rating: 'strong_buy' },
    { symbol: 'RMD.AX', name: 'ResMed', price: '$29.79', change: '-1.52%', changePct: -1.52, score: 96, rating: 'strong_buy' },
    { symbol: 'FPH.AX', name: 'Fisher & Paykel', price: '$34.02', change: '-0.64%', changePct: -0.64, score: 96, rating: 'strong_buy' },
  ],
  weakRallies: [
    { symbol: 'SGR.AX', name: 'Star Entertainment', price: '$0.14', change: '+3.70%', changePct: 3.7, score: 27, rating: 'strong_sell' },
    { symbol: 'VEA.AX', name: 'Viva Energy', price: '$2.85', change: '+2.15%', changePct: 2.15, score: 26, rating: 'strong_sell' },
    { symbol: 'BEN.AX', name: 'Bendigo Bank', price: '$11.46', change: '+1.15%', changePct: 1.15, score: 25, rating: 'strong_sell' },
  ],
};

const TAPE_SYMBOLS = [
  'BHP.AX', 'CBA.AX', 'CSL.AX', 'NAB.AX', 'WBC.AX', 'ANZ.AX', 'WES.AX',
  'MQG.AX', 'WOW.AX', 'TLS.AX', 'RIO.AX', 'FMG.AX', 'GMG.AX', 'WDS.AX',
  'STO.AX', 'REA.AX',
];

const FALLBACK_TAPE: TapeItem[] = [
  { symbol: 'BHP.AX', price: '$60.31', change: '+1.96%', up: true },
  { symbol: 'CBA.AX', price: '$142.80', change: '+0.42%', up: true },
  { symbol: 'CSL.AX', price: '$284.15', change: '-0.87%', up: false },
  { symbol: 'NAB.AX', price: '$37.92', change: '+0.13%', up: true },
  { symbol: 'WBC.AX', price: '$31.44', change: '-0.25%', up: false },
  { symbol: 'ANZ.AX', price: '$29.87', change: '+0.61%', up: true },
  { symbol: 'WES.AX', price: '$71.20', change: '+1.08%', up: true },
  { symbol: 'MQG.AX', price: '$218.35', change: '-1.12%', up: false },
  { symbol: 'WOW.AX', price: '$30.55', change: '+0.20%', up: true },
  { symbol: 'TLS.AX', price: '$4.12', change: '+0.49%', up: true },
  { symbol: 'RIO.AX', price: '$118.64', change: '+2.31%', up: true },
  { symbol: 'FMG.AX', price: '$19.02', change: '-0.68%', up: false },
];

const FALLBACK_SECTORS: SectorChip[] = [
  'Financials', 'Mining & Resources', 'Healthcare', 'Technology',
  'Consumer Staples', 'Consumer Discretionary', 'Industrials', 'Energy',
  'REITs', 'Utilities', 'Communication Services',
].map(name => ({ key: '', name }));

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, LogoMarkComponent, MarketCityComponent, BandMeterComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private zone = inject(NgZone);
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  @ViewChild('landingContainer') landingContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('topnav') topnav!: ElementRef<HTMLElement>;
  @ViewChild('heroCopy') heroCopy!: ElementRef<HTMLDivElement>;
  @ViewChild('heroVisual') heroVisual!: ElementRef<HTMLDivElement>;
  @ViewChild('statsStrip') statsStrip!: ElementRef<HTMLElement>;
  @ViewChild('statCompanies') statCompanies!: ElementRef<HTMLSpanElement>;
  @ViewChild('statSectors') statSectors!: ElementRef<HTMLSpanElement>;
  @ViewChild('statRatios') statRatios!: ElementRef<HTMLSpanElement>;

  auth = inject(AuthService);
  googleAuthUrl = `${environment.apiUrl}/auth/google/login`;
  githubAuthUrl = `${environment.apiUrl}/auth/github/login`;
  lastProvider = this.readLastProvider();

  fieldItems = signal<ScreenerItem[] | null>(null);
  board = signal<DivergenceBoard>(FALLBACK_BOARD);
  boardLoading = signal(true);
  liveData = signal(false);
  tapeItems = signal<TapeItem[]>(FALLBACK_TAPE);
  sectorChips = signal<SectorChip[]>(FALLBACK_SECTORS);
  readonly skeletonRows = [0, 1, 2, 3, 4];

  companiesCount = computed(() => {
    const items = this.fieldItems();
    return items ? items.filter(i => i.rating !== 'insufficient_data').length : 297;
  });

  // Sector list with size, average and the share of companies in each band
  sectorRows = computed<SectorRow[]>(() => {
    const items = this.fieldItems() ?? [];
    const rows = this.sectorChips().map(chip => {
      const list = items.filter(i =>
        (chip.key ? i.sector_key === chip.key : i.sector_name === chip.name) &&
        i.rating !== 'insufficient_data');
      const counts = new Map<Band, number>();
      for (const i of list) {
        const b = ratingBand(i.rating);
        if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
      }
      const avg = list.length
        ? Math.round(list.reduce((s, i) => s + i.composite_score, 0) / list.length)
        : 0;
      return {
        ...chip,
        count: list.length,
        avg,
        // Strongest first so every bar starts from the bright end
        mix: [...BANDS].reverse().map(band => ({ band, share: counts.get(band) ?? 0 })),
      };
    });
    return items.length ? rows.sort((a, b) => b.avg - a.avg) : rows;
  });

  private gsapCtx: gsap.Context | null = null;
  private scrollListener: (() => void) | null = null;
  private scrollerEl: HTMLElement | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  bandFor(rating: string) {
    return ratingBand(rating);
  }

  onOAuthClick(provider: 'google' | 'github'): void {
    try {
      localStorage.setItem('equitylens_last_provider', provider);
    } catch {
      // Storage can be blocked; remembering the provider is only a nicety
    }
  }

  ngOnInit(): void {
    this.loadLiveData();
  }

  private readLastProvider(): 'google' | 'github' | null {
    try {
      return localStorage.getItem('equitylens_last_provider') as 'google' | 'github' | null;
    } catch {
      return null;
    }
  }

  private loadLiveData(): void {
    // Paint the field straight away from the last known scores
    this.api.marketSnapshot().subscribe(items => {
      if (items.length && !this.fieldItems()) this.fieldItems.set(items);
    });

    this.api.screener({}).subscribe({
      next: (items) => {
        if (!items.length) {
          this.boardLoading.set(false);
          return;
        }
        this.fieldItems.set(items);
        this.api.rememberMarket(items);
        loadMoverRows(this.api, items).subscribe({
          next: (rows) => {
            if (rows.length) {
              const short = rows.map(r => ({ ...r, name: shortName(r.name) }));
              this.board.set(computeDivergence(short, 5));
              this.liveData.set(true);
            }
            this.boardLoading.set(false);
          },
          error: () => this.boardLoading.set(false),
        });
      },
      error: () => this.boardLoading.set(false),
    });

    this.api.getQuotes(TAPE_SYMBOLS).subscribe({
      next: (quotes) => {
        const items: TapeItem[] = [];
        for (const sym of TAPE_SYMBOLS) {
          const q = quotes[sym];
          if (!q) continue;
          items.push({
            symbol: sym.replace('.AX', ''),
            price: '$' + q.price.toFixed(2),
            change: (q.change >= 0 ? '+' : '') + q.change_pct.toFixed(2) + '%',
            up: q.change >= 0,
          });
        }
        if (items.length >= 8) this.tapeItems.set(items);
      },
      error: () => {},
    });

    this.api.listSectors().subscribe({
      next: (sectors) => {
        if (sectors.length) {
          this.sectorChips.set(sectors.map(s => ({ key: s.key, name: s.display_name })));
        }
      },
      error: () => {},
    });
  }

  // ── Navigation ──

  scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({
      behavior: this.reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  scrollTop(): void {
    this.scrollerEl?.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  private getScroller(): HTMLElement {
    let parent = this.landingContainer.nativeElement.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (/(auto|scroll)/.test(style.overflowY)) return parent;
      parent = parent.parentElement;
    }
    return document.documentElement;
  }

  // ── Lifecycle ──

  ngAfterViewInit(): void {
    const scroller = this.getScroller();
    this.scrollerEl = scroller;

    this.zone.runOutsideAngular(() => {
      const nav = this.topnav.nativeElement;
      const onScroll = () => nav.classList.toggle('scrolled', scroller.scrollTop > 8);
      scroller.addEventListener('scroll', onScroll, { passive: true });
      this.scrollListener = () => scroller.removeEventListener('scroll', onScroll);
      onScroll();

      // Deep links such as /#signin from the app sidebar
      const fragment = this.route.snapshot.fragment;
      if (fragment) setTimeout(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }), 60);

      if (this.reducedMotion) return;
      requestAnimationFrame(() => this.initAnimations(scroller));
    });
  }

  private initAnimations(scroller: HTMLElement): void {
    this.gsapCtx = gsap.context(() => {
      ScrollTrigger.defaults({ scroller });

      // One entrance: the copy, then the market panel
      const copyEls = this.heroCopy.nativeElement.querySelectorAll('.kicker, .hero-headline, .hero-sub, .hero-ctas');
      gsap.from(copyEls, { y: 16, opacity: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out', delay: 0.05 });
      gsap.from(this.heroVisual.nativeElement, { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out', delay: 0.25 });

      // Sections rise in once as they arrive
      this.landingContainer.nativeElement.querySelectorAll('.reveal').forEach((el) => {
        gsap.from(el, {
          y: 20, opacity: 0, duration: 0.7, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      });

      // Figures count up the first time the strip is seen, using whatever
      // live values have loaded by then
      ScrollTrigger.create({
        trigger: this.statsStrip.nativeElement,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          const countUp = (el: HTMLElement, target: number) => {
            const obj = { val: 0 };
            gsap.to(obj, {
              val: target, duration: 1.2, ease: 'power2.out',
              onUpdate: () => { el.textContent = Math.round(obj.val).toString(); },
            });
          };
          countUp(this.statCompanies.nativeElement, this.companiesCount());
          countUp(this.statSectors.nativeElement, this.sectorChips().length);
          countUp(this.statRatios.nativeElement, 7);
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.scrollListener?.();
    this.gsapCtx?.revert();
  }
}
