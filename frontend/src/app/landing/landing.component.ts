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
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideScanEye, lucideBrainCircuit, lucideRadar } from '@ng-icons/lucide';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

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
  imports: [RouterLink, NgIcon],
  viewProviders: [provideIcons({ lucideScanEye, lucideBrainCircuit, lucideRadar })],
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
  @ViewChild('sectionDivider') sectionDivider!: ElementRef<HTMLDivElement>;
  @ViewChild('howSection') howSection!: ElementRef<HTMLElement>;
  @ViewChild('howStep1') howStep1!: ElementRef<HTMLDivElement>;
  @ViewChild('howStep2') howStep2!: ElementRef<HTMLDivElement>;
  @ViewChild('howStep3') howStep3!: ElementRef<HTMLDivElement>;
  @ViewChild('howIndicators') howIndicators!: ElementRef<HTMLDivElement>;
  @ViewChild('ctaSection') ctaSection!: ElementRef<HTMLElement>;
  @ViewChild('ctaInner') ctaInner!: ElementRef<HTMLDivElement>;

  // Data columns
  dataColumns = buildColumns(12, 18);

  // Auth
  auth = inject(AuthService);
  googleAuthUrl = `${environment.apiUrl}/auth/google/login`;
  githubAuthUrl = `${environment.apiUrl}/auth/github/login`;
  lastProvider = localStorage.getItem('equitylens_last_provider') as 'google' | 'github' | null;

  onOAuthClick(provider: 'google' | 'github'): void {
    localStorage.setItem('equitylens_last_provider', provider);
  }

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
  // Navigation
  // ──────────────────────────────────────────────

  scrollToCta(): void {
    this.ctaSection.nativeElement.scrollIntoView({ behavior: 'smooth' });
  }

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
          0.10);

      // Phase 5a (0.44 → 0.65): Data disintegration — columns drift apart
      const lensColumns = this.dataStreamLens.nativeElement.querySelectorAll('.data-column');
      lensColumns.forEach((col: Element, i: number) => {
        const angle = i * 2.39996; // golden angle for organic distribution
        const xDrift = Math.sin(angle) * (70 + (i % 3) * 35);
        const yDrift = Math.cos(angle) * (25 + (i % 2) * 30);
        const rotDrift = Math.sin(angle * 1.7) * 14;
        const staggerStart = 0.44 + (i % 5) * 0.022;

        scrollTl.to(col as HTMLElement, {
          x: xDrift,
          y: yDrift,
          rotation: rotDrift,
          opacity: 0,
          duration: 0.22,
          ease: 'power2.in',
        }, staggerStart);
      });

      // Phase 5b (0.46 → 0.62): Blur intensifies on the drifting data
      scrollTl.to(this.dataStreamLens.nativeElement,
        { filter: 'blur(14px)', opacity: 0.5, duration: 0.16, ease: 'none' },
        0.46);

      // Phase 6 (0.58 → 0.78): Problem statement — word-by-word reveal
      const psWords = this.problemStatement.nativeElement.querySelectorAll('.ps-word');
      scrollTl
        .set(psWords, { opacity: 0, y: 25 }, 0)
        .set(this.problemStatement.nativeElement, { opacity: 1 }, 0.57)
        .to(psWords, {
          opacity: 1,
          y: 0,
          duration: 0.05,
          stagger: 0.018,
          ease: 'power2.out',
        }, 0.60)

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

      // Sparkline draw animation
      const sparklineLine = this.demoCard.nativeElement.querySelector('.sparkline-line') as SVGGeometryElement | null;
      const sparklineArea = this.demoCard.nativeElement.querySelector('.sparkline-area') as SVGElement | null;
      if (sparklineLine) {
        const len = sparklineLine.getTotalLength?.() ?? 300;
        gsap.set(sparklineLine, { strokeDasharray: len, strokeDashoffset: len });
      }

      solutionTl
        .to(this.demoCard.nativeElement, {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
        });

      if (sparklineLine) {
        solutionTl.to(sparklineLine, {
          strokeDashoffset: 0,
          duration: 1.2,
          ease: 'power2.out',
        }, 0.3);
      }
      if (sparklineArea) {
        solutionTl.to(sparklineArea, {
          opacity: 1,
          duration: 0.6,
          ease: 'power1.out',
        }, 0.8);
      }

      solutionTl.to(scoreObj, {
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
      // Section divider
      // ──────────────────────────────────────────

      gsap.to(this.sectionDivider.nativeElement, {
        scaleX: 1,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: this.sectionDivider.nativeElement,
          start: 'top 90%',
          toggleActions: 'play none none reverse',
        },
      });

      // ──────────────────────────────────────────
      // How it works — pinned step showcase
      // ──────────────────────────────────────────

      const howSlides = [this.howStep1, this.howStep2, this.howStep3];

      // Set up icon paths for stroke-draw animation
      howSlides.forEach((slide) => {
        const paths = slide.nativeElement.querySelectorAll('.how-icon svg path, .how-icon svg circle, .how-icon svg line');
        paths.forEach((p: Element) => {
          const el = p as SVGGeometryElement;
          const len = el.getTotalLength?.() ?? 200;
          gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
        });
      });

      const howTl = gsap.timeline({
        scrollTrigger: {
          trigger: this.howSection.nativeElement,
          pin: true,
          start: 'top top',
          end: '+=300%',
          scrub: 1,
          onUpdate: (self) => {
            const dots = this.howIndicators.nativeElement.querySelectorAll('.how-dot');
            const step = self.progress < 0.33 ? 0 : self.progress < 0.66 ? 1 : 2;
            dots.forEach((d: Element, i: number) =>
              d.classList.toggle('active', i === step));
          },
        },
      });

      // Initial states
      howTl
        .set(howSlides[0].nativeElement, { opacity: 1, y: 0 }, 0)
        .set(howSlides[1].nativeElement, { opacity: 0, y: 80 }, 0)
        .set(howSlides[2].nativeElement, { opacity: 0, y: 80 }, 0);

      // Step animation helper
      const addHowStep = (idx: number, enterAt: number, exitAt: number) => {
        const slide = howSlides[idx].nativeElement;
        const paths = slide.querySelectorAll('.how-icon svg path, .how-icon svg circle, .how-icon svg line');

        // Entrance (step 0 is already visible)
        if (idx > 0) {
          howTl.to(slide, {
            opacity: 1, y: 0, duration: 0.10, ease: 'power2.out',
          }, enterAt);
        }

        // Draw icon strokes
        howTl.to(paths, {
          strokeDashoffset: 0,
          duration: 0.12,
          stagger: 0.03,
          ease: 'power2.out',
        }, enterAt + 0.02);

        // Exit (last step stays)
        if (exitAt < 1) {
          howTl.to(slide, {
            opacity: 0, y: -80, duration: 0.10, ease: 'power2.in',
          }, exitAt);
        }
      };

      addHowStep(0, 0.02, 0.28);
      addHowStep(1, 0.33, 0.60);
      addHowStep(2, 0.65, 1.0);

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
