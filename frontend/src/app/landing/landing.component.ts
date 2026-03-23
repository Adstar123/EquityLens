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
  for (let i = 0; i < 30; i++) {
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

  // Template refs — GSAP targets
  @ViewChild('landingContainer') landingContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('heroSection') heroSection!: ElementRef<HTMLElement>;
  @ViewChild('heroType') heroType!: ElementRef<HTMLDivElement>;
  @ViewChild('heroEquity') heroEquity!: ElementRef<HTMLHeadingElement>;
  @ViewChild('heroLens') heroLens!: ElementRef<HTMLHeadingElement>;
  @ViewChild('aperture') aperture!: ElementRef<HTMLDivElement>;
  @ViewChild('heroSubtitle') heroSubtitle!: ElementRef<HTMLParagraphElement>;
  @ViewChild('scrollCue') scrollCue!: ElementRef<HTMLDivElement>;
  @ViewChild('dataStream') dataStream!: ElementRef<HTMLDivElement>;
  @ViewChild('problemSection') problemSection!: ElementRef<HTMLElement>;
  @ViewChild('dataStreamFull') dataStreamFull!: ElementRef<HTMLDivElement>;
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

  // Data columns for different sections
  dataColumns = buildColumns(12, 18);
  dataColumnsFull = buildColumns(16, 14);
  apertureColumns = buildColumns(6, 12);

  // Auth URLs
  googleAuthUrl = 'http://localhost:8080/api/v1/auth/google/login';
  githubAuthUrl = 'http://localhost:8080/api/v1/auth/github/login';

  // GSAP context for cleanup
  private gsapCtx: gsap.Context | null = null;

  onMouseMove(event: MouseEvent): void {
    if (!this.aperture) return;
    const section = this.heroSection.nativeElement;
    const rect = section.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    // Subtle parallax shift on aperture
    const offsetX = (x - 0.5) * 8;
    const offsetY = (y - 0.5) * 12;
    this.aperture.nativeElement.style.setProperty('--aperture-offset-x', `${offsetX}px`);
    this.aperture.nativeElement.style.setProperty('--aperture-offset-y', `${offsetY}px`);
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      // Small delay to let layout settle
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.initAnimations();
        });
      });
    });
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
      // SECTION 0: Hero entrance
      // ──────────────────────────────────────────

      const heroTl = gsap.timeline();
      heroTl
        .from(this.heroEquity.nativeElement, {
          y: 40,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
        })
        .from(this.heroLens.nativeElement, {
          y: 40,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
        }, '-=0.7')
        .from(this.aperture.nativeElement, {
          scale: 0,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
        }, '-=0.4')
        .from(this.heroSubtitle.nativeElement, {
          y: 20,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
        }, '-=0.5')
        .from(this.scrollCue.nativeElement, {
          opacity: 0,
          duration: 1,
          ease: 'power1.out',
        }, '-=0.3');

      // Fade scroll cue on scroll
      gsap.to(this.scrollCue.nativeElement, {
        opacity: 0,
        scrollTrigger: {
          trigger: this.heroSection.nativeElement,
          start: 'top top',
          end: '30% top',
          scrub: true,
        },
      });

      // ──────────────────────────────────────────
      // SECTION 1: Aperture expands + problem
      // ──────────────────────────────────────────

      const problemTl = gsap.timeline({
        scrollTrigger: {
          trigger: this.problemSection.nativeElement,
          start: 'top bottom',
          end: 'bottom bottom',
          scrub: 1,
        },
      });

      // Phase 1: Hero fades, full data stream emerges
      problemTl
        .to(this.heroType.nativeElement, {
          opacity: 0,
          scale: 1.05,
          duration: 0.2,
          ease: 'none',
        }, 0)
        .to(this.dataStream.nativeElement, {
          opacity: 0,
          duration: 0.15,
          ease: 'none',
        }, 0)
        // Full data stream fades in
        .to(this.dataStreamFull.nativeElement, {
          opacity: 1,
          duration: 0.2,
          ease: 'none',
        }, 0.05)
        // Problem statement
        .to(this.problemStatement.nativeElement, {
          opacity: 1,
          duration: 0.15,
          ease: 'none',
        }, 0.3)
        // Blur the data
        .to(this.dataStreamFull.nativeElement, {
          filter: 'blur(12px)',
          opacity: 0.5,
          duration: 0.3,
          ease: 'none',
        }, 0.45)
        // Fade everything out
        .to(this.problemStatement.nativeElement, {
          opacity: 0,
          y: -30,
          duration: 0.15,
          ease: 'none',
        }, 0.8)
        .to(this.dataStreamFull.nativeElement, {
          opacity: 0,
          duration: 0.15,
          ease: 'none',
        }, 0.8);

      // ──────────────────────────────────────────
      // SECTION 2: Solution card
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

      // Ratio bars staggered fill
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

      // Rating stamp
      solutionTl.to(this.demoRating.nativeElement, {
        opacity: 1,
        scale: 1,
        duration: 0.3,
        ease: 'back.out(3)',
      }, '-=0.3');

      // Caption
      solutionTl.to(this.solutionCaption.nativeElement, {
        opacity: 1,
        duration: 0.6,
        ease: 'power2.out',
      }, '-=0.2');

      // ──────────────────────────────────────────
      // SECTION 3: How it works
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
      // SECTION 4: CTA
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
    if (this.gsapCtx) {
      this.gsapCtx.revert();
    }
  }
}
