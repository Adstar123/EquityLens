import { Component, computed, input } from '@angular/core';
import { BAND_LABELS, BANDS, Band, bandLevel, bandVar } from '../../core/bands';

// The five-step band meter: poor, weak, neutral, good, strong. Steps up to
// the company's band light in that band's colour. Used anywhere a ratio
// or score is graded so the scale always reads the same way.
@Component({
  selector: 'app-band-meter',
  standalone: true,
  template: `
    <span
      class="meter"
      [class.is-md]="size() === 'md'"
      [class.is-lg]="size() === 'lg'"
      role="img"
      [attr.aria-label]="ariaLabel()"
      [style.--lit]="colour()"
    >
      @for (step of steps; track step) {
        <i [class.on]="step <= level()"></i>
      }
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
      line-height: 0;
    }

    .meter {
      display: inline-flex;
      gap: 2px;
    }

    i {
      display: block;
      width: 8px;
      height: 4px;
      border-radius: 1px;
      background: var(--band-off);
      transition: background-color var(--dur) var(--ease);
    }

    i.on {
      background: var(--lit);
    }

    .is-md {
      gap: 3px;
    }

    .is-md i {
      width: 14px;
      height: 6px;
      border-radius: 2px;
    }

    .is-lg {
      gap: 4px;
    }

    .is-lg i {
      width: 24px;
      height: 6px;
      border-radius: 2px;
    }
  `],
})
export class BandMeterComponent {
  band = input<string | null>(null);
  size = input<'sm' | 'md' | 'lg'>('sm');

  readonly steps = [1, 2, 3, 4, 5];

  level = computed(() => bandLevel(this.band()));
  colour = computed(() => bandVar(this.band()));
  ariaLabel = computed(() => {
    const b = this.band();
    return BANDS.includes(b as Band) ? `${BAND_LABELS[b as Band]} band` : 'Not scored';
  });
}
