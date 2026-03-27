import {
  Component,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  NgZone,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ──────────────────────────────────────────────
// Data stream column config
// ──────────────────────────────────────────────
interface DataItem {
  text: string;
  isTicker: boolean;
}

interface DataColumn {
  id: number;
  items: DataItem[];
  speed: number;
  delay: number;
  left: number;
}

const TICKERS = [
  'BHP.AX', 'RIO.AX', 'FMG.AX', 'CBA.AX', 'CSL.AX',
  'WBC.AX', 'NAB.AX', 'ANZ.AX', 'WES.AX', 'WOW.AX',
  'MQG.AX', 'TLS.AX', 'WDS.AX', 'ALL.AX', 'GMG.AX',
  'TCL.AX', 'STO.AX', 'COL.AX', 'JHX.AX', 'REA.AX',
];

const VALUES = [
  '14.5', '0.28', '78.3', '45.2', '1.23',
  '92.0', '67.8', '0.45', '3.21', '8.70',
  '22.1', '0.89', '55.6', '31.4', '2.05',
  '17.3', '0.67', '41.9', '6.34', '0.12',
  '103', '0.91', '34.7', '19.8', '4.56',
];

function buildItems(seed: number): DataItem[] {
  const items: DataItem[] = [];
  for (let i = 0; i < 60; i++) {
    if (i % 3 === 0) {
      items.push({ text: TICKERS[(i + seed) % TICKERS.length], isTicker: true });
    } else {
      items.push({ text: VALUES[(i + seed * 7) % VALUES.length], isTicker: false });
    }
  }
  return items;
}

function buildColumns(count: number, baseSpeed: number): DataColumn[] {
  const cols: DataColumn[] = [];
  for (let i = 0; i < count; i++) {
    cols.push({
      id: i,
      items: buildItems(i * 3),
      speed: baseSpeed + (i % 5) * 4,
      delay: -(i * 2.3),
      left: (i / count) * 100,
    });
  }
  return cols;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  private zone = inject(NgZone);

  // Template refs
  @ViewChild('landingContainer') landingContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('heroSection') heroSection!: ElementRef<HTMLElement>;
  @ViewChild('heroType') heroType!: ElementRef<HTMLDivElement>;
  @ViewChild('heroEquity') heroEquity!: ElementRef<HTMLHeadingElement>;
  @ViewChild('heroLens') heroLens!: ElementRef<HTMLHeadingElement>;
  @ViewChild('heroSubtitle') heroSubtitle!: ElementRef<HTMLParagraphElement>;
  @ViewChild('scrollCue') scrollCue!: ElementRef<HTMLDivElement>;
  @ViewChild('dataStream') dataStream!: ElementRef<HTMLDivElement>;
  @ViewChild('dataStreamLens') dataStreamLens!: ElementRef<HTMLDivElement>;
  @ViewChild('lensEl') lensEl!: ElementRef<HTMLDivElement>;
  @ViewChild('lensHint') lensHint!: ElementRef<HTMLSpanElement>;
  @ViewChild('problemStatement') problemStatement!: ElementRef<HTMLDivElement>;
  @ViewChild('solutionSection') solutionSection!: ElementRef<HTMLElement>;
  @ViewChild('demoCard') demoCard!: ElementRef<HTMLDivElement>;
  @ViewChild('demoScore') demoScore!: ElementRef<HTMLSpanElement>;
  @ViewChild('demoRating') demoRating!: ElementRef<HTMLSpanElement>;
  @ViewChild('demoRatios') demoRatios!: ElementRef<HTMLDivElement>;
  @ViewChild('solutionCaption') solutionCaption!: ElementRef<HTMLParagraphElement>;
  @ViewChild('howStep1') howStep1!: ElementRef<HTMLDivElement>;
  @ViewChild('howStep2') howStep2!: ElementRef<HTMLDivElement>;
  @ViewChild('howStep3') howStep3!: ElementRef<HTMLDivElement>;
  @ViewChild('ctaSection') ctaSection!: ElementRef<HTMLElement>;
  @ViewChild('ctaInner') ctaInner!: ElementRef<HTMLDivElement>;

  // Data columns
  dataColumns = buildColumns(12, 18);

  // Auth URLs
  googleAuthUrl = 'http://localhost:8080/api/v1/auth/google/login';
  githubAuthUrl = 'http://localhost:8080/api/v1/auth/github/login';

  // GSAP context
  private gsapCtx: gsap.Context | null = null;

  // Lens state
  private lensTargetX = 50;
  private lensTargetY = 50;
  private lensPosX = 50;
  private lensPosY = 50;
  private lensTargetR = 0;
  private lensCurR = 0;
  private lensScale = 1.2;
  private lensRaf: number | null = null;
  private lensExpanded = false;
  private hintDismissed = false;
  private scrollActive = false;

  // ──────────────────────────────────────────────
  // Lens interaction
  // ──────────────────────────────────────────────

  onHeroMouseMove(event: MouseEvent): void {
    const section = this.heroSection.nativeElement;
    const rect = section.getBoundingClientRect();
    this.lensTargetX = ((event.clientX - rect.left) / rect.width) * 100;
    this.lensTargetY = ((event.clientY - rect.top) / rect.height) * 100;
  }

  onHeroMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    this.lensExpanded = true;
    this.lensTargetR = 120;
    if (!this.hintDismissed) {
      this.hintDismissed = true;
      gsap.to(this.lensHint.nativeElement, { opacity: 0, duration: 0.2 });
    }
  }

  onHeroMouseUp(): void {
    if (!this.lensExpanded) return;
    this.lensExpanded = false;
    this.lensTargetR = 70;
  }

  onHeroMouseLeave(): void {
    this.lensTargetX = 50;
    this.lensTargetY = 50;
    if (this.lensExpanded) {
      this.lensExpanded = false;
      this.lensTargetR = 70;
    }
  }

  // ──────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.initAnimations();
          this.startLensLoop();
        });
      });
    });
  }

  private startLensLoop(): void {
    const animate = (): void => {
      const posEase = 0.08;
      const rEase = 0.1;

      this.lensPosX += (this.lensTargetX - this.lensPosX) * posEase;
      this.lensPosY += (this.lensTargetY - this.lensPosY) * posEase;
      this.lensCurR += (this.lensTargetR - this.lensCurR) * rEase;

      // Update bright data stream — clip + magnification
      if (this.dataStreamLens) {
        const el = this.dataStreamLens.nativeElement;
        el.style.clipPath =
          `circle(${this.lensCurR}px at ${this.lensPosX}% ${this.lensPosY}%)`;
        el.style.transformOrigin = `${this.lensPosX}% ${this.lensPosY}%`;
        el.style.transform = `scale(${this.lensScale})`;
      }

      // Update lens visual ring — only when NOT in scroll transition
      if (this.lensEl && !this.scrollActive) {
        const el = this.lensEl.nativeElement;
        el.style.left = `${this.lensPosX}%`;
        el.style.top = `${this.lensPosY}%`;
        const d = this.lensCurR * 2;
        el.style.width = `${d}px`;
        el.style.height = `${d}px`;
      }

      this.lensRaf = requestAnimationFrame(animate);
    };
    this.lensRaf = requestAnimationFrame(animate);
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

  private initAnimations(): void {
    const scroller = this.getScroller();

    this.gsapCtx = gsap.context(() => {
      ScrollTrigger.defaults({ scroller });
      ScrollTrigger.refresh();

      // ──────────────────────────────────────────
      // Hero entrance (plays on load, no scroll)
      // Uses set+to instead of from() to avoid stale inline styles
      // ──────────────────────────────────────────

      const heroEls = [
        this.heroType.nativeElement,
        this.heroEquity.nativeElement,
        this.heroLens.nativeElement,
        this.heroSubtitle.nativeElement,
        this.scrollCue.nativeElement,
      ];

      // Set initial hidden state
      gsap.set(this.heroEquity.nativeElement, { y: 40, opacity: 0 });
      gsap.set(this.heroLens.nativeElement, { y: 40, opacity: 0 });
      gsap.set(this.heroSubtitle.nativeElement, { y: 20, opacity: 0 });
      gsap.set(this.scrollCue.nativeElement, { opacity: 0 });

      const heroTl = gsap.timeline({
        onComplete: () => {
          // Remove all inline styles — elements return to CSS defaults (visible)
          // Scroll timeline then has a perfectly clean slate
          gsap.set(heroEls, { clearProps: 'all' });
        },
      });

      heroTl
        .to(this.heroEquity.nativeElement, {
          y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        })
        .to(this.heroLens.nativeElement, {
          y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        }, '-=0.7')
        .add(() => {
          this.lensTargetR = 70;
        }, '-=0.3')
        .to(this.heroSubtitle.nativeElement, {
          y: 0, opacity: 1, duration: 0.8, ease: 'power2.out',
        }, '-=0.5')
        .to(this.scrollCue.nativeElement, {
          opacity: 1, duration: 1, ease: 'power1.out',
        }, '-=0.3')
        .to(this.lensHint.nativeElement, {
          opacity: 1, duration: 0.5, ease: 'power1.out',
        }, '+=0.3');

      // ──────────────────────────────────────────
      // Pinned hero scroll transition
      // The lens expansion IS the transition.
      // ──────────────────────────────────────────

      // GSAP drives these via proxy, rAF loop reads them
      const expandProxy = { r: 70, scale: 1.2 };
      let entranceKilled = false;

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: this.heroSection.nativeElement,
          pin: true,
          start: 'top top',
          end: '+=250%',
          scrub: 1,
          onUpdate: (self) => {
            // Kill entrance + clear props on first scroll
            if (self.progress > 0.003 && !entranceKilled) {
              entranceKilled = true;
              heroTl.progress(1).kill();
              gsap.set(heroEls, { clearProps: 'all' });
            }
            // Hide/show lens glass instantly (no scrub lag)
            const wasActive = this.scrollActive;
            this.scrollActive = self.progress > 0.003;
            if (this.scrollActive) {
              this.lensEl.nativeElement.style.visibility = 'hidden';
              // Collapse the bright data circle only on first frame entering scroll
              if (!wasActive) {
                this.lensTargetR = 0;
                this.lensCurR = 0;
              }
              this.lensTargetX = 50;
              this.lensTargetY = 50;
            } else {
              this.lensEl.nativeElement.style.visibility = '';
              // Reset lens state when scrolling back to hero
              if (wasActive) {
                this.lensTargetR = 70;
                this.lensCurR = 70;
                this.lensScale = 1.2;
                expandProxy.r = 0;
                expandProxy.scale = 1.2;
              }
            }
          },
        },
      });

      // Anchor visible state at timeline start so scrub-back restores it
      scrollTl
        .set(this.heroType.nativeElement, { scale: 1 }, 0)
        .set(this.heroEquity.nativeElement, { opacity: 1 }, 0)
        .set(this.heroLens.nativeElement, { opacity: 1 }, 0)
        .set(this.heroSubtitle.nativeElement, { opacity: 1 }, 0)
        .set(this.dataStream.nativeElement, { opacity: 0.6 }, 0)
        .set(this.dataStreamLens.nativeElement, { filter: 'blur(0px)', opacity: 1 }, 0)

      // Phase 0 (0 → 0.02): Scroll cue + hint vanish
        .to(this.scrollCue.nativeElement, { opacity: 0, duration: 0.02 }, 0)
        .to(this.lensHint.nativeElement, { opacity: 0, duration: 0.02 }, 0)

      // Phase 1 (0.01 → 0.15): Hero zooms past you
      // Container handles scale (guarantees both words reverse together)
        .to(this.heroType.nativeElement,
          { scale: 2.5, duration: 0.14, ease: 'power2.in' },
          0.01)
      // Individual opacity for stagger effect — EQUITY first, then LENS
        .to(this.heroEquity.nativeElement,
          { opacity: 0, duration: 0.08, ease: 'power2.in' },
          0.01)
        .to(this.heroLens.nativeElement,
          { opacity: 0, duration: 0.08, ease: 'power2.in' },
          0.05)
        .to(this.heroSubtitle.nativeElement,
          { opacity: 0, duration: 0.06 },
          0.02)

      // Phase 2 (0.05 → 0.45): THE LENS OPENS
      // clip-path expands from 0 to cover entire viewport
      // magnification normalizes from 1.2x to 1.0x
        .fromTo(expandProxy,
          { r: 0, scale: 1.2 },
          {
            r: 2500,
            scale: 1.0,
            duration: 0.40,
            ease: 'power2.inOut',
            immediateRender: false,
            onUpdate: () => {
              this.lensTargetR = expandProxy.r;
              this.lensCurR = expandProxy.r;
              this.lensScale = expandProxy.scale;
            },
          },
          0.05)

      // Phase 4b (0.1 → 0.3): Dim data fades as bright takes over
        .to(this.dataStream.nativeElement,
          { opacity: 0, duration: 0.20 },
          0.10)

      // Phase 5 (0.48 → 0.65): Data overwhelms — blur
        .to(this.dataStreamLens.nativeElement,
          { filter: 'blur(14px)', opacity: 0.5, duration: 0.17, ease: 'none' },
          0.48)

      // Phase 6 (0.60 → 0.75): Problem statement
        .fromTo(this.problemStatement.nativeElement,
          { opacity: 0, y: 0 },
          { opacity: 1, duration: 0.12, ease: 'none', immediateRender: false },
          0.60)

      // Phase 7 (0.82 → 0.95): Everything fades to black
        .to(this.problemStatement.nativeElement, {
          opacity: 0,
          y: -30,
          duration: 0.08,
        }, 0.82)
        .to(this.dataStreamLens.nativeElement, {
          opacity: 0,
          duration: 0.12,
        }, 0.85);

      // ──────────────────────────────────────────
      // Solution card
      // ──────────────────────────────────────────

      const scoreObj = { val: 0 };

      const solutionTl = gsap.timeline({
        scrollTrigger: {
          trigger: this.solutionSection.nativeElement,
          start: 'top 70%',
          toggleActions: 'play none none reverse',
        },
      });

      solutionTl
        .to(this.demoCard.nativeElement, {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
        })
        .to(scoreObj, {
          val: 78,
          duration: 1.2,
          ease: 'power2.out',
          onUpdate: () => {
            this.demoScore.nativeElement.textContent = Math.round(scoreObj.val).toString();
          },
        }, '-=0.5');

      const ratioFills = this.demoRatios.nativeElement.querySelectorAll('.demo-ratio-fill');
      ratioFills.forEach((fill: Element, i: number) => {
        const el = fill as HTMLElement;
        const targetWidth = el.style.getPropertyValue('--target-width');
        const color = el.getAttribute('data-color') || '#d4930d';
        el.style.background = color;
        solutionTl.to(el, {
          width: targetWidth,
          duration: 0.5,
          ease: 'power2.out',
        }, `${0.5 + i * 0.15}`);
      });

      solutionTl.to(this.demoRating.nativeElement, {
        opacity: 1,
        scale: 1,
        duration: 0.3,
        ease: 'back.out(3)',
      }, '-=0.3');

      solutionTl.to(this.solutionCaption.nativeElement, {
        opacity: 1,
        duration: 0.6,
        ease: 'power2.out',
      }, '-=0.2');

      // ──────────────────────────────────────────
      // How it works
      // ──────────────────────────────────────────

      [this.howStep1, this.howStep2, this.howStep3].forEach((ref, i) => {
        gsap.to(ref.nativeElement, {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: ref.nativeElement,
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
          delay: i * 0.1,
        });
      });

      // ──────────────────────────────────────────
      // CTA
      // ──────────────────────────────────────────

      gsap.to(this.ctaInner.nativeElement, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: this.ctaSection.nativeElement,
          start: 'top 70%',
          toggleActions: 'play none none reverse',
        },
      });

    }); // end gsap.context
  }

  ngOnDestroy(): void {
    if (this.lensRaf !== null) {
      cancelAnimationFrame(this.lensRaf);
    }
    if (this.gsapCtx) {
      this.gsapCtx.revert();
    }
  }
}
