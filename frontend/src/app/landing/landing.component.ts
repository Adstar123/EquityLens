import {
  Component,
  AfterViewInit,
  OnDestroy,
  OnInit,
  ViewChild,
  ElementRef,
  NgZone,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { loadMovers, Movers, MoverRow } from '../core/movers';
import { LogoMarkComponent } from '../shared/components/logo-mark.component';

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

// Shown until (or in place of) live data
const FALLBACK_MOVERS: Movers = {
  gainers: [
    { symbol: 'NEM.AX', name: 'Newmont Corporation', price: '$134.97', change: '+3.46%', changePct: 3.46, score: 100 },
    { symbol: 'ELS.AX', name: 'Elsight Limited', price: '$5.59', change: '+3.71%', changePct: 3.71, score: 100 },
    { symbol: 'NIC.AX', name: 'Nickel Industries', price: '$0.81', change: '+3.16%', changePct: 3.16, score: 100 },
    { symbol: 'RIO.AX', name: 'Rio Tinto Limited', price: '$118.64', change: '+2.31%', changePct: 2.31, score: 87 },
    { symbol: 'VEA.AX', name: 'Viva Energy Group', price: '$2.85', change: '+2.15%', changePct: 2.15, score: 26 },
  ],
  fallers: [
    { symbol: 'CSL.AX', name: 'CSL Limited', price: '$123.06', change: '-3.81%', changePct: -3.81, score: 62 },
    { symbol: 'REA.AX', name: 'REA Group Ltd', price: '$160.71', change: '-2.68%', changePct: -2.68, score: 100 },
    { symbol: 'HLI.AX', name: 'Helia Group Limited', price: '$5.02', change: '-2.33%', changePct: -2.33, score: 100 },
    { symbol: 'CYL.AX', name: 'Catalyst Metals', price: '$5.40', change: '-1.82%', changePct: -1.82, score: 100 },
    { symbol: 'RMD.AX', name: 'ResMed Inc.', price: '$29.79', change: '-1.52%', changePct: -1.52, score: 100 },
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
  { symbol: 'GMG.AX', price: '$34.77', change: '+0.90%', up: true },
  { symbol: 'WDS.AX', price: '$24.19', change: '-0.33%', up: false },
  { symbol: 'STO.AX', price: '$6.85', change: '+0.74%', up: true },
  { symbol: 'REA.AX', price: '$160.71', change: '-2.68%', up: false },
];

const FALLBACK_SECTORS: SectorChip[] = [
  'Financials', 'Mining & Resources', 'Healthcare', 'Technology',
  'Consumer Staples', 'Consumer Discretionary', 'Industrials', 'Energy',
  'Real Estate', 'Utilities', 'Communication Services',
].map(name => ({ key: '', name }));

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, LogoMarkComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private zone = inject(NgZone);
  private api = inject(ApiService);

  @ViewChild('landingContainer') landingContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('topnav') topnav!: ElementRef<HTMLElement>;
  @ViewChild('heroCopy') heroCopy!: ElementRef<HTMLDivElement>;
  @ViewChild('heroVisual') heroVisual!: ElementRef<HTMLDivElement>;
  @ViewChild('pvBoard') pvBoard!: ElementRef<HTMLDivElement>;
  @ViewChild('pvDetail') pvDetail!: ElementRef<HTMLDivElement>;
  @ViewChild('statsStrip') statsStrip!: ElementRef<HTMLElement>;
  @ViewChild('statCompanies') statCompanies!: ElementRef<HTMLSpanElement>;
  @ViewChild('statSectors') statSectors!: ElementRef<HTMLSpanElement>;
  @ViewChild('statRatios') statRatios!: ElementRef<HTMLSpanElement>;
  @ViewChild('methodThread') methodThread!: ElementRef<HTMLDivElement>;

  auth = inject(AuthService);
  googleAuthUrl = `${environment.apiUrl}/auth/google/login`;
  githubAuthUrl = `${environment.apiUrl}/auth/github/login`;
  lastProvider = localStorage.getItem('equitylens_last_provider') as 'google' | 'github' | null;

  movers = signal<Movers>(FALLBACK_MOVERS);
  moversLoading = signal(true);
  tapeItems = signal<TapeItem[]>(FALLBACK_TAPE);
  sectorChips = signal<SectorChip[]>(FALLBACK_SECTORS);
  companiesCount = signal(298);
  readonly skeletonRows = [0, 1, 2, 3, 4];

  heroBoard = (): MoverRow[] => this.movers().gainers.slice(0, 5);

  private gsapCtx: gsap.Context | null = null;
  private scrollListener: (() => void) | null = null;
  private scrollerEl: HTMLElement | Window = window;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  onOAuthClick(provider: 'google' | 'github'): void {
    localStorage.setItem('equitylens_last_provider', provider);
  }

  ngOnInit(): void {
    this.loadLiveData();
  }

  private loadLiveData(): void {
    this.api.screener({}).subscribe({
      next: (items) => {
        if (!items.length) {
          this.moversLoading.set(false);
          return;
        }
        this.companiesCount.set(items.length);
        loadMovers(this.api, items, 5).subscribe({
          next: (movers) => {
            if (movers.gainers.length || movers.fallers.length) {
              this.movers.set({
                gainers: movers.gainers.map(m => ({ ...m, name: this.shortName(m.name) })),
                fallers: movers.fallers.map(m => ({ ...m, name: this.shortName(m.name) })),
              });
            }
            this.moversLoading.set(false);
          },
          error: () => this.moversLoading.set(false),
        });
      },
      error: () => this.moversLoading.set(false),
    });

    this.api.getQuotes(TAPE_SYMBOLS).subscribe({
      next: (quotes) => {
        const items: TapeItem[] = [];
        for (const sym of TAPE_SYMBOLS) {
          const q = quotes[sym];
          if (!q) continue;
          items.push({
            symbol: sym,
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

  private shortName(name: string): string {
    return name
      .replace(/\s+(Limited|Ltd\.?|Inc\.?|Corporation|Group|Holdings)\s*$/i, '')
      .trim();
  }

  // ── Navigation ──

  scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({
      behavior: this.reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  scrollTop(): void {
    if (this.scrollerEl instanceof Window) {
      this.scrollerEl.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      this.scrollerEl.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
    }
  }

  private getScroller(): HTMLElement {
    const el = this.landingContainer.nativeElement;
    let parent = el.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflow === 'auto' || style.overflowY === 'auto' ||
          style.overflow === 'scroll' || style.overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return document.documentElement;
  }

  // ── Lifecycle ──

  ngAfterViewInit(): void {
    const scroller = this.getScroller();
    this.scrollerEl = scroller;

    this.zone.runOutsideAngular(() => {
      // Nav backdrop on scroll
      const nav = this.topnav.nativeElement;
      const onScroll = () => {
        nav.classList.toggle('scrolled', scroller.scrollTop > 12);
      };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      this.scrollListener = () => scroller.removeEventListener('scroll', onScroll);
      onScroll();

      if (this.reducedMotion) return;

      requestAnimationFrame(() => this.initAnimations(scroller));
    });
  }

  private initAnimations(scroller: HTMLElement): void {
    this.gsapCtx = gsap.context(() => {
      ScrollTrigger.defaults({ scroller });

      // ── Hero entrance ──
      const copyEls = Array.from(this.heroCopy.nativeElement.children);
      gsap.set(copyEls, { y: 28, opacity: 0 });
      gsap.set(this.pvBoard.nativeElement, { y: 40, opacity: 0 });
      gsap.set(this.pvDetail.nativeElement, { y: 56, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to(copyEls, { y: 0, opacity: 1, duration: 0.9, stagger: 0.09 }, 0.05)
        .to(this.pvBoard.nativeElement, { y: 0, opacity: 1, duration: 1 }, 0.35)
        .to(this.pvDetail.nativeElement, { y: 0, opacity: 1, duration: 1 }, 0.5);

      // Gentle idle float on the hero cards
      gsap.to(this.pvDetail.nativeElement, {
        y: -10, duration: 3.4, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.6,
      });
      gsap.to(this.pvBoard.nativeElement, {
        y: -5, duration: 4.2, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.9,
      });

      // ── Section reveals ──
      const reveals = this.landingContainer.nativeElement.querySelectorAll('.reveal');
      reveals.forEach((el) => {
        gsap.fromTo(el,
          { y: 32, opacity: 0 },
          {
            y: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          });
      });

      // ── Stat count-ups ──
      const countUp = (el: HTMLElement, target: number) => {
        const obj = { val: 0 };
        gsap.to(obj, {
          val: target, duration: 1.4, ease: 'power2.out',
          scrollTrigger: { trigger: this.statsStrip.nativeElement, start: 'top 88%', once: true },
          onUpdate: () => { el.textContent = Math.round(obj.val).toString(); },
        });
      };
      countUp(this.statCompanies.nativeElement, this.companiesCount());
      countUp(this.statSectors.nativeElement, this.sectorChips().length);
      countUp(this.statRatios.nativeElement, 7);

      // ── Methodology thread draw (desktop only; the thread runs
      //    vertically on narrow layouts and stays static there) ──
      if (window.innerWidth > 1024) gsap.fromTo(this.methodThread.nativeElement,
        { scaleX: 0 },
        {
          scaleX: 1, ease: 'none',
          scrollTrigger: {
            trigger: this.methodThread.nativeElement.parentElement,
            start: 'top 75%',
            end: 'bottom 60%',
            scrub: 0.6,
          },
        });
    });
  }

  ngOnDestroy(): void {
    this.scrollListener?.();
    this.gsapCtx?.revert();
  }
}
